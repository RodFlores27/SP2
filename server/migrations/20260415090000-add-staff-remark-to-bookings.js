'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      ALTER TABLE "Bookings"
      ADD COLUMN IF NOT EXISTS "staffRemark" TEXT;
    `);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      ALTER TABLE "Bookings"
      DROP COLUMN IF EXISTS "staffRemark";
    `);
  }
};

