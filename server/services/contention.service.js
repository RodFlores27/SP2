'use strict';

const { Op } = require('sequelize');
const {
  computeContentionDeadline,
  assertPositiveContentionDeadline,
  computePencilExpiryAt
} = require('../utils/booking-rules');
const { domain } = require('../messages/bookingMessages');

// ---------------------------------------------------------------------------
// Basic utilities
// ---------------------------------------------------------------------------

function intervalsOverlap(aStart, aEnd, bStart, bEnd) {
  return new Date(aStart) < new Date(bEnd) && new Date(aEnd) > new Date(bStart);
}

function pickDefenderBooking(overlapPencils) {
  if (!overlapPencils.length) return null;
  return [...overlapPencils].sort(
    (a, b) => new Date(a.createdAt) - new Date(b.createdAt) || a.id - b.id
  )[0];
}

// ---------------------------------------------------------------------------
// Reusable query helpers
// ---------------------------------------------------------------------------

function firmOverlapWhere(firmBooking) {
  return {
    resourceType: firmBooking.resourceType,
    resourceId: firmBooking.resourceId,
    [Op.and]: [
      { startTime: { [Op.lt]: firmBooking.endTime } },
      { endTime: { [Op.gt]: firmBooking.startTime } }
    ]
  };
}

async function getLockedBookingById(Booking, id, transaction) {
  if (!id) return null;
  return Booking.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
}

async function findActiveChallengerForDefender(defenderId, { transaction, Booking }) {
  return Booking.findOne({
    where: {
      challengingBookingId: defenderId,
      bookingType: 'pencil',
      status: 'penciled',
      contentionRole: 'challenger'
    },
    transaction,
    lock: transaction.LOCK.UPDATE
  });
}

async function findOverlappingPencilsForFirm(
  firmBooking,
  { statuses, contentionRole },
  { transaction, Booking }
) {
  const where = {
    bookingType: 'pencil',
    ...firmOverlapWhere(firmBooking)
  };
  if (statuses) where.status = Array.isArray(statuses) ? { [Op.in]: statuses } : statuses;
  if (typeof contentionRole !== 'undefined') where.contentionRole = contentionRole;

  return Booking.findAll({
    where,
    order: [['createdAt', 'ASC']],
    transaction
  });
}

// ---------------------------------------------------------------------------
// Shared state helpers
// ---------------------------------------------------------------------------

async function clearContentionState(booking, { transaction }) {
  booking.contentionRole = null;
  booking.contentionDeadlineAt = null;
  booking.challengingBookingId = null;
  await booking.save({ transaction });
}

async function applyFirmHoldState(booking, { transaction, Booking }) {
  if (!booking || booking.bookingType !== 'pencil') {
    return { blocked: false, becameOnHold: false, releasedFromHold: false };
  }
  if (!['penciled', 'on_hold'].includes(booking.status)) {
    return { blocked: false, becameOnHold: false, releasedFromHold: false };
  }

  const blockers = await Booking.findFirmBlockers(
    booking.resourceType,
    booking.resourceId,
    booking.startTime,
    booking.endTime,
    booking.id,
    { transaction }
  );

  if (blockers.length > 0) {
    if (booking.status !== 'on_hold') {
      booking.status = 'on_hold';
      await booking.save({ transaction });
      return { blocked: true, becameOnHold: true, releasedFromHold: false };
    }
    return { blocked: true, becameOnHold: false, releasedFromHold: false };
  }

  if (booking.status === 'on_hold') {
    booking.status = 'penciled';
    await booking.save({ transaction });
    return { blocked: false, becameOnHold: false, releasedFromHold: true };
  }
  return { blocked: false, becameOnHold: false, releasedFromHold: false };
}

/**
 * Re-evaluate a pencil after an episode-ending event.
 * Case-by-case callers clear/terminalize state first, then call this helper.
 */
