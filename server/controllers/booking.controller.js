const {
  Booking,
  User,
  Equipment,
  Room,
  sequelize,
  ContentionEpisode,
  ContentionQueueItem
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
  notifyBookingQueuedForContention,
  notifyDisplacedUsersSlotReopened,
} = require('../utils/booking-notifications');
const { computePencilExpiryAt, assertStartNotWithinLockHours, isWithinLockHours } = require('../utils/booking-rules');
const contention = require('../services/contention.service');

const getUserAccountType = (req) => req.user?.accountType || req.user?.role;
const REBOOKABLE_STATUSES = ['cancelled', 'denied', 'expired', 'displaced'];

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
    const confirmContention = req.body.confirmContention === true || req.body.confirmContention === 'true';
    const rebookedFromBookingIdRaw = req.body.rebookedFromBookingId;
    const userId = req.user.id;

    // Handle optional file upload for authorization document
    let authorizationDocUrl = req.body.authorizationDocUrl || null;
    let authorizationDocHash = null;
    if (req.file) {
      authorizationDocHash = sha256HexBuffer(req.file.buffer);
      authorizationDocUrl = await uploadToCloudinary(req.file.buffer, 'authorization-docs');
    }

    if (!resourceType || !resourceId || !bookingType || !startTime || !endTime) {
      return res.status(400).json({
        error: 'Missing required fields: resourceType, resourceId, bookingType, startTime, and endTime are required'
      });
    }

    if (!['equipment', 'room'].includes(resourceType)) {
      return res.status(400).json({ error: 'Invalid resourceType. Must be "equipment" or "room"' });
    }

    if (!['pencil', 'firm'].includes(bookingType)) {
      return res.status(400).json({ error: 'Invalid bookingType. Must be "pencil" or "firm"' });
    }

    const start = new Date(startTime);
    const end = new Date(endTime);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ error: 'Invalid date format for startTime or endTime' });
    }

    if (start >= end) {
      return res.status(400).json({ error: 'endTime must be after startTime' });
    }

    if (start < new Date()) {
      return res.status(400).json({ error: 'Cannot create booking in the past' });
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
        return res.status(400).json({ error: 'Invalid rebookedFromBookingId' });
      }

      sourceBooking = await Booking.findByPk(rebookedFromBookingId);
      if (!sourceBooking) {
        return res.status(404).json({ error: 'Source booking for rebook not found' });
      }

      if (sourceBooking.userId !== userId) {
        return res.status(403).json({ error: 'Access denied. You can only rebook your own booking attempts.' });
      }

      if (!REBOOKABLE_STATUSES.includes(sourceBooking.status)) {
        return res.status(400).json({
          error: `Cannot rebook from booking with status: ${sourceBooking.status}. Only denied, cancelled, expired, or displaced attempts can be rebooked.`
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
            error:
              'Cannot rebook yet: the firm booking that displaced this slot is still pending or approved. Try again after it is cancelled or denied.',
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
          error: 'This booking attempt is no longer the latest in its thread. Please rebook from the most recent attempt.'
        });
      }

      if (sourceBooking.resourceType !== resourceType || sourceBooking.resourceId !== parseInt(resourceId, 10)) {
        return res.status(400).json({
          error: 'Resource type and resource must match the source booking when rebooking.'
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
      return res.status(404).json({ error: `${resourceType} not found` });
    }

    if (!['available', 'in-use'].includes(resource.status)) {
      return res.status(400).json({ 
        error: `Cannot book ${resourceType}. Current status: ${resource.status}` 
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
        user: {
          id: c.user.id,
          email: c.user.email
        }
      }));

    if (bookingType === 'firm') {
      if (firmBlockers.length > 0) {
        return res.status(409).json({
          error: 'Firm booking conflicts with an existing firm booking',
          conflicts: formatConflicts(firmBlockers)
        });
      }
      if (ownPencilOverlaps.length > 0 && !confirmOverlapOwn) {
        return res.status(409).json({
          error:
            'Firm booking overlaps your existing pencil booking(s). Confirm to proceed — overlapping pencil bookings will be cancelled.',
          requiresConfirmation: true,
          ownPencilConflicts: formatConflicts(ownPencilOverlaps)
        });
      }
    }

    if (bookingType === 'pencil') {
      if (firmBlockers.length > 0) {
        return res.status(409).json({
          error: 'Cannot create pencil booking: time slot overlaps a firm booking',
          conflicts: formatConflicts(firmBlockers)
        });
      }
      if (ownPencilOverlaps.length > 0) {
        return res.status(409).json({
          error: 'You already have a pencil booking for this time slot',
          conflicts: formatConflicts(ownPencilOverlaps)
        });
      }
      if (otherPencilOverlaps.length > 0 && !confirmContention) {
        return res.status(409).json({
          error:
            'This pencil booking would contest an existing pencil booking. Confirm to proceed.',
          requiresContentionConfirmation: true,
          conflicts: formatConflicts(otherPencilOverlaps)
        });
      }
    }

    let cancelledPencilBookings = [];
    if (bookingType === 'firm' && ownPencilOverlaps.length > 0 && confirmOverlapOwn) {
      for (const pencilBooking of ownPencilOverlaps) {
        await sequelize.transaction(async (t) => {
          const b = await Booking.findByPk(pencilBooking.id, { transaction: t, lock: t.LOCK.UPDATE });
          if (!b || !['penciled', 'contested', 'queued'].includes(b.status)) return;
          await contention.onBookingCancelledMidContention(b, {
            transaction: t,
            Booking,
            ContentionEpisode,
            ContentionQueueItem
          });
          b.status = 'cancelled';
          b.staffRemark = 'Auto-cancelled: superseded by firm booking';
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
    try {
      createdBooking = await sequelize.transaction(async (t) => {
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
          const openEp = await contention.findOpenEpisodeOverlappingSlot(
            { resourceType, resourceId, startTime: start, endTime: end },
            { transaction: t, ContentionEpisode, Booking }
          );
          if (openEp) {
            const b = await Booking.findByPk(created.id, { transaction: t, lock: t.LOCK.UPDATE });
            await contention.enqueueBookingInEpisode(b, openEp.id, {
              transaction: t,
              ContentionQueueItem,
              Booking
            });
          } else {
            const defenderRow = contention.pickDefenderBooking(otherPencilOverlaps);
            if (!defenderRow) {
              throw new Error('No defender for contention');
            }
            const d = await Booking.findByPk(defenderRow.id, { transaction: t, lock: t.LOCK.UPDATE });
            const c = await Booking.findByPk(created.id, { transaction: t, lock: t.LOCK.UPDATE });
            await contention.openEpisode(
              {
                defenderBooking: d,
                challengerBooking: c,
                resourceType,
                resourceId
              },
              { transaction: t, ContentionEpisode, Booking }
            );
          }
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
      throw txnErr;
    }

    const response = {
      booking: createdBooking,
      message:
        cancelledPencilBookings.length > 0
          ? `Booking created successfully. ${cancelledPencilBookings.length} overlapping pencil booking(s) were cancelled.`
          : bookingType === 'firm' && otherPencilOverlaps.length > 0
            ? 'Firm booking submitted for staff approval. Overlapping pencil bookings will be displaced if it is approved.'
            : otherPencilOverlaps.length > 0 && bookingType === 'pencil'
              ? createdBooking.status === 'queued'
                ? 'Booking created and queued for contention.'
                : 'Booking created; contention timer started against the overlapping pencil holder.'
              : 'Booking created successfully'
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

    res.status(201).json(response);

    const resourceName = await resolveResourceName(resourceType, resourceId);
    notifyBookingCreated(createdBooking, resourceName).catch(() => {});

    const epChallenger = await ContentionEpisode.findOne({
      where: { challengerBookingId: createdBooking.id, status: 'open' },
      include: [
        { model: Booking, as: 'defenderBooking', include: [{ model: User, as: 'user' }] },
        { model: Booking, as: 'challengerBooking', include: [{ model: User, as: 'user' }] }
      ]
    });
    if (epChallenger) {
      notifyContentionStarted(epChallenger, resourceName).catch(() => {});
    }

    const queueRow = await ContentionQueueItem.findOne({
      where: { bookingId: createdBooking.id },
      include: [{ model: ContentionEpisode, as: 'episode' }]
    });
    if (queueRow) {
      notifyBookingQueuedForContention(createdBooking, resourceName, queueRow.position).catch(() => {});
    }
  } catch (error) {
    console.error('Error creating booking:', error);
    res.status(500).json({ error: 'Failed to create booking' });
  }
};

const getAllBookings = async (req, res) => {
  try {
    const userId = req.user.id;
    const userAccountType = getUserAccountType(req);
    const { status, resourceType, mine } = req.query;
    const rebookSourceDenied =
      req.query.rebookSourceDenied === 'true' || req.query.rebookSourceDenied === true;

    if (
      rebookSourceDenied &&
      userAccountType !== 'ptcf_staff' &&
      userAccountType !== 'system_admin'
    ) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const whereClause = {};
    const restrictToOwnBookings = mine === 'true';

    if (restrictToOwnBookings || (userAccountType !== 'ptcf_staff' && userAccountType !== 'system_admin')) {
      whereClause.userId = userId;
    }

    if (resourceType) {
      if (!['equipment', 'room'].includes(resourceType)) {
        return res.status(400).json({ error: 'Invalid resourceType. Must be "equipment" or "room"' });
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

    const bookings = await Booking.findAll({
      where: finalWhereClause,
      include: buildBookingIncludes({
        includeThreadHistory: restrictToOwnBookings || userAccountType === 'ptcf_staff' || userAccountType === 'system_admin'
      }),
      order: [['createdAt', 'DESC']]
    });

    const withFlags = bookings.map((booking) => {
      const plain = booking.toJSON();
      plain.canRebook = computeCanRebook(plain);
      return plain;
    });

    res.json(withFlags);
  } catch (error) {
    console.error('Error fetching bookings:', error);
    res.status(500).json({ error: 'Failed to fetch bookings' });
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
      return res.status(404).json({ error: 'Booking not found' });
    }

    if (booking.userId !== userId && 
        userAccountType !== 'ptcf_staff' && 
        userAccountType !== 'system_admin') {
      return res.status(403).json({ error: 'Access denied. You can only view your own bookings.' });
    }

    const plain = booking.toJSON();
    plain.canRebook = computeCanRebook(plain);
    res.json(plain);
  } catch (error) {
    console.error('Error fetching booking:', error);
    res.status(500).json({ error: 'Failed to fetch booking' });
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
      return res.status(404).json({ error: 'Booking not found' });
    }

    if (booking.userId !== userId && 
        userAccountType !== 'ptcf_staff' && 
        userAccountType !== 'system_admin') {
      return res.status(403).json({ error: 'Access denied. You can only cancel your own bookings.' });
    }

    if (['cancelled', 'denied', 'expired', 'displaced'].includes(booking.status)) {
      return res.status(400).json({ error: `Booking is already ${booking.status}` });
    }

    if (
      booking.bookingType === 'firm' &&
      ['pending_approval', 'approved'].includes(booking.status) &&
      isWithinLockHours(booking.startTime)
    ) {
      return res.status(400).json({
        error: 'Firm bookings cannot be cancelled within 24 hours of the scheduled start time.'
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
      await contention.onBookingCancelledMidContention(b, {
        transaction: t,
        Booking,
        ContentionEpisode,
        ContentionQueueItem
      });
      b.status = 'cancelled';
      await b.save({ transaction: t });
    });

    const updated = await Booking.findByPk(booking.id, {
      include: buildBookingIncludes({ includeThreadHistory: true })
    });

    res.json({
      message: 'Booking cancelled successfully',
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
    res.status(500).json({ error: 'Failed to cancel booking' });
  }
};

const convertToFirm = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    if (!req.file) {
      return res.status(400).json({
        error: 'Authorization document is required when converting to firm booking'
      });
    }

    const booking = await Booking.findByPk(id, {
      include: buildBookingIncludes({ includeThreadHistory: true })
    });

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    if (booking.userId !== userId) {
      return res.status(403).json({ error: 'Access denied. You can only convert your own bookings.' });
    }

    if (booking.bookingType === 'firm') {
      return res.status(400).json({ error: 'Booking is already a firm booking' });
    }

    if (['cancelled', 'denied', 'expired', 'displaced'].includes(booking.status)) {
      return res.status(400).json({
        error: `Cannot convert ${booking.status} booking to firm`
      });
    }

    if (booking.status === 'queued') {
      return res.status(400).json({
        error:
          'This booking is waiting in a contention queue. It cannot be converted until it becomes an active pencil.'
      });
    }

    const epAsChallenger = await contention.findOpenEpisodeForChallenger(booking.id, {
      transaction: null,
      ContentionEpisode
    });
    if (epAsChallenger) {
      return res.status(400).json({
        error:
          'Only the contested pencil holder (defender) can convert to firm to win a contention. You are the challenger.'
      });
    }

    const authDocUrl = await uploadToCloudinary(req.file.buffer, 'authorization-docs');
    const authDocHash = sha256HexBuffer(req.file.buffer);

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
        // No includes here: Postgres rejects FOR UPDATE on outer joins (User is LEFT JOINed).
        const b = await Booking.findByPk(id, {
          transaction: t,
          lock: t.LOCK.UPDATE
        });

        if (!b || b.userId !== userId) {
          const err = new Error('Booking not found');
          err.statusCode = 404;
          throw err;
        }

        const epDef = await contention.findOpenEpisodeForDefender(b.id, { transaction: t, ContentionEpisode });
        if (epDef) {
          await contention.onDefenderConvertedToFirm(b, epDef.id, {
            transaction: t,
            Booking,
            ContentionEpisode,
            ContentionQueueItem
          });
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
          const err = new Error('Cannot convert to firm booking: time slot overlaps another firm booking');
          err.statusCode = 409;
          err.conflicts = firmBlockers.map(formatConflict);
          throw err;
        }

        b.bookingType = 'firm';
        b.status = 'pending_approval';
        b.authorizationDocUrl = authDocUrl;
        b.authorizationDocHash = authDocHash;
        b.expiryAt = null;
        await b.save({ transaction: t });
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
      message: 'Booking converted to firm successfully. Awaiting staff approval.',
      booking: updatedBooking
    });
  } catch (error) {
    console.error('Error converting booking to firm:', error);
    res.status(500).json({ error: 'Failed to convert booking to firm' });
  }
};

const approveBooking = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ error: 'Invalid booking id' });
    }
    const { staffRemark } = req.body;

    const booking = await Booking.findByPk(id, {
      attributes: ['id', 'status', 'bookingType']
    });

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    if (booking.bookingType !== 'firm' || booking.status !== 'pending_approval') {
      return res.status(400).json({
        error: `Cannot approve booking with status: ${booking.status}. Only firm bookings awaiting staff approval can be approved.`
      });
    }

    try {
      await sequelize.transaction(async (t) => {
        const updatePayload = { status: 'approved' };
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
          const err = new Error(
            'This booking was updated by another action. Refresh the staff dashboard and try again.'
          );
          err.statusCode = 409;
          throw err;
        }

        const full = await Booking.findByPk(id, {
          transaction: t,
          include: [{ model: User, as: 'user', attributes: ['id', 'email'] }]
        });

        await contention.onFirmBookingApproved(full, {
          transaction: t,
          Booking,
          ContentionEpisode,
          ContentionQueueItem
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
      message: 'Booking approved successfully',
      booking: updatedBooking
    });

    resolveResourceName(updatedBooking.resourceType, updatedBooking.resourceId).then((resourceName) => {
      notifyBookingApproved(updatedBooking, resourceName).catch(() => {});
    });
  } catch (error) {
    console.error('Error approving booking:', error);
    res.status(500).json({ error: 'Failed to approve booking' });
  }
};

const denyBooking = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ error: 'Invalid booking id' });
    }
    const { staffRemark } = req.body;

    const booking = await Booking.findByPk(id, {
      attributes: ['id', 'status', 'bookingType']
    });

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    if (booking.bookingType !== 'firm' || booking.status !== 'pending_approval') {
      return res.status(400).json({
        error: 'Only firm bookings awaiting staff approval can be denied.'
      });
    }

    const updatePayload = { status: 'denied' };
    if (staffRemark) {
      updatePayload.staffRemark = staffRemark;
    }

    const [affectedCount] = await Booking.update(updatePayload, {
      where: {
        id,
        status: 'pending_approval',
        bookingType: 'firm'
      }
    });

    if (affectedCount === 0) {
      return res.status(409).json({
        error: 'This booking was updated by another action. Refresh the staff dashboard and try again.'
      });
    }

    const updatedBooking = await Booking.findByPk(id, {
      include: buildBookingIncludes({ includeThreadHistory: true })
    });

    res.json({
      message: 'Booking denied',
      booking: updatedBooking
    });

    // Non-blocking email notification
    resolveResourceName(updatedBooking.resourceType, updatedBooking.resourceId).then((resourceName) => {
      notifyBookingDenied(updatedBooking, resourceName).catch(() => {});
    });
  } catch (error) {
    console.error('Error denying booking:', error);
    res.status(500).json({ error: 'Failed to deny booking' });
  }
};

