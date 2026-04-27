'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class BookingAnalyticsEvent extends Model {
    static associate(models) {
      BookingAnalyticsEvent.belongsTo(models.User, {
        foreignKey: 'actorUserId',
        as: 'actor',
      });
      BookingAnalyticsEvent.belongsTo(models.Booking, {
        foreignKey: 'bookingId',
        as: 'booking',
      });
    }
  }

  BookingAnalyticsEvent.init(
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
    },
    {
      sequelize,
      modelName: 'BookingAnalyticsEvent',
    }
  );

  return BookingAnalyticsEvent;
};