async function rebuildPencilAfterEpisode(bookingId, { transaction, Booking }) {
  const booking = await Booking.findByPk(bookingId, { transaction, lock: transaction.LOCK.UPDATE });
  if (!booking || booking.bookingType !== 'pencil') return { action: 'skip' };
  if (!['penciled', 'on_hold'].includes(booking.status)) return { action: 'skip' };

  // First priority: if firm-blocked, park it as non-blocking on_hold.
  const holdState = await applyFirmHoldState(booking, { transaction, Booking });
  if (holdState.blocked) {
    return {
      action: 'on_hold',
      bookingId: booking.id,
      newlyOnHold: holdState.becameOnHold,
    };
  }

  // Only free penciled bookings can start/enter a new 1v1.
  if (booking.status !== 'penciled' || booking.contentionRole != null) {
    return { action: 'free', bookingId: booking.id };
  }

  try {
    const contentionResult = await tryAttachPencilToContention(booking, { transaction, Booking });
    return { action: contentionResult ? 'contention' : 'free', bookingId: booking.id, contentionResult };
  } catch (e) {
    if (e.code !== 'ACTIVE_CONTENTION_LOCKED') throw e;
    return { action: 'free', bookingId: booking.id, locked: true };
  }
}

// ---------------------------------------------------------------------------
// Core 1v1 lifecycle
// ---------------------------------------------------------------------------

/**
 * Start strict 1v1 contention between defender and challenger.
 */
async function startContention({ defenderBooking, challengerBooking }, { transaction, Booking }) {
  const now = new Date();
  const deadlineAt = computeContentionDeadline(now, defenderBooking.startTime, defenderBooking.expiryAt);
  assertPositiveContentionDeadline(deadlineAt, now);

  const defender = await Booking.findByPk(defenderBooking.id, { transaction, lock: transaction.LOCK.UPDATE });
  const challenger = await Booking.findByPk(challengerBooking.id, { transaction, lock: transaction.LOCK.UPDATE });

  if (!defender || defender.status !== 'penciled' || defender.bookingType !== 'pencil') {
    const err = new Error(domain.defenderIneligible);
    err.code = 'CONTENTION_DEFENDER_INVALID';
    err.statusCode = 409;
    throw err;
  }
  if (!challenger || challenger.status !== 'penciled' || challenger.bookingType !== 'pencil') {
    const err = new Error(domain.challengerIneligible);
    err.code = 'CONTENTION_CHALLENGER_INVALID';
    err.statusCode = 409;
    throw err;
  }

  defender.contentionRole = 'defender';
  defender.contentionDeadlineAt = deadlineAt;
  defender.challengingBookingId = null;
  await defender.save({ transaction });

  challenger.contentionRole = 'challenger';
  challenger.challengingBookingId = defender.id;
  challenger.contentionDeadlineAt = null;
  await challenger.save({ transaction });
}

async function tryAttachPencilToContention(pencilBooking, { transaction, Booking }) {
  const overlaps = await Booking.findActivePencilOverlaps(
    pencilBooking.resourceType,
    pencilBooking.resourceId,
    pencilBooking.startTime,
    pencilBooking.endTime,
    pencilBooking.id,
    { transaction }
  );
  const foreign = overlaps.filter((b) => b.userId !== pencilBooking.userId);
  if (foreign.length === 0) return null;

  // Hard reject when overlapping any active contention participant.
  // New pencils cannot enter while a defender/challenger pair is already in progress.
  const activeContentionParticipant = foreign.find(
    (b) => b.contentionRole === 'defender' || b.contentionRole === 'challenger'
  );
  if (activeContentionParticipant) {
    const err = new Error(domain.activeContentionLocked);
    err.code = 'ACTIVE_CONTENTION_LOCKED';
    err.statusCode = 409;
    throw err;
  }

  // Elect defender by earliest createdAt across the current booking + free foreign overlaps.
  // This guarantees deterministic defender selection even during on_hold re-evaluation.
  const freeForeign = foreign.filter((b) => b.contentionRole == null);
  const electionPool = [pencilBooking, ...freeForeign];
  const defender = pickDefenderBooking(electionPool);
  if (!defender) return null;

  if (defender.id === pencilBooking.id) {
    const challenger = pickDefenderBooking(freeForeign);
    if (!challenger) return null;
    await startContention(
      { defenderBooking: pencilBooking, challengerBooking: challenger },
      { transaction, Booking }
    );
    return { action: 'defender', challengerId: challenger.id };
  }

  await startContention({ defenderBooking: defender, challengerBooking: pencilBooking }, { transaction, Booking });
  return { action: 'challenger', defenderId: defender.id };
}

