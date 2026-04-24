const {
  Booking,
  User,
  Equipment,
  Room,
  sequelize
} = require('../models');
const { Op } = require('sequelize');
const { uploadToCloudinary } = require('../utils/cloudinary');
const { sha256HexBuffer } = require('../utils/file-hash');
const {
  notifyBookingCreated,
  notifyBookingApproved,
  notifyBookingDenied,
  notifyBookingCancelled,
  notifyContentionStarted,
  notifyDisplacedUsersSlotReopened,
} = require('../utils/booking-notifications');
const { computePencilExpiryAt, assertStartNotWithinLockHours, isWithinLockHours } = require('../utils/booking-rules');
const contention = require('../services/contention.service');
const { api } = require('../messages/bookingMessages');

const getUserAccountType = (req) => req.user?.accountType || req.user?.role;
const REBOOKABLE_STATUSES = ['cancelled', 'denied', 'expired', 'displaced', 'completed'];

/** Firm still "holds" the slot for displacement purposes — rebook not allowed until gone. */
const FIRM_ACTIVE_FOR_DISPLACEMENT = ['pending_approval', 'approved'];

function computeCanRebook(plain) {
  if (!plain || !REBOOKABLE_STATUSES.includes(plain.status)) return false;
  if (plain.status === 'displaced') {
    const d = plain.displacedByBooking;
    if (d && d.bookingType === 'firm' && FIRM_ACTIVE_FOR_DISPLACEMENT.includes(d.status)) {
      return false;
    }
  }
  return true;
}

function formatBookingOverlapSummary(row) {
  const u = row.user;
  return {
    id: row.id,
    bookingType: row.bookingType,
    status: row.status,
    startTime: row.startTime,
    endTime: row.endTime,
    user: u ? { id: u.id, email: u.email } : null
  };
}

/**
 * My Bookings UI: firm pending may overlap on-hold pencils; on-hold pencils overlap blocking firms.
 */
async function attachDashboardOverlapHints(plain) {
  plain.overlappingOnHoldPencils = [];
  plain.overlappingFirmBookings = [];

  if (plain.bookingType === 'firm' && plain.status === 'pending_approval') {
    const rows = await Booking.findAll({
      where: {
        resourceType: plain.resourceType,
        resourceId: plain.resourceId,
        bookingType: 'pencil',
        status: 'on_hold',
        id: { [Op.ne]: plain.id },
        [Op.and]: [
          { startTime: { [Op.lt]: plain.endTime } },
          { endTime: { [Op.gt]: plain.startTime } }
        ]
      },
      include: [{ model: User, as: 'user', attributes: ['id', 'email'] }]
    });
    plain.overlappingOnHoldPencils = rows.map(formatBookingOverlapSummary);
  }

  if (plain.bookingType === 'pencil' && plain.status === 'on_hold') {
    const firms = await Booking.findFirmBlockers(
      plain.resourceType,
      plain.resourceId,
      plain.startTime,
      plain.endTime,
      plain.id
    );
    plain.overlappingFirmBookings = firms.map(formatBookingOverlapSummary);
  }
}

const THREAD_BOOKING_ATTRIBUTES = [
  'id',
  'bookingThreadId',
  'rebookedFromBookingId',
  'bookingType',
  'status',
  'startTime',
  'endTime',
  'purpose',
  'staffRemark',
  'rebookedFromStatus',
  'createdAt',
];

const buildBookingIncludes = ({ includeThreadHistory = false } = {}) => {
  const includes = [{
    model: User,
    as: 'user',
    attributes: ['id', 'email', 'accountType', 'userCategory']
  }];

  includes.push({
    model: User,
    as: 'approvedBy',
    required: false,
    attributes: ['id', 'email', 'accountType', 'userCategory']
  });

  if (includeThreadHistory) {
    includes.push({
      model: Booking,
      as: 'threadBookings',
      separate: true,
      order: [['createdAt', 'DESC']],
      attributes: THREAD_BOOKING_ATTRIBUTES,
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'email', 'accountType', 'userCategory']
      }]
    });
  }

  includes.push({
    model: Booking,
    as: 'displacedByBooking',
    required: false,
    attributes: ['id', 'status', 'bookingType', 'startTime', 'endTime']
  });

  return includes;
};

function isNewerBooking(a, b) {
  const aTime = new Date(a.createdAt).getTime();
  const bTime = new Date(b.createdAt).getTime();
  if (aTime !== bTime) return aTime > bTime;
  return a.id > b.id;
}

function getLatestBookingIdByThread(bookings) {
  const latestByThread = new Map();

  for (const booking of bookings) {
    const threadId = booking.bookingThreadId || booking.id;
    const current = latestByThread.get(threadId);
    if (!current || isNewerBooking(booking, current)) {
      latestByThread.set(threadId, booking);
    }
  }

  return new Map([...latestByThread.entries()].map(([threadId, booking]) => [threadId, booking.id]));
}

