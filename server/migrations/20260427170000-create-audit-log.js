'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('AuditLogs', {
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
      payload: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
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

    await queryInterface.addIndex('AuditLogs', ['eventType'], {
      name: 'audit_logs_event_type_index',
    });
    await queryInterface.addIndex('AuditLogs', ['bookingId'], {
      name: 'audit_logs_booking_id_index',
    });
    await queryInterface.addIndex('AuditLogs', ['actorUserId'], {
      name: 'audit_logs_actor_user_id_index',
    });
    await queryInterface.addIndex('AuditLogs', ['occurredAt'], {
      name: 'audit_logs_occurred_at_index',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('AuditLogs', 'audit_logs_occurred_at_index');
    await queryInterface.removeIndex('AuditLogs', 'audit_logs_actor_user_id_index');
    await queryInterface.removeIndex('AuditLogs', 'audit_logs_booking_id_index');
    await queryInterface.removeIndex('AuditLogs', 'audit_logs_event_type_index');
    await queryInterface.dropTable('AuditLogs');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_AuditLogs_resourceType";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_AuditLogs_bookingType";');
  },
};
