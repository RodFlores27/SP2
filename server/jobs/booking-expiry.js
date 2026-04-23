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
  notifyBookingExpiringSoon
} = require('../utils/booking-notifications');
const { LOCK_HOURS, isWithinLockHours } = require('../utils/booking-rules');
const contention = require('../services/contention.service');

const MS_HOUR = 60 * 60 * 1000;

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

/**
 * Expire + contention resolution — runs every 15 minutes.
 */
cron.schedule('*/15 * * * *', async () => {
  try {
    const now = new Date();

    const defenderDeadlineResults = await contention.resolveDueContentionDeadlines(now, {
      sequelize,
      Booking
    });
    if (defenderDeadlineResults.length > 0) {
      console.log(`[cron:expire] Processed ${defenderDeadlineResults.length} defender deadline(s)`);
    }

    const challengerExpiryResults = await contention.resolveExpiredChallengers(now, {
      sequelize,
      Booking
    });
    if (challengerExpiryResults.length > 0) {
      console.log(`[cron:expire] Processed ${challengerExpiryResults.length} expired challenger(s)`);
    }

    const defenderExpiryResults = await contention.resolveExpiredDefenders(now, {
      sequelize,
      Booking
    });
    if (defenderExpiryResults.length > 0) {
      console.log(`[cron:expire] Processed ${defenderExpiryResults.length} expired defender(s)`);
    }

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
        notifyBookingExpired(forNotify, resourceName).catch(() => {});
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
      notifyBookingExpired(booking, resourceName).catch(() => {});
    }
  } catch (err) {
    console.error('[cron:expire] Error during expiry job:', err.message);
  }
});

/**
 * Warning job — runs daily at 08:00 Asia/Manila (UTC+8 = 00:00 UTC).
 */
cron.schedule('0 0 * * *', async () => {
  try {
    const now = new Date();

    const window48Start = new Date(now.getTime() + 47 * 60 * 60 * 1000);
    const window48End = new Date(now.getTime() + 49 * 60 * 60 * 1000);

    const window24Start = new Date(now.getTime() + 23 * 60 * 60 * 1000);
    const window24End = new Date(now.getTime() + 25 * 60 * 60 * 1000);

    const [bookings48, bookings24] = await Promise.all([
      Booking.findAll({
        where: {
          bookingType: 'pencil',
          status: 'penciled',
          expiryAt: { [Op.between]: [window48Start, window48End] }
        },
        include: [{ model: User, as: 'user', attributes: ['id', 'email'] }]
      }),
      Booking.findAll({
        where: {
          bookingType: 'pencil',
          status: 'penciled',
          expiryAt: { [Op.between]: [window24Start, window24End] }
        },
        include: [{ model: User, as: 'user', attributes: ['id', 'email'] }]
      })
    ]);

    console.log(
      `[cron:warn] 48hr warnings: ${bookings48.length}, 24hr warnings: ${bookings24.length}`
    );

    for (const booking of bookings48) {
      const resourceName = await resolveResourceName(booking.resourceType, booking.resourceId);
      notifyBookingExpiringSoon(booking, resourceName, 48).catch(() => {});
    }

    for (const booking of bookings24) {
      const resourceName = await resolveResourceName(booking.resourceType, booking.resourceId);
      notifyBookingExpiringSoon(booking, resourceName, 24).catch(() => {});
    }
  } catch (err) {
    console.error('[cron:warn] Error during warning job:', err.message);
  }
});

console.log('[cron] Booking expiry + contention jobs scheduled');