async function getNextBookingId() {
  const [rows] = await sequelize.query('SELECT nextval(\'"Bookings_id_seq"\') AS id;');
  return rows[0]?.id;
}

async function resolveResourceName(resourceType, resourceId) {
  try {
    if (resourceType === 'equipment') {
      const eq = await Equipment.findByPk(resourceId, { attributes: ['name'] });
      return eq?.name ?? `Equipment #${resourceId}`;
    }
    if (resourceType === 'room') {
      const rm = await Room.findByPk(resourceId, { attributes: ['name'] });
      return rm?.name ?? `Room #${resourceId}`;
    }
  } catch {
    // non-fatal
  }
  return `Resource #${resourceId}`;
}

function normalizeOptionalText(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function hasAuthDoc(url) {
  return Boolean(url && String(url).trim().length > 0);
}

function buildRebookChangeSummary(sourceBooking, nextValues) {
  const changes = {};

  if (sourceBooking.startTime?.toISOString() !== nextValues.startTime?.toISOString()) {
    changes.startTime = {
      before: sourceBooking.startTime,
      after: nextValues.startTime
    };
  }

  if (sourceBooking.endTime?.toISOString() !== nextValues.endTime?.toISOString()) {
    changes.endTime = {
      before: sourceBooking.endTime,
      after: nextValues.endTime
    };
  }

  if (sourceBooking.bookingType !== nextValues.bookingType) {
    changes.bookingType = {
      before: sourceBooking.bookingType,
      after: nextValues.bookingType
    };
  }

  if (normalizeOptionalText(sourceBooking.purpose) !== normalizeOptionalText(nextValues.purpose)) {
    changes.purpose = {
      before: sourceBooking.purpose || null,
      after: nextValues.purpose || null
    };
  }

  const sourceHasDoc = hasAuthDoc(sourceBooking.authorizationDocUrl);
  const nextHasDoc = hasAuthDoc(nextValues.authorizationDocUrl);
  let authorizationDocChanged = sourceHasDoc !== nextHasDoc;
  if (!authorizationDocChanged && sourceHasDoc && nextHasDoc) {
    if (sourceBooking.authorizationDocUrl !== nextValues.authorizationDocUrl) {
      const srcHash = sourceBooking.authorizationDocHash || null;
      const nextHash = nextValues.authorizationDocHash || null;
      if (!(srcHash && nextHash && srcHash === nextHash)) {
        authorizationDocChanged = true;
      }
    }
  }
  if (authorizationDocChanged) {
    changes.authorizationDocUrl = {
      before: sourceBooking.authorizationDocUrl || null,
      after: nextValues.authorizationDocUrl || null
    };
  }

  const changedFields = Object.keys(changes);
  if (changedFields.length === 0) return null;

  return {
    changedFields,
    changes
  };
}

const createBooking = async (req, res) => {
  try {
    const { resourceType, resourceId, bookingType, startTime, endTime, purpose } = req.body;
    const confirmOverlapOwn = req.body.confirmOverlapOwn === true || req.body.confirmOverlapOwn === 'true';
    const rebookedFromBookingIdRaw = req.body.rebookedFromBookingId;
    const userId = req.user.id;

    let authorizationDocUrl = req.body.authorizationDocUrl || null;
    let authorizationDocHash = null;
    if (req.file) {
      authorizationDocHash = sha256HexBuffer(req.file.buffer);
      authorizationDocUrl = await uploadToCloudinary(req.file.buffer, 'authorization-docs');
    }

    if (!resourceType || !resourceId || !bookingType || !startTime || !endTime) {
      return res.status(400).json({
        error: api.create.missingFields
      });
    }

    if (!['equipment', 'room'].includes(resourceType)) {
      return res.status(400).json({ error: api.create.invalidResourceType });
    }

    if (!['pencil', 'firm'].includes(bookingType)) {
      return res.status(400).json({ error: api.create.invalidBookingType });
    }

    const start = new Date(startTime);
    const end = new Date(endTime);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ error: api.create.invalidDates });
    }

    if (start >= end) {
      return res.status(400).json({ error: api.create.endBeforeStart });
    }

    if (start < new Date()) {
      return res.status(400).json({ error: api.create.pastBooking });
    }

    try {
      assertStartNotWithinLockHours(start);
    } catch (lockErr) {
      if (lockErr.statusCode) {
        return res.status(lockErr.statusCode).json({ error: lockErr.message, code: lockErr.code });
      }
      throw lockErr;
    }

    let rebookedFromBookingId = null;
    let bookingThreadId = null;
    let sourceBooking = null;
    let rebookedFromStatus = null;
    if (rebookedFromBookingIdRaw !== undefined && rebookedFromBookingIdRaw !== null && rebookedFromBookingIdRaw !== '') {
      rebookedFromBookingId = parseInt(rebookedFromBookingIdRaw, 10);
      if (Number.isNaN(rebookedFromBookingId)) {
        return res.status(400).json({ error: api.create.invalidRebookId });
      }

      sourceBooking = await Booking.findByPk(rebookedFromBookingId);
      if (!sourceBooking) {
        return res.status(404).json({ error: api.create.rebookSourceNotFound });
      }

      if (sourceBooking.userId !== userId) {
        return res.status(403).json({ error: api.create.rebookAccessDenied });
      }

      if (!REBOOKABLE_STATUSES.includes(sourceBooking.status)) {
        return res.status(400).json({
          error: api.create.rebookInvalidStatus({
            status: sourceBooking.status,
            allowedListCsv: REBOOKABLE_STATUSES.join(', '),
          })
        });
      }

      if (sourceBooking.status === 'displaced' && sourceBooking.displacedByBookingId) {
        const displacer = await Booking.findByPk(sourceBooking.displacedByBookingId, {
          attributes: ['id', 'status', 'bookingType']
        });
        if (
          displacer &&
          displacer.bookingType === 'firm' &&
          FIRM_ACTIVE_FOR_DISPLACEMENT.includes(displacer.status)
        ) {
          return res.status(400).json({
            error: api.create.displacedRebookBlocked,
            code: 'DISPLACED_REBOOK_BLOCKED'
          });
        }
      }

      bookingThreadId = sourceBooking.bookingThreadId || sourceBooking.id;

      const newerAttempt = await Booking.findOne({
        where: {
          bookingThreadId,
          [Op.or]: [
            { createdAt: { [Op.gt]: sourceBooking.createdAt } },
            {
              [Op.and]: [
                { createdAt: sourceBooking.createdAt },
                { id: { [Op.gt]: sourceBooking.id } }
              ]
            }
          ]
        },
        attributes: ['id'],
      });

      if (newerAttempt) {
        return res.status(409).json({
          error: api.create.threadNotLatest
        });
      }

      if (sourceBooking.resourceType !== resourceType || sourceBooking.resourceId !== parseInt(resourceId, 10)) {
        return res.status(400).json({
          error: api.create.rebookResourceMismatch
        });
      }

      rebookedFromStatus = sourceBooking.status;
      if (
        !req.file &&
        authorizationDocUrl &&
        sourceBooking.authorizationDocUrl === authorizationDocUrl &&
        sourceBooking.authorizationDocHash
      ) {
        authorizationDocHash = sourceBooking.authorizationDocHash;
      }
    }

    let resource;
    if (resourceType === 'equipment') {
      resource = await Equipment.findByPk(resourceId);
    } else {
      resource = await Room.findByPk(resourceId);
    }

    if (!resource) {
      return res.status(404).json({ error: api.create.resourceNotFound({ resourceType }) });
    }

    if (!['available', 'in-use'].includes(resource.status)) {
      return res.status(400).json({ 
        error: api.create.resourceNotBookable({ resourceType, resourceStatus: resource.status })
      });
    }

    const firmBlockers = await Booking.findFirmBlockers(resourceType, resourceId, start, end);
    const pencilOverlaps = await Booking.findActivePencilOverlaps(resourceType, resourceId, start, end);

    const ownPencilOverlaps = pencilOverlaps.filter(
      (c) => c.userId === userId && c.bookingType === 'pencil'
    );
    const otherPencilOverlaps = pencilOverlaps.filter(
      (c) => !(c.userId === userId && c.bookingType === 'pencil')
    );

    const formatConflicts = (list) =>
      list.map((c) => ({
        id: c.id,
        bookingType: c.bookingType,
        status: c.status,
        startTime: c.startTime,
        endTime: c.endTime,
        contentionRole: c.contentionRole || null,
        user: {
          id: c.user.id,
          email: c.user.email
        }
      }));

    if (bookingType === 'firm') {
      if (firmBlockers.length > 0) {
        return res.status(409).json({
          error: api.create.firmFirmConflict,
          conflicts: formatConflicts(firmBlockers)
        });
      }
      if (ownPencilOverlaps.length > 0 && !confirmOverlapOwn) {
        return res.status(409).json({
          error: api.create.firmOwnPencilOverlapConfirm,
          requiresConfirmation: true,
          ownPencilConflicts: formatConflicts(ownPencilOverlaps)
        });
      }
    }

    if (bookingType === 'pencil') {
      if (firmBlockers.length > 0) {
        return res.status(409).json({
          error: api.create.pencilOverlapsFirm,
          conflicts: formatConflicts(firmBlockers)
        });
      }
      if (ownPencilOverlaps.length > 0) {
        return res.status(409).json({
          error: api.create.pencilOwnDuplicate,
          conflicts: formatConflicts(ownPencilOverlaps)
        });
      }
      // 1v1 mode: overlap with foreign pencils is allowed and evaluated in-transaction.
      // If an active contention already exists at commit time, we hard reject with 409.
    }

    let cancelledPencilBookings = [];
    if (bookingType === 'firm' && ownPencilOverlaps.length > 0 && confirmOverlapOwn) {
      for (const pencilBooking of ownPencilOverlaps) {
        await sequelize.transaction(async (t) => {
          const b = await Booking.findByPk(pencilBooking.id, { transaction: t, lock: t.LOCK.UPDATE });
          if (!b || b.status !== 'penciled') return;
          await contention.onBookingCancelledMidContention(b, {
            transaction: t,
            Booking
          });
          b.status = 'cancelled';
          b.staffRemark = api.create.autoCancelledPencilRemark;
          await b.save({ transaction: t });
        });
        cancelledPencilBookings.push(pencilBooking.id);
      }
    }

    const issuedAt = new Date();
    const expiryAt =
      bookingType === 'pencil' ? computePencilExpiryAt(issuedAt, start) : null;

    let bookingId = null;
    if (!bookingThreadId) {
      bookingId = await getNextBookingId();
      bookingThreadId = bookingId;
    }

    const rebookChangeSummary = sourceBooking
      ? buildRebookChangeSummary(sourceBooking, {
          startTime: start,
          endTime: end,
          bookingType,
          purpose: purpose || null,
          authorizationDocUrl,
          authorizationDocHash
        })
      : null;

    const initialPencilStatus = 'penciled';
    const initialFirmStatus = 'pending_approval';

    let createdBooking;
    let contentionResult = null;
    try {
      createdBooking = await sequelize.transaction(async (t) => {
        if (bookingType === 'pencil' && otherPencilOverlaps.length > 0) {
          const freshPencilOverlaps = await Booking.findActivePencilOverlaps(
            resourceType,
            resourceId,
            start,
            end,
            null,
            { transaction: t }
          );
          const freshOther = freshPencilOverlaps.filter(
            (c) => !(c.userId === userId && c.bookingType === 'pencil')
          );

          if (freshOther.length === 0) {
            // Nothing left to contend with; this request becomes a free pencil.
          }
        }

        const created = await Booking.create(
          {
            ...(bookingId ? { id: bookingId } : {}),
            userId,
            resourceType,
            resourceId,
            bookingType,
            status: bookingType === 'pencil' ? initialPencilStatus : initialFirmStatus,
            startTime: start,
            endTime: end,
            purpose,
            authorizationDocUrl,
            authorizationDocHash,
            expiryAt,
            rebookedFromBookingId,
            rebookedFromStatus,
            bookingThreadId,
            rebookChangeSummary
          },
          { transaction: t }
        );

        if (bookingType === 'pencil' && otherPencilOverlaps.length > 0) {
          const b = await Booking.findByPk(created.id, { transaction: t, lock: t.LOCK.UPDATE });
          contentionResult = await contention.tryAttachPencilToContention(b, { transaction: t, Booking });
        }

        if (bookingType === 'firm') {
          const b = await Booking.findByPk(created.id, { transaction: t, lock: t.LOCK.UPDATE });
          await contention.autoResolveFirmBlockedDefenders(b, { transaction: t, Booking });
          await contention.reevaluateOverlappingPencilsForFirm(b, { transaction: t, Booking });
        }

        return Booking.findByPk(created.id, {
          include: buildBookingIncludes({ includeThreadHistory: true }),
          transaction: t
        });
      });
    } catch (txnErr) {
      if (txnErr.code === 'CONTENTION_DEADLINE_INVALID' || txnErr.code === 'BOOKING_LOCK_WINDOW') {
        return res.status(txnErr.statusCode || 400).json({
          error: txnErr.message,
          code: txnErr.code
        });
      }
      if (txnErr.code === 'CONTENTION_DEFENDER_INVALID' || txnErr.code === 'CONTENTION_CHALLENGER_INVALID') {
        return res.status(txnErr.statusCode || 409).json({ error: txnErr.message, code: txnErr.code });
      }
      if (txnErr.code === 'ACTIVE_CONTENTION_LOCKED') {
        return res.status(409).json({ error: txnErr.message, code: txnErr.code });
      }
      throw txnErr;
    }

    const response = {
      booking: createdBooking,
      message:
        cancelledPencilBookings.length > 0
          ? api.create.successCancelledPencils({ count: cancelledPencilBookings.length })
          : bookingType === 'firm' && otherPencilOverlaps.length > 0
            ? api.create.successFirmSubmitted
            : otherPencilOverlaps.length > 0 && bookingType === 'pencil'
              ? api.create.successContentionStarted
              : api.create.successGeneric
    };

    if (cancelledPencilBookings.length > 0) {
      response.cancelledPencilBookings = cancelledPencilBookings;
    }

    if (bookingType === 'firm' && otherPencilOverlaps.length > 0) {
      response.overlappingPencils = formatConflicts(otherPencilOverlaps);
    }

    if (otherPencilOverlaps.length > 0 && bookingType === 'pencil') {
      response.conflicts = formatConflicts(otherPencilOverlaps);
    }

    const bookingPlain = createdBooking.toJSON();
    bookingPlain.contentionChallenger = createdBooking.contentionRole === 'challenger';
    response.booking = bookingPlain;

    res.status(201).json(response);

    const resourceName = await resolveResourceName(resourceType, resourceId);
    notifyBookingCreated(createdBooking, resourceName).catch(() => {});

    if (contentionResult?.action === 'challenger') {
      const freshBooking = await Booking.findByPk(createdBooking.id, {
        include: [{ model: User, as: 'user' }]
      });
      const defender = await Booking.findByPk(freshBooking.challengingBookingId, {
        include: [{ model: User, as: 'user' }]
      });
      if (freshBooking && defender) {
        notifyContentionStarted({ defender, challenger: freshBooking }, resourceName).catch(() => {});
      }
    }

  } catch (error) {
    console.error('Error creating booking:', error);
    res.status(500).json({ error: api.create.failed });
  }
};

