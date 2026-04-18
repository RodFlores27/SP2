'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ContentionEpisode extends Model {
    static associate(models) {
      ContentionEpisode.belongsTo(models.Booking, {
        foreignKey: 'defenderBookingId',
        as: 'defenderBooking'
      });
      ContentionEpisode.belongsTo(models.Booking, {
        foreignKey: 'challengerBookingId',
        as: 'challengerBooking'
      });
      ContentionEpisode.hasMany(models.ContentionQueueItem, {
        foreignKey: 'episodeId',
        as: 'queueItems'
      });
    }
  }

  ContentionEpisode.init(
    {
      resourceType: {
        type: DataTypes.ENUM('equipment', 'room'),
        allowNull: false
      },
      resourceId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      defenderBookingId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      challengerBookingId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      deadlineAt: {
        type: DataTypes.DATE,
        allowNull: false
      },
      status: {
        type: DataTypes.ENUM('open', 'closed'),
        allowNull: false,
        defaultValue: 'open'
      }
    },
    {
      sequelize,
      modelName: 'ContentionEpisode',
      tableName: 'ContentionEpisodes'
    }
  );

  return ContentionEpisode;
};
