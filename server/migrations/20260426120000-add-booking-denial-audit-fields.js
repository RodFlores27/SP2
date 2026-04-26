'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE "Bookings"
      ADD COLUMN IF NOT EXISTS "deniedByUserId" INTEGER;
    `);

    await queryInterface.sequelize.query(`
      DO $$ BEGIN
        ALTER TABLE "Bookings"
        ADD CONSTRAINT "Bookings_deniedByUserId_fkey"
        FOREIGN KEY ("deniedByUserId") REFERENCES "Users" ("id")
        ON UPDATE CASCADE
        ON DELETE SET NULL;
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS "bookings_denied_by_index"
      ON "Bookings" ("deniedByUserId");
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS "bookings_denied_by_index";
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE "Bookings"
      DROP CONSTRAINT IF EXISTS "Bookings_deniedByUserId_fkey";
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE "Bookings"
      DROP COLUMN IF EXISTS "deniedByUserId";
    `);
  }
};