const getAvailability = async (req, res) => {
  try {
    const { resourceType, resourceId, startDate, endDate } = req.query;

    const whereClause = {
      status: {
        [Op.notIn]: ['cancelled', 'denied', 'expired', 'displaced']
      }
    };

    if (resourceType) {
      if (!['equipment', 'room'].includes(resourceType)) {
        return res.status(400).json({ error: 'Invalid resourceType. Must be "equipment" or "room"' });
      }
      whereClause.resourceType = resourceType;
    }

    if (resourceId) {
      whereClause.resourceId = parseInt(resourceId, 10);
    }

    if (startDate) {
      const start = new Date(startDate);
      if (isNaN(start.getTime())) {
        return res.status(400).json({ error: 'Invalid startDate format' });
      }
      whereClause.endTime = { [Op.gte]: start };
    }

    if (endDate) {
      const end = new Date(endDate);
      if (isNaN(end.getTime())) {
        return res.status(400).json({ error: 'Invalid endDate format' });
      }
      whereClause.startTime = { 
        ...(whereClause.startTime || {}),
        [Op.lte]: end 
      };
    }

    const bookings = await Booking.findAll({
      where: whereClause,
      attributes: ['id', 'resourceType', 'resourceId', 'bookingType', 'status', 'startTime', 'endTime'],
      order: [['startTime', 'ASC']]
    });

    const challengerIdSet = new Set();
    if (bookings.length > 0) {
      const episodeWhere = { status: 'open' };
      if (resourceType && resourceId) {
        episodeWhere.resourceType = resourceType;
        episodeWhere.resourceId = parseInt(resourceId, 10);
      } else {
        const pairs = [
          ...new Map(
            bookings.map((b) => [`${b.resourceType}:${b.resourceId}`, { resourceType: b.resourceType, resourceId: b.resourceId }])
          ).values()
        ];
        if (pairs.length === 1) {
          episodeWhere.resourceType = pairs[0].resourceType;
          episodeWhere.resourceId = pairs[0].resourceId;
        } else {
          episodeWhere[Op.or] = pairs;
        }
      }

      const episodes = await ContentionEpisode.findAll({
        where: episodeWhere,
        attributes: ['challengerBookingId']
      });
      for (const ep of episodes) {
        challengerIdSet.add(ep.challengerBookingId);
      }
    }

    const payload = bookings.map((b) => {
      const row = b.get({ plain: true });
      return {
        ...row,
        contentionChallenger: challengerIdSet.has(b.id)
      };
    });

    res.json(payload);
  } catch (error) {
    console.error('Error fetching availability:', error);
    res.status(500).json({ error: 'Failed to fetch availability' });
  }
};

const getBookingConflicts = async (req, res) => {
  try {
    const { id } = req.params;

    const booking = await Booking.findByPk(id);
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
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
    res.status(500).json({ error: 'Failed to fetch booking conflicts' });
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
