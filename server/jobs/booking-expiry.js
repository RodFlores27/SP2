const cron = require('node-cron');
const { Op } = require('sequelize');
const {
  Booking,
  User,
  Equipment,
  Room,
  sequelize
} = require('../models');
const {
  notifyBookingExpired,
  notifyBookingExpiringSoon,
  notifyBookingOnHold,
  notifyBookingDisplaced,
  notifyContentionResolved
} = require('../utils/booking-notifications');
const {
  BOOKING_EVENT_TYPES,
  deriveRequestType,
  isKafkaEnabled,
  publishBookingLifecycleEvent,
} = require('../utils/kafka');
const { LOCK_HOURS, isWithinLockHours } = require('../utils/booking-rules');
const contention = require('../services/contention.service');

const MS_HOUR = 60 * 60 * 1000;
const DEFAULT_EXPIRY_CRON_MINUTES = 5;
const DEFAULT_WARNING_CRON_MINUTES = 15;

function getCronMinutes(envName, fallback) {
  const raw = process.env[envName];
  if (!raw) return fallback;

  const minutes = Number.parseInt(raw, 10);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 59) {
    console.warn(
      `[cron] Invalid ${envName}="${raw}". Falling back to ${fallback} minute(s).`
    );
    return fallback;
  }

  return minutes;
}

const expiryCronMinutes = getCronMinutes('BOOKING_EXPIRY_CRON_MINUTES', DEFAULT_EXPIRY_CRON_MINUTES);
const expiryCronExpression = `*/${expiryCronMinutes} * * * *`;
const warningCronMinutes = getCronMinutes('BOOKING_WARNING_CRON_MINUTES', DEFAULT_WARNING_CRON_MINUTES);
const warningCronExpression = `*/${warningCronMinutes} * * * *`;

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

async function emitTransitionNotifications({ bookingIds, eventType, payload = {}, directNotifier }) {
  const bookings = await loadBookingsForNotification(bookingIds);
  for (const booking of bookings) {
    const resourceName = await resolveResourceName(booking.resourceType, booking.resourceId);
    publishBookingLifecycleEvent(eventType, booking, { resourceName, payload });
    if (!isKafkaEnabled() && typeof directNotifier === 'function') {
      directNotifier(booking, resourceName).catch(() => {});
    }
  }
}

