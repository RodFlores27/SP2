'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      DO $$ BEGIN
        ALTER TYPE "enum_Bookings_status" ADD VALUE 'completed';
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      UPDATE "Bookings" SET status = 'approved' WHERE status = 'completed';
    `);
    // PostgreSQL cannot drop a single enum label safely here; value may remain on rollback.
  }
};