function mapTerminalOutcome(status) {
  if (status === 'cancelled' || status === 'expired') return status;
  return 'displaced';
}

function mapRebuildOutcome(rebuildResult) {
  return rebuildResult?.action === 'on_hold' ? 'on_hold' : 'active';
}

function createContentionResolvedNotification({
  recipientBookingId,
  counterpartyBookingId,
  recipientOutcome,
  resolutionReason,
  resolvedByBookingId = null,
  recipientContentionRole,
}) {
  return {
    recipientBookingId,
    counterpartyBookingId,
    recipientOutcome,
    resolutionReason,
    resolvedByBookingId,
    recipientContentionRole,
  };
}

function createDualResolutionNotifications({
  defender,
  challenger,
  defenderOutcome,
  challengerOutcome,
  resolutionReason,
  resolvedByBookingId = null,
}) {
  const notifications = [];
  if (defender) {
    notifications.push(
      createContentionResolvedNotification({
        recipientBookingId: defender.id,
        counterpartyBookingId: challenger?.id || null,
        recipientOutcome: defenderOutcome,
        resolutionReason,
        resolvedByBookingId,
        recipientContentionRole: 'defender',
      })
    );
  }
  if (challenger) {
    notifications.push(
      createContentionResolvedNotification({
        recipientBookingId: challenger.id,
        counterpartyBookingId: defender?.id || null,
        recipientOutcome: challengerOutcome,
        resolutionReason,
        resolvedByBookingId,
        recipientContentionRole: 'challenger',
      })
    );
  }
  return notifications;
}

/**
 * Defender resolves terminally, challenger is rebuilt (on_hold / free / re-contention).
 */
async function resolveDefenderLoses1v1(
  defenderId,
  { terminalStatus, remark, resolutionReason, resolvedByBookingId = null },
  { transaction, Booking }
) {
  const defender = await getLockedBookingById(Booking, defenderId, transaction);
  if (!defender) return { winnerId: null, notifications: [] };

  const challenger = await findActiveChallengerForDefender(defender.id, { transaction, Booking });
  const defenderRole = defender.contentionRole || 'defender';
  const challengerRole = challenger?.contentionRole || 'challenger';
  const notifications = [];

  if (defender.status === 'penciled') {
    defender.status = terminalStatus;
    if (remark) defender.staffRemark = remark;
  }
  await clearContentionState(defender, { transaction });

  notifications.push(
    createContentionResolvedNotification({
      recipientBookingId: defender.id,
      counterpartyBookingId: challenger?.id || null,
      recipientOutcome: mapTerminalOutcome(defender.status),
      resolutionReason,
      resolvedByBookingId,
      recipientContentionRole: defenderRole,
    })
  );

  if (challenger) {
    await clearContentionState(challenger, { transaction });
    const rebuildResult = await rebuildPencilAfterEpisode(challenger.id, { transaction, Booking });
    notifications.push(
      createContentionResolvedNotification({
        recipientBookingId: challenger.id,
        counterpartyBookingId: defender.id,
        recipientOutcome: mapRebuildOutcome(rebuildResult),
        resolutionReason,
        resolvedByBookingId,
        recipientContentionRole: challengerRole,
      })
    );
    return {
      winnerId: challenger.id,
      notifications,
    };
  }
  return { winnerId: null, notifications };
}

/**
 * Challenger resolves terminally, defender is rebuilt (on_hold / free / re-contention).
 */
