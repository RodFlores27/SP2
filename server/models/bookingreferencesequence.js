'use strict';
const {
  Model
} = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class BookingReferenceSequence extends Model {
    static associate() {
      // Sequence rows are scoped by resource code and year; no direct association needed.
    }
  }

  BookingReferenceSequence.init({
    resourceType: {
      type: DataTypes.ENUM('equipment', 'room'),
      allowNull: false,
    },
    codeGroup: {
      type: DataTypes.STRING(16),
      allowNull: false,
    },
    resourceCode: {
      type: DataTypes.STRING(16),
      allowNull: false,
    },
    year: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    lastNumber: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
  }, {
    sequelize,
    modelName: 'BookingReferenceSequence',
  });

  return BookingReferenceSequence;
};