const getAllBookings = async (req, res) => {
  try {
    const userId = req.user.id;
    const userAccountType = getUserAccountType(req);
    const { status, resourceType, mine } = req.query;
    const approvedBy = req.query.approvedBy;
    const approvedByUserIdRaw = req.query.approvedByUserId;
    const approvedByUserIdParsed =
      approvedByUserIdRaw != null && approvedByUserIdRaw !== ''
        ? parseInt(approvedByUserIdRaw, 10)
        : null;
    const rebookSourceDenied =
      req.query.rebookSourceDenied === 'true' || req.query.rebookSourceDenied === true;

    if (
      rebookSourceDenied &&
      userAccountType !== 'ptcf_staff' &&
      userAccountType !== 'system_admin'
    ) {
      return res.status(403).json({ error: api.list.accessDenied });
    }

    if (
      (approvedBy === 'me' || approvedByUserIdRaw != null) &&
      userAccountType !== 'ptcf_staff' &&
      userAccountType !== 'system_admin'
    ) {
      return res.status(403).json({ error: api.list.accessDenied });
    }

    if (approvedBy != null && approvedBy !== 'me') {
      return res.status(400).json({ error: api.list.invalidApprovedBy });
    }

    if (
      approvedByUserIdRaw != null &&
      (Number.isNaN(approvedByUserIdParsed) || approvedByUserIdParsed <= 0)
    ) {
      return res.status(400).json({ error: api.list.approvedByUserIdInvalid });
    }

    if ((approvedBy === 'me' || approvedByUserIdRaw != null) && status !== 'approved') {
      return res.status(400).json({
        error: api.list.approvedByRequiresApprovedStatus
      });
    }

    const whereClause = {};
    const restrictToOwnBookings = mine === 'true';

    if (restrictToOwnBookings || (userAccountType !== 'ptcf_staff' && userAccountType !== 'system_admin')) {
      whereClause.userId = userId;
    }

    if (resourceType) {
      if (!['equipment', 'room'].includes(resourceType)) {
        return res.status(400).json({ error: api.create.invalidResourceType });
      }
      whereClause.resourceType = resourceType;
    }

    const allVisibleBookings = await Booking.findAll({
      where: whereClause,
      attributes: ['id', 'bookingThreadId', 'status', 'createdAt'],
    });

    const latestBookingIdByThread = getLatestBookingIdByThread(allVisibleBookings);
    const latestBookingIds = [...latestBookingIdByThread.values()];

    if (latestBookingIds.length === 0) {
      return res.json([]);
    }

    const finalWhereClause = {
      id: { [Op.in]: latestBookingIds }
    };

    if (status) {
      finalWhereClause.status = status;
    }

    if (rebookSourceDenied) {
      finalWhereClause.rebookedFromStatus = 'denied';
    }

    if (status === 'approved') {
      if (approvedBy === 'me') {
        finalWhereClause.approvedByUserId = userId;
      } else if (approvedByUserIdParsed != null) {
        finalWhereClause.approvedByUserId = approvedByUserIdParsed;
      }
    }

    const bookings = await Booking.findAll({
      where: finalWhereClause,
      include: buildBookingIncludes({
        includeThreadHistory: restrictToOwnBookings || userAccountType === 'ptcf_staff' || userAccountType === 'system_admin'
      }),
      order: [['createdAt', 'DESC']]
    });

    const enriched = await Promise.all(bookings.map(async (booking) => {
      const plain = booking.toJSON();
      plain.canRebook = computeCanRebook(plain);
      plain.contentionChallenger = booking.contentionRole === 'challenger';
      
      if (booking.contentionRole) {
        plain.contentionDetail = await contention.getContentionDetails(booking, { Booking, User });
      } else {
        plain.contentionDetail = null;
      }

      await attachDashboardOverlapHints(plain);
      
      return plain;
    }));

    res.json(enriched);
  } catch (error) {
    console.error('Error fetching bookings:', error);
    res.status(500).json({ error: api.list.fetchFailed });
  }
};

