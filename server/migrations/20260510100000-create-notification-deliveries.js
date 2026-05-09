'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('NotificationDeliveries', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      eventId: {
        type: Sequelize.STRING(128),
        allowNull: false,
      },
      eventType: {
        type: Sequelize.STRING(128),
        allowNull: false,
      },
      notificationType: {
        type: Sequelize.STRING(128),
        allowNull: false,
      },
      recipientEmail: {
        type: Sequelize.STRING(320),
        allowNull: false,
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
      status: {
        type: Sequelize.ENUM('processing', 'sent', 'failed'),
        allowNull: false,
        defaultValue: 'processing',
      },
      attemptCount: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },
      sentAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      lastError: {
        type: Sequelize.TEXT,
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

    await queryInterface.addConstraint('NotificationDeliveries', {
      fields: ['eventId', 'notificationType', 'recipientEmail'],
      type: 'unique',
      name: 'notification_deliveries_event_recipient_unique',
    });
    await queryInterface.addIndex('NotificationDeliveries', ['eventId'], {
      name: 'notification_deliveries_event_id_index',
    });
    await queryInterface.addIndex('NotificationDeliveries', ['status'], {
      name: 'notification_deliveries_status_index',
    });
    await queryInterface.addIndex('NotificationDeliveries', ['bookingId'], {
      name: 'notification_deliveries_booking_id_index',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex(
      'NotificationDeliveries',
      'notification_deliveries_booking_id_index'
    );
    await queryInterface.removeIndex(
      'NotificationDeliveries',
      'notification_deliveries_status_index'
    );
    await queryInterface.removeIndex(
      'NotificationDeliveries',
      'notification_deliveries_event_id_index'
    );
    await queryInterface.removeConstraint(
      'NotificationDeliveries',
      'notification_deliveries_event_recipient_unique'
    );
    await queryInterface.dropTable('NotificationDeliveries');
    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_NotificationDeliveries_status";'
    );
  },
};
