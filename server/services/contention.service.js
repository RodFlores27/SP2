'use strict';

const { Op } = require('sequelize');
const {
  computeContentionDeadline,
  assertPositiveContentionDeadline,
  computePencilExpiryAt
} = require('../utils/booking-rules');

/**
 * Contention Service - Simplified Architecture
 * 
 * Contention state is tracked directly on the Booking model via:
 * - contentionGroupId: Links bookings in the same contention group
 * - contentionRole: 'defender' | 'challenger' | 'queued' | null
 * - contentionDeadlineAt: Deadline for the defender
 * - challengingBookingId: Who the challenger is challenging
 * - queuePosition: Order in the queue
 * 
 * Key rules from use cases:
 * 1. A booking challenges only ONE booking at a time (earliest issued overlap)
 * 2. Bookings overlapping someone in contention join as queued
 * 3. Bookings not overlapping anyone in contention stay as free pencils
 * 4. When defender converts to firm, group freezes (challenger becomes free pencil)
 * 5. When defender loses, challenger wins and may challenge next overlap
 */

function intervalsOverlap(aStart, aEnd, bStart, bEnd) {
  return new Date(aStart) < new Date(bEnd) && new Date(aEnd) > new Date(bStart);
}

/**
 * Pick the defender from a list of overlapping pencils (earliest createdAt, then lowest id).
 */
function pickDefenderBooking(overlapPencils) {
  if (!overlapPencils.length) return null;
  return [...overlapPencils].sort(
    (a, b) =>
      new Date(a.createdAt) - new Date(b.createdAt) ||
      a.id - b.id
  )[0];
}

/**
 * Generate a new contention group ID. We use the defender's booking ID as the group ID.
 */
function generateGroupId(defenderBookingId) {
  return defenderBookingId;
}

/**
 * Get the next queue position in a contention group.
 */
async function getNextQueuePosition(groupId, { transaction, Booking }) {
  const maxPos = await Booking.max('queuePosition', {
    where: { contentionGroupId: groupId, contentionRole: 'queued' },
    transaction
  });
  return (maxPos || 0) + 1;
}

/**
 * Start a new contention between defender and challenger.
 * 
 * @param {Object} params
 * @param {Booking} params.defenderBooking - The booking being challenged (earliest issued)
 * @param {Booking} params.challengerBooking - The new booking doing the challenging
 * @param {Object} context - { transaction, Booking }
 * @returns {number} - The contention group ID
 */
