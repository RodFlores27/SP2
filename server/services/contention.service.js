'use strict';

const { Op } = require('sequelize');
const {
  computeContentionDeadline,
  assertPositiveContentionDeadline,
  computePencilExpiryAt
} = require('../utils/booking-rules');

function intervalsOverlap(aStart, aEnd, bStart, bEnd) {
  return new Date(aStart) < new Date(bEnd) && new Date(aEnd) > new Date(bStart);
}

function pickDefenderBooking(overlapPencils) {
  if (!overlapPencils.length) return null;
  const nonQueued = overlapPencils.filter((b) => b.status !== 'queued');
  const pool = nonQueued.length ? nonQueued : overlapPencils;
  return [...pool].sort(
    (a, b) =>
      new Date(a.createdAt) - new Date(b.createdAt) ||
      a.id - b.id
  )[0];
}

async function findOpenEpisodeOverlappingSlot(
  { resourceType, resourceId, startTime, endTime },
  { transaction, ContentionEpisode, Booking }
) {
  const episodes = await ContentionEpisode.findAll({
    where: { resourceType, resourceId, status: 'open' },
    include: [
      { model: Booking, as: 'defenderBooking', required: true },
      { model: Booking, as: 'challengerBooking', required: true }
    ],
    transaction
  });

  const s = new Date(startTime);
  const e = new Date(endTime);

  for (const ep of episodes) {
    const d = ep.defenderBooking;
    const c = ep.challengerBooking;
    const od = intervalsOverlap(d.startTime, d.endTime, s, e);
    const oc = intervalsOverlap(c.startTime, c.endTime, s, e);
    if (od || oc) return ep;
  }
  return null;
}

async function nextQueuePosition(episodeId, { transaction, ContentionQueueItem }) {
  const max = await ContentionQueueItem.max('position', {
    where: { episodeId },
    transaction
  });
  return (max || 0) + 1;
}

/**
 * Open a new contention episode: defender -> contested, challenger stays penciled.
 */