const getBookingById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userAccountType = getUserAccountType(req);

    const booking = await Booking.findByPk(id, {
      include: buildBookingIncludes({
        includeThreadHistory: userAccountType === 'ptcf_staff' || userAccountType === 'system_admin'
      })
    });

    if (!booking) {
      return res.status(404).json({ error: api.getById.notFound });
    }

    if (booking.userId !== userId && 
        userAccountType !== 'ptcf_staff' && 
        userAccountType !== 'system_admin') {
      return res.status(403).json({ error: api.getById.accessDenied });
    }

    const plain = booking.toJSON();
    plain.canRebook = computeCanRebook(plain);
    plain.contentionChallenger = booking.contentionRole === 'challenger';

    if (booking.contentionRole) {
      plain.contentionDetail = await contention.getContentionDetails(booking, { Booking, User });
    } else {
      plain.contentionDetail = null;
    }

    await attachDashboardOverlapHints(plain);

    res.json(plain);
  } catch (error) {
    console.error('Error fetching booking:', error);
    res.status(500).json({ error: api.getById.fetchFailed });
  }
};

const cancelBooking = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userAccountType = getUserAccountType(req);

    const booking = await Booking.findByPk(id, {
      include: buildBookingIncludes({ includeThreadHistory: true })
    });

    if (!booking) {
      return res.status(404).json({ error: api.getById.notFound });
    }

    if (booking.userId !== userId && 
        userAccountType !== 'ptcf_staff' && 
        userAccountType !== 'system_admin') {
      return res.status(403).json({ error: api.cancel.accessDenied });
    }

    if (['cancelled', 'denied', 'expired', 'displaced', 'completed'].includes(booking.status)) {
      return res.status(400).json({ error: api.cancel.alreadyTerminal({ status: booking.status }) });
    }

    if (
      booking.bookingType === 'firm' &&
      ['pending_approval', 'approved'].includes(booking.status) &&
      new Date(booking.startTime) <= new Date()
    ) {
      return res.status(400).json({
        error: api.cancel.firmStarted
      });
    }

    const displacedNotifyList = [];
    if (booking.bookingType === 'firm' && booking.status === 'approved') {
      const displaced = await Booking.findAll({
        where: { displacedByBookingId: booking.id, status: 'displaced' },
        include: [{ model: User, as: 'user', attributes: ['id', 'email'] }]
      });
      displacedNotifyList.push(...displaced);
    }

    await sequelize.transaction(async (t) => {
      const b = await Booking.findByPk(booking.id, { transaction: t, lock: t.LOCK.UPDATE });
      if (!b) return;

      // Set status to cancelled FIRST so that overlap queries inside the
      // contention promotion logic do not see this booking as an active pencil.
      b.status = 'cancelled';
      await b.save({ transaction: t });

      if (b.contentionRole) {
        // Active contention participant in strict 1v1 mode.
        await contention.onBookingCancelledMidContention(b, {
          transaction: t,
          Booking
        });
      } else if (b.bookingType === 'firm') {
        // Firm booking cancellation: clear any residual contention metadata.
        await contention.onFirmDeniedOrCancelled(b, { transaction: t, Booking });
      }
    });

    const updated = await Booking.findByPk(booking.id, {
      include: buildBookingIncludes({ includeThreadHistory: true })
    });

    res.json({
      message: api.cancel.successMessage,
      booking: updated
    });

    const cancelledById = req.user.id;
    const resourceName = await resolveResourceName(booking.resourceType, booking.resourceId);
    notifyBookingCancelled(updated, resourceName, cancelledById).catch(() => {});

    for (const d of displacedNotifyList) {
      notifyDisplacedUsersSlotReopened(d, updated, resourceName).catch(() => {});
    }
  } catch (error) {
    console.error('Error cancelling booking:', error);
    res.status(500).json({ error: api.cancel.failed });
  }
};

