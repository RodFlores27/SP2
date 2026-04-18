'use strict';
const { Model, Op } = require('sequelize');

const TERMINAL_STATUSES = ['cancelled', 'denied', 'expired', 'displaced'];

/** Firm bookings that block other bookings from overlapping this window. */
const FIRM_BLOCKING_STATUSES = ['pending_approval', 'approved'];

const ACTIVE_PENCIL_STATUSES = ['penciled', 'contested', 'queued'];

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
      Booking.belongsTo(models.Booking, {
        foreignKey: 'displacedByBookingId',
        as: 'displacedByBooking'
      });
      Booking.hasMany(models.Booking, {
        foreignKey: 'displacedByBookingId',
        as: 'displacedBookings'
      });
    }

    isActive() {
      return !TERMINAL_STATUSES.includes(this.status);
    }

    isConflicting(otherBooking) {
      if (this.resourceType !== otherBooking.resourceType || 
          this.resourceId !== otherBooking.resourceId) {
        return false;
      }
      
      return (this.startTime < otherBooking.endTime) && 
             (this.endTime > otherBooking.startTime);
    }

    /**
     * Any booking that still occupies the calendar for conflict purposes (legacy / admin tools).
     */
    static async findConflicts(resourceType, resourceId, startTime, endTime, excludeId = null) {
      const [firm, pencils] = await Promise.all([
        Booking.findFirmBlockers(resourceType, resourceId, startTime, endTime, excludeId),
        Booking.findActivePencilOverlaps(resourceType, resourceId, startTime, endTime, excludeId)
      ]);
      const merged = [...firm, ...pencils].sort(
        (a, b) => new Date(a.startTime) - new Date(b.startTime) || a.id - b.id
      );
      return merged;
    }

    /** Overlapping firm bookings that block new bookings (pending or approved). */
    static async findFirmBlockers(
      resourceType,
      resourceId,
      startTime,
      endTime,
      excludeId = null,
      options = {}
    ) {
      const { transaction } = options;
      const whereClause = {
        resourceType,
        resourceId,
        bookingType: 'firm',
        status: { [Op.in]: FIRM_BLOCKING_STATUSES },
        [Op.and]: [
          { startTime: { [Op.lt]: endTime } },
          { endTime: { [Op.gt]: startTime } }
        ]
      };
      if (excludeId) whereClause.id = { [Op.ne]: excludeId };
      return Booking.findAll({
        where: whereClause,
        include: [
          {
            model: sequelize.models.User,
            as: 'user',
            attributes: ['id', 'email', 'accountType', 'userCategory']
          }
        ],
        order: [['startTime', 'ASC']],
        transaction
      });
    }

    /** Active pencil bookings overlapping the interval (penciled / contested / queued). */
    static async findActivePencilOverlaps(
      resourceType,
      resourceId,
      startTime,
      endTime,
      excludeId = null,
      options = {}
    ) {
      const { transaction } = options;
      const whereClause = {
        resourceType,
        resourceId,
        bookingType: 'pencil',
        status: { [Op.in]: ACTIVE_PENCIL_STATUSES },
        [Op.and]: [
          { startTime: { [Op.lt]: endTime } },
          { endTime: { [Op.gt]: startTime } }
        ]
      };
      if (excludeId) whereClause.id = { [Op.ne]: excludeId };
      return Booking.findAll({
        where: whereClause,
        include: [
          {
            model: sequelize.models.User,
            as: 'user',
            attributes: ['id', 'email', 'accountType', 'userCategory']
          }
        ],
        order: [
          ['createdAt', 'ASC'],
          ['id', 'ASC']
        ],
        transaction
      });
    }
  }

  Booking.TERMINAL_STATUSES = TERMINAL_STATUSES;
  Booking.FIRM_BLOCKING_STATUSES = FIRM_BLOCKING_STATUSES;
  Booking.ACTIVE_PENCIL_STATUSES = ACTIVE_PENCIL_STATUSES;

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
      type: DataTypes.ENUM(
        'penciled',
        'contested',
        'queued',
        'pending_approval',
        'approved',
        'denied',
        'cancelled',
        'expired',
        'displaced'
      ),
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
    },
    displacedByBookingId: {
      type: DataTypes.INTEGER,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'Booking',
  });

  return Booking;
};
