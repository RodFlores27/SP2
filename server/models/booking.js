'use strict';
const { Model, Op } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Booking extends Model {
    static associate(models) {
      Booking.belongsTo(models.User, {
        foreignKey: 'userId',
        as: 'user'
      });
      Booking.belongsTo(models.Booking, {
        foreignKey: 'rebookedFromBookingId',
        as: 'rebookedFrom'
      });
      Booking.hasMany(models.Booking, {
        foreignKey: 'rebookedFromBookingId',
        as: 'rebooks'
      });
      Booking.hasMany(models.Booking, {
        foreignKey: 'bookingThreadId',
        sourceKey: 'bookingThreadId',
        as: 'threadBookings'
      });
    }

    isActive() {
      const inactiveStatuses = ['cancelled', 'denied', 'expired'];
      return !inactiveStatuses.includes(this.status);
    }

    isConflicting(otherBooking) {
      if (this.resourceType !== otherBooking.resourceType || 
          this.resourceId !== otherBooking.resourceId) {
        return false;
      }
      
      return (this.startTime < otherBooking.endTime) && 
             (this.endTime > otherBooking.startTime);
    }

    static async findConflicts(resourceType, resourceId, startTime, endTime, excludeId = null) {
      const whereClause = {
        resourceType,
        resourceId,
        status: {
          [Op.notIn]: ['cancelled', 'denied', 'expired']
        },
        [Op.and]: [
          { startTime: { [Op.lt]: endTime } },
          { endTime: { [Op.gt]: startTime } }
        ]
      };

      if (excludeId) {
        whereClause.id = { [Op.ne]: excludeId };
      }

      return await Booking.findAll({
        where: whereClause,
        include: [{
          model: sequelize.models.User,
          as: 'user',
          attributes: ['id', 'email', 'accountType', 'userCategory']
        }],
        order: [['startTime', 'ASC']]
      });
    }
  }

  Booking.init({
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    resourceType: {
      type: DataTypes.ENUM('equipment', 'room'),
      allowNull: false
    },
    resourceId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    bookingType: {
      type: DataTypes.ENUM('pencil', 'firm'),
      allowNull: false,
      defaultValue: 'pencil'
    },
    status: {
      type: DataTypes.ENUM('penciled', 'contested', 'pending_approval', 'approved', 'denied', 'cancelled', 'expired'),
      allowNull: false,
      defaultValue: 'penciled'
    },
    startTime: {
      type: DataTypes.DATE,
      allowNull: false
    },
    endTime: {
      type: DataTypes.DATE,
      allowNull: false
    },
    purpose: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    authorizationDocUrl: {
      type: DataTypes.STRING,
      allowNull: true
    },
    authorizationDocHash: {
      type: DataTypes.STRING(64),
      allowNull: true
    },
    rebookedFromBookingId: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    rebookedFromStatus: {
      type: DataTypes.STRING,
      allowNull: true
    },
    bookingThreadId: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    rebookChangeSummary: {
      type: DataTypes.JSONB,
      allowNull: true
    },
    staffRemark: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    expiryAt: {
      type: DataTypes.DATE,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'Booking',
  });

  return Booking;
};
