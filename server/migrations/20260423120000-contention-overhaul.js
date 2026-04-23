'use strict';

/**
 * Contention Overhaul Migration
 *
 * This migration simplifies the contention system by:
 * 1. Adding contention columns directly to Bookings table
 * 2. Migrating existing contention state from Episodes/Queue tables
 * 3. Dropping ContentionEpisodes and ContentionQueueItems tables
 *
 * The `contested` and `queued` status values are deprecated but kept in the enum
 * for backward compatibility. New code will use `penciled` + `contentionRole` instead.
 *
 * Idempotent: safe to re-run after a partial failure (e.g. column added but migration
 * not recorded in SequelizeMeta).
 */

/** @param {import('sequelize').QueryInterface} queryInterface */
async function tableExists(queryInterface, tableName) {
  const [rows] = await queryInterface.sequelize.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = :t LIMIT 1`,
    { replacements: { t: tableName } }
  );
  return rows.length > 0;
}

/** @param {import('sequelize').QueryInterface} queryInterface */
async function columnExists(queryInterface, tableName, columnName) {
  const [rows] = await queryInterface.sequelize.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = :t AND column_name = :c LIMIT 1`,
    { replacements: { t: tableName, c: columnName } }
  );
  return rows.length > 0;
}

/**
 * Drop every FK in public that references "ContentionEpisodes" (e.g. legacy ContentionGroups).
 */
