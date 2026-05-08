'use strict';

const { AuditLog, Booking, BookingAnalyticsEvent, Sequelize, User } = require('../models');
const { AUDIT_EVENT_TYPES, recordAuditEvent } = require('../utils/audit-log');

const ALLOWED_ROLES = ['regular_user', 'ptcf_staff', 'system_admin'];

const listUsers = async (req, res) => {
  try {
    const users = await User.findAll({
      attributes: ['id', 'email', 'accountType', 'userCategory', 'createdAt'],
      order: [['createdAt', 'DESC']],
    });
    res.json(users);
  } catch (err) {
    console.error('Error listing users:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
};

const updateUserRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { accountType } = req.body;

    if (!accountType || !ALLOWED_ROLES.includes(accountType)) {
      return res.status(400).json({
        error: `Invalid accountType. Must be one of: ${ALLOWED_ROLES.join(', ')}`,
      });
    }

    const targetId = parseInt(id, 10);

    if (targetId === req.user.id) {
      return res.status(400).json({ error: 'You cannot change your own role' });
    }

    const user = await User.findByPk(targetId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const previousAccountType = user.accountType;
    user.accountType = accountType;
    await user.save();

    await recordAuditEvent({
      eventType: AUDIT_EVENT_TYPES.USER_ROLE_CHANGED,
      actorUserId: req.user.id,
      status: accountType,
      payload: {
        targetUserId: user.id,
        targetEmail: user.email,
        previousAccountType,
        newAccountType: accountType,
      },
    });

    res.json({
      message: 'User role updated successfully',
      user: {
        id: user.id,
        email: user.email,
        accountType: user.accountType,
        userCategory: user.userCategory,
      },
    });
  } catch (err) {
    console.error('Error updating user role:', err);
    res.status(500).json({ error: 'Failed to update user role' });
  }
};

const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    const targetId = parseInt(id, 10);

    if (targetId === req.user.id) {
      return res.status(400).json({ error: 'You cannot delete your own account' });
    }

    const user = await User.findByPk(targetId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const deletedUser = {
      id: user.id,
      email: user.email,
      accountType: user.accountType,
      userCategory: user.userCategory,
    };

    await user.destroy();

    await recordAuditEvent({
      eventType: AUDIT_EVENT_TYPES.USER_DELETED,
      actorUserId: req.user.id,
      payload: {
        targetUserId: deletedUser.id,
        targetEmail: deletedUser.email,
        targetAccountType: deletedUser.accountType,
        targetUserCategory: deletedUser.userCategory,
      },
    });

    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    console.error('Error deleting user:', err);
    res.status(500).json({ error: 'Failed to delete user' });
  }
};

