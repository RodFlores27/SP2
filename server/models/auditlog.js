'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class AuditLog extends Model {
    static associate(models) {
      AuditLog.belongsTo(models.User, {
        foreignKey: 'actorUserId',
        as: 'actor',
      });
      AuditLog.belongsTo(models.Booking, {
        foreignKey: 'bookingId',
        as: 'booking',
      });
    }
  }

  AuditLog.init(
    {
      eventId: {
        type: DataTypes.STRING(128),
        allowNull: false,
        unique: true,
      },
      eventType: {
        type: DataTypes.STRING(128),
        allowNull: false,
      },
      occurredAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      topic: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      partition: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      offset: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },
      actorUserId: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      bookingId: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      resourceType: {
        type: DataTypes.ENUM('equipment', 'room'),
        allowNull: true,
      },
      resourceId: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      bookingType: {
        type: DataTypes.ENUM('pencil', 'firm'),
        allowNull: true,
      },
      status: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },
      payload: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
      },
    },
    {
      sequelize,
      modelName: 'AuditLog',
      hooks: {
        beforeUpdate() {
          throw new Error('AuditLog rows are immutable and cannot be updated.');
        },
        beforeDestroy() {
          throw new Error('AuditLog rows are immutable and cannot be deleted.');
        },
      },
    }
  );

  return AuditLog;
};
