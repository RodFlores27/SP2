'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      DROP TYPE IF EXISTS "enum_Bookings_status_new"
    `);

    await queryInterface.sequelize.query(`
      CREATE TYPE "enum_Bookings_status_new" AS ENUM(
        'penciled', 'contested', 'queued', 'pending_approval', 'approved', 'denied', 'cancelled', 'expired', 'displaced'
      )
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE "Bookings" ALTER COLUMN status DROP DEFAULT
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE "Bookings"
      ALTER COLUMN status TYPE "enum_Bookings_status_new"
      USING status::text::"enum_Bookings_status_new"
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE "Bookings" ALTER COLUMN status SET DEFAULT 'penciled'::"enum_Bookings_status_new"
    `);

    await queryInterface.sequelize.query(`
      DROP TYPE IF EXISTS "enum_Bookings_status"
    `);

    await queryInterface.sequelize.query(`
      ALTER TYPE "enum_Bookings_status_new" RENAME TO "enum_Bookings_status"
    `);

    await queryInterface.addColumn('Bookings', 'displacedByBookingId', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'Bookings', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });

    await queryInterface.addIndex('Bookings', ['displacedByBookingId'], {
      name: 'bookings_displaced_by_index'
    });

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
        type: Sequelize.ENUM('open', 'closed'),
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

    await queryInterface.addIndex('ContentionEpisodes', ['resourceType', 'resourceId', 'status'], {
      name: 'contention_episodes_resource_open_index'
    });
    await queryInterface.addIndex('ContentionEpisodes', ['defenderBookingId'], {
      name: 'contention_episodes_defender_index'
    });
    await queryInterface.addIndex('ContentionEpisodes', ['challengerBookingId'], {
      name: 'contention_episodes_challenger_index'
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

    await queryInterface.addIndex('ContentionQueueItems', ['episodeId', 'position'], {
      name: 'contention_queue_episode_position_index'
    });
    await queryInterface.addConstraint('ContentionQueueItems', {
      fields: ['episodeId', 'bookingId'],
      type: 'unique',
      name: 'contention_queue_episode_booking_unique'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('ContentionQueueItems');
    await queryInterface.dropTable('ContentionEpisodes');

    await queryInterface.removeIndex('Bookings', 'bookings_displaced_by_index');
    await queryInterface.removeColumn('Bookings', 'displacedByBookingId');

    await queryInterface.sequelize.query(`
      UPDATE "Bookings" SET status = 'penciled' WHERE status IN ('queued', 'displaced')
    `);

    await queryInterface.sequelize.query(`
      DROP TYPE IF EXISTS "enum_Bookings_status_new"
    `);

    await queryInterface.sequelize.query(`
      CREATE TYPE "enum_Bookings_status_new" AS ENUM(
        'penciled', 'contested', 'pending_approval', 'approved', 'denied', 'cancelled', 'expired'
      )
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE "Bookings" ALTER COLUMN status DROP DEFAULT
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE "Bookings"
      ALTER COLUMN status TYPE "enum_Bookings_status_new"
      USING status::text::"enum_Bookings_status_new"
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE "Bookings" ALTER COLUMN status SET DEFAULT 'penciled'::"enum_Bookings_status_new"
    `);

    await queryInterface.sequelize.query(`
      DROP TYPE IF EXISTS "enum_Bookings_status"
    `);

    await queryInterface.sequelize.query(`
      ALTER TYPE "enum_Bookings_status_new" RENAME TO "enum_Bookings_status"
    `);
  }
};