const convertToFirm = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const purposeInput = req.body?.purpose;

    const booking = await Booking.findByPk(id, {
      include: buildBookingIncludes({ includeThreadHistory: true })
    });

    if (!booking) {
      return res.status(404).json({ error: api.getById.notFound });
    }

    if (booking.userId !== userId) {
      return res.status(403).json({ error: api.convert.accessDenied });
    }

    if (booking.bookingType === 'firm') {
      return res.status(400).json({ error: api.convert.alreadyFirm });
    }

    if (['cancelled', 'denied', 'expired', 'displaced', 'completed'].includes(booking.status)) {
      return res.status(400).json({
        error: api.convert.cannotConvertStatus({ status: booking.status })
      });
    }

    try {
      assertStartNotWithinLockHours(booking.startTime);
    } catch (lockErr) {
      if (lockErr.statusCode) {
        return res.status(lockErr.statusCode).json({ error: lockErr.message, code: lockErr.code });
      }
      throw lockErr;
    }

    if (!contention.canConvertToFirm(booking)) {
      if (booking.contentionRole === 'challenger') {
        return res.status(400).json({
          error: api.convert.challengerBlocked
        });
      }
    }

    const hasExistingAuth = hasAuthDoc(booking.authorizationDocUrl);
    if (!req.file && !hasExistingAuth) {
      return res.status(400).json({
        error: api.convert.authRequired
      });
    }

    let authDocUrl;
    let authDocHash;
    if (req.file) {
      authDocUrl = await uploadToCloudinary(req.file.buffer, 'authorization-docs');
      authDocHash = sha256HexBuffer(req.file.buffer);
    } else {
      authDocUrl = booking.authorizationDocUrl;
      authDocHash = booking.authorizationDocHash;
    }

    const nextPurpose =
      purposeInput !== undefined && purposeInput !== null
        ? normalizeOptionalText(purposeInput) || null
        : undefined;

    const formatConflict = (c) => ({
      id: c.id,
      bookingType: c.bookingType,
      status: c.status,
      startTime: c.startTime,
      endTime: c.endTime,
      user: {
        id: c.user.id,
        email: c.user.email
      }
    });

    try {
      await sequelize.transaction(async (t) => {
        const b = await Booking.findByPk(id, {
          transaction: t,
          lock: t.LOCK.UPDATE
        });

        if (!b || b.userId !== userId) {
          const err = new Error(api.convert.notFound);
          err.statusCode = 404;
          throw err;
        }

        const firmBlockers = await Booking.findFirmBlockers(
          b.resourceType,
          b.resourceId,
          b.startTime,
          b.endTime,
          b.id,
          { transaction: t }
        );

        if (firmBlockers.length > 0) {
          const err = new Error(api.convert.overlapsFirm);
          err.statusCode = 409;
          err.conflicts = firmBlockers.map(formatConflict);
          throw err;
        }

        const wasDefender = b.contentionRole === 'defender';

        b.bookingType = 'firm';
        b.status = 'pending_approval';
        b.authorizationDocUrl = authDocUrl;
        b.authorizationDocHash = authDocHash;
        if (nextPurpose !== undefined) {
          b.purpose = nextPurpose;
        }
        b.expiryAt = null;
        await b.save({ transaction: t });

        if (wasDefender) {
          await contention.onDefenderConvertedToFirm(b, { transaction: t, Booking });
        }
      });
    } catch (txnErr) {
      if (txnErr.statusCode === 409) {
        return res.status(409).json({
          error: txnErr.message,
          conflicts: txnErr.conflicts || []
        });
      }
      if (txnErr.statusCode === 404) {
        return res.status(404).json({ error: txnErr.message });
      }
      throw txnErr;
    }

    const updatedBooking = await Booking.findByPk(booking.id, {
      include: buildBookingIncludes({ includeThreadHistory: true })
    });

    res.json({
      message: api.convert.successMessage,
      booking: updatedBooking
    });
  } catch (error) {
    console.error('Error converting booking to firm:', error);
    res.status(500).json({ error: api.convert.failed });
  }
};

