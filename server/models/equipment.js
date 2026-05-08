'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Equipment extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // Polymorphic relationship with Bookings (via resourceType='equipment' and resourceId)
    }
  }
  Equipment.init({
    name: DataTypes.STRING,
    category: DataTypes.STRING,
    description: DataTypes.TEXT,
    imageUrl: DataTypes.STRING,
    codeGroup: DataTypes.STRING,
    resourceCode: DataTypes.STRING(64),
    status: DataTypes.STRING
  }, {
    sequelize,
    modelName: 'Equipment',
    paranoid: true,
  });
  return Equipment;
};