async function resolveChallengerLoses1v1(
  challengerId,
  { terminalStatus, remark, resolutionReason, resolvedByBookingId = null },
  { transaction, Booking }
) {
  const challenger = await getLockedBookingById(Booking, challengerId, transaction);
  if (!challenger) return { winnerId: null, notifications: [] };

  const defender = challenger.challengingBookingId
    ? await getLockedBookingById(Booking, challenger.challengingBookingId, transaction)
    : null;
  const challengerRole = challenger.contentionRole || 'challenger';
  const defenderRole = defender?.contentionRole || 'defender';
  const notifications = [];

  if (terminalStatus && challenger.status === 'penciled') {
    challenger.status = terminalStatus;
    if (remark) challenger.staffRemark = remark;
  }
  await clearContentionState(challenger, { transaction });

  notifications.push(
    createContentionResolvedNotification({
      recipientBookingId: challenger.id,
      counterpartyBookingId: defender?.id || null,
      recipientOutcome: mapTerminalOutcome(challenger.status),
      resolutionReason,
      resolvedByBookingId,
      recipientContentionRole: challengerRole,
    })
  );

  if (defender && defender.status === 'penciled' && defender.contentionRole === 'defender') {
    await clearContentionState(defender, { transaction });
    const rebuildResult = await rebuildPencilAfterEpisode(defender.id, { transaction, Booking });
    notifications.push(
      createContentionResolvedNotification({
        recipientBookingId: defender.id,
        counterpartyBookingId: challenger.id,
        recipientOutcome: mapRebuildOutcome(rebuildResult),
        resolutionReason,
        resolvedByBookingId,
        recipientContentionRole: defenderRole,
      })
    );
    return {
      winnerId: defender.id,
      notifications,
    };
  }
  return { winnerId: null, notifications };
}

// ---------------------------------------------------------------------------
// Booking event hooks
// ---------------------------------------------------------------------------

async function onBookingCancelledMidContention(cancelledBooking, { transaction, Booking }) {
  if (cancelledBooking.contentionRole === 'defender') {
    return resolveDefenderLoses1v1(
      cancelledBooking.id,
      {
        terminalStatus: 'cancelled',
        remark: cancelledBooking.staffRemark || null,
        resolutionReason: 'defender_cancelled',
        resolvedByBookingId: cancelledBooking.id,
      },
      { transaction, Booking }
    );
  }

  if (cancelledBooking.contentionRole === 'challenger') {
    return resolveChallengerLoses1v1(
      cancelledBooking.id,
      {
        terminalStatus: 'cancelled',
        remark: cancelledBooking.staffRemark || null,
        resolutionReason: 'challenger_cancelled',
        resolvedByBookingId: cancelledBooking.id,
      },
      { transaction, Booking }
    );
  }

  await clearContentionState(cancelledBooking, { transaction });
  return { winnerId: null, notifications: [] };
}

/**
 * Defender converts to firm pending; release challenger from contention and reclassify.
 */
async function onDefenderConvertedToFirm(firmBooking, { transaction, Booking }) {
  if (firmBooking.contentionRole !== 'defender') return { notifications: [] };
  const challenger = await findActiveChallengerForDefender(firmBooking.id, { transaction, Booking });
  const notifications = [];
  if (challenger) {
    await clearContentionState(challenger, { transaction });
    const holdState = await applyFirmHoldState(challenger, { transaction, Booking });
    notifications.push(
      createContentionResolvedNotification({
        recipientBookingId: challenger.id,
        counterpartyBookingId: firmBooking.id,
        recipientOutcome: holdState.blocked ? 'on_hold' : 'active',
        resolutionReason: 'defender_converted_to_firm',
        resolvedByBookingId: firmBooking.id,
        recipientContentionRole: 'challenger',
      })
    );
  }
  firmBooking.contentionRole = null;
  firmBooking.contentionDeadlineAt = null;
  firmBooking.challengingBookingId = null;
  await firmBooking.save({ transaction });
  notifications.unshift(
    createContentionResolvedNotification({
      recipientBookingId: firmBooking.id,
      counterpartyBookingId: challenger?.id || null,
      recipientOutcome: 'active',
      resolutionReason: 'defender_converted_to_firm',
      resolvedByBookingId: firmBooking.id,
      recipientContentionRole: 'defender',
    })
  );
  return { notifications };
}

