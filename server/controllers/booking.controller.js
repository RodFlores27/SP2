const {
  Booking,
  AuditLog,
  User,
  Equipment,
  Room,
  BookingReferenceSequence,
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
  notifyBookingOnHold,
  notifyBookingOnHoldReleased,
  notifyBookingDisplaced,
  notifyContentionResolved,
  notifyContentionStarted,
  notifyDisplacedUsersSlotReopened,
} = require('../utils/booking-notifications');
const {
  BOOKING_EVENT_TYPES,
  deriveRequestType,
  isKafkaEnabled,
  publishBookingLifecycleEvent,
} = require('../utils/kafka');
const {
  computeContentionDeadline,
  computePencilExpiryAt,
  assertStartNotWithinLockHours,
  isWithinLockHours,
  assertStartMeetsMinimumLeadTime,
  assertCancellationBeforeCutoff,
} = require('../utils/booking-rules');
const contention = require('../services/contention.service');
const { api } = require('../messages/bookingMessages');

const getUserAccountType = (req) => req.user?.accountType || req.user?.role;
const REBOOKABLE_STATUSES = ['cancelled', 'denied', 'expired', 'displaced', 'completed'];
const TERMINAL_BOOKING_STATUSES = ['cancelled', 'denied', 'expired', 'displaced', 'completed'];

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
    referenceCode: row.referenceCode || null,
    bookingType: row.bookingType,
    status: row.status,
    startTime: row.startTime,
    endTime: row.endTime,
    user: u ? { id: u.id, email: u.email } : null
  };
}

function getProjectedContentionDeadline(overlappingPencils, challengerStartTime) {
  if (!overlappingPencils?.length) return null;
  const defender = contention.pickDefenderBooking(overlappingPencils);
  if (!defender?.expiryAt) return null;
  const now = new Date();
  const deadlineAt = computeContentionDeadline(now, challengerStartTime, defender.expiryAt);
  return deadlineAt.getTime() > now.getTime() ? deadlineAt : null;
}

async function resolveBookingContentionDeadline(booking) {
  if (!booking || !booking.contentionRole) return null;
  if (booking.contentionRole === 'defender') return booking.contentionDeadlineAt || null;
  if (booking.contentionRole === 'challenger' && booking.challengingBookingId) {
    const defender = await Booking.findByPk(booking.challengingBookingId, {
      attributes: ['contentionDeadlineAt']
    });
    return defender?.contentionDeadlineAt || null;
  }
  return null;
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
  'referenceCode',
  'bookingThreadId',
  'rebookedFromBookingId',
  'bookingType',
  'status',
  'startTime',
  'endTime',
  'purpose',
  'staffRemark',
  'cancellationReason',
  'probableRebookDate',
  'rebookedFromStatus',
  'deniedByUserId',
  'createdAt',
  'updatedAt',
];

const HISTORY_TERMINAL_EVENT_TYPE_BY_STATUS = Object.freeze({
  denied: 'booking.denied',
  cancelled: 'booking.cancelled',
  expired: 'booking.expired',
  displaced: 'booking.displaced',
});

const HISTORY_STATE_EVENT_TYPES = [
  'booking.created',
  'booking.converted_to_firm',
  'booking.approved',
  'booking.denied',
  'booking.cancelled',
  'booking.expired',
  'booking.displaced',
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

  includes.push({
    model: User,
    as: 'deniedBy',
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
      }, {
        model: User,
        as: 'deniedBy',
        required: false,
        attributes: ['id', 'email', 'accountType', 'userCategory']
      }]
    });
  }

  includes.push({
    model: Booking,
    as: 'displacedByBooking',
    required: false,
    attributes: ['id', 'referenceCode', 'status', 'bookingType', 'startTime', 'endTime']
  });

  return includes;
};

function isNewerBooking(a, b) {
  const aTime = new Date(a.createdAt).getTime();
  const bTime = new Date(b.createdAt).getTime();
  if (aTime !== bTime) return aTime > bTime;
  return a.id > b.id;
}