async function startContention(
  { defenderBooking, challengerBooking },
  { transaction, Booking }
) {
  const now = new Date();
  const deadlineAt = computeContentionDeadline(
    now,
    defenderBooking.startTime,
    defenderBooking.expiryAt
  );
  assertPositiveContentionDeadline(deadlineAt, now);

  const defender = await Booking.findByPk(defenderBooking.id, {
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  const challenger = await Booking.findByPk(challengerBooking.id, {
    transaction,
    lock: transaction.LOCK.UPDATE
  });

  if (!defender || !challenger) {
    throw new Error('Booking not found for contention');
  }
  if (defender.status !== 'penciled') {
    const err = new Error('Defender is not eligible for contention');
    err.code = 'CONTENTION_DEFENDER_INVALID';
    err.statusCode = 409;
    throw err;
  }
  if (challenger.status !== 'penciled') {
    const err = new Error('Challenger is not eligible for contention');
    err.code = 'CONTENTION_CHALLENGER_INVALID';
    err.statusCode = 409;
    throw err;
  }

  const groupId = generateGroupId(defender.id);

  defender.contentionGroupId = groupId;
  defender.contentionRole = 'defender';
  defender.contentionDeadlineAt = deadlineAt;
  await defender.save({ transaction });

  challenger.contentionGroupId = groupId;
  challenger.contentionRole = 'challenger';
  challenger.challengingBookingId = defender.id;
  await challenger.save({ transaction });

  return groupId;
}

/**
 * Add a booking to an existing contention group as queued.
 * 
 * @param {Booking} booking - The booking to enqueue
 * @param {number} groupId - The contention group ID
 * @param {Object} context - { transaction, Booking }
 */
async function joinContentionGroup(booking, groupId, { transaction, Booking }) {
  const b = await Booking.findByPk(booking.id, {
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  if (!b || b.bookingType !== 'pencil' || b.status !== 'penciled') {
    const err = new Error('Invalid booking to queue');
    err.code = 'CONTENTION_QUEUE_INVALID';
    err.statusCode = 400;
    throw err;
  }

  const position = await getNextQueuePosition(groupId, { transaction, Booking });

  b.contentionGroupId = groupId;
  b.contentionRole = 'queued';
  b.queuePosition = position;
  await b.save({ transaction });

  return position;
}

/**
 * Find if the proposed slot overlaps any booking currently in an active or frozen
 * contention group. Returns the group ID if found, null otherwise.
 *
 * We check contentionGroupId != null rather than contentionRole != null because
 * frozen group members (the released challenger) keep their contentionGroupId
 * but have contentionRole = null. Without this, a new booking created in the
 * tail of a frozen challenger's time range would miss the frozen group and
 * incorrectly start a new contention instead of joining the queue.
 */
async function findOverlappingContentionGroup(
  { resourceType, resourceId, startTime, endTime },
  { transaction, Booking }
) {
  const contentionBookings = await Booking.findAll({
    where: {
      resourceType,
      resourceId,
      bookingType: 'pencil',
      status: 'penciled',
      contentionGroupId: { [Op.ne]: null }
    },
    transaction
  });

  for (const b of contentionBookings) {
    if (intervalsOverlap(b.startTime, b.endTime, startTime, endTime)) {
      return b.contentionGroupId;
    }
  }
  return null;
}

/**
 * Try to attach a pencil booking to contention (on create or after winning).
 * 
 * Algorithm:
 * 1. Find foreign pencil overlaps (other users' active pencils)
 * 2. If any overlap is in active contention → join that group as queued
 * 3. Elect the defender from ALL participants (pencilBooking included):
 *    - Earliest-created booking wins the defender role
 *    - If pencilBooking IS the earliest → it becomes the defender; earliest foreign pencil challenges it
 *    - If pencilBooking is NOT the earliest → it becomes the challenger to that earlier booking
 * 4. If no overlaps → stay as free pencil
 * 
 * Including pencilBooking in the election is critical for the post-win scenario:
 * when a challenger wins a battle and calls this function to look for its next
 * contention, it has already been "in the system" longer than any queued booking
 * that was waiting for it. The winner earned the defender role for the next episode.
 */
async function tryAttachPencilToContention(
  pencilBooking,
  { transaction, Booking }
) {
  const others = await Booking.findActivePencilOverlaps(
    pencilBooking.resourceType,
    pencilBooking.resourceId,
    pencilBooking.startTime,
    pencilBooking.endTime,
    pencilBooking.id,
    { transaction }
  );

  const foreignPencils = others.filter((o) => o.userId !== pencilBooking.userId);
  if (foreignPencils.length === 0) return null;

  const existingGroupId = await findOverlappingContentionGroup(
    {
      resourceType: pencilBooking.resourceType,
      resourceId: pencilBooking.resourceId,
      startTime: pencilBooking.startTime,
      endTime: pencilBooking.endTime
    },
    { transaction, Booking }
  );

  if (existingGroupId) {
    await joinContentionGroup(pencilBooking, existingGroupId, { transaction, Booking });
    return { action: 'queued', groupId: existingGroupId };
  }

  // Elect the defender from all participants including pencilBooking itself.
  // This ensures a battle-hardened winner (e.g. a challenger who just won) correctly
  // takes the defender role when it is the oldest booking in the remaining pool.
  const allParticipants = [...foreignPencils, pencilBooking];
  const electedDefender = pickDefenderBooking(allParticipants);

  if (electedDefender.id === pencilBooking.id) {
    // pencilBooking is the earliest: it becomes the defender.
    // The challenger is the earliest of the foreign pencils.
    const firstChallenger = pickDefenderBooking(foreignPencils);
    if (!firstChallenger) return null;

    if (firstChallenger.contentionRole != null) {
      // Foreign pencil already in contention — join as queued instead.
      await joinContentionGroup(pencilBooking, firstChallenger.contentionGroupId, { transaction, Booking });
      return { action: 'queued', groupId: firstChallenger.contentionGroupId };
    }

    const groupId = await startContention(
      { defenderBooking: pencilBooking, challengerBooking: firstChallenger },
      { transaction, Booking }
    );
    return { action: 'defender', groupId };
  }

  // pencilBooking is NOT the earliest: it becomes the challenger (or queued).
  if (electedDefender.contentionRole != null) {
    await joinContentionGroup(pencilBooking, electedDefender.contentionGroupId, { transaction, Booking });
    return { action: 'queued', groupId: electedDefender.contentionGroupId };
  }

  const groupId = await startContention(
    { defenderBooking: electedDefender, challengerBooking: pencilBooking },
    { transaction, Booking }
  );

  return { action: 'challenger', groupId };
}

/**
 * Clear contention state from a booking.
 */
async function clearContentionState(booking, { transaction }) {
  booking.contentionGroupId = null;
  booking.contentionRole = null;
  booking.contentionDeadlineAt = null;
  booking.challengingBookingId = null;
  booking.queuePosition = null;
  await booking.save({ transaction });
}

/**
 * Promote the queue after the challenger wins or defender is removed.
 * 
 * @param {Booking} winner - The booking that won (usually the former challenger)
 * @param {number} groupId - The old contention group ID
 * @param {Object} context
 */
async function promoteQueueAndRebuild(winner, groupId, { transaction, Booking }) {
  const queuedBookings = await Booking.findAll({
    where: {
      contentionGroupId: groupId,
      contentionRole: 'queued',
      status: 'penciled'
    },
    order: [['queuePosition', 'ASC'], ['createdAt', 'ASC']],
    transaction
  });

  for (const qb of queuedBookings) {
    const b = await Booking.findByPk(qb.id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!b || b.status !== 'penciled') continue;
    await clearContentionState(b, { transaction });
  }

  if (winner) {
    const w = await Booking.findByPk(winner.id, { transaction, lock: transaction.LOCK.UPDATE });
    if (w && w.status === 'penciled') {
      await clearContentionState(w, { transaction });
      await tryAttachPencilToContention(w, { transaction, Booking });
    }
  }

  for (const qb of queuedBookings) {
    const b = await Booking.findByPk(qb.id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!b || b.status !== 'penciled' || b.contentionRole != null) continue;
    await tryAttachPencilToContention(b, { transaction, Booking });
  }
}

/**
 * Handle when the defender loses (deadline passed, defender expired, defender cancelled).
 * The challenger wins and may proceed to challenge other overlaps.
 */
async function applyDefenderLoses(
  defenderId,
  { terminalStatus, remark },
  { transaction, Booking }
) {
  const defender = await Booking.findByPk(defenderId, {
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  if (!defender) return { winnerId: null };

  const groupId = defender.contentionGroupId;
  
  const challenger = await Booking.findOne({
    where: {
      contentionGroupId: groupId,
      contentionRole: 'challenger',
      status: 'penciled'
    },
    transaction,
    lock: transaction.LOCK.UPDATE
  });

  if (defender.status === 'penciled') {
    defender.status = terminalStatus;
    if (remark) defender.staffRemark = remark;
  }
  await clearContentionState(defender, { transaction });

  if (!challenger) {
    return { winnerId: null, groupId };
  }

  await promoteQueueAndRebuild(challenger, groupId, { transaction, Booking });

  return { winnerId: challenger.id, groupId };
}

/**
 * Handle when the challenger cancels or expires.
 * The defender wins this round and may face the next queued challenger.
 */
async function applyChallengerLoses(
  challengerId,
  { transaction, Booking }
) {
  const challenger = await Booking.findByPk(challengerId, {
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  if (!challenger) return { winnerId: null };

  const groupId = challenger.contentionGroupId;

  const defender = await Booking.findOne({
    where: {
      contentionGroupId: groupId,
      contentionRole: 'defender',
      status: 'penciled'
    },
    transaction,
    lock: transaction.LOCK.UPDATE
  });

  await clearContentionState(challenger, { transaction });

  if (!defender) {
    return { winnerId: null, groupId };
  }

  const queuedBookings = await Booking.findAll({
    where: {
      contentionGroupId: groupId,
      contentionRole: 'queued',
      status: 'penciled'
    },
    order: [['queuePosition', 'ASC'], ['createdAt', 'ASC']],
    transaction
  });

  if (queuedBookings.length === 0) {
    await clearContentionState(defender, { transaction });
    await tryAttachPencilToContention(defender, { transaction, Booking });
    return { winnerId: defender.id, groupId };
  }

  const nextChallenger = await Booking.findByPk(queuedBookings[0].id, {
    transaction,
    lock: transaction.LOCK.UPDATE
  });

  if (!nextChallenger || !intervalsOverlap(
    defender.startTime, defender.endTime,
    nextChallenger.startTime, nextChallenger.endTime
  )) {
    for (const qb of queuedBookings) {
      const b = await Booking.findByPk(qb.id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!b || b.status !== 'penciled') continue;
      await clearContentionState(b, { transaction });
    }
    await clearContentionState(defender, { transaction });
    
    await tryAttachPencilToContention(defender, { transaction, Booking });
    for (const qb of queuedBookings) {
      const b = await Booking.findByPk(qb.id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!b || b.status !== 'penciled' || b.contentionRole != null) continue;
      await tryAttachPencilToContention(b, { transaction, Booking });
    }
    return { winnerId: defender.id, groupId };
  }

  nextChallenger.contentionRole = 'challenger';
  nextChallenger.challengingBookingId = defender.id;
  nextChallenger.queuePosition = null;
  await nextChallenger.save({ transaction });

  for (let i = 1; i < queuedBookings.length; i++) {
    const qb = await Booking.findByPk(queuedBookings[i].id, { transaction, lock: transaction.LOCK.UPDATE });
    if (qb && qb.status === 'penciled') {
      qb.queuePosition = i;
      await qb.save({ transaction });
    }
  }

  return { winnerId: defender.id, groupId, newChallengerId: nextChallenger.id };
}

/**
 * Handle when defender converts to firm.
 * The group freezes: the challenger visually becomes a free pencil but STAYS in
 * the group (contentionGroupId is kept). Only its active-role fields are cleared.
 * Keeping the challenger in the group means onFirmDeniedOrCancelled can find it
 * via the standard group-member query instead of relying on a time-overlap scan.
 * The queue stays fully intact.
 */
async function onDefenderConvertedToFirm(firmBooking, { transaction, Booking }) {
  const groupId = firmBooking.contentionGroupId;
  if (!groupId) return;

  const challenger = await Booking.findOne({
    where: {
      contentionGroupId: groupId,
      contentionRole: 'challenger',
      status: 'penciled'
    },
    transaction,
    lock: transaction.LOCK.UPDATE
  });

  if (challenger) {
    // Partial-clear: remove the active-role fields so the challenger displays as
    // a free pencil, but keep contentionGroupId so it remains a group member.
    challenger.contentionRole = null;
    challenger.contentionDeadlineAt = null;
    challenger.challengingBookingId = null;
    challenger.queuePosition = null;
    await challenger.save({ transaction });
  }

  firmBooking.contentionRole = null;
  firmBooking.contentionDeadlineAt = null;
  await firmBooking.save({ transaction });
}

/**
 * Handle when a firm booking is approved.
 * Displace all overlapping pencils and rebuild contention groups.
 */
async function onFirmBookingApproved(firmBooking, { transaction, Booking }) {
  const pencils = await Booking.findActivePencilOverlaps(
    firmBooking.resourceType,
    firmBooking.resourceId,
    firmBooking.startTime,
    firmBooking.endTime,
    firmBooking.id,
    { transaction }
  );

  const displacedIds = [];
  for (const p of pencils) {
    const row = await Booking.findByPk(p.id, {
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!row || row.status === 'displaced') continue;

    const hadGroup = row.contentionGroupId;
    await clearContentionState(row, { transaction });

    row.status = 'displaced';
    row.displacedByBookingId = firmBooking.id;
    await row.save({ transaction });
    displacedIds.push(row.id);
  }

  await clearContentionState(firmBooking, { transaction });

  const remainingPencils = await Booking.findAll({
    where: {
      resourceType: firmBooking.resourceType,
      resourceId: firmBooking.resourceId,
      bookingType: 'pencil',
      status: 'penciled',
      id: { [Op.notIn]: displacedIds }
    },
    order: [['createdAt', 'ASC']],
    transaction
  });

  for (const p of remainingPencils) {
    const b = await Booking.findByPk(p.id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!b || b.status !== 'penciled' || b.contentionRole != null) continue;
    await tryAttachPencilToContention(b, { transaction, Booking });
  }
}

/**
 * Handle when a firm booking is denied or cancelled (was freezing a group).
 * Unfreeze and rebuild contention among remaining pencils.
 *
 * The frozen group contains three categories:
 *   - The firm booking itself       (contentionGroupId set, contentionRole = null, bookingType = 'firm')
 *   - The frozen challenger         (contentionGroupId kept, contentionRole = null, bookingType = 'pencil')
 *   - Queued bookings               (contentionGroupId set, contentionRole = 'queued')
 *
 * Crucially, the frozen challenger and queued members must be handled DIFFERENTLY:
 *
 *   Frozen challenger → just release it (clear contentionGroupId).
 *     It was intentionally freed when the group froze and should REMAIN a free
 *     pencil after the unfreeze. If a queued booking wins its new battles and
 *     overlaps it, they will naturally form a new contention at that point.
 *     Re-evaluating it here would cause it to "steal" the defender role, because
 *     it is often the earliest-created booking and would win the election before
 *     the actual intended defender (a formerly queued booking's wider overlap
 *     target) is considered.
 *
 *   Queued bookings → clear them then re-run tryAttachPencilToContention.
 *     These bookings are the "active waiters". When re-evaluated they see ALL
 *     free pencils in their overlap range — including the just-released frozen
 *     challenger and any bookings that were never in the group — so the correct
 *     earliest-created booking naturally wins the defender election.
 */
async function onFirmDeniedOrCancelled(firmBooking, { transaction, Booking }) {
  const groupId = firmBooking.contentionGroupId;

  await clearContentionState(firmBooking, { transaction });

  if (!groupId) return;

  // Release the frozen challenger: clear its contentionGroupId so it becomes a
  // true free pencil, but do NOT re-run tryAttachPencilToContention for it.
  const frozenChallenger = await Booking.findOne({
    where: {
      contentionGroupId: groupId,
      bookingType: 'pencil',
      status: 'penciled',
      contentionRole: null
    },
    transaction,
    lock: transaction.LOCK.UPDATE
  });

  if (frozenChallenger) {
    await clearContentionState(frozenChallenger, { transaction });
  }

  // Re-evaluate only queued bookings. When tryAttachPencilToContention runs for
  // each queued booking it sees the just-released challenger (now contentionRole=null)
  // plus any other free pencils in its overlap range, giving it the full picture
  // needed to elect the correct defender.
  const queuedMembers = await Booking.findAll({
    where: {
      contentionGroupId: groupId,
      contentionRole: 'queued',
      status: 'penciled'
    },
    order: [['createdAt', 'ASC']],
    transaction
  });

  for (const m of queuedMembers) {
    const b = await Booking.findByPk(m.id, { transaction, lock: transaction.LOCK.UPDATE });
    if (b && b.status === 'penciled') {
      await clearContentionState(b, { transaction });
    }
  }

  for (const m of queuedMembers) {
    const b = await Booking.findByPk(m.id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!b || b.status !== 'penciled' || b.contentionRole != null) continue;
    await tryAttachPencilToContention(b, { transaction, Booking });
  }
}

/**
 * Handle cancellation of a frozen challenger.
 *
 * When a defender converts to firm the group freezes: the challenger keeps its
 * contentionGroupId (stays in the group) but its contentionRole is cleared so it
 * displays as a free pencil. If that frozen challenger is later cancelled we just
 * clean up its groupId and re-compact the remaining queue positions so they stay
 * contiguous. The firm booking is still the group anchor — nothing else changes
 * until the firm is eventually denied or cancelled.
 */
async function onFrozenChallengerCancelled(cancelledBooking, { transaction, Booking }) {
  const groupId = cancelledBooking.contentionGroupId;
  await clearContentionState(cancelledBooking, { transaction });

  if (!groupId) return;

  // Re-number any queued bookings so positions remain contiguous (1, 2, 3…).
  const remainingQueue = await Booking.findAll({
    where: {
      contentionGroupId: groupId,
      contentionRole: 'queued',
      status: 'penciled'
    },
    order: [['queuePosition', 'ASC']],
    transaction
  });

  let pos = 1;
  for (const qb of remainingQueue) {
    const b = await Booking.findByPk(qb.id, { transaction, lock: transaction.LOCK.UPDATE });
    if (b && b.status === 'penciled') {
      b.queuePosition = pos++;
      await b.save({ transaction });
    }
  }
}

/**
 * Handle booking cancellation during contention.
 */
async function onBookingCancelledMidContention(cancelledBooking, { transaction, Booking }) {
  const role = cancelledBooking.contentionRole;
  const groupId = cancelledBooking.contentionGroupId;

  if (!role || !groupId) {
    await clearContentionState(cancelledBooking, { transaction });
    return;
  }

  if (role === 'defender') {
    const challenger = await Booking.findOne({
      where: {
        contentionGroupId: groupId,
        contentionRole: 'challenger',
        status: 'penciled'
      },
      transaction,
      lock: transaction.LOCK.UPDATE
    });

    await clearContentionState(cancelledBooking, { transaction });

    if (challenger) {
      await promoteQueueAndRebuild(challenger, groupId, { transaction, Booking });
    }
    return;
  }

  if (role === 'challenger') {
    await clearContentionState(cancelledBooking, { transaction });
    await applyChallengerLoses(cancelledBooking.id, { transaction, Booking });
    return;
  }

  if (role === 'queued') {
    await clearContentionState(cancelledBooking, { transaction });

    const remainingQueue = await Booking.findAll({
      where: {
        contentionGroupId: groupId,
        contentionRole: 'queued',
        status: 'penciled'
      },
      order: [['queuePosition', 'ASC']],
      transaction
    });

    let pos = 1;
    for (const qb of remainingQueue) {
      const b = await Booking.findByPk(qb.id, { transaction, lock: transaction.LOCK.UPDATE });
      if (b && b.status === 'penciled') {
        b.queuePosition = pos++;
        await b.save({ transaction });
      }
    }
  }
}

/**
 * Cron: Resolve contention deadlines (defender loses by timeout).
 */
async function resolveDueContentionDeadlines(
  now = new Date(),
  { sequelize, Booking }
) {
  const dueDefenders = await Booking.findAll({
    where: {
      contentionRole: 'defender',
      contentionDeadlineAt: { [Op.lte]: now },
      status: 'penciled',
      bookingType: 'pencil'
    }
  });

  const results = [];
  for (const defender of dueDefenders) {
    const t = await sequelize.transaction();
    try {
      const fresh = await Booking.findByPk(defender.id, {
        transaction: t,
        lock: t.LOCK.UPDATE
      });
      if (!fresh || fresh.contentionRole !== 'defender' || fresh.status !== 'penciled') {
        await t.commit();
        continue;
      }

      if (fresh.bookingType === 'firm') {
        await clearContentionState(fresh, { transaction: t });
        await t.commit();
        continue;
      }

      const result = await applyDefenderLoses(
        fresh.id,
        {
          terminalStatus: 'displaced',
          remark: 'Displaced: lost contention — did not convert to firm in time'
        },
        { transaction: t, Booking }
      );

      await t.commit();
      results.push({ bookingId: defender.id, outcome: 'defender_lost_deadline', ...result });
    } catch (e) {
      await t.rollback();
      results.push({ bookingId: defender.id, error: e.message });
    }
  }
  return results;
}

/**
 * Cron: Resolve expired challenger pencils.
 */
async function resolveExpiredChallengers(
  now = new Date(),
  { sequelize, Booking }
) {
  const expiredChallengers = await Booking.findAll({
    where: {
      contentionRole: 'challenger',
      bookingType: 'pencil',
      status: 'penciled',
      expiryAt: { [Op.lte]: now }
    }
  });

  const results = [];
  for (const challenger of expiredChallengers) {
    const t = await sequelize.transaction();
    try {
      const fresh = await Booking.findByPk(challenger.id, {
        transaction: t,
        lock: t.LOCK.UPDATE
      });
      if (!fresh || fresh.contentionRole !== 'challenger' || fresh.status !== 'penciled') {
        await t.commit();
        continue;
      }

      await applyChallengerLoses(fresh.id, { transaction: t, Booking });

      fresh.status = 'expired';
      fresh.staffRemark = 'Expired: pencil lifetime ended during contention';
      await fresh.save({ transaction: t });

      await t.commit();
      results.push({ bookingId: challenger.id, outcome: 'challenger_expired' });
    } catch (e) {
      await t.rollback();
      results.push({ bookingId: challenger.id, error: e.message });
    }
  }
  return results;
}

/**
 * Cron: Resolve expired defender pencils.
 */
async function resolveExpiredDefenders(
  now = new Date(),
  { sequelize, Booking }
) {
  const expiredDefenders = await Booking.findAll({
    where: {
      contentionRole: 'defender',
      bookingType: 'pencil',
      status: 'penciled',
      expiryAt: { [Op.lte]: now }
    }
  });

  const results = [];
  for (const defender of expiredDefenders) {
    const t = await sequelize.transaction();
    try {
      const fresh = await Booking.findByPk(defender.id, {
        transaction: t,
        lock: t.LOCK.UPDATE
      });
      if (!fresh || fresh.contentionRole !== 'defender' || fresh.status !== 'penciled') {
        await t.commit();
        continue;
      }

      const result = await applyDefenderLoses(
        fresh.id,
        {
          terminalStatus: 'expired',
          remark: 'Expired: pencil lifetime ended during contention'
        },
        { transaction: t, Booking }
      );

      await t.commit();
      results.push({ bookingId: defender.id, outcome: 'defender_expired', ...result });
    } catch (e) {
      await t.rollback();
      results.push({ bookingId: defender.id, error: e.message });
    }
  }
  return results;
}

/**
 * Get contention details for a booking (for API responses).
 */
async function getContentionDetails(booking, { Booking, User }) {
  if (!booking.contentionRole || !booking.contentionGroupId) {
    return null;
  }

  const groupMembers = await Booking.findAll({
    where: {
      contentionGroupId: booking.contentionGroupId,
      status: 'penciled'
    },
    include: [{ model: User, as: 'user', attributes: ['id', 'email'] }],
    order: [
      [Booking.sequelize.literal(`CASE "contentionRole" 
        WHEN 'defender' THEN 0 
        WHEN 'challenger' THEN 1 
        WHEN 'queued' THEN 2 
        ELSE 3 END`), 'ASC'],
      ['queuePosition', 'ASC']
    ]
  });

  const defender = groupMembers.find(m => m.contentionRole === 'defender');
  const challenger = groupMembers.find(m => m.contentionRole === 'challenger');
  const queue = groupMembers.filter(m => m.contentionRole === 'queued');

  return {
    groupId: booking.contentionGroupId,
    role: booking.contentionRole,
    deadlineAt: defender?.contentionDeadlineAt || null,
    defender: defender ? {
      bookingId: defender.id,
      startTime: defender.startTime,
      endTime: defender.endTime,
      user: defender.user ? { id: defender.user.id, email: defender.user.email } : null
    } : null,
    challenger: challenger ? {
      bookingId: challenger.id,
      startTime: challenger.startTime,
      endTime: challenger.endTime,
      user: challenger.user ? { id: challenger.user.id, email: challenger.user.email } : null
    } : null,
    queue: queue.map((q, idx) => ({
      position: q.queuePosition || idx + 1,
      bookingId: q.id,
      startTime: q.startTime,
      endTime: q.endTime,
      user: q.user ? { id: q.user.id, email: q.user.email } : null
    })),
    queueLength: queue.length
  };
}

/**
 * Check if a booking can convert to firm.
 * Only defenders (or free pencils) can convert; challengers and queued cannot.
 */
function canConvertToFirm(booking) {
  if (booking.bookingType !== 'pencil' || booking.status !== 'penciled') {
    return false;
  }
  return booking.contentionRole === null || booking.contentionRole === 'defender';
}

module.exports = {
  intervalsOverlap,
  pickDefenderBooking,
  startContention,
  joinContentionGroup,
  findOverlappingContentionGroup,
  tryAttachPencilToContention,
  clearContentionState,
  applyDefenderLoses,
  applyChallengerLoses,
  promoteQueueAndRebuild,
  onDefenderConvertedToFirm,
  onFirmBookingApproved,
  onFirmDeniedOrCancelled,
  onFrozenChallengerCancelled,
  onBookingCancelledMidContention,
  resolveDueContentionDeadlines,
  resolveExpiredChallengers,
  resolveExpiredDefenders,
  getContentionDetails,
  canConvertToFirm,
  computePencilExpiryAt
};
