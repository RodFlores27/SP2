/**
 * Deletes every row in Bookings (dev utility).
 * Run from repo: cd server && node scripts/clear-bookings.js
 */
require('dotenv').config();

const path = require('path');
const { Booking, sequelize } = require(path.join(__dirname, '..', 'models'));

(async () => {
  try {
    await sequelize.authenticate();
    const deleted = await Booking.destroy({ where: {} });
    console.log(`Deleted ${deleted} booking(s).`);
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
})();