async function dropForeignKeysReferencingContentionEpisodes(queryInterface) {
  await queryInterface.sequelize.query(`
    DO $$
    DECLARE r RECORD;
    BEGIN
      FOR r IN (
        SELECT c.conname AS cname,
               n.nspname AS sch,
               rel.relname AS tbl
        FROM pg_constraint c
        JOIN pg_class rel ON rel.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = rel.relnamespace
        JOIN pg_class ref ON ref.oid = c.confrelid
        JOIN pg_namespace refn ON refn.oid = ref.relnamespace
        WHERE c.contype = 'f'
          AND ref.relname = 'ContentionEpisodes'
          AND refn.nspname = 'public'
          AND n.nspname = 'public'
      ) LOOP
        EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', r.sch, r.tbl, r.cname);
      END LOOP;
    END $$;
  `);
}

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      DO $$ BEGIN
        CREATE TYPE "enum_Bookings_contentionRole" AS ENUM('defender', 'challenger', 'queued');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    if (!(await columnExists(queryInterface, 'Bookings', 'contentionGroupId'))) {
      await queryInterface.addColumn('Bookings', 'contentionGroupId', {
        type: Sequelize.INTEGER,
        allowNull: true
      });
    }

    if (!(await columnExists(queryInterface, 'Bookings', 'contentionRole'))) {
      await queryInterface.addColumn('Bookings', 'contentionRole', {
        type: Sequelize.ENUM('defender', 'challenger', 'queued'),
        allowNull: true
      });
    }

    if (!(await columnExists(queryInterface, 'Bookings', 'contentionDeadlineAt'))) {
      await queryInterface.addColumn('Bookings', 'contentionDeadlineAt', {
        type: Sequelize.DATE,
        allowNull: true
      });
    }

    if (!(await columnExists(queryInterface, 'Bookings', 'challengingBookingId'))) {
      await queryInterface.addColumn('Bookings', 'challengingBookingId', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'Bookings', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      });
    }

    if (!(await columnExists(queryInterface, 'Bookings', 'queuePosition'))) {
      await queryInterface.addColumn('Bookings', 'queuePosition', {
        type: Sequelize.INTEGER,
        allowNull: true
      });
    }

    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS bookings_contention_group_index ON "Bookings" ("contentionGroupId");
    `);
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS bookings_contention_role_index ON "Bookings" ("contentionRole");
    `);
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS bookings_challenging_booking_index ON "Bookings" ("challengingBookingId");
    `);

    if (await tableExists(queryInterface, 'ContentionEpisodes')) {
      // Compare as text so DBs whose enum never got `awaiting_firm` still parse the query.
      await queryInterface.sequelize.query(`
        UPDATE "Bookings" b
        SET
          "contentionGroupId" = ep.id,
          "contentionRole" = 'defender',
          "contentionDeadlineAt" = ep."deadlineAt"
        FROM "ContentionEpisodes" ep
        WHERE b.id = ep."defenderBookingId"
          AND ep.status::text IN ('open', 'awaiting_firm')
      `);

      await queryInterface.sequelize.query(`
        UPDATE "Bookings" b
        SET
          "contentionGroupId" = ep.id,
          "contentionRole" = 'challenger',
          "challengingBookingId" = ep."defenderBookingId"
        FROM "ContentionEpisodes" ep
        WHERE b.id = ep."challengerBookingId"
          AND ep.status::text IN ('open', 'awaiting_firm')
      `);
    }

    if (
      (await tableExists(queryInterface, 'ContentionQueueItems')) &&
      (await tableExists(queryInterface, 'ContentionEpisodes'))
    ) {
      await queryInterface.sequelize.query(`
        UPDATE "Bookings" b
        SET
          "contentionGroupId" = qi."episodeId",
          "contentionRole" = 'queued',
          "queuePosition" = qi.position
        FROM "ContentionQueueItems" qi
        INNER JOIN "ContentionEpisodes" ep ON qi."episodeId" = ep.id
        WHERE b.id = qi."bookingId"
          AND ep.status::text IN ('open', 'awaiting_firm')
      `);
    }

    await queryInterface.sequelize.query(`
      UPDATE "Bookings"
      SET status = 'penciled'
      WHERE status = 'contested'
    `);

    await queryInterface.sequelize.query(`
      UPDATE "Bookings"
      SET status = 'penciled'
      WHERE status = 'queued'
    `);

    if (await tableExists(queryInterface, 'ContentionQueueItems')) {
      await queryInterface.dropTable('ContentionQueueItems');
    }

    if (await tableExists(queryInterface, 'ContentionEpisodes')) {
      await dropForeignKeysReferencingContentionEpisodes(queryInterface);
      await queryInterface.dropTable('ContentionEpisodes');
    }

    if (await tableExists(queryInterface, 'ContentionGroups')) {
      await queryInterface.sequelize.query(`DROP TABLE IF EXISTS "ContentionGroups" CASCADE;`);
    }

    await queryInterface.sequelize.query(`
      DROP TYPE IF EXISTS "enum_ContentionEpisodes_status";
      DROP TYPE IF EXISTS "enum_ContentionEpisodes_resourceType";
    `);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.createTable('ContentionEpisodes', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      resourceType: {
        type: Sequelize.ENUM('equipment', 'room'),
        allowNull: false
      },
      resourceId: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      defenderBookingId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'Bookings', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      challengerBookingId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'Bookings', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      deadlineAt: {
        type: Sequelize.DATE,
        allowNull: false
      },
      status: {
        type: Sequelize.ENUM('open', 'awaiting_firm', 'closed'),
        allowNull: false,
        defaultValue: 'open'
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });

    await queryInterface.createTable('ContentionQueueItems', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      episodeId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'ContentionEpisodes', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      bookingId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'Bookings', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      position: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });

    await queryInterface.removeIndex('Bookings', 'bookings_contention_group_index').catch(() => {});
    await queryInterface.removeIndex('Bookings', 'bookings_contention_role_index').catch(() => {});
    await queryInterface.removeIndex('Bookings', 'bookings_challenging_booking_index').catch(() => {});

    for (const col of [
      'queuePosition',
      'challengingBookingId',
      'contentionDeadlineAt',
      'contentionRole',
      'contentionGroupId'
    ]) {
      if (await columnExists(queryInterface, 'Bookings', col)) {
        await queryInterface.removeColumn('Bookings', col);
      }
    }

    await queryInterface.sequelize.query(`
      DROP TYPE IF EXISTS "enum_Bookings_contentionRole";
    `);
  }
};