async function openEpisode(
  { defenderBooking, challengerBooking, resourceType, resourceId },
  { transaction, ContentionEpisode, Booking }
) {
  const now = new Date();
  const deadlineAt = computeContentionDeadline(
    now,
    defenderBooking.startTime,
    defenderBooking.expiryAt
  );
  assertPositiveContentionDeadline(deadlineAt, now);

  const d = await Booking.findByPk(defenderBooking.id, {
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  const c = await Booking.findByPk(challengerBooking.id, {
    transaction,
    lock: transaction.LOCK.UPDATE
  });

  if (!d || !c) throw new Error('Booking not found for contention');
  if (d.status !== 'penciled') {
    const err = new Error('Defender is not eligible for contention');
    err.code = 'CONTENTION_DEFENDER_INVALID';
    err.statusCode = 409;
    throw err;
  }
  if (c.status !== 'penciled') {
    const err = new Error('Challenger is not eligible for contention');
    err.code = 'CONTENTION_CHALLENGER_INVALID';
    err.statusCode = 409;
    throw err;
  }

  d.status = 'contested';
  await d.save({ transaction });

  const ep = await ContentionEpisode.create(
    {
      resourceType,
      resourceId,
      defenderBookingId: d.id,
      challengerBookingId: c.id,
      deadlineAt,
      status: 'open'
    },
    { transaction }
  );

  return ep;
}

async function enqueueBookingInEpisode(booking, episodeId, { transaction, ContentionQueueItem, Booking }) {
  const b = await Booking.findByPk(booking.id, {
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  if (!b || b.bookingType !== 'pencil') {
    const err = new Error('Invalid booking to queue');
    err.code = 'CONTENTION_QUEUE_INVALID';
    err.statusCode = 400;
    throw err;
  }

  const pos = await nextQueuePosition(episodeId, { transaction, ContentionQueueItem });
  await ContentionQueueItem.create(
    {
      episodeId,
      bookingId: b.id,
      position: pos
    },
    { transaction }
  );

  b.status = 'queued';
  await b.save({ transaction });
  return pos;
}

/**
 * Close episode and delete queue rows; returns ordered list of queued booking IDs.
 */
async function drainEpisodeQueue(episodeId, { transaction, ContentionQueueItem }) {
  const items = await ContentionQueueItem.findAll({
    where: { episodeId },
    order: [['position', 'ASC']],
    transaction
  });
  const ids = items.map((i) => i.bookingId);
  await ContentionQueueItem.destroy({ where: { episodeId }, transaction });
  return ids;
}

async function closeEpisode(episode, { transaction }) {
  episode.status = 'closed';
  await episode.save({ transaction });
}

/**
 * Challenger wins: defender expired/cancelled path; optional reason for defender terminal state.
 */
async function applyChallengerWins(
  episode,
  { defenderTerminalStatus, defenderRemark },
  { transaction, Booking, ContentionEpisode, ContentionQueueItem }
) {
  if (episode.status !== 'open') return { winnerId: null, queueIds: [] };

  const queueIds = await drainEpisodeQueue(episode.id, { transaction, ContentionQueueItem });
  await closeEpisode(episode, { transaction });

  const defender = await Booking.findByPk(episode.defenderBookingId, {
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  const challenger = await Booking.findByPk(episode.challengerBookingId, {
    transaction,
    lock: transaction.LOCK.UPDATE
  });

  if (!defender || !challenger) {
    return { winnerId: null, queueIds };
  }

  if (['penciled', 'contested'].includes(defender.status)) {
    defender.status = defenderTerminalStatus;
    if (defenderRemark) defender.staffRemark = defenderRemark;
    await defender.save({ transaction });
  }

  if (!['cancelled', 'expired', 'displaced'].includes(challenger.status)) {
    challenger.status = 'penciled';
    await challenger.save({ transaction });
  }

  return { winnerId: challenger.id, queueIds };
}

async function openEpisodeOrEnqueueFromWinner(
  winnerId,
  queueIds,
  { transaction, Booking, ContentionEpisode, ContentionQueueItem }
) {
  const winner = await Booking.findByPk(winnerId, {
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  if (!winner || winner.status !== 'penciled') return;

  // No waitlist: winner may still overlap other pencils that were never on this episode
  // (e.g. morning pencil vs afternoon defender — wide challenger spans both).
  if (!queueIds.length) {
    await tryAttachPencilToContention(winner, {
      transaction,
      Booking,
      ContentionEpisode,
      ContentionQueueItem
    });
    return;
  }

  const [nextId, ...rest] = queueIds;
  const next = await Booking.findByPk(nextId, {
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  if (!next || next.status !== 'queued') {
    const remaining = next ? [nextId, ...rest] : rest;
    await openEpisodeOrEnqueueFromWinner(winnerId, remaining, {
      transaction,
      Booking,
      ContentionEpisode,
      ContentionQueueItem
    });
    return;
  }

  if (!intervalsOverlap(winner.startTime, winner.endTime, next.startTime, next.endTime)) {
    next.status = 'penciled';
    await next.save({ transaction });
    await tryAttachPencilToContention(next, {
      transaction,
      Booking,
      ContentionEpisode,
      ContentionQueueItem
    });
    await openEpisodeOrEnqueueFromWinner(winnerId, rest, {
      transaction,
      Booking,
      ContentionEpisode,
      ContentionQueueItem
    });
    return;
  }

  // Waitlist rows stay `queued` until paired; openEpisode requires challenger `penciled`.
  next.status = 'penciled';
  await next.save({ transaction });

  const ep = await openEpisode(
    {
      defenderBooking: winner,
      challengerBooking: next,
      resourceType: winner.resourceType,
      resourceId: winner.resourceId
    },
    { transaction, ContentionEpisode, Booking }
  );

  for (const rid of rest) {
    const rb = await Booking.findByPk(rid, { transaction, lock: transaction.LOCK.UPDATE });
    if (rb && rb.status === 'queued') {
      await enqueueBookingInEpisode(rb, ep.id, { transaction, ContentionQueueItem, Booking });
    }
  }

  await attachUnqueuedPencilOverlapsToEpisode(ep, next.id, {
    transaction,
    Booking,
    ContentionEpisode,
    ContentionQueueItem
  });
}

/**
 * Run after challenger wins (timer or expiry): promote queue into new episodes.
 */
async function promoteQueueAfterChallengerWin(result, { transaction, Booking, ContentionEpisode, ContentionQueueItem }) {
  if (!result.winnerId) return;
  await openEpisodeOrEnqueueFromWinner(
    result.winnerId,
    [...(result.queueIds || [])],
    {
      transaction,
      Booking,
      ContentionEpisode,
      ContentionQueueItem
    }
  );
}

/**
 * Defender converts to firm (booking row becomes firm pending_approval in same txn by caller).
 * Displaces challenger and overlapping queue pencils (same semantics as firm-over-pencil);
 * non-overlapping queue released to penciled + optional new contention.
 */
async function onDefenderConvertedToFirm(
  firmBooking,
  episodeId,
  { transaction, Booking, ContentionEpisode, ContentionQueueItem }
) {
  const episode = await ContentionEpisode.findByPk(episodeId, {
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  if (!episode || episode.status !== 'open') return;

  const challenger = await Booking.findByPk(episode.challengerBookingId, {
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  const queueIds = await drainEpisodeQueue(episode.id, { transaction, ContentionQueueItem });
  await closeEpisode(episode, { transaction });

  if (challenger && ['penciled', 'contested', 'queued'].includes(challenger.status)) {
    challenger.status = 'displaced';
    challenger.displacedByBookingId = firmBooking.id;
    challenger.staffRemark = null;
    await challenger.save({ transaction });
  }

  const fStart = firmBooking.startTime;
  const fEnd = firmBooking.endTime;

  for (const qid of queueIds) {
    const qb = await Booking.findByPk(qid, { transaction, lock: transaction.LOCK.UPDATE });
    if (!qb || qb.status !== 'queued') continue;

    if (intervalsOverlap(qb.startTime, qb.endTime, fStart, fEnd)) {
      qb.status = 'displaced';
      qb.displacedByBookingId = firmBooking.id;
      qb.staffRemark = null;
      await qb.save({ transaction });
    } else {
      qb.status = 'penciled';
      await qb.save({ transaction });
      await tryAttachPencilToContention(qb, { transaction, Booking, ContentionEpisode, ContentionQueueItem });
    }
  }
}

/**
 * If a pencil overlaps other active pencils, join or open contention (no-op if alone).
 */
async function tryAttachPencilToContention(
  pencilBooking,
  { transaction, Booking, ContentionEpisode, ContentionQueueItem }
) {
  const others = await Booking.findActivePencilOverlaps(
    pencilBooking.resourceType,
    pencilBooking.resourceId,
    pencilBooking.startTime,
    pencilBooking.endTime,
    pencilBooking.id,
    transaction ? { transaction } : {}
  );

  const foreignPencils = others.filter((o) => o.userId !== pencilBooking.userId);
  if (foreignPencils.length === 0) return;

  const openEp = await findOpenEpisodeOverlappingSlot(
    {
      resourceType: pencilBooking.resourceType,
      resourceId: pencilBooking.resourceId,
      startTime: pencilBooking.startTime,
      endTime: pencilBooking.endTime
    },
    { transaction, ContentionEpisode, Booking }
  );

  if (openEp) {
    await enqueueBookingInEpisode(pencilBooking, openEp.id, {
      transaction,
      ContentionQueueItem,
      Booking
    });
    return;
  }

  const defender = pickDefenderBooking(foreignPencils);
  if (!defender || defender.id === pencilBooking.id) return;

  await openEpisode(
    {
      defenderBooking: defender,
      challengerBooking: pencilBooking,
      resourceType: pencilBooking.resourceType,
      resourceId: pencilBooking.resourceId
    },
    { transaction, ContentionEpisode, Booking }
  );
}

/**
 * Pencils that overlapped only the (previous) challenger — not the old defender — never got a
 * ContentionQueueItem. After promotion opens a new episode, attach those stragglers via the same
 * path as fresh overlaps (enqueue on this episode or open another).
 */
async function attachUnqueuedPencilOverlapsToEpisode(
  episode,
  challengerBookingId,
  { transaction, Booking, ContentionEpisode, ContentionQueueItem }
) {
  const defender = await Booking.findByPk(episode.defenderBookingId, {
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  const challenger = await Booking.findByPk(challengerBookingId, {
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  if (!defender || !challenger) return;

  const candidateIds = new Set();
  for (const anchor of [defender, challenger]) {
    const rows = await Booking.findActivePencilOverlaps(
      anchor.resourceType,
      anchor.resourceId,
      anchor.startTime,
      anchor.endTime,
      anchor.id,
      { transaction }
    );
    for (const r of rows) {
      if (r.id === defender.id || r.id === challenger.id) continue;
      candidateIds.add(r.id);
    }
  }

  for (const pid of candidateIds) {
    const b = await Booking.findByPk(pid, { transaction, lock: transaction.LOCK.UPDATE });
    if (!b || b.bookingType !== 'pencil' || b.status !== 'penciled') continue;
    await tryAttachPencilToContention(b, {
      transaction,
      Booking,
      ContentionEpisode,
      ContentionQueueItem
    });
  }
}

/**
 * Defender cancelled mid-episode: only pencils overlapping the former challenger's slot stay in
 * this line; other queue rows are released (penciled + tryAttach).
 *
 * Pairing: if several foreign pencils overlap the anchor, the earliest foreign slot is the new
 * defender and the anchor (wide ongoing challenge) stays challenger — never pair two foreigners
 * that do not overlap each other. If only one foreign pencil overlaps the anchor, defender vs
 * challenger is decided by createdAt (earlier = contested). Remaining foreigners join the waitlist
 * only when they overlap the new defender's window; otherwise they stay penciled.
 */
async function reopenContentionAfterDefenderCancelled(
  formerChallenger,
  queueIds,
  { transaction, Booking, ContentionEpisode, ContentionQueueItem }
) {
  if (!formerChallenger || formerChallenger.bookingType !== 'pencil') return;

  if (formerChallenger.status !== 'penciled') {
    formerChallenger.status = 'penciled';
    await formerChallenger.save({ transaction });
  }

  const anchor = await Booking.findByPk(formerChallenger.id, {
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  if (!anchor) return;

  const overlapRows = await Booking.findActivePencilOverlaps(
    anchor.resourceType,
    anchor.resourceId,
    anchor.startTime,
    anchor.endTime,
    anchor.id,
    { transaction }
  );
  const overlapIds = new Set(overlapRows.map((o) => o.id));

  for (const qid of queueIds) {
    if (overlapIds.has(qid)) continue;
    const b = await Booking.findByPk(qid, { transaction, lock: transaction.LOCK.UPDATE });
    if (!b || b.bookingType !== 'pencil') continue;
    if (b.status === 'queued') {
      b.status = 'penciled';
      await b.save({ transaction });
    }
    if (b.status === 'penciled') {
      await tryAttachPencilToContention(b, {
        transaction,
        Booking,
        ContentionEpisode,
        ContentionQueueItem
      });
    }
  }

  const foreignSorted = [];
  for (const o of overlapRows) {
    const b = await Booking.findByPk(o.id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!b || b.bookingType !== 'pencil') continue;
    if (!['penciled', 'queued'].includes(b.status)) continue;
    foreignSorted.push(b);
  }
  foreignSorted.sort(
    (a, b) => new Date(a.createdAt) - new Date(b.createdAt) || a.id - b.id
  );

  if (foreignSorted.length === 0) {
    await tryAttachPencilToContention(anchor, {
      transaction,
      Booking,
      ContentionEpisode,
      ContentionQueueItem
    });
    return;
  }

  let defender;
  let newChallenger;

  if (foreignSorted.length === 1) {
    const other = foreignSorted[0];
    const anchorEarlier =
      new Date(anchor.createdAt) < new Date(other.createdAt) ||
      (new Date(anchor.createdAt).getTime() === new Date(other.createdAt).getTime() &&
        anchor.id < other.id);
    if (anchorEarlier) {
      defender = anchor;
      newChallenger = other;
    } else {
      defender = other;
      newChallenger = anchor;
    }
  } else {
    defender = foreignSorted[0];
    newChallenger = anchor;
  }

  defender = await Booking.findByPk(defender.id, { transaction, lock: transaction.LOCK.UPDATE });
  newChallenger = await Booking.findByPk(newChallenger.id, {
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  if (!defender || !newChallenger || defender.id === newChallenger.id) return;

  for (const r of [defender, newChallenger]) {
    if (r.status === 'queued') {
      r.status = 'penciled';
      await r.save({ transaction });
    }
  }
  if (defender.status !== 'penciled' || newChallenger.status !== 'penciled') return;

  const ep = await openEpisode(
    {
      defenderBooking: defender,
      challengerBooking: newChallenger,
      resourceType: defender.resourceType,
      resourceId: defender.resourceId
    },
    { transaction, ContentionEpisode, Booking }
  );

  if (foreignSorted.length >= 2) {
    for (const b of foreignSorted.slice(1)) {
      if (b.id === newChallenger.id) continue;
      const rb = await Booking.findByPk(b.id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!rb || rb.bookingType !== 'pencil') continue;
      if (
        intervalsOverlap(rb.startTime, rb.endTime, defender.startTime, defender.endTime)
      ) {
        if (rb.status === 'queued' || rb.status === 'penciled') {
          await enqueueBookingInEpisode(rb, ep.id, { transaction, ContentionQueueItem, Booking });
        }
      } else if (rb.status === 'queued') {
        rb.status = 'penciled';
        await rb.save({ transaction });
      }
    }
  }
}

async function findOpenEpisodeForDefender(defenderId, { transaction, ContentionEpisode }) {
  return ContentionEpisode.findOne({
    where: { defenderBookingId: defenderId, status: 'open' },
    transaction
  });
}

async function findOpenEpisodeForChallenger(challengerId, { transaction, ContentionEpisode }) {
  return ContentionEpisode.findOne({
    where: { challengerBookingId: challengerId, status: 'open' },
    transaction
  });
}

/**
 * Cron/job: episodes past deadline (challenger wins).
 */
async function resolveDueContentionEpisodes(
  now = new Date(),
  { sequelize, Booking, ContentionEpisode, ContentionQueueItem }
) {
  const due = await ContentionEpisode.findAll({
    where: {
      status: 'open',
      deadlineAt: { [Op.lte]: now }
    },
    include: [
      { model: Booking, as: 'defenderBooking', required: true },
      { model: Booking, as: 'challengerBooking', required: true }
    ]
  });

  const results = [];
  for (const ep of due) {
    const t = await sequelize.transaction();
    try {
      const fresh = await ContentionEpisode.findByPk(ep.id, {
        transaction: t,
        lock: t.LOCK.UPDATE
      });
      if (!fresh || fresh.status !== 'open') {
        await t.commit();
        continue;
      }

      const defender = await Booking.findByPk(fresh.defenderBookingId, { transaction: t });
      if (defender.bookingType === 'firm') {
        await closeEpisode(fresh, { transaction: t });
        await t.commit();
        continue;
      }

      const r = await applyChallengerWins(
        fresh,
        {
          defenderTerminalStatus: 'expired',
          defenderRemark: 'Expired: lost contention — did not convert to firm in time'
        },
        { transaction: t, Booking, ContentionEpisode, ContentionQueueItem }
      );
      await promoteQueueAfterChallengerWin(r, {
        transaction: t,
        Booking,
        ContentionEpisode,
        ContentionQueueItem
      });
      await t.commit();
      results.push({ episodeId: ep.id, outcome: 'challenger_won', ...r });
    } catch (e) {
      await t.rollback();
      results.push({ episodeId: ep.id, error: e.message });
    }
  }
  return results;
}

/**
 * C8: defender pencil expiry during open episode — challenger wins immediately.
 */
/**
 * Challenger's pencil expired before contention resolved — defender keeps the slot.
 */
async function resolveChallengerExpiredDuringContention(
  now = new Date(),
  { sequelize, Booking, ContentionEpisode, ContentionQueueItem }
) {
  const open = await ContentionEpisode.findAll({
    where: { status: 'open' },
    include: [{ model: Booking, as: 'challengerBooking', required: true }]
  });

  const results = [];
  for (const ep of open) {
    const ch = ep.challengerBooking;
    if (ch.bookingType !== 'pencil') continue;
    if (!ch.expiryAt || new Date(ch.expiryAt) > now) continue;

    const t = await sequelize.transaction();
    try {
      const fresh = await ContentionEpisode.findByPk(ep.id, {
        transaction: t,
        lock: t.LOCK.UPDATE
      });
      if (!fresh || fresh.status !== 'open') {
        await t.commit();
        continue;
      }

      const queueIds = await drainEpisodeQueue(fresh.id, { transaction: t, ContentionQueueItem });
      await closeEpisode(fresh, { transaction: t });

      const challenger = await Booking.findByPk(fresh.challengerBookingId, {
        transaction: t,
        lock: t.LOCK.UPDATE
      });
      const defender = await Booking.findByPk(fresh.defenderBookingId, {
        transaction: t,
        lock: t.LOCK.UPDATE
      });

      if (challenger && ['penciled', 'contested', 'queued'].includes(challenger.status)) {
        challenger.status = 'expired';
        challenger.staffRemark = 'Expired: pencil lifetime ended during contention';
        await challenger.save({ transaction: t });
      }

      if (defender && defender.status === 'contested') {
        defender.status = 'penciled';
        await defender.save({ transaction: t });
      }

      if (defender) {
        await openEpisodeOrEnqueueFromWinner(defender.id, queueIds, {
          transaction: t,
          Booking,
          ContentionEpisode,
          ContentionQueueItem
        });
      }

      await t.commit();
      results.push({ episodeId: ep.id, outcome: 'challenger_expired' });
    } catch (e) {
      await t.rollback();
      results.push({ episodeId: ep.id, error: e.message });
    }
  }
  return results;
}

async function resolveDefenderExpiredDuringContention(
  now = new Date(),
  { sequelize, Booking, ContentionEpisode, ContentionQueueItem }
) {
  const open = await ContentionEpisode.findAll({
    where: { status: 'open' },
    include: [{ model: Booking, as: 'defenderBooking', required: true }]
  });

  const results = [];
  for (const ep of open) {
    const d = ep.defenderBooking;
    if (d.bookingType !== 'pencil') continue;
    if (!d.expiryAt || new Date(d.expiryAt) > now) continue;
    if (!['contested', 'penciled'].includes(d.status)) continue;

    const t = await sequelize.transaction();
    try {
      const fresh = await ContentionEpisode.findByPk(ep.id, {
        transaction: t,
        lock: t.LOCK.UPDATE
      });
      if (!fresh || fresh.status !== 'open') {
        await t.commit();
        continue;
      }

      const r = await applyChallengerWins(
        fresh,
        {
          defenderTerminalStatus: 'expired',
          defenderRemark: 'Expired: pencil lifetime ended during contention'
        },
        { transaction: t, Booking, ContentionEpisode, ContentionQueueItem }
      );
      await promoteQueueAfterChallengerWin(r, {
        transaction: t,
        Booking,
        ContentionEpisode,
        ContentionQueueItem
      });
      await t.commit();
      results.push({ episodeId: ep.id, outcome: 'defender_expired', ...r });
    } catch (e) {
      await t.rollback();
      results.push({ episodeId: ep.id, error: e.message });
    }
  }
  return results;
}

/**
 * After a firm booking is approved: displace overlapping pencils and clean up open episodes.
 */
async function onFirmBookingApproved(
  firmBooking,
  { transaction, Booking, ContentionEpisode, ContentionQueueItem }
) {
  const pencils = await Booking.findActivePencilOverlaps(
    firmBooking.resourceType,
    firmBooking.resourceId,
    firmBooking.startTime,
    firmBooking.endTime,
    firmBooking.id,
    { transaction }
  );

  for (const p of pencils) {
    const row = await Booking.findByPk(p.id, {
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!row || row.status === 'displaced') continue;
    row.status = 'displaced';
    row.displacedByBookingId = firmBooking.id;
    await row.save({ transaction });
  }

  const episodes = await ContentionEpisode.findAll({
    where: {
      status: 'open',
      resourceType: firmBooking.resourceType,
      resourceId: firmBooking.resourceId
    },
    transaction
  });

  for (const ep of episodes) {
    const def = await Booking.findByPk(ep.defenderBookingId, { transaction });
    const ch = await Booking.findByPk(ep.challengerBookingId, { transaction });
    const touchesFirm =
      (def &&
        intervalsOverlap(def.startTime, def.endTime, firmBooking.startTime, firmBooking.endTime)) ||
      (ch &&
        intervalsOverlap(ch.startTime, ch.endTime, firmBooking.startTime, firmBooking.endTime));
    if (!touchesFirm) continue;

    const queueIds = await drainEpisodeQueue(ep.id, { transaction, ContentionQueueItem });
    await closeEpisode(ep, { transaction });

    for (const qid of queueIds) {
      const qb = await Booking.findByPk(qid, {
        transaction,
        lock: transaction.LOCK.UPDATE
      });
      if (!qb) continue;
      if (intervalsOverlap(qb.startTime, qb.endTime, firmBooking.startTime, firmBooking.endTime)) {
        qb.status = 'displaced';
        qb.displacedByBookingId = firmBooking.id;
        await qb.save({ transaction });
      } else {
        qb.status = 'penciled';
        await qb.save({ transaction });
        await tryAttachPencilToContention(qb, {
          transaction,
          Booking,
          ContentionEpisode,
          ContentionQueueItem
        });
      }
    }
  }
}

async function onBookingCancelledMidContention(
  cancelledBooking,
  { transaction, Booking, ContentionEpisode, ContentionQueueItem }
) {
  const ep =
    (await ContentionEpisode.findOne({
      where: {
        status: 'open',
        [Op.or]: [
          { defenderBookingId: cancelledBooking.id },
          { challengerBookingId: cancelledBooking.id }
        ]
      },
      transaction
    })) || null;

  if (!ep) return;

  const defender = await Booking.findByPk(ep.defenderBookingId, {
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  const challenger = await Booking.findByPk(ep.challengerBookingId, {
    transaction,
    lock: transaction.LOCK.UPDATE
  });

  const queueIds = await drainEpisodeQueue(ep.id, { transaction, ContentionQueueItem });
  await closeEpisode(ep, { transaction });

  // Mark the cancelled row before promoting the queue. Otherwise overlap logic
  // (tryAttachPencilToContention) still sees the old defender as "contested" and
  // may try to open a new episode with that row — openEpisode requires defender penciled.
  cancelledBooking.status = 'cancelled';
  await cancelledBooking.save({ transaction });

  const defCancelled = defender && defender.id === cancelledBooking.id;
  const chCancelled = challenger && challenger.id === cancelledBooking.id;

  if (defCancelled && challenger && ['penciled', 'contested', 'queued'].includes(challenger.status)) {
    challenger.status = 'penciled';
    await challenger.save({ transaction });
    await reopenContentionAfterDefenderCancelled(challenger, queueIds, {
      transaction,
      Booking,
      ContentionEpisode,
      ContentionQueueItem
    });
    return;
  }

  if (chCancelled && defender && ['contested', 'penciled'].includes(defender.status)) {
    defender.status = 'penciled';
    await defender.save({ transaction });
    await openEpisodeOrEnqueueFromWinner(defender.id, queueIds, {
      transaction,
      Booking,
      ContentionEpisode,
      ContentionQueueItem
    });
  }
}

module.exports = {
  onFirmBookingApproved,
  intervalsOverlap,
  pickDefenderBooking,
  findOpenEpisodeOverlappingSlot,
  openEpisode,
  enqueueBookingInEpisode,
  drainEpisodeQueue,
  closeEpisode,
  applyChallengerWins,
  promoteQueueAfterChallengerWin,
  openEpisodeOrEnqueueFromWinner,
  onDefenderConvertedToFirm,
  tryAttachPencilToContention,
  findOpenEpisodeForDefender,
  findOpenEpisodeForChallenger,
  resolveDueContentionEpisodes,
  resolveDefenderExpiredDuringContention,
  resolveChallengerExpiredDuringContention,
  onBookingCancelledMidContention,
  computePencilExpiryAt
};