const approveBooking = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ error: api.approve.invalidId });
    }
    const { staffRemark } = req.body;
    const approverUserId = req.user.id;

    const booking = await Booking.findByPk(id, {
      attributes: ['id', 'status', 'bookingType', 'startTime', 'resourceType', 'resourceId']
    });

    if (!booking) {
      return res.status(404).json({ error: api.getById.notFound });
    }

    if (booking.bookingType !== 'firm' || booking.status !== 'pending_approval') {
      return res.status(400).json({
        error: api.approve.invalidStatus({ status: booking.status })
      });
    }

    if (isWithinLockHours(booking.startTime)) {
      return res.status(400).json({
        error: api.approve.lockWindow,
        code: 'FIRM_APPROVAL_LOCK_WINDOW'
      });
    }

    try {
      await sequelize.transaction(async (t) => {
        const updatePayload = {
          status: 'approved',
          approvedByUserId: approverUserId,
          approvedAt: new Date()
        };
        if (staffRemark) {
          updatePayload.staffRemark = staffRemark;
        }

        const [affectedCount] = await Booking.update(updatePayload, {
          where: {
            id,
            status: 'pending_approval',
            bookingType: 'firm'
          },
          transaction: t
        });

        if (affectedCount === 0) {
          const err = new Error(api.approve.concurrentUpdate);
          err.statusCode = 409;
          throw err;
        }

        const full = await Booking.findByPk(id, {
          transaction: t,
          include: [{ model: User, as: 'user', attributes: ['id', 'email'] }]
        });

        await contention.onFirmBookingApproved(full, {
          transaction: t,
          Booking
        });
      });
    } catch (txnErr) {
      if (txnErr.statusCode === 409) {
        return res.status(409).json({ error: txnErr.message });
      }
      throw txnErr;
    }

    const updatedBooking = await Booking.findByPk(id, {
      include: buildBookingIncludes({ includeThreadHistory: true })
    });

    res.json({
      message: api.approve.successMessage,
      booking: updatedBooking
    });

    resolveResourceName(updatedBooking.resourceType, updatedBooking.resourceId).then((resourceName) => {
      notifyBookingApproved(updatedBooking, resourceName).catch(() => {});
    });
  } catch (error) {
    console.error('Error approving booking:', error);
    res.status(500).json({ error: api.approve.failed });
  }
};