async function emitContentionResolvedNotifications(notifications) {
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

    const resourceName = await resolveResourceName(anchorBooking.resourceType, anchorBooking.resourceId);
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
      resourceName,
      payload,
    });
  }

  if (!isKafkaEnabled()) {
    for (const notification of entries) {
      const recipientBooking = bookingMap.get(notification.recipientBookingId);
      if (!recipientBooking) continue;
      const resourceName = await resolveResourceName(recipientBooking.resourceType, recipientBooking.resourceId);
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

async function claimWarning(bookingId, { hoursLeft, now, transaction }) {
  const booking = await Booking.findByPk(bookingId, {
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  if (!booking || booking.bookingType !== 'pencil' || booking.status !== 'penciled') return null;

  const expiryAtMs = new Date(booking.expiryAt).getTime();
  const nowMs = now.getTime();
  if (!Number.isFinite(expiryAtMs) || expiryAtMs <= nowMs) return null;

  if (hoursLeft === 48) {
    const threshold48Ms = nowMs + 48 * MS_HOUR;
    const threshold24Ms = nowMs + 24 * MS_HOUR;
    if (expiryAtMs > threshold48Ms || expiryAtMs <= threshold24Ms) return null;
    if (booking.warning48SentAt) return null;
    booking.warning48SentAt = now;
  } else {
    const threshold24Ms = nowMs + 24 * MS_HOUR;
    if (expiryAtMs > threshold24Ms) return null;
    if (booking.warning24SentAt) return null;
    booking.warning24SentAt = now;
  }

  await booking.save({ transaction });
  return booking.id;
}

async function processDueWarnings(hoursLeft, now = new Date()) {
  const warningField = hoursLeft === 24 ? 'warning24SentAt' : 'warning48SentAt';
  const upperBound = new Date(now.getTime() + hoursLeft * MS_HOUR);
  const lowerBound = hoursLeft === 48 ? new Date(now.getTime() + 24 * MS_HOUR) : now;

  const due = await Booking.findAll({
    where: {
      bookingType: 'pencil',
      status: 'penciled',
      [warningField]: null,
      expiryAt: {
        [Op.gt]: lowerBound,
        [Op.lte]: upperBound
      }
    },
    attributes: ['id']
  });

  const processed = [];
  for (const row of due) {
    const claimedId = await sequelize.transaction(async (t) => {
      return claimWarning(row.id, { hoursLeft, now, transaction: t });
    });
    if (!claimedId) continue;

    const booking = await Booking.findByPk(claimedId, {
      include: [{ model: User, as: 'user', attributes: ['id', 'email'] }]
    });
    if (!booking) continue;

    const resourceName = await resolveResourceName(booking.resourceType, booking.resourceId);
    if (isKafkaEnabled()) {
      await publishBookingLifecycleEvent(BOOKING_EVENT_TYPES.EXPIRING_SOON, booking, {
        resourceName,
        payload: {
          source: 'cron:warn',
          hoursLeft,
        },
      });
    } else {
      await notifyBookingExpiringSoon(booking, resourceName, hoursLeft).catch(() => {});
    }

    processed.push(claimedId);
  }

  return processed;
}

/**
 * Expire + contention resolution — default every 5 minutes, env-configurable.
 */
cron.schedule(expiryCronExpression, async () => {
  try {
    const now = new Date();

    const defenderDeadlineResults = await contention.resolveDueContentionDeadlines(now, {
      sequelize,
      Booking
    });
    if (defenderDeadlineResults.length > 0) {
      console.log(`[cron:expire] Processed ${defenderDeadlineResults.length} defender deadline(s)`);
    }
    await emitContentionResolvedNotifications(
      defenderDeadlineResults.flatMap((result) => result?.notifications || [])
    );

    const challengerExpiryResults = await contention.resolveExpiredChallengers(now, {
      sequelize,
      Booking
    });
    if (challengerExpiryResults.length > 0) {
      console.log(`[cron:expire] Processed ${challengerExpiryResults.length} expired challenger(s)`);
    }
    await emitContentionResolvedNotifications(
      challengerExpiryResults.flatMap((result) => result?.notifications || [])
    );

    const defenderExpiryResults = await contention.resolveExpiredDefenders(now, {
      sequelize,
      Booking
    });
    if (defenderExpiryResults.length > 0) {
      console.log(`[cron:expire] Processed ${defenderExpiryResults.length} expired defender(s)`);
    }
    await emitContentionResolvedNotifications(
      defenderExpiryResults.flatMap((result) => result?.notifications || [])
    );

    const [completedFirms] = await Booking.update(
      { status: 'completed' },
      {
        where: {
          bookingType: 'firm',
          status: 'approved',
          endTime: { [Op.lte]: now }
        }
      }
    );
    if (completedFirms > 0) {
      console.log(`[cron:expire] Marked ${completedFirms} approved firm booking(s) as completed (past endTime)`);
    }

    const firmApprovalLockHorizon = new Date(now.getTime() + LOCK_HOURS * MS_HOUR);
    const firmPendingPastApprovalDeadline = await Booking.findAll({
      where: {
        bookingType: 'firm',
        status: 'pending_approval',
        startTime: { [Op.lte]: firmApprovalLockHorizon }
      },
      include: [{ model: User, as: 'user', attributes: ['id', 'email'] }]
    });

    if (firmPendingPastApprovalDeadline.length > 0) {
      console.log(
        `[cron:expire] Expiring ${firmPendingPastApprovalDeadline.length} firm pending_approval booking(s) (not approved before 24h pre-start deadline)`
      );
    }

    for (const booking of firmPendingPastApprovalDeadline) {
      await sequelize.transaction(async (t) => {
        const b = await Booking.findByPk(booking.id, {
          transaction: t,
          lock: t.LOCK.UPDATE
        });
        if (!b || b.bookingType !== 'firm' || b.status !== 'pending_approval') return;
        if (!isWithinLockHours(b.startTime, now)) return;

        if (b.contentionRole === 'defender') {
          await contention.onFirmDeniedOrCancelled(b, { transaction: t, Booking });
        }

        b.status = 'expired';
        b.staffRemark =
          b.staffRemark ||
          'Expired: firm request was not approved at least 24 hours before the scheduled start';
        await b.save({ transaction: t });
      });

      const forNotify = await Booking.findByPk(booking.id, {
        include: [{ model: User, as: 'user', attributes: ['id', 'email'] }]
      });
      if (forNotify?.status === 'expired') {
        const resourceName = await resolveResourceName(forNotify.resourceType, forNotify.resourceId);
        publishBookingLifecycleEvent(BOOKING_EVENT_TYPES.EXPIRED, forNotify, {
          resourceName,
          payload: {
            source: 'cron:expire',
            reason: 'firm_pending_approval_lock_window',
          },
        });
        if (!isKafkaEnabled()) {
          notifyBookingExpired(forNotify, resourceName).catch(() => {});
        }
      }
    }

    const expired = await Booking.findAll({
      where: {
        bookingType: 'pencil',
        status: 'penciled',
        contentionRole: null,
        expiryAt: { [Op.lte]: now }
      },
      include: [{ model: User, as: 'user', attributes: ['id', 'email'] }]
    });

    if (expired.length === 0) return;

    console.log(`[cron:expire] Expiring ${expired.length} free pencil booking(s)`);

    for (const booking of expired) {
      await sequelize.transaction(async (t) => {
        const b = await Booking.findByPk(booking.id, {
          transaction: t,
          lock: t.LOCK.UPDATE
        });
        if (!b || b.status !== 'penciled' || b.contentionRole != null) return;

        b.status = 'expired';
        b.staffRemark = b.staffRemark || 'Expired: pencil booking lifetime ended';
        await b.save({ transaction: t });
      });

      const resourceName = await resolveResourceName(booking.resourceType, booking.resourceId);
      publishBookingLifecycleEvent(BOOKING_EVENT_TYPES.EXPIRED, booking, {
        resourceName,
        payload: {
          source: 'cron:expire',
          reason: 'pencil_lifetime_ended',
        },
      });
      if (!isKafkaEnabled()) {
        notifyBookingExpired(booking, resourceName).catch(() => {});
      }
    }
  } catch (err) {
    console.error('[cron:expire] Error during expiry job:', err.message);
  }
});

/**
 * Warning job — default every 15 minutes, env-configurable.
 */
cron.schedule(warningCronExpression, async () => {
  try {
    const now = new Date();
    const [processed48, processed24] = await Promise.all([
      processDueWarnings(48, now),
      processDueWarnings(24, now)
    ]);

    if (processed48.length > 0 || processed24.length > 0) {
      console.log(
        `[cron:warn] 48hr warnings: ${processed48.length}, 24hr warnings: ${processed24.length}`
      );
    }
  } catch (err) {
    console.error('[cron:warn] Error during warning job:', err.message);
  }
});

console.log(
  `[cron] Booking expiry + contention jobs scheduled (expire every ${expiryCronMinutes} minute(s), warn every ${warningCronMinutes} minute(s))`
);