/**
 * Firm approval displaces all overlapping pencils that still occupy the slot,
 * including those currently parked as on_hold by another firm blocker.
 */
async function onFirmBookingApproved(firmBooking, { transaction, Booking }) {
  const displacedBookingIds = [];
  const pencils = await findOverlappingPencilsForFirm(
    firmBooking,
    { statuses: ['penciled', 'on_hold'] },
    { transaction, Booking }
  );

  for (const p of pencils) {
    const row = await Booking.findByPk(p.id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!row || row.status === 'displaced') continue;
    await clearContentionState(row, { transaction });
    row.status = 'displaced';
    row.displacedByBookingId = firmBooking.id;
    await row.save({ transaction });
    displacedBookingIds.push(row.id);
  }

  await clearContentionState(firmBooking, { transaction });
  return { displacedBookingIds };
}

/**
 * Firm denied/cancelled: clear firm contention metadata and rebuild nearby on_hold pencils.
 */
async function onFirmDeniedOrCancelled(firmBooking, { transaction, Booking }) {
  await clearContentionState(firmBooking, { transaction });

  const onHoldOverlaps = await findOverlappingPencilsForFirm(
    firmBooking,
    { statuses: 'on_hold' },
    { transaction, Booking }
  );

  for (const row of onHoldOverlaps) {
    const b = await Booking.findByPk(row.id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!b || b.status !== 'on_hold') continue;

    await rebuildPencilAfterEpisode(b.id, { transaction, Booking });
  }
}

/**
 * New firm can make active defenders unwinnable (defender can't convert to firm due to new firm); dissolve those 1v1 episodes immediately.
 */
async function autoResolveFirmBlockedDefenders(firmBooking, { transaction, Booking }) {
  const onHoldBookingIds = new Set();
  const contentionNotifications = [];
  const overlappingDefenders = await findOverlappingPencilsForFirm(
    firmBooking,
    { statuses: 'penciled', contentionRole: 'defender' },
    { transaction, Booking }
  );

  for (const d of overlappingDefenders) {
    const defender = await Booking.findByPk(d.id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!defender || defender.status !== 'penciled' || defender.contentionRole !== 'defender') continue;

    const challenger = await findActiveChallengerForDefender(defender.id, { transaction, Booking });

    await clearContentionState(defender, { transaction });
    const defenderResult = await rebuildPencilAfterEpisode(defender.id, { transaction, Booking });
    if (defenderResult?.action === 'on_hold' && defenderResult.newlyOnHold) {
      onHoldBookingIds.add(defender.id);
    }

    let challengerOutcome = null;
    if (challenger) {
      await clearContentionState(challenger, { transaction });
      const challengerResult = await rebuildPencilAfterEpisode(challenger.id, { transaction, Booking });
      if (challengerResult?.action === 'on_hold' && challengerResult.newlyOnHold) {
        onHoldBookingIds.add(challenger.id);
      }
      challengerOutcome = mapRebuildOutcome(challengerResult);
    }

    const defenderOutcome = mapRebuildOutcome(defenderResult);
    contentionNotifications.push(
      ...createDualResolutionNotifications({
        defender,
        challenger,
        defenderOutcome,
        challengerOutcome,
        resolutionReason: 'unwinnable_defender_firm_overlap',
        resolvedByBookingId: firmBooking.id,
      })
    );
  }

  // Also park any overlapping free pencils as on_hold.
  // This covers cases where a contention ended before the firm row existed
  // (e.g. own-pencil challenger auto-cancel during firm create).
  const overlappingFreePencils = await findOverlappingPencilsForFirm(
    firmBooking,
    { statuses: 'penciled', contentionRole: null },
    { transaction, Booking }
  );

  for (const p of overlappingFreePencils) {
    const freePencil = await Booking.findByPk(p.id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!freePencil || freePencil.status !== 'penciled' || freePencil.contentionRole != null) continue;
    const result = await rebuildPencilAfterEpisode(freePencil.id, { transaction, Booking });
    if (result?.action === 'on_hold' && result.newlyOnHold) {
      onHoldBookingIds.add(freePencil.id);
    }
  }

  return {
    onHoldBookingIds: Array.from(onHoldBookingIds),
    contentionNotifications,
  };
}

