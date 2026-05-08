'use strict';
const { Model, Op } = require('sequelize');

const TERMINAL_STATUSES = ['cancelled', 'denied', 'expired', 'displaced', 'completed'];

/** Firm bookings that block other bookings from overlapping this window. */
const FIRM_BLOCKING_STATUSES = ['pending_approval', 'approved'];

/** Active pencil bookings that can participate in contention. */
const ACTIVE_PENCIL_STATUSES = ['penciled'];

/** Contention roles for pencil bookings (strict 1v1). */
const CONTENTION_ROLES = ['defender', 'challenger'];

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
      Booking.belongsTo(models.User, {
        foreignKey: 'approvedByUserId',
        as: 'approvedBy'
      });
      Booking.belongsTo(models.User, {
        foreignKey: 'deniedByUserId',
        as: 'deniedBy'
      });
      Booking.hasMany(models.Booking, {
        foreignKey: 'displacedByBookingId',
        as: 'displacedBookings'
      });
      Booking.belongsTo(models.Booking, {
        foreignKey: 'challengingBookingId',
        as: 'challengingBooking'
      });
      Booking.hasOne(models.Booking, {
        foreignKey: 'challengingBookingId',
        as: 'challengedByBooking'
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

    /** Check if this booking is the defender in an active contention. */
    isDefender() {
      return this.contentionRole === 'defender';
    }

    /** Check if this booking is the challenger in an active contention. */
    isChallenger() {
      return this.contentionRole === 'challenger';
    }

    /** Check if this booking is in any contention (defender or challenger). */
    isInContention() {
      return this.contentionRole != null;
    }

    /** Check if this booking is a free pencil (not in any contention). */
    isFreePencil() {
      return this.bookingType === 'pencil' && 
             this.status === 'penciled' && 
             this.contentionRole == null;
    }

    isOnHoldPencil() {
      return this.bookingType === 'pencil' && this.status === 'on_hold';
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

    /** Active pencil bookings overlapping the interval. */
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

    /**
     * Clear contention state from a booking.
     * @param {object} options - Query options including transaction
     */
    async clearContentionState(options = {}) {
      const { transaction } = options;
      this.contentionRole = null;
      this.contentionDeadlineAt = null;
      this.challengingBookingId = null;
      await this.save({ transaction });
    }
  }

  Booking.TERMINAL_STATUSES = TERMINAL_STATUSES;
  Booking.FIRM_BLOCKING_STATUSES = FIRM_BLOCKING_STATUSES;
  Booking.ACTIVE_PENCIL_STATUSES = ACTIVE_PENCIL_STATUSES;
  Booking.CONTENTION_ROLES = CONTENTION_ROLES;

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
    equipmentRequestType: {
      type: DataTypes.ENUM('in_house', 'loan'),
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM(
        'penciled',
        'on_hold',
        'contested',  // DEPRECATED: kept for backward compatibility, use contentionRole='defender' instead
        'pending_approval',
        'approved',
        'denied',
        'cancelled',
        'expired',
        'displaced',
        'completed'
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
    loanReason: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    loanWorkflowNote: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    loanTransportPlan: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    roomParticipantCount: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    roomEquipmentNeeds: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    roomSetupRequirements: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    roomProgramDetails: {
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
    referenceCode: {
      type: DataTypes.STRING(64),
      allowNull: true,
      unique: true
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
    cancellationReason: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    probableRebookDate: {
      type: DataTypes.DATE,
      allowNull: true
    },
    approvedByUserId: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    deniedByUserId: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    approvedAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    expiryAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    warning48SentAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    warning24SentAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    displacedByBookingId: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    contentionRole: {
      type: DataTypes.ENUM('defender', 'challenger'),
      allowNull: true
    },
    contentionDeadlineAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    challengingBookingId: {
      type: DataTypes.INTEGER,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'Booking',
  });

  return Booking;
};