const listAuditLogs = async (req, res) => {
  try {
    const limitRaw = parseInt(req.query.limit, 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50;
    const where = {
      eventType: { [Sequelize.Op.ne]: 'booking.displaced_slot_reopened' },
    };

    if (req.query.eventType) {
      const eventType = String(req.query.eventType).trim();
      if (eventType === 'booking.displaced_slot_reopened') {
        return res.json({ count: 0, logs: [] });
      }
      where.eventType = eventType;
    }
    if (req.query.bookingId != null && req.query.bookingId !== '') {
      const bookingId = parseInt(req.query.bookingId, 10);
      if (Number.isNaN(bookingId)) {
        return res.status(400).json({ error: 'bookingId must be a valid integer' });
      }
      where.bookingId = bookingId;
    }
    if (req.query.actorUserId != null && req.query.actorUserId !== '') {
      const actorUserId = parseInt(req.query.actorUserId, 10);
      if (Number.isNaN(actorUserId)) {
        return res.status(400).json({ error: 'actorUserId must be a valid integer' });
      }
      where.actorUserId = actorUserId;
    }
    if (req.query.resourceType) {
      const resourceType = String(req.query.resourceType).trim();
      if (!['equipment', 'room'].includes(resourceType)) {
        return res.status(400).json({ error: 'resourceType must be either equipment or room' });
      }
      where.resourceType = resourceType;
    }
    if (req.query.resourceId != null && req.query.resourceId !== '') {
      const resourceId = parseInt(req.query.resourceId, 10);
      if (Number.isNaN(resourceId)) {
        return res.status(400).json({ error: 'resourceId must be a valid integer' });
      }
      where.resourceId = resourceId;
    }
    if (req.query.from || req.query.to) {
      where.occurredAt = {};
      if (req.query.from) {
        const from = new Date(String(req.query.from));
        if (Number.isNaN(from.getTime())) {
          return res.status(400).json({ error: 'from must be a valid date' });
        }
        where.occurredAt[Sequelize.Op.gte] = from;
      }
      if (req.query.to) {
        const to = new Date(String(req.query.to));
        if (Number.isNaN(to.getTime())) {
          return res.status(400).json({ error: 'to must be a valid date' });
        }
        where.occurredAt[Sequelize.Op.lte] = to;
      }
    }

    const logs = await AuditLog.findAll({
      where,
      limit,
      order: [['occurredAt', 'DESC'], ['id', 'DESC']],
      include: [
        {
          model: User,
          as: 'actor',
          required: false,
          attributes: ['id', 'email', 'accountType'],
        },
        {
          model: Booking,
          as: 'booking',
          required: false,
          attributes: [
            'id',
            'referenceCode',
            'resourceType',
            'resourceId',
            'bookingType',
            'status',
            'equipmentRequestType',
            'loanReason',
            'loanWorkflowNote',
            'loanTransportPlan',
            'roomParticipantCount',
            'roomEquipmentNeeds',
            'roomSetupRequirements',
            'roomProgramDetails',
            'cancellationReason',
            'probableRebookDate',
          ],
          include: [
            {
              model: User,
              as: 'user',
              required: false,
              attributes: ['id', 'email'],
            },
          ],
        },
      ],
    });

    res.json({
      count: logs.length,
      logs,
    });
  } catch (err) {
    console.error('Error listing audit logs:', err);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
};

function normalizeGroupedCounts(rows, keyName) {
  return rows
    .filter((row) => row[keyName] !== null && row[keyName] !== undefined && row[keyName] !== '')
    .map((row) => ({
      label: row[keyName],
      count: Number(row.count),
    }));
}

async function countBy(fieldName) {
  const rows = await BookingAnalyticsEvent.findAll({
    attributes: [
      [Sequelize.col(fieldName), fieldName],
      [Sequelize.fn('COUNT', Sequelize.col('id')), 'count'],
    ],
    group: [fieldName],
    order: [[Sequelize.literal('count'), 'DESC'], [fieldName, 'ASC']],
    raw: true,
  });
  return normalizeGroupedCounts(rows, fieldName);
}

const getAnalytics = async (req, res) => {
  try {
    const [
      totalEvents,
      countsByEventType,
      countsByResourceType,
      countsByBookingType,
      countsByStatus,
      recentEvents,
    ] = await Promise.all([
      BookingAnalyticsEvent.count(),
      countBy('eventType'),
      countBy('resourceType'),
      countBy('bookingType'),
      countBy('status'),
      BookingAnalyticsEvent.findAll({
        limit: 10,
        order: [['occurredAt', 'DESC'], ['id', 'DESC']],
        include: [
          {
            model: User,
            as: 'actor',
            required: false,
            attributes: ['id', 'email', 'accountType'],
          },
          {
            model: Booking,
            as: 'booking',
            required: false,
            attributes: ['id', 'referenceCode', 'resourceType', 'resourceId', 'bookingType', 'status'],
          },
        ],
      }),
    ]);

    res.json({
      totalEvents,
      countsByEventType,
      countsByResourceType,
      countsByBookingType,
      countsByStatus,
      recentEvents,
    });
  } catch (err) {
    console.error('Error fetching analytics:', err);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
};

module.exports = {
  listUsers,
  updateUserRole,
  deleteUser,
  listAuditLogs,
  getAnalytics,
};
