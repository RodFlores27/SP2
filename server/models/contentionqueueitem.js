'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ContentionQueueItem extends Model {
    static associate(models) {
      ContentionQueueItem.belongsTo(models.ContentionEpisode, {
        foreignKey: 'episodeId',
        as: 'episode'
      });
      ContentionQueueItem.belongsTo(models.Booking, {
        foreignKey: 'bookingId',
        as: 'booking'
      });
    }
  }

  ContentionQueueItem.init(
    {
      episodeId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      bookingId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      position: {
        type: DataTypes.INTEGER,
        allowNull: false
      }
    },
    {
      sequelize,
      modelName: 'ContentionQueueItem',
      tableName: 'ContentionQueueItems'
    }
  );

  return ContentionQueueItem;
};
