'use strict';

/**
 * Superseded: warning/contention showcase bookings live in 20260330100000-seed-initial-data.js.
 * Kept so existing `db:seed:all` / SequelizeData history stays stable; does not insert rows.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up() {
    // Intentionally empty — see seed-initial-data.js for demo bookings.
  },

  async down() {
    // No-op: this seeder never inserted rows.
  },
};
