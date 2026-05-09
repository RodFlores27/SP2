'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class NotificationDelivery extends Model {}

  NotificationDelivery.init(
    {
      eventId: {
        type: DataTypes.STRING(128),
        allowNull: false,
      },
      eventType: {
        type: DataTypes.STRING(128),
        allowNull: false,
      },
      notificationType: {
        type: DataTypes.STRING(128),
        allowNull: false,
      },
      recipientEmail: {
        type: DataTypes.STRING(320),
        allowNull: false,
      },
      bookingId: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      status: {
        type: DataTypes.ENUM('processing', 'sent', 'failed'),
        allowNull: false,
        defaultValue: 'processing',
      },
      attemptCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },
      sentAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      lastError: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: 'NotificationDelivery',
    }
  );

  return NotificationDelivery;
};
