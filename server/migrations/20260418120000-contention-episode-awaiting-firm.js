'use strict';

/** Add ContentionEpisode.status = awaiting_firm (freeze line while defender firm is pending_approval). */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `ALTER TYPE "enum_ContentionEpisodes_status" ADD VALUE IF NOT EXISTS 'awaiting_firm';`
    );
  },

  async down() {
    // Postgres: removing enum values is non-trivial; leave type as-is on rollback.
  }
};
