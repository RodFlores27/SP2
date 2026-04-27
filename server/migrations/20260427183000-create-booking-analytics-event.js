'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('BookingAnalyticsEvents', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      eventId: {
        type: Sequelize.STRING(128),
        allowNull: false,
        unique: true,
      },
      eventType: {
        type: Sequelize.STRING(128),
        allowNull: false,
      },
      occurredAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      topic: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      partition: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      offset: {
        type: Sequelize.STRING(64),
        allowNull: true,
      },
      actorUserId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'Users',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      bookingId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'Bookings',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      resourceType: {
        type: Sequelize.ENUM('equipment', 'room'),
        allowNull: true,
      },
      resourceId: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      bookingType: {
        type: Sequelize.ENUM('pencil', 'firm'),
        allowNull: true,
      },
      status: {
        type: Sequelize.STRING(64),
        allowNull: true,
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    await queryInterface.addIndex('BookingAnalyticsEvents', ['eventType'], {
      name: 'booking_analytics_events_event_type_index',
    });
    await queryInterface.addIndex('BookingAnalyticsEvents', ['resourceType'], {
      name: 'booking_analytics_events_resource_type_index',
    });
    await queryInterface.addIndex('BookingAnalyticsEvents', ['bookingType'], {
      name: 'booking_analytics_events_booking_type_index',
    });
    await queryInterface.addIndex('BookingAnalyticsEvents', ['status'], {
      name: 'booking_analytics_events_status_index',
    });
    await queryInterface.addIndex('BookingAnalyticsEvents', ['occurredAt'], {
      name: 'booking_analytics_events_occurred_at_index',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex(
      'BookingAnalyticsEvents',
      'booking_analytics_events_occurred_at_index'
    );
    await queryInterface.removeIndex(
      'BookingAnalyticsEvents',
      'booking_analytics_events_status_index'
    );
    await queryInterface.removeIndex(
      'BookingAnalyticsEvents',
      'booking_analytics_events_booking_type_index'
    );
    await queryInterface.removeIndex(
      'BookingAnalyticsEvents',
      'booking_analytics_events_resource_type_index'
    );
    await queryInterface.removeIndex(
      'BookingAnalyticsEvents',
      'booking_analytics_events_event_type_index'
    );
    await queryInterface.dropTable('BookingAnalyticsEvents');
    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_BookingAnalyticsEvents_resourceType";'
    );
    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_BookingAnalyticsEvents_bookingType";'
    );
  },
};