function toMs(value) {
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

function pickTerminalAuditIndexForAttempt(attempt, logs) {
  if (!Array.isArray(logs) || logs.length === 0) return -1;
  const status = String(attempt?.status || '').trim().toLowerCase();
  const expectedEventType = HISTORY_TERMINAL_EVENT_TYPE_BY_STATUS[status] || null;
  if (expectedEventType) {
    for (let i = logs.length - 1; i >= 0; i -= 1) {
      const row = logs[i];
      if (row.eventType === expectedEventType) return i;
    }
  }
  for (let i = logs.length - 1; i >= 0; i -= 1) {
    const row = logs[i];
    if (row.status && String(row.status).trim().toLowerCase() === status) return i;
  }
  return logs.length - 1;
}

async function attachThreadHistoryMetadata(bookingsPlain) {
  if (!Array.isArray(bookingsPlain) || bookingsPlain.length === 0) return;

  const attemptIds = new Set();
  for (const booking of bookingsPlain) {
    for (const attempt of booking?.threadBookings || []) {
      if (Number.isInteger(attempt?.id)) attemptIds.add(attempt.id);
    }
  }
  if (attemptIds.size === 0) return;

  const logs = await AuditLog.findAll({
    where: {
      bookingId: { [Op.in]: Array.from(attemptIds) },
      eventType: { [Op.in]: HISTORY_STATE_EVENT_TYPES },
    },
    attributes: ['bookingId', 'eventType', 'occurredAt', 'bookingType', 'status', 'payload'],
    order: [
      ['bookingId', 'ASC'],
      ['occurredAt', 'ASC'],
      ['id', 'ASC'],
    ],
  });

  const logsByBookingId = new Map();
  for (const row of logs) {
    const list = logsByBookingId.get(row.bookingId) || [];
    list.push(row);
    logsByBookingId.set(row.bookingId, list);
  }

  for (const booking of bookingsPlain) {
    const nextAttempts = (booking.threadBookings || []).map((attempt) => {
      const attemptLogs = logsByBookingId.get(attempt.id) || [];
      const terminalIndex = pickTerminalAuditIndexForAttempt(attempt, attemptLogs);
      const terminalLog = terminalIndex >= 0 ? attemptLogs[terminalIndex] : null;
      const previousLog = terminalIndex > 0 ? attemptLogs[terminalIndex - 1] : null;

      return {
        ...attempt,
        historyEvent: {
          eventType: terminalLog?.eventType || null,
          occurredAt: terminalLog?.occurredAt || null,
          snapshotAtEvent: terminalLog
            ? {
                bookingType: terminalLog.bookingType || null,
                status: terminalLog.status || null,
              }
            : null,
          stateBeforeEvent: previousLog
            ? {
                bookingType: previousLog.bookingType || null,
                status: previousLog.status || null,
              }
            : null,
        },
      };
    });

    nextAttempts.sort((a, b) => {
      const aMs = toMs(a?.historyEvent?.occurredAt) || toMs(a?.createdAt);
      const bMs = toMs(b?.historyEvent?.occurredAt) || toMs(b?.createdAt);
      if (aMs !== bMs) return bMs - aMs;
      return (b.id || 0) - (a.id || 0);
    });
    booking.threadBookings = nextAttempts;
  }
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

function normalizeReferencePart(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function normalizeRoomCode(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '');
}

function normalizeEquipmentCode(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

function acronymFallback(value, fallback) {
  const cleaned = String(value || '').trim();
  if (!cleaned) return fallback;

  const initials = cleaned
    .split(/\s+/)
    .map((part) => part[0])
    .join('');

  return normalizeReferencePart(initials || cleaned).slice(0, 6) || fallback;
}

function resolveResourceCodeParts(resourceType, resource) {
  const groupFallbackSource = resourceType === 'equipment' ? resource.category : resource.location;
  const codeGroup =
    normalizeReferencePart(resource.codeGroup) ||
    acronymFallback(groupFallbackSource, resourceType === 'equipment' ? 'EQP' : 'ROOM');
  const resourceCode =
    resourceType === 'room'
      ? normalizeRoomCode(resource.resourceCode) || acronymFallback(resource.name, 'ROOM')
      : normalizeEquipmentCode(resource.resourceCode) || acronymFallback(resource.name, 'EQUIP');

  return {
    codeGroup,
    resourceCode,
  };
}

async function generateBookingReferenceCode({ resourceType, resource, createdAt, transaction }) {
  const { codeGroup, resourceCode } = resolveResourceCodeParts(resourceType, resource);
  const year = new Date(createdAt).getFullYear();
  const shortYear = String(year).slice(-2);

  const where = {
    resourceType,
    codeGroup: resourceType === 'room' ? 'ROOM' : codeGroup,
    resourceCode,
    year,
  };

  const [sequence] = await BookingReferenceSequence.findOrCreate({
    where,
    defaults: {
      ...where,
      lastNumber: 0,
    },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });

  await sequence.reload({ transaction, lock: transaction.LOCK.UPDATE });
  sequence.lastNumber += 1;
  await sequence.save({ transaction });

  const sequenceText = String(sequence.lastNumber).padStart(3, '0');
  if (resourceType === 'room') {
    return `${resourceCode}-${sequenceText}-${shortYear}`;
  }
  return `${codeGroup}-${resourceCode}-${sequenceText}-${shortYear}`;
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

async function loadBookingsForNotification(bookingIds) {
  const uniqueIds = [...new Set((bookingIds || []).filter((id) => Number.isInteger(id) && id > 0))];
  if (uniqueIds.length === 0) return [];

  const rows = await Booking.findAll({
    where: { id: { [Op.in]: uniqueIds } },
    include: [{ model: User, as: 'user', attributes: ['id', 'email'] }]
  });

  const byId = new Map(rows.map((row) => [row.id, row]));
  return uniqueIds.map((id) => byId.get(id)).filter(Boolean);
}

async function loadBookingsForContentionNotifications(notifications) {
  const bookingIds = [];
  for (const notification of notifications || []) {
    if (Number.isInteger(notification?.recipientBookingId)) bookingIds.push(notification.recipientBookingId);
    if (Number.isInteger(notification?.counterpartyBookingId)) bookingIds.push(notification.counterpartyBookingId);
  }

  const rows = await loadBookingsForNotification(bookingIds);
  return new Map(rows.map((row) => [row.id, row]));
}

async function emitBookingTransitionNotifications({
  bookingIds,
  eventType,
  resourceName,
  actorUserId = null,
  payload = {},
  directNotifier,
}) {
  const bookings = await loadBookingsForNotification(bookingIds);
  for (const booking of bookings) {
    publishBookingLifecycleEvent(eventType, booking, {
      actorUserId,
      resourceName,
      payload,
    });
    if (!isKafkaEnabled() && typeof directNotifier === 'function') {
      directNotifier(booking, resourceName).catch(() => {});
    }
  }
}

async function emitContentionResolvedNotifications({
  notifications,
  resourceName,
  actorUserId = null,
}) {
  const entries = (notifications || []).filter((notification) => notification?.recipientBookingId);
  if (entries.length === 0) return;

  const bookingMap = await loadBookingsForContentionNotifications(entries);
  const byPair = new Map();
  for (const notification of entries) {
    const a = Number(notification?.recipientBookingId || 0);
    const b = Number(notification?.counterpartyBookingId || 0);
    if (!a) continue;
    const key = [Math.min(a, b || a), Math.max(a, b || a)].join(':');
    if (!byPair.has(key)) byPair.set(key, []);
    byPair.get(key).push(notification);
  }

  for (const pairEntries of byPair.values()) {
    const defenderEntry = pairEntries.find((entry) => entry.recipientContentionRole === 'defender') || null;
    const challengerEntry = pairEntries.find((entry) => entry.recipientContentionRole === 'challenger') || null;
    const fallback = pairEntries[0];
    const defenderBooking = defenderEntry
      ? bookingMap.get(defenderEntry.recipientBookingId)
      : fallback?.counterpartyBookingId
        ? bookingMap.get(fallback.counterpartyBookingId)
        : null;
    const challengerBooking = challengerEntry
      ? bookingMap.get(challengerEntry.recipientBookingId)
      : fallback?.recipientBookingId
        ? bookingMap.get(fallback.recipientBookingId)
        : null;
    const anchorBooking = defenderBooking || challengerBooking || bookingMap.get(fallback.recipientBookingId);
    if (!anchorBooking) continue;

    const payload = {
      requestType: deriveRequestType(anchorBooking),
      resolutionReason: fallback.resolutionReason || null,
      resolvedByBookingId: fallback.resolvedByBookingId || null,
      defender: defenderBooking
        ? {
            bookingId: defenderBooking.id,
            referenceCode: defenderBooking.referenceCode || null,
            outcome: defenderEntry?.recipientOutcome || null,
            finalStatus: defenderBooking.status || null,
          }
        : null,
      challenger: challengerBooking
        ? {
            bookingId: challengerBooking.id,
            referenceCode: challengerBooking.referenceCode || null,
            outcome: challengerEntry?.recipientOutcome || null,
            finalStatus: challengerBooking.status || null,
          }
        : null,
      targets: [defenderBooking?.id, challengerBooking?.id].filter(Boolean),
    };

    publishBookingLifecycleEvent(BOOKING_EVENT_TYPES.CONTENTION_RESOLVED, anchorBooking, {
      actorUserId,
      resourceName,
      payload,
    });
  }

  if (!isKafkaEnabled()) {
    for (const notification of entries) {
      const recipientBooking = bookingMap.get(notification.recipientBookingId);
      if (!recipientBooking) continue;
      const payload = {
        counterpartyBookingId: notification.counterpartyBookingId || null,
        recipientOutcome: notification.recipientOutcome,
        resolutionReason: notification.resolutionReason,
        resolvedByBookingId: notification.resolvedByBookingId || null,
        recipientContentionRole: notification.recipientContentionRole || null,
      };
      const counterpartyBooking = notification.counterpartyBookingId
        ? bookingMap.get(notification.counterpartyBookingId) || null
        : null;
      notifyContentionResolved(recipientBooking, counterpartyBooking, resourceName, payload).catch(() => {});
    }
  }
}

function summarizeContentionParticipant(booking) {
  if (!booking) return null;
  return {
    bookingId: booking.id,
    referenceCode: booking.referenceCode || null,
    userId: booking.user?.id ?? null,
    email: booking.user?.email ?? null,
  };
}

function deriveDisplacementReasonFromPayload(payload = {}) {
  if (payload.source === 'booking.approve') return 'firm_approved_overlap';
  if (payload.source === 'contention.resolve_due_deadline') return 'defender_missed_deadline';
  if (payload.source === 'contention.resolve_expired_defender') return 'defender_expired_boundary';
  return null;
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
    const {
      resourceType,
      resourceId,
      bookingType,
      startTime,
      endTime,
      purpose,
      equipmentRequestType,
      loanReason,
      loanWorkflowNote,
      loanTransportPlan,
      roomParticipantCount,
      roomEquipmentNeeds,
      roomSetupRequirements,
      roomProgramDetails,
    } = req.body;
    const confirmOverlapOwn = req.body.confirmOverlapOwn === true || req.body.confirmOverlapOwn === 'true';
    const confirmContention =
      req.body.confirmContention === true || req.body.confirmContention === 'true';
    const confirmOverlapForeign =
      req.body.confirmOverlapForeign === true || req.body.confirmOverlapForeign === 'true';
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
    if (
      resourceType === 'equipment' &&
      !['in_house', 'loan'].includes(String(equipmentRequestType || '').trim())
    ) {
      return res.status(400).json({ error: api.create.invalidEquipmentRequestType });
    }

    if (!['pencil', 'firm'].includes(bookingType)) {
      return res.status(400).json({ error: api.create.invalidBookingType });
    }
    if (bookingType === 'firm' && !normalizeOptionalText(purpose)) {
      return res.status(400).json({ error: api.create.firmPurposeRequired });
    }
    if (bookingType === 'firm' && !hasAuthDoc(authorizationDocUrl)) {
      return res.status(400).json({ error: api.create.firmAuthRequired });
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
      assertStartMeetsMinimumLeadTime(
        start,
        resourceType,
        resourceType === 'equipment' ? equipmentRequestType : null
      );
    } catch (ruleErr) {
      if (ruleErr.statusCode) {
        return res.status(ruleErr.statusCode).json({ error: ruleErr.message, code: ruleErr.code });
      }
      throw ruleErr;
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

    const normalizedEquipmentRequestType =
      resourceType === 'equipment' ? String(equipmentRequestType || '').trim() : null;

    if (normalizedEquipmentRequestType === 'loan') {
      const hasLoanDetails =
        normalizeOptionalText(loanReason) &&
        normalizeOptionalText(loanWorkflowNote) &&
        normalizeOptionalText(loanTransportPlan);
      if (!hasLoanDetails) {
        return res.status(400).json({ error: api.create.loanDetailsRequired });
      }
    }

    if (resourceType === 'room') {
      const participants = Number.parseInt(roomParticipantCount, 10);
      const hasRoomDetails =
        Number.isInteger(participants) &&
        participants > 0 &&
        normalizeOptionalText(roomEquipmentNeeds) &&
        normalizeOptionalText(roomSetupRequirements) &&
        normalizeOptionalText(roomProgramDetails);
      if (!hasRoomDetails) {
        return res.status(400).json({ error: api.create.roomDetailsRequired });
      }
    }

    const firmBlockers = await Booking.findFirmBlockers(resourceType, resourceId, start, end);
    const pencilOverlaps = await Booking.findActivePencilOverlaps(resourceType, resourceId, start, end);
    const ownPencilOverlaps = await Booking.findAll({
      where: {
        resourceType,
        resourceId,
        bookingType: 'pencil',
        userId,
        status: { [Op.in]: ['penciled', 'on_hold'] },
        [Op.and]: [
          { startTime: { [Op.lt]: end } },
          { endTime: { [Op.gt]: start } }
        ]
      },
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'email', 'accountType', 'userCategory']
        }
      ],
      order: [
        ['createdAt', 'ASC'],
        ['id', 'ASC']
      ]
    });
    const otherPencilOverlaps = pencilOverlaps.filter(
      (c) => !(c.userId === userId && c.bookingType === 'pencil')
    );
    const activeContentionOverlap = otherPencilOverlaps.find(
      (c) => c.contentionRole === 'defender' || c.contentionRole === 'challenger'
    );
    const getActiveContentionDeadline = async (participant, overlaps) => {
      if (!participant) return null;
      if (participant.contentionRole === 'defender') return participant.contentionDeadlineAt || null;
      if (participant.contentionRole === 'challenger' && participant.challengingBookingId) {
        const linkedDefender = overlaps.find((c) => c.id === participant.challengingBookingId);
        if (linkedDefender?.contentionDeadlineAt) return linkedDefender.contentionDeadlineAt;

        // If only challenger overlaps the new slot, defender might be outside this overlap set.
        // Fetch defender directly so UI can still show contention deadline.
        const defender = await Booking.findByPk(participant.challengingBookingId, {
          attributes: ['contentionDeadlineAt']
        });
        return defender?.contentionDeadlineAt || null;
      }
      return null;
    };

    const formatConflicts = (list) =>
      list.map((c) => ({
        id: c.id,
        referenceCode: c.referenceCode,
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
      if (otherPencilOverlaps.length > 0 && !confirmOverlapForeign) {
        return res.status(409).json({
          error: api.create.firmForeignPencilOverlapConfirm,
          requiresForeignOverlapConfirmation: true,
          foreignPencilConflicts: formatConflicts(otherPencilOverlaps)
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
      if (activeContentionOverlap) {
        const contentionDeadlineAt = await getActiveContentionDeadline(
          activeContentionOverlap,
          otherPencilOverlaps
        );
        return res.status(409).json({
          error: api.create.pencilActiveContentionLocked,
          code: 'ACTIVE_CONTENTION_LOCKED',
          contentionDeadlineAt,
          conflicts: formatConflicts(otherPencilOverlaps)
        });
      }
      if (otherPencilOverlaps.length > 0 && !confirmContention) {
        const projectedContentionDeadlineAt = getProjectedContentionDeadline(otherPencilOverlaps, start);
        return res.status(409).json({
          error: api.create.pencilForeignOverlapConfirm,
          requiresContentionConfirmation: true,
          contentionDeadlineAt: projectedContentionDeadlineAt,
          conflicts: formatConflicts(otherPencilOverlaps)
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
          if (!b || !['penciled', 'on_hold'].includes(b.status)) return;
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
    const onHoldBookingIds = new Set();
    const contentionResolvedNotifications = [];
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

        const referenceCode = await generateBookingReferenceCode({
          resourceType,
          resource,
          createdAt: issuedAt,
          transaction: t,
        });

        const created = await Booking.create(
          {
            ...(bookingId ? { id: bookingId } : {}),
            userId,
            resourceType,
            resourceId,
            referenceCode,
            bookingType,
            status: bookingType === 'pencil' ? initialPencilStatus : initialFirmStatus,
            startTime: start,
            endTime: end,
            purpose,
            equipmentRequestType: normalizedEquipmentRequestType,
            loanReason: normalizedEquipmentRequestType === 'loan' ? normalizeOptionalText(loanReason) : null,
            loanWorkflowNote:
              normalizedEquipmentRequestType === 'loan' ? normalizeOptionalText(loanWorkflowNote) : null,
            loanTransportPlan:
              normalizedEquipmentRequestType === 'loan' ? normalizeOptionalText(loanTransportPlan) : null,
            roomParticipantCount:
              resourceType === 'room' ? Number.parseInt(roomParticipantCount, 10) : null,
            roomEquipmentNeeds:
              resourceType === 'room' ? normalizeOptionalText(roomEquipmentNeeds) : null,
            roomSetupRequirements:
              resourceType === 'room' ? normalizeOptionalText(roomSetupRequirements) : null,
            roomProgramDetails:
              resourceType === 'room' ? normalizeOptionalText(roomProgramDetails) : null,
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
          const autoResolveResult = await contention.autoResolveFirmBlockedDefenders(b, {
            transaction: t,
            Booking
          });
          autoResolveResult?.onHoldBookingIds?.forEach((id) => onHoldBookingIds.add(id));
          contentionResolvedNotifications.push(...(autoResolveResult?.contentionNotifications || []));

          const reevaluateResult = await contention.reevaluateOverlappingPencilsForFirm(b, {
            transaction: t,
            Booking
          });
          reevaluateResult?.onHoldBookingIds?.forEach((id) => onHoldBookingIds.add(id));
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
        const freshPencilOverlaps = await Booking.findActivePencilOverlaps(
          resourceType,
          resourceId,
          start,
          end
        );
        const freshOther = freshPencilOverlaps.filter((c) => !(c.userId === userId && c.bookingType === 'pencil'));
        const freshActiveContention = freshOther.find(
          (c) => c.contentionRole === 'defender' || c.contentionRole === 'challenger'
        );
        const contentionDeadlineAt = await getActiveContentionDeadline(
          freshActiveContention,
          freshOther
        );
        return res.status(409).json({
          error: api.create.pencilActiveContentionLocked,
          code: txnErr.code,
          contentionDeadlineAt,
          conflicts: formatConflicts(freshOther)
        });
      }
      throw txnErr;
    }

    const createdContentionDeadlineAt =
      bookingType === 'pencil' && otherPencilOverlaps.length > 0
        ? await resolveBookingContentionDeadline(createdBooking)
        : null;

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
      response.contentionDeadlineAt = createdContentionDeadlineAt;
    }

    const bookingPlain = createdBooking.toJSON();
    bookingPlain.contentionChallenger = createdBooking.contentionRole === 'challenger';
    if (createdContentionDeadlineAt && bookingPlain.contentionRole === 'challenger') {
      bookingPlain.contentionDeadlineAt = createdContentionDeadlineAt;
    }
    response.booking = bookingPlain;

    res.status(201).json(response);

    const resourceName = await resolveResourceName(resourceType, resourceId);
    publishBookingLifecycleEvent(BOOKING_EVENT_TYPES.CREATED, createdBooking, {
      actorUserId: userId,
      resourceName,
      payload: {
        rebookedFromBookingId,
        rebookedFromStatus,
        cancelledPencilBookings,
      },
    });
    if (!isKafkaEnabled()) {
      notifyBookingCreated(createdBooking, resourceName).catch(() => {});
    }

    await emitBookingTransitionNotifications({
      bookingIds: Array.from(onHoldBookingIds),
      eventType: BOOKING_EVENT_TYPES.ON_HOLD,
      resourceName,
      actorUserId: userId,
      payload: {
        source: 'booking.create',
        triggerBookingId: createdBooking.id,
        causingBookingId: createdBooking.id,
        causingReferenceCode: createdBooking.referenceCode || null,
      },
      directNotifier: notifyBookingOnHold,
    });
    await emitContentionResolvedNotifications({
      notifications: contentionResolvedNotifications,
      resourceName,
      actorUserId: userId,
    });

    if (contentionResult?.action === 'challenger') {
      const freshBooking = await Booking.findByPk(createdBooking.id, {
        include: [{ model: User, as: 'user' }]
      });
      const defender = await Booking.findByPk(freshBooking.challengingBookingId, {
        include: [{ model: User, as: 'user' }]
      });
      if (freshBooking && defender) {
        publishBookingLifecycleEvent(BOOKING_EVENT_TYPES.CONTENTION_STARTED, freshBooking, {
          actorUserId: userId,
          resourceName,
          payload: {
            defender: summarizeContentionParticipant(defender),
            challenger: summarizeContentionParticipant(freshBooking),
            contentionDeadlineAt: defender.contentionDeadlineAt || null,
          },
        });
        if (!isKafkaEnabled()) {
          notifyContentionStarted({ defender, challenger: freshBooking }, resourceName).catch(() => {});
        }
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
    const excludeRebookSourceDenied =
      req.query.excludeRebookSourceDenied === 'true' ||
      req.query.excludeRebookSourceDenied === true;

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
    if (excludeRebookSourceDenied) {
      finalWhereClause.rebookedFromStatus = {
        [Op.or]: [
          { [Op.ne]: 'denied' },
          { [Op.is]: null }
        ]
      };
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
    await attachThreadHistoryMetadata(enriched);

    res.json(enriched);
  } catch (error) {
    console.error('Error fetching bookings:', error);
    res.status(500).json({ error: api.list.fetchFailed });
  }
};

const getBookingApprovers = async (req, res) => {
  try {
    const approvers = await User.findAll({
      where: {
        accountType: { [Op.in]: ['ptcf_staff', 'system_admin'] },
      },
      attributes: ['id', 'email', 'accountType'],
      order: [['email', 'ASC']],
    });

    res.json(approvers);
  } catch (error) {
    console.error('Error fetching booking approvers:', error);
    res.status(500).json({ error: 'Failed to fetch booking approvers.' });
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
    await attachThreadHistoryMetadata([plain]);

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
    const cancellationReason = normalizeOptionalText(req.body?.cancellationReason);
    const probableRebookDateRaw = req.body?.probableRebookDate;

    if (!cancellationReason) {
      return res.status(400).json({ error: api.cancel.reasonRequired });
    }
    if (!probableRebookDateRaw) {
      return res.status(400).json({ error: api.cancel.probableRebookDateRequired });
    }
    const probableRebookDate = new Date(probableRebookDateRaw);
    if (Number.isNaN(probableRebookDate.getTime())) {
      return res.status(400).json({ error: api.cancel.probableRebookDateInvalid });
    }

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

    if (TERMINAL_BOOKING_STATUSES.includes(booking.status)) {
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

    try {
      assertCancellationBeforeCutoff(
        booking.startTime,
        booking.resourceType,
        booking.resourceType === 'equipment' ? booking.equipmentRequestType : null
      );
    } catch (cutoffErr) {
      if (cutoffErr.statusCode) {
        return res
          .status(cutoffErr.statusCode)
          .json({ error: cutoffErr.message || api.cancel.cutoffReached, code: cutoffErr.code });
      }
      throw cutoffErr;
    }

    const displacedNotifyList = [];
    if (booking.bookingType === 'firm' && booking.status === 'approved') {
      const displaced = await Booking.findAll({
        where: { displacedByBookingId: booking.id, status: 'displaced' },
        include: [{ model: User, as: 'user', attributes: ['id', 'email'] }]
      });
      displacedNotifyList.push(...displaced);
    }

    const contentionNotifications = [];
    const onHoldReleasedBookingIds = new Set();
    await sequelize.transaction(async (t) => {
      const b = await Booking.findByPk(booking.id, { transaction: t, lock: t.LOCK.UPDATE });
      if (!b) return;
      if (TERMINAL_BOOKING_STATUSES.includes(b.status)) {
        const err = new Error(api.cancel.alreadyTerminal({ status: b.status }));
        err.statusCode = 400;
        throw err;
      }

      // Set status to cancelled FIRST so that overlap queries inside the
      // contention promotion logic do not see this booking as an active pencil.
      b.status = 'cancelled';
      b.cancellationReason = cancellationReason;
      b.probableRebookDate = probableRebookDate;
      await b.save({ transaction: t });

      if (b.contentionRole) {
        // Active contention participant in strict 1v1 mode.
        const contentionResult = await contention.onBookingCancelledMidContention(b, {
          transaction: t,
          Booking
        });
        contentionNotifications.push(...(contentionResult?.notifications || []));
      } else if (b.bookingType === 'firm') {
        // Firm booking cancellation: clear any residual contention metadata.
        const firmResult = await contention.onFirmDeniedOrCancelled(b, { transaction: t, Booking });
        firmResult?.releasedBookingIds?.forEach((releasedId) => onHoldReleasedBookingIds.add(releasedId));
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
    publishBookingLifecycleEvent(BOOKING_EVENT_TYPES.CANCELLED, updated, {
      actorUserId: cancelledById,
      resourceName,
      payload: {
        cancelledByUserId: cancelledById,
        displacedBookingsToNotify: displacedNotifyList.map((d) => d.id),
      },
    });
    if (!isKafkaEnabled()) {
      notifyBookingCancelled(updated, resourceName, cancelledById).catch(() => {});
    }

    await emitContentionResolvedNotifications({
      notifications: contentionNotifications,
      resourceName,
      actorUserId: cancelledById,
    });
    await emitBookingTransitionNotifications({
      bookingIds: Array.from(onHoldReleasedBookingIds),
      eventType: BOOKING_EVENT_TYPES.ON_HOLD_RELEASED,
      resourceName,
      actorUserId: cancelledById,
      payload: {
        source: 'booking.cancel',
        triggerBookingId: updated.id,
        causingBookingId: updated.id,
        causingReferenceCode: updated.referenceCode || null,
        causingBookingStatus: updated.status || null,
        releaseReason: 'firm_cancelled',
      },
      directNotifier: notifyBookingOnHoldReleased,
    });

    for (const d of displacedNotifyList) {
      publishBookingLifecycleEvent(BOOKING_EVENT_TYPES.DISPLACED_SLOT_REOPENED, d, {
        actorUserId: cancelledById,
        resourceName,
        payload: {
          reopenedByBookingId: updated.id,
          firmBookingId: updated.id,
        },
      });
      if (!isKafkaEnabled()) {
        notifyDisplacedUsersSlotReopened(d, updated, resourceName).catch(() => {});
      }
    }
  } catch (error) {
    if (error?.statusCode === 400) {
      return res.status(400).json({ error: error.message || api.cancel.failed });
    }
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
    const resolvedPurpose = nextPurpose !== undefined ? nextPurpose : booking.purpose || null;
    if (!normalizeOptionalText(resolvedPurpose)) {
      return res.status(400).json({ error: api.convert.purposeRequired });
    }

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

    const contentionNotifications = [];
    const onHoldReleasedBookingIds = new Set();
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
          const convertResult = await contention.onDefenderConvertedToFirm(b, { transaction: t, Booking });
          contentionNotifications.push(...(convertResult?.notifications || []));
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

    const resourceName = await resolveResourceName(updatedBooking.resourceType, updatedBooking.resourceId);
    publishBookingLifecycleEvent(BOOKING_EVENT_TYPES.CONVERTED_TO_FIRM, updatedBooking, {
      actorUserId: userId,
      resourceName,
      payload: {
        previousBookingType: 'pencil',
        previousStatus: booking.status,
      },
    });
    const onHoldBookingIds = contentionNotifications
      .filter((notification) => notification?.recipientOutcome === 'on_hold')
      .map((notification) => notification.recipientBookingId)
      .filter((id) => Number.isInteger(id));
    await emitBookingTransitionNotifications({
      bookingIds: onHoldBookingIds,
      eventType: BOOKING_EVENT_TYPES.ON_HOLD,
      resourceName,
      actorUserId: userId,
      payload: {
        source: 'booking.convert_to_firm',
        triggerBookingId: updatedBooking.id,
        causingBookingId: updatedBooking.id,
        causingReferenceCode: updatedBooking.referenceCode || null,
      },
      directNotifier: notifyBookingOnHold,
    });
    await emitContentionResolvedNotifications({
      notifications: contentionNotifications,
      resourceName,
      actorUserId: userId,
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

    const displacedBookingIds = new Set();
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

        const approvalResult = await contention.onFirmBookingApproved(full, {
          transaction: t,
          Booking
        });
        approvalResult?.displacedBookingIds?.forEach((bookingId) => displacedBookingIds.add(bookingId));
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

    const resourceName = await resolveResourceName(updatedBooking.resourceType, updatedBooking.resourceId);
    publishBookingLifecycleEvent(BOOKING_EVENT_TYPES.APPROVED, updatedBooking, {
      actorUserId: approverUserId,
      resourceName,
      payload: {
        approvedByUserId: approverUserId,
        approvedAt: updatedBooking.approvedAt || null,
      },
    });
    if (!isKafkaEnabled()) {
      notifyBookingApproved(updatedBooking, resourceName).catch(() => {});
    }
    await emitBookingTransitionNotifications({
      bookingIds: Array.from(displacedBookingIds),
      eventType: BOOKING_EVENT_TYPES.DISPLACED,
      resourceName,
      actorUserId: approverUserId,
      payload: {
        source: 'booking.approve',
        triggerBookingId: updatedBooking.id,
        displacedByBookingId: updatedBooking.id,
        displacingBookingId: updatedBooking.id,
        displacingReferenceCode: updatedBooking.referenceCode || null,
        displacementReason: deriveDisplacementReasonFromPayload({ source: 'booking.approve' }),
      },
      directNotifier: notifyBookingDisplaced,
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
    const deniedByUserId = req.user.id;
    const normalizedRemark = normalizeOptionalText(staffRemark);

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

    if (!normalizedRemark) {
      return res.status(400).json({ error: api.deny.remarkRequired });
    }

    const updatePayload = { status: 'denied', deniedByUserId, staffRemark: normalizedRemark };

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

        const firmResult = await contention.onFirmDeniedOrCancelled(deniedRow, {
          transaction: t,
          Booking
        });
        firmResult?.releasedBookingIds?.forEach((releasedId) => onHoldReleasedBookingIds.add(releasedId));
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
      publishBookingLifecycleEvent(BOOKING_EVENT_TYPES.DENIED, updatedBooking, {
        actorUserId: deniedByUserId,
        resourceName,
        payload: {
          deniedByUserId,
        },
      });
      if (!isKafkaEnabled()) {
        notifyBookingDenied(updatedBooking, resourceName).catch(() => {});
      }
      emitBookingTransitionNotifications({
        bookingIds: Array.from(onHoldReleasedBookingIds),
        eventType: BOOKING_EVENT_TYPES.ON_HOLD_RELEASED,
        resourceName,
        actorUserId: deniedByUserId,
        payload: {
          source: 'booking.deny',
          triggerBookingId: updatedBooking.id,
          causingBookingId: updatedBooking.id,
          causingReferenceCode: updatedBooking.referenceCode || null,
          causingBookingStatus: updatedBooking.status || null,
          releaseReason: 'firm_denied',
        },
        directNotifier: notifyBookingOnHoldReleased,
      }).catch(() => {});
    });
  } catch (error) {
    console.error('Error denying booking:', error);
    res.status(500).json({ error: api.deny.failed });
  }
};

const getAvailability = async (req, res) => {
  try {
    const { resourceType, resourceId, startDate, endDate } = req.query;
    const hasAgendaCheckboxParams =
      req.query.includeFirms != null ||
      req.query.includeActivePencils != null ||
      req.query.includeSecondary != null;
    const includeFirms = req.query.includeFirms === 'true';
    const includeActivePencils = req.query.includeActivePencils === 'true';
    const includeSecondary = req.query.includeSecondary === 'true';

    const whereClause = {};

    if (hasAgendaCheckboxParams) {
      const agendaFilters = [];
      if (includeFirms) {
        agendaFilters.push({
          bookingType: 'firm',
          status: { [Op.in]: ['approved', 'pending_approval'] }
        });
      }
      if (includeActivePencils) {
        agendaFilters.push({
          bookingType: 'pencil',
          status: 'penciled',
          [Op.or]: [{ contentionRole: null }, { contentionRole: 'defender' }]
        });
      }
      if (includeSecondary) {
        agendaFilters.push({
          bookingType: 'pencil',
          [Op.or]: [
            { status: 'on_hold' },
            { status: 'penciled', contentionRole: 'challenger' }
          ]
        });
      }

      if (agendaFilters.length === 0) {
        return res.json([]);
      }
      whereClause[Op.or] = agendaFilters;
    } else {
      whereClause.status = {
        [Op.notIn]: ['cancelled', 'denied', 'expired', 'displaced', 'completed']
      };
    }

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
        'id', 'referenceCode', 'resourceType', 'resourceId', 'bookingType', 'status',
        'startTime', 'endTime', 'contentionRole', 'contentionDeadlineAt', 'challengingBookingId'
      ],
      order: [['startTime', 'ASC']]
    });

    const payload = bookings.map((b) => {
      const row = b.get({ plain: true });
      return {
        id: row.id,
        referenceCode: row.referenceCode || null,
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
  getBookingApprovers,
  getBookingById,
  getAvailability,
  cancelBooking,
  convertToFirm,
  approveBooking,
  denyBooking,
  getBookingConflicts
};
