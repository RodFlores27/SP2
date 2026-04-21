const cron = require('node-cron');
const { Op } = require('sequelize');
const {
  Booking,
  User,
  Equipment,
  Room,
  sequelize,
  ContentionEpisode,
  ContentionQueueItem
} = require('../models');
const {
  notifyBookingExpired,
  notifyBookingExpiringSoon
} = require('../utils/booking-notifications');
const contention = require('../services/contention.service');

const PENCIL_WARN_STATUSES = ['penciled', 'contested', 'queued'];

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

    await contention.resolveChallengerExpiredDuringContention(now, {
      sequelize,
      Booking,
      ContentionEpisode,
      ContentionQueueItem
    });
    await contention.resolveDefenderExpiredDuringContention(now, {
      sequelize,
      Booking,
      ContentionEpisode,
      ContentionQueueItem
    });
    await contention.resolveDueContentionEpisodes(now, {
      sequelize,
      Booking,
      ContentionEpisode,
      ContentionQueueItem
    });

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

    const expired = await Booking.findAll({
      where: {
        bookingType: 'pencil',
        status: { [Op.in]: ['penciled', 'queued'] },
        expiryAt: { [Op.lte]: now }
      },
      include: [{ model: User, as: 'user', attributes: ['id', 'email'] }]
    });

    if (expired.length === 0) return;

    console.log(`[cron:expire] Expiring ${expired.length} pencil booking(s)`);

    for (const booking of expired) {
      await sequelize.transaction(async (t) => {
        const b = await Booking.findByPk(booking.id, {
          transaction: t,
          lock: t.LOCK.UPDATE
        });
        if (!b || !['penciled', 'queued'].includes(b.status)) return;

        await contention.onBookingCancelledMidContention(b, {
          transaction: t,
          Booking,
          ContentionEpisode,
          ContentionQueueItem
        });

        await ContentionQueueItem.destroy({
          where: { bookingId: b.id },
          transaction: t
        });

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
          status: { [Op.in]: PENCIL_WARN_STATUSES },
          expiryAt: { [Op.between]: [window48Start, window48End] }
        },
        include: [{ model: User, as: 'user', attributes: ['id', 'email'] }]
      }),
      Booking.findAll({
        where: {
          bookingType: 'pencil',
          status: { [Op.in]: PENCIL_WARN_STATUSES },
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
