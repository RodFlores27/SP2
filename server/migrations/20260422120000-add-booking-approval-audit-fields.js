'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE "Bookings"
      ADD COLUMN IF NOT EXISTS "approvedByUserId" INTEGER,
      ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMPTZ;
    `);

    await queryInterface.sequelize.query(`
      DO $$ BEGIN
        ALTER TABLE "Bookings"
        ADD CONSTRAINT "Bookings_approvedByUserId_fkey"
        FOREIGN KEY ("approvedByUserId") REFERENCES "Users" ("id")
        ON UPDATE CASCADE
        ON DELETE SET NULL;
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS "bookings_approved_by_index"
      ON "Bookings" ("approvedByUserId");
    `);

    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS "bookings_approved_at_index"
      ON "Bookings" ("approvedAt");
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS "bookings_approved_at_index";
    `);
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS "bookings_approved_by_index";
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE "Bookings"
      DROP CONSTRAINT IF EXISTS "Bookings_approvedByUserId_fkey";
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE "Bookings"
      DROP COLUMN IF EXISTS "approvedAt",
      DROP COLUMN IF EXISTS "approvedByUserId";
    `);
  }
};
