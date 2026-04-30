'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class User extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      User.hasMany(models.Booking, {
        foreignKey: 'userId',
        as: 'bookings'
      });
    }
  }
  User.init({
    email: DataTypes.STRING,
    supabaseAuthId: {
      type: DataTypes.UUID,
      allowNull: true,
      unique: true,
    },
    passwordHash: DataTypes.STRING,
    accountType: DataTypes.STRING,
    userCategory: DataTypes.STRING
  }, {
    sequelize,
    modelName: 'User',
    paranoid: true,
  });
  return User;
};
