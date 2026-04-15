const cron = require('node-cron');
const { Op } = require('sequelize');
const { Booking, User, Equipment, Room } = require('../models');
const {
  notifyBookingExpired,
  notifyBookingExpiringSoon,
} = require('../utils/booking-notifications');

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
 * Expire job — runs every 15 minutes.
 * Finds pencil bookings whose expiryAt has passed and marks them expired.
 * Sends a notification email to each affected owner.
 */
cron.schedule('*/15 * * * *', async () => {
  try {
    const now = new Date();

    const expired = await Booking.findAll({
      where: {
        status: 'penciled',
        expiryAt: { [Op.lte]: now },
      },
      include: [{ model: User, as: 'user', attributes: ['id', 'email'] }],
    });

    if (expired.length === 0) return;

    console.log(`[cron:expire] Expiring ${expired.length} pencil booking(s)`);

    for (const booking of expired) {
      booking.status = 'expired';
      await booking.save();

      const resourceName = await resolveResourceName(booking.resourceType, booking.resourceId);
      notifyBookingExpired(booking, resourceName).catch(() => {});
    }
  } catch (err) {
    console.error('[cron:expire] Error during expiry job:', err.message);
  }
});

/**
 * Warning job — runs daily at 08:00 Asia/Manila (UTC+8 = 00:00 UTC).
 * Sends 48hr and 24hr expiry warnings for pencil bookings.
 */
cron.schedule('0 0 * * *', async () => {
  try {
    const now = new Date();

    // 48hr window: expiryAt between 47h and 49h from now
    const window48Start = new Date(now.getTime() + 47 * 60 * 60 * 1000);
    const window48End = new Date(now.getTime() + 49 * 60 * 60 * 1000);

    // 24hr window: expiryAt between 23h and 25h from now
    const window24Start = new Date(now.getTime() + 23 * 60 * 60 * 1000);
    const window24End = new Date(now.getTime() + 25 * 60 * 60 * 1000);

    const [bookings48, bookings24] = await Promise.all([
      Booking.findAll({
        where: {
          status: 'penciled',
          expiryAt: { [Op.between]: [window48Start, window48End] },
        },
        include: [{ model: User, as: 'user', attributes: ['id', 'email'] }],
      }),
      Booking.findAll({
        where: {
          status: 'penciled',
          expiryAt: { [Op.between]: [window24Start, window24End] },
        },
        include: [{ model: User, as: 'user', attributes: ['id', 'email'] }],
      }),
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

console.log('[cron] Booking expiry jobs scheduled');
