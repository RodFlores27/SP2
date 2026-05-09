'use strict';

const { AuditLog, Booking, BookingAnalyticsEvent, Equipment, Room, Sequelize, User } = require('../models');
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
  return countByWithWhere(fieldName, {});
}

async function countByWithWhere(fieldName, where) {
  const rows = await BookingAnalyticsEvent.findAll({
    where,
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

function parseAnalyticsRangeFilters(query = {}) {
  const range = String(query.range || 'all').trim();
  const now = new Date();
  const where = {};

  const makeDayStart = (d) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  };
  const makeDayEnd = (d) => {
    const x = new Date(d);
    x.setHours(23, 59, 59, 999);
    return x;
  };

  let from = null;
  let to = null;

  if (range === 'today') {
    from = makeDayStart(now);
    to = makeDayEnd(now);
  } else if (range === 'last_7_days') {
    from = makeDayStart(now);
    from.setDate(from.getDate() - 6);
    to = makeDayEnd(now);
  } else if (range === 'last_30_days') {
    from = makeDayStart(now);
    from.setDate(from.getDate() - 29);
    to = makeDayEnd(now);
  }

  const startDateRaw = query.startDate != null ? String(query.startDate).trim() : '';
  const endDateRaw = query.endDate != null ? String(query.endDate).trim() : '';
  if (startDateRaw || endDateRaw) {
    if (startDateRaw) {
      const parsedStart = new Date(startDateRaw);
      if (Number.isNaN(parsedStart.getTime())) {
        return { error: 'startDate must be a valid date' };
      }
      from = makeDayStart(parsedStart);
    }
    if (endDateRaw) {
      const parsedEnd = new Date(endDateRaw);
      if (Number.isNaN(parsedEnd.getTime())) {
        return { error: 'endDate must be a valid date' };
      }
      to = makeDayEnd(parsedEnd);
    }
  }

  if (from || to) {
    where.occurredAt = {};
    if (from) where.occurredAt[Sequelize.Op.gte] = from;
    if (to) where.occurredAt[Sequelize.Op.lte] = to;
    if (from && to && from > to) {
      return { error: 'startDate must be earlier than or equal to endDate' };
    }
  }

  return {
    where,
    appliedRange: range,
    appliedStartDate: startDateRaw || null,
    appliedEndDate: endDateRaw || null,
  };
}

function csvCell(value) {
  const stringValue = value == null ? '' : String(value);
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

function pushCsvRow(lines, ...values) {
  lines.push(values.map(csvCell).join(','));
}

function renderAnalyticsCsv({
  generatedAt,
  adminEmail,
  appliedRange,
  appliedStartDate,
  appliedEndDate,
  totalEvents,
  countsByEventType,
  countsByStatus,
  countsByResourceType,
  countsByBookingType,
  bookingsByResource,
}) {
  const lines = [];
  pushCsvRow(lines, 'PTCF Booking Analytics Report');
  pushCsvRow(lines, 'Generated At', generatedAt);
  pushCsvRow(lines, 'Generated By', adminEmail || '');
  pushCsvRow(lines, 'Range', appliedRange || 'all');
  pushCsvRow(lines, 'Start Date', appliedStartDate || '');
  pushCsvRow(lines, 'End Date', appliedEndDate || '');
  lines.push('');

  pushCsvRow(lines, 'Summary');
  pushCsvRow(lines, 'Metric', 'Value');
  pushCsvRow(lines, 'Total Events', totalEvents);
  lines.push('');

  const appendCountSection = (title, rows) => {
    pushCsvRow(lines, title);
    pushCsvRow(lines, 'Label', 'Count');
    if (!rows || rows.length === 0) {
      pushCsvRow(lines, 'No data', 0);
    } else {
      rows.forEach((row) => pushCsvRow(lines, row.label, row.count));
    }
    lines.push('');
  };

  appendCountSection('Counts By Event Type', countsByEventType);
  appendCountSection('Counts By Status', countsByStatus);
  appendCountSection('Counts By Resource Type', countsByResourceType);
  appendCountSection('Counts By Booking Type', countsByBookingType);

  pushCsvRow(lines, 'Bookings By Resource (Pencil/Firm Breakdown)');
  pushCsvRow(lines, 'Resource Type', 'Resource Id', 'Resource Name', 'Total Bookings', 'Pencil', 'Firm');
  if (!bookingsByResource || bookingsByResource.length === 0) {
    pushCsvRow(lines, 'No data', '', '', 0, 0, 0);
  } else {
    bookingsByResource.forEach((row) => {
      pushCsvRow(
        lines,
        row.resourceType,
        row.resourceId,
        row.resourceName || '',
        row.totalBookings,
        row.pencilCount,
        row.firmCount
      );
    });
  }

  return lines.join('\n');
}

async function getBookingsByResource(where) {
  const rows = await BookingAnalyticsEvent.findAll({
    where: {
      ...where,
      eventType: 'booking.created',
      bookingId: { [Sequelize.Op.ne]: null },
      resourceType: { [Sequelize.Op.in]: ['equipment', 'room'] },
      resourceId: { [Sequelize.Op.ne]: null },
    },
    attributes: [
      'resourceType',
      'resourceId',
      [Sequelize.fn('COUNT', Sequelize.fn('DISTINCT', Sequelize.col('bookingId'))), 'totalBookings'],
      [
        Sequelize.fn(
          'COUNT',
          Sequelize.literal(`DISTINCT CASE WHEN "bookingType" = 'pencil' THEN "bookingId" ELSE NULL END`)
        ),
        'pencilCount',
      ],
      [
        Sequelize.fn(
          'COUNT',
          Sequelize.literal(`DISTINCT CASE WHEN "bookingType" = 'firm' THEN "bookingId" ELSE NULL END`)
        ),
        'firmCount',
      ],
    ],
    group: ['resourceType', 'resourceId'],
    order: [[Sequelize.literal('"totalBookings"'), 'DESC'], ['resourceType', 'ASC'], ['resourceId', 'ASC']],
    raw: true,
  });

  const equipmentIds = rows
    .filter((row) => row.resourceType === 'equipment')
    .map((row) => Number(row.resourceId))
    .filter(Number.isFinite);
  const roomIds = rows
    .filter((row) => row.resourceType === 'room')
    .map((row) => Number(row.resourceId))
    .filter(Number.isFinite);

  const [equipmentRows, roomRows] = await Promise.all([
    equipmentIds.length
      ? Equipment.findAll({ where: { id: equipmentIds }, attributes: ['id', 'name'], raw: true })
      : [],
    roomIds.length ? Room.findAll({ where: { id: roomIds }, attributes: ['id', 'name'], raw: true }) : [],
  ]);
  const equipmentNameMap = new Map(equipmentRows.map((item) => [Number(item.id), item.name]));
  const roomNameMap = new Map(roomRows.map((item) => [Number(item.id), item.name]));

  return rows.map((row) => {
    const resourceId = Number(row.resourceId);
    const resourceName =
      row.resourceType === 'equipment'
        ? equipmentNameMap.get(resourceId)
        : roomNameMap.get(resourceId);
    return {
      resourceType: row.resourceType,
      resourceId,
      resourceName: resourceName || '',
      totalBookings: Number(row.totalBookings) || 0,
      pencilCount: Number(row.pencilCount) || 0,
      firmCount: Number(row.firmCount) || 0,
    };
  });
}

const getAnalytics = async (req, res) => {
  try {
    const parsedFilters = parseAnalyticsRangeFilters(req.query);
    if (parsedFilters.error) {
      return res.status(400).json({ error: parsedFilters.error });
    }
    const { where } = parsedFilters;

    const [
      totalEvents,
      countsByEventType,
      countsByResourceType,
      countsByBookingType,
      countsByStatus,
      recentEvents,
      bookingsByResource,
    ] = await Promise.all([
      BookingAnalyticsEvent.count({ where }),
      countByWithWhere('eventType', where),
      countByWithWhere('resourceType', where),
      countByWithWhere('bookingType', where),
      countByWithWhere('status', where),
      BookingAnalyticsEvent.findAll({
        where,
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
      getBookingsByResource(where),
    ]);

    res.json({
      totalEvents,
      countsByEventType,
      countsByResourceType,
      countsByBookingType,
      countsByStatus,
      recentEvents,
      bookingsByResource,
      filters: {
        range: parsedFilters.appliedRange,
        startDate: parsedFilters.appliedStartDate,
        endDate: parsedFilters.appliedEndDate,
      },
    });
  } catch (err) {
    console.error('Error fetching analytics:', err);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
};

const exportAnalyticsCsv = async (req, res) => {
  try {
    const parsedFilters = parseAnalyticsRangeFilters(req.query);
    if (parsedFilters.error) {
      return res.status(400).json({ error: parsedFilters.error });
    }
    const { where } = parsedFilters;
    const [
      totalEvents,
      countsByEventType,
      countsByResourceType,
      countsByBookingType,
      countsByStatus,
      bookingsByResource,
    ] = await Promise.all([
      BookingAnalyticsEvent.count({ where }),
      countByWithWhere('eventType', where),
      countByWithWhere('resourceType', where),
      countByWithWhere('bookingType', where),
      countByWithWhere('status', where),
      getBookingsByResource(where),
    ]);

    const now = new Date();
    const fileDate = now.toISOString().slice(0, 10);
    const fileTime = now.toTimeString().slice(0, 5).replace(':', '');
    const fileName = `analytics-report-${fileDate}-${fileTime}.csv`;
    const csv = renderAnalyticsCsv({
      generatedAt: now.toISOString(),
      adminEmail: req.user?.email || '',
      appliedRange: parsedFilters.appliedRange,
      appliedStartDate: parsedFilters.appliedStartDate,
      appliedEndDate: parsedFilters.appliedEndDate,
      totalEvents,
      countsByEventType,
      countsByStatus,
      countsByResourceType,
      countsByBookingType,
      bookingsByResource,
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.status(200).send(csv);
  } catch (err) {
    console.error('Error exporting analytics CSV:', err);
    res.status(500).json({ error: 'Failed to export analytics CSV' });
  }
};

module.exports = {
  listUsers,
  updateUserRole,
  deleteUser,
  listAuditLogs,
  getAnalytics,
  exportAnalyticsCsv,
};