/**
 * Post-create firm safety pass to re-check all overlapping pencils now that the firm row exists.
 */
async function reevaluateOverlappingPencilsForFirm(firmBooking, { transaction, Booking }) {
  const onHoldBookingIds = new Set();
  const overlappingPencils = await findOverlappingPencilsForFirm(
    firmBooking,
    { statuses: ['penciled', 'on_hold'] },
    { transaction, Booking }
  );

  for (const row of overlappingPencils) {
    const result = await rebuildPencilAfterEpisode(row.id, { transaction, Booking });
    if (result?.action === 'on_hold' && result.newlyOnHold) {
      onHoldBookingIds.add(row.id);
    }
  }

  return { onHoldBookingIds: Array.from(onHoldBookingIds) };
}

// ---------------------------------------------------------------------------
// Scheduled resolution helpers
// ---------------------------------------------------------------------------

async function runResolutionBatch(rows, { sequelize, Booking, worker }) {
  const results = [];
  for (const row of rows) {
    const t = await sequelize.transaction();
    try {
      const result = await worker(row, t, Booking);
      await t.commit();
      if (result) results.push(result);
    } catch (e) {
      await t.rollback();
      results.push({ bookingId: row.id, error: e.message });
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Scheduled resolvers
// ---------------------------------------------------------------------------

async function resolveDueContentionDeadlines(now = new Date(), { sequelize, Booking }) {
  const dueDefenders = await Booking.findAll({
    where: {
      contentionRole: 'defender',
      contentionDeadlineAt: { [Op.lte]: now },
      status: 'penciled',
      bookingType: 'pencil'
    }
  });

  return runResolutionBatch(dueDefenders, {
    sequelize,
    Booking,
    worker: async (defender, t) => {
      const fresh = await Booking.findByPk(defender.id, { transaction: t, lock: t.LOCK.UPDATE });
      if (!fresh || fresh.contentionRole !== 'defender' || fresh.status !== 'penciled') {
        return null;
      }
      const result = await resolveDefenderLoses1v1(
        fresh.id,
        {
          terminalStatus: 'displaced',
          remark: 'Displaced: lost contention — did not convert to firm in time',
          resolutionReason: 'defender_missed_deadline',
        },
        { transaction: t, Booking }
      );
      return { bookingId: defender.id, outcome: 'defender_lost_deadline', ...result };
    }
  });
}

async function resolveExpiredChallengers(now = new Date(), { sequelize, Booking }) {
  const expiredChallengers = await Booking.findAll({
    where: {
      contentionRole: 'challenger',
      bookingType: 'pencil',
      status: 'penciled',
      expiryAt: { [Op.lte]: now }
    }
  });

  return runResolutionBatch(expiredChallengers, {
    sequelize,
    Booking,
    worker: async (challenger, t) => {
      const fresh = await Booking.findByPk(challenger.id, { transaction: t, lock: t.LOCK.UPDATE });
      if (!fresh || fresh.contentionRole !== 'challenger' || fresh.status !== 'penciled') {
        return null;
      }
      const result = await resolveChallengerLoses1v1(
        fresh.id,
        {
          terminalStatus: 'expired',
          remark: 'Expired: pencil lifetime ended during contention',
          resolutionReason: 'challenger_expired',
        },
        { transaction: t, Booking }
      );
      return { bookingId: challenger.id, outcome: 'challenger_expired', ...result };
    }
  });
}

async function resolveExpiredDefenders(now = new Date(), { sequelize, Booking }) {
  const expiredDefenders = await Booking.findAll({
    where: {
      contentionRole: 'defender',
      bookingType: 'pencil',
      status: 'penciled',
      expiryAt: { [Op.lte]: now }
    }
  });

  return runResolutionBatch(expiredDefenders, {
    sequelize,
    Booking,
    worker: async (defender, t) => {
      const fresh = await Booking.findByPk(defender.id, { transaction: t, lock: t.LOCK.UPDATE });
      if (!fresh || fresh.contentionRole !== 'defender' || fresh.status !== 'penciled') {
        return null;
      }
      const result = await resolveDefenderLoses1v1(
        fresh.id,
        {
          terminalStatus: 'displaced',
          remark:
            'Displaced: lost contention — expiry boundary was reached before defender converted to firm',
          resolutionReason: 'defender_expired_boundary',
        },
        { transaction: t, Booking }
      );
      return { bookingId: defender.id, outcome: 'defender_lost_expiry_boundary', ...result };
    }
  });
}

// ---------------------------------------------------------------------------
// Read-model helpers
// ---------------------------------------------------------------------------

async function getContentionDetails(booking, { Booking, User }) {
  if (!booking.contentionRole) return null;

  if (booking.contentionRole === 'defender') {
    const challenger = await Booking.findOne({
      where: {
        challengingBookingId: booking.id,
        contentionRole: 'challenger',
        status: 'penciled'
      },
      include: [{ model: User, as: 'user', attributes: ['id', 'email'] }]
    });
    return {
      role: 'defender',
      deadlineAt: booking.contentionDeadlineAt || null,
      defender: {
        bookingId: booking.id,
        referenceCode: booking.referenceCode || null,
        startTime: booking.startTime,
        endTime: booking.endTime,
        user: booking.user ? { id: booking.user.id, email: booking.user.email } : null
      },
      challenger: challenger
        ? {
            bookingId: challenger.id,
            referenceCode: challenger.referenceCode || null,
            startTime: challenger.startTime,
            endTime: challenger.endTime,
            user: challenger.user ? { id: challenger.user.id, email: challenger.user.email } : null
          }
        : null
    };
  }

  if (booking.contentionRole === 'challenger' && booking.challengingBookingId) {
    const defender = await Booking.findByPk(booking.challengingBookingId, {
      include: [{ model: User, as: 'user', attributes: ['id', 'email'] }]
    });
    return {
      role: 'challenger',
      deadlineAt: defender?.contentionDeadlineAt || null,
      defender: defender
        ? {
            bookingId: defender.id,
            referenceCode: defender.referenceCode || null,
            startTime: defender.startTime,
            endTime: defender.endTime,
            user: defender.user ? { id: defender.user.id, email: defender.user.email } : null
          }
        : null,
      challenger: {
        bookingId: booking.id,
        referenceCode: booking.referenceCode || null,
        startTime: booking.startTime,
        endTime: booking.endTime,
        user: booking.user ? { id: booking.user.id, email: booking.user.email } : null
      }
    };
  }

  return null;
}

function canConvertToFirm(booking) {
  if (booking.bookingType !== 'pencil' || booking.status !== 'penciled') return false;
  return booking.contentionRole === null || booking.contentionRole === 'defender';
}

module.exports = {
  intervalsOverlap,
  pickDefenderBooking,
  startContention,
  tryAttachPencilToContention,
  clearContentionState,
  resolveDefenderLoses1v1,
  resolveChallengerLoses1v1,
  onDefenderConvertedToFirm,
  onFirmBookingApproved,
  onFirmDeniedOrCancelled,
  autoResolveFirmBlockedDefenders,
  reevaluateOverlappingPencilsForFirm,
  rebuildPencilAfterEpisode,
  onBookingCancelledMidContention,
  resolveDueContentionDeadlines,
  resolveExpiredChallengers,
  resolveExpiredDefenders,
  getContentionDetails,
  canConvertToFirm,
  computePencilExpiryAt
};
