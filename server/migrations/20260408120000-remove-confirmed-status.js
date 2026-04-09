'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Step 1: Update existing 'confirmed' bookings to 'approved'
    await queryInterface.sequelize.query(`
      UPDATE "Bookings" 
      SET status = 'approved' 
      WHERE status = 'confirmed'
    `);

    // Step 2: Drop the _new type if it exists from a previous failed run
    await queryInterface.sequelize.query(`
      DROP TYPE IF EXISTS "enum_Bookings_status_new"
    `);

    // Step 3: Create new ENUM type without 'confirmed'
    await queryInterface.sequelize.query(`
      CREATE TYPE "enum_Bookings_status_new" AS ENUM(
        'penciled', 'contested', 'pending_approval', 'approved', 'denied', 'cancelled', 'expired'
      )
    `);

    // Step 4: Drop default constraint before altering type
    await queryInterface.sequelize.query(`
      ALTER TABLE "Bookings" ALTER COLUMN status DROP DEFAULT
    `);

    // Step 5: Alter column to use new ENUM
    await queryInterface.sequelize.query(`
      ALTER TABLE "Bookings" 
      ALTER COLUMN status TYPE "enum_Bookings_status_new" 
      USING status::text::"enum_Bookings_status_new"
    `);

    // Step 6: Restore default
    await queryInterface.sequelize.query(`
      ALTER TABLE "Bookings" ALTER COLUMN status SET DEFAULT 'penciled'::"enum_Bookings_status_new"
    `);

    // Step 7: Drop old ENUM type
    await queryInterface.sequelize.query(`
      DROP TYPE IF EXISTS "enum_Bookings_status"
    `);

    // Step 8: Rename new ENUM to original name
    await queryInterface.sequelize.query(`
      ALTER TYPE "enum_Bookings_status_new" RENAME TO "enum_Bookings_status"
    `);
  },

  async down(queryInterface, Sequelize) {
    // Reverse: Add 'confirmed' back to ENUM
    await queryInterface.sequelize.query(`
      CREATE TYPE "enum_Bookings_status_new" AS ENUM(
        'penciled', 'confirmed', 'contested', 'pending_approval', 'approved', 'denied', 'cancelled', 'expired'
      )
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE "Bookings" 
      ALTER COLUMN status TYPE "enum_Bookings_status_new" 
      USING status::text::"enum_Bookings_status_new"
    `);

    await queryInterface.sequelize.query(`
      DROP TYPE "enum_Bookings_status"
    `);

    await queryInterface.sequelize.query(`
      ALTER TYPE "enum_Bookings_status_new" RENAME TO "enum_Bookings_status"
    `);
  }
};