const denyBooking = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ error: api.approve.invalidId });
    }
    const { staffRemark } = req.body;

    const booking = await Booking.findByPk(id, {
      attributes: ['id', 'status', 'bookingType', 'contentionRole']
    });

    if (!booking) {
      return res.status(404).json({ error: api.getById.notFound });
    }

    if (booking.bookingType !== 'firm' || booking.status !== 'pending_approval') {
      return res.status(400).json({
        error: api.deny.invalidBooking
      });
    }

    const updatePayload = { status: 'denied' };
    if (staffRemark) {
      updatePayload.staffRemark = staffRemark;
    }

    try {
      await sequelize.transaction(async (t) => {
        const [affectedCount] = await Booking.update(updatePayload, {
          where: {
            id,
            status: 'pending_approval',
            bookingType: 'firm'
          },
          transaction: t
        });

        if (affectedCount === 0) {
          const err = new Error(api.approve.concurrentUpdate);
          err.statusCode = 409;
          throw err;
        }

        const deniedRow = await Booking.findByPk(id, {
          transaction: t,
          lock: t.LOCK.UPDATE
        });

        if (deniedRow.contentionRole === 'defender') {
          await contention.onFirmDeniedOrCancelled(deniedRow, {
            transaction: t,
            Booking
          });
        }
      });
    } catch (txnErr) {
      if (txnErr.statusCode === 409) {
        return res.status(409).json({ error: txnErr.message });
      }
      throw txnErr;
    }

    const updatedBooking = await Booking.findByPk(id, {
      include: buildBookingIncludes({ includeThreadHistory: true })
    });

    res.json({
      message: 'Booking denied',
      booking: updatedBooking
    });

    resolveResourceName(updatedBooking.resourceType, updatedBooking.resourceId).then((resourceName) => {
      notifyBookingDenied(updatedBooking, resourceName).catch(() => {});
    });
  } catch (error) {
    console.error('Error denying booking:', error);
    res.status(500).json({ error: api.deny.failed });
  }
};

