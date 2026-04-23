'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      DO $$
      BEGIN
        ALTER TYPE "enum_Bookings_status" ADD VALUE IF NOT EXISTS 'on_hold';
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);
  },

  async down() {
    // PostgreSQL enum value removal is not safely reversible in-place.
    // Intentionally left as no-op.
  }
};
