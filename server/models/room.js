'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Room extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // Polymorphic relationship with Bookings (via resourceType='room' and resourceId)
    }
  }
  Room.init({
    name: DataTypes.STRING,
    description: DataTypes.TEXT,
    location: DataTypes.STRING,
    zone: DataTypes.STRING(64),
    ppe: DataTypes.TEXT,
    capacity: DataTypes.INTEGER,
    imageUrl: DataTypes.STRING,
    resourceCode: DataTypes.STRING(64),
    status: DataTypes.STRING
  }, {
    sequelize,
    modelName: 'Room',
    paranoid: true,
  });
  return Room;
};