const getAvailability = async (req, res) => {
  try {
    const { resourceType, resourceId, startDate, endDate } = req.query;

    const whereClause = {
      status: {
        [Op.notIn]: ['cancelled', 'denied', 'expired', 'displaced', 'completed']
      }
    };

    if (resourceType) {
      if (!['equipment', 'room'].includes(resourceType)) {
        return res.status(400).json({ error: api.create.invalidResourceType });
      }
      whereClause.resourceType = resourceType;
    }

    if (resourceId) {
      whereClause.resourceId = parseInt(resourceId, 10);
    }

    if (startDate) {
      const start = new Date(startDate);
      if (isNaN(start.getTime())) {
        return res.status(400).json({ error: api.availability.invalidStartDate });
      }
      whereClause.endTime = { [Op.gte]: start };
    }

    if (endDate) {
      const end = new Date(endDate);
      if (isNaN(end.getTime())) {
        return res.status(400).json({ error: api.availability.invalidEndDate });
      }
      whereClause.startTime = { 
        ...(whereClause.startTime || {}),
        [Op.lte]: end 
      };
    }

    const bookings = await Booking.findAll({
      where: whereClause,
      attributes: [
        'id', 'resourceType', 'resourceId', 'bookingType', 'status',
        'startTime', 'endTime', 'contentionRole', 'contentionDeadlineAt', 'challengingBookingId'
      ],
      order: [['startTime', 'ASC']]
    });

    const payload = bookings.map((b) => {
      const row = b.get({ plain: true });
      return {
        id: row.id,
        resourceType: row.resourceType,
        resourceId: row.resourceId,
        bookingType: row.bookingType,
        status: row.status,
        startTime: row.startTime,
        endTime: row.endTime,
        contentionChallenger: row.contentionRole === 'challenger',
        contentionRole: row.contentionRole || null,
        contentionDeadlineAt: row.contentionDeadlineAt || null,
        challengingBookingId: row.challengingBookingId || null,
        contentionQueuePosition: null
      };
    });

    res.json(payload);
  } catch (error) {
    console.error('Error fetching availability:', error);
    res.status(500).json({ error: api.availability.fetchFailed });
  }
};

const getBookingConflicts = async (req, res) => {
  try {
    const { id } = req.params;

    const booking = await Booking.findByPk(id);
    if (!booking) {
      return res.status(404).json({ error: api.getById.notFound });
    }

    const conflicts = await Booking.findConflicts(
      booking.resourceType,
      booking.resourceId,
      booking.startTime,
      booking.endTime,
      booking.id
    );

    res.json(conflicts);
  } catch (error) {
    console.error('Error fetching booking conflicts:', error);
    res.status(500).json({ error: api.conflicts.fetchFailed });
  }
};

module.exports = {
  createBooking,
  getAllBookings,
  getBookingById,
  getAvailability,
  cancelBooking,
  convertToFirm,
  approveBooking,
  denyBooking,
  getBookingConflicts
};
