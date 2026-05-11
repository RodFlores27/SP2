/**
 * Seed one shared Admin showcase dataset for Analytics + Audit Trail.
 * - Shared across all admins (no per-admin duplication)
 * - Idempotent via deterministic eventIds + purpose markers
 * - Human-like purpose/remarks/details
 */
const path = require('path');
const { Op } = require('sequelize');

const resolvedEnv =
  process.env.NODE_ENV ||
  (process.env.ALLOW_MVP_DEMO_RESET === '1' ? 'production' : 'development');
const envFile = resolvedEnv === 'production' ? '.env.production' : '.env';
require('dotenv').config({ path: envFile });
require('dotenv').config();

const db = require(path.join(__dirname, '..', 'models'));
const kafkaConfig = require('../config/kafka');

const MARKER = '[Admin Showcase]';
const TOPIC = kafkaConfig.topics?.bookingEvents || 'booking-events';

function addDays(base, days) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function setTime(base, hours, minutes = 0) {
  const d = new Date(base);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

function normalizeReferencePart(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function normalizeRoomCode(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '');
}

function normalizeEquipmentCode(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

function acronymFallback(value, fallback) {
  const cleaned = String(value || '').trim();
  if (!cleaned) return fallback;
  const initials = cleaned.split(/\s+/).map((part) => part[0]).join('');
  return normalizeReferencePart(initials || cleaned).slice(0, 6) || fallback;
}

function resolveResourceCodeParts(resourceType, resource) {
  const groupFallbackSource = resourceType === 'equipment' ? resource.category : resource.location;
  const codeGroup =
    normalizeReferencePart(resource.codeGroup) ||
    acronymFallback(groupFallbackSource, resourceType === 'equipment' ? 'EQP' : 'ROOM');
  const resourceCode =
    resourceType === 'room'
      ? normalizeRoomCode(resource.resourceCode) || acronymFallback(resource.name, 'ROOM')
      : normalizeEquipmentCode(resource.resourceCode) || acronymFallback(resource.name, 'EQUIP');

  return { codeGroup, resourceCode };
}

async function generateBookingReferenceCode({ BookingReferenceSequence, resourceType, resource, createdAt, transaction }) {
  const { codeGroup, resourceCode } = resolveResourceCodeParts(resourceType, resource);
  const year = new Date(createdAt).getFullYear();
  const shortYear = String(year).slice(-2);
  const where = {
    resourceType,
    codeGroup: resourceType === 'room' ? 'ROOM' : codeGroup,
    resourceCode,
    year,
  };

  const [sequence] = await BookingReferenceSequence.findOrCreate({
    where,
    defaults: { ...where, lastNumber: 0 },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  await sequence.reload({ transaction, lock: transaction.LOCK.UPDATE });
  sequence.lastNumber += 1;
  await sequence.save({ transaction });
  const sequenceText = String(sequence.lastNumber).padStart(3, '0');
  if (resourceType === 'room') return `${resourceCode}-${sequenceText}-${shortYear}`;
  return `${codeGroup}-${resourceCode}-${sequenceText}-${shortYear}`;
}

async function createBookingIfMissing({
  Booking,
  BookingReferenceSequence,
  transaction,
  resource,
  userId,
  status,
  bookingType,
  purpose,
  startTime,
  endTime,
  extras = {},
}) {
  const existing = await Booking.findOne({
    where: { purpose },
    transaction,
  });
  if (existing) return existing;

  const createdAt = new Date();
  const referenceCode = await generateBookingReferenceCode({
    BookingReferenceSequence,
    resourceType: resource.type,
    resource: resource.row,
    createdAt,
    transaction,
  });

  const row = await Booking.create({
    userId,
    resourceType: resource.type,
    resourceId: resource.id,
    bookingType,
    bookingThreadId: 0,
    status,
    startTime,
    endTime,
    purpose,
    referenceCode,
    equipmentRequestType: resource.type === 'equipment' ? (extras.equipmentRequestType || 'in_house') : null,
    loanReason: resource.type === 'equipment' ? (extras.loanReason || null) : null,
    loanWorkflowNote: resource.type === 'equipment' ? (extras.loanWorkflowNote || null) : null,
    loanTransportPlan: resource.type === 'equipment' ? (extras.loanTransportPlan || null) : null,
    roomParticipantCount: resource.type === 'room' ? (extras.roomParticipantCount ?? 10) : null,
    roomEquipmentNeeds: resource.type === 'room' ? (extras.roomEquipmentNeeds || 'Projector and whiteboard') : null,
    roomSetupRequirements: resource.type === 'room' ? (extras.roomSetupRequirements || 'Classroom setup') : null,
    roomProgramDetails: resource.type === 'room' ? (extras.roomProgramDetails || 'Program details prepared') : null,
    authorizationDocUrl: bookingType === 'firm' ? 'https://res.cloudinary.com/demo/sample.pdf' : null,
    approvedByUserId: status === 'approved' ? extras.approvedByUserId || null : null,
    approvedAt: status === 'approved' ? new Date() : null,
    deniedByUserId: status === 'denied' ? extras.deniedByUserId || null : null,
    staffRemark: extras.staffRemark || null,
    cancellationReason: extras.cancellationReason || null,
    probableRebookDate: extras.probableRebookDate || null,
    contentionRole: extras.contentionRole || null,
    contentionDeadlineAt: extras.contentionDeadlineAt || null,
    challengingBookingId: extras.challengingBookingId || null,
  }, { transaction });

  row.bookingThreadId = row.id;
  await row.save({ transaction });
  return row;
}

async function createAuditIfMissing(AuditLog, row) {
  const exists = await AuditLog.findOne({ where: { eventId: row.eventId } });
  if (exists) return false;
  await AuditLog.create(row);
  return true;
}

async function createAnalyticsIfMissing(BookingAnalyticsEvent, row) {
  const exists = await BookingAnalyticsEvent.findOne({ where: { eventId: row.eventId } });
  if (exists) return false;
  await BookingAnalyticsEvent.create(row);
  return true;
}

(async () => {
  const {
    sequelize,
    User,
    Equipment,
    Room,
    Booking,
    BookingReferenceSequence,
    AuditLog,
    BookingAnalyticsEvent,
  } = db;

  try {
    await sequelize.authenticate();
    const now = new Date();

    const [admin, staff] = await Promise.all([
      User.findOne({ where: { accountType: 'system_admin' }, order: [['id', 'ASC']] }),
      User.findOne({ where: { accountType: 'ptcf_staff' }, order: [['id', 'ASC']] }),
    ]);
    const requester = await User.findOne({
      where: {
        accountType: 'regular_user',
        email: { [Op.ne]: 'student@uplb.edu.ph' },
      },
      order: [['id', 'ASC']],
    });
    if (!admin || !staff || !requester) {
      throw new Error('Need at least one admin, one staff, and one regular user before admin showcase seed.');
    }

    const [equipmentRows, roomRows] = await Promise.all([
      Equipment.findAll({ where: { status: { [Op.in]: ['available', 'in-use'] } }, order: [['id', 'ASC']] }),
      Room.findAll({ where: { status: { [Op.in]: ['available', 'in-use'] } }, order: [['id', 'ASC']] }),
    ]);
    if (!equipmentRows.length || !roomRows.length) {
      throw new Error('Need at least one equipment and one room to seed admin showcase.');
    }

    const eq = { type: 'equipment', id: equipmentRows[0].id, row: equipmentRows[0] };
    const rm = { type: 'room', id: roomRows[0].id, row: roomRows[0] };

    const day = addDays(now, 22);
    let defender = null;
    let challenger = null;

    await sequelize.transaction(async (transaction) => {
      await createBookingIfMissing({
        Booking,
        BookingReferenceSequence,
        transaction,
        resource: eq,
        userId: requester.id,
        status: 'pending_approval',
        bookingType: 'firm',
        purpose: `${MARKER} Equipment booking pending review for media transfer practice`,
        startTime: setTime(day, 8, 0),
        endTime: setTime(day, 9, 30),
        extras: {
          equipmentRequestType: 'loan',
          loanReason: 'Need to borrow equipment for a short protocol demonstration in another room.',
          loanWorkflowNote: 'Requester will check calibration first and return unit after the run.',
          loanTransportPlan: 'Move using padded cart and signed checkout form.',
        },
      });

      await createBookingIfMissing({
        Booking,
        BookingReferenceSequence,
        transaction,
        resource: rm,
        userId: requester.id,
        status: 'approved',
        bookingType: 'firm',
        purpose: `${MARKER} Approved room reservation for orientation and safety walkthrough`,
        startTime: setTime(day, 10, 0),
        endTime: setTime(day, 11, 30),
        extras: {
          approvedByUserId: staff.id,
          roomParticipantCount: 14,
          roomEquipmentNeeds: 'Projector, extension cord, and marker set',
          roomSetupRequirements: 'U-shape seating with front demo table',
          roomProgramDetails: 'Intro session for new researchers and lab assistants.',
        },
      });

      await createBookingIfMissing({
        Booking,
        BookingReferenceSequence,
        transaction,
        resource: eq,
        userId: requester.id,
        status: 'denied',
        bookingType: 'firm',
        purpose: `${MARKER} Denied equipment request pending revised handling notes`,
        startTime: setTime(day, 12, 0),
        endTime: setTime(day, 13, 0),
        extras: {
          deniedByUserId: staff.id,
          staffRemark: 'Please provide clearer handling steps before approval.',
        },
      });

      await createBookingIfMissing({
        Booking,
        BookingReferenceSequence,
        transaction,
        resource: rm,
        userId: requester.id,
        status: 'cancelled',
        bookingType: 'firm',
        purpose: `${MARKER} Cancelled room reservation after schedule conflict`,
        startTime: setTime(day, 13, 30),
        endTime: setTime(day, 14, 30),
        extras: {
          cancellationReason: 'Requester moved meeting to another date.',
          probableRebookDate: setTime(addDays(day, 2), 10, 0),
        },
      });

      await createBookingIfMissing({
        Booking,
        BookingReferenceSequence,
        transaction,
        resource: eq,
        userId: requester.id,
        status: 'on_hold',
        bookingType: 'pencil',
        purpose: `${MARKER} On-hold pencil entry waiting on firm decision`,
        startTime: setTime(day, 15, 0),
        endTime: setTime(day, 16, 0),
      });

      defender = await createBookingIfMissing({
        Booking,
        BookingReferenceSequence,
        transaction,
        resource: eq,
        userId: requester.id,
        status: 'penciled',
        bookingType: 'pencil',
        purpose: `${MARKER} Defender pencil reservation under active contention`,
        startTime: setTime(day, 16, 30),
        endTime: setTime(day, 18, 0),
        extras: {
          contentionRole: 'defender',
          contentionDeadlineAt: setTime(day, 17, 30),
        },
      });

      challenger = await createBookingIfMissing({
        Booking,
        BookingReferenceSequence,
        transaction,
        resource: eq,
        userId: staff.id,
        status: 'penciled',
        bookingType: 'pencil',
        purpose: `${MARKER} Challenger pencil entry created for contention demo`,
        startTime: setTime(day, 17, 0),
        endTime: setTime(day, 17, 45),
        extras: {
          contentionRole: 'challenger',
          challengingBookingId: defender.id,
        },
      });
    });

    const auditRows = [
      {
        eventId: 'uat-admin-showcase-audit-booking-created',
        eventType: 'booking.created',
        occurredAt: setTime(addDays(now, -1), 9, 0),
        topic: TOPIC,
        partition: 0,
        offset: '1001',
        actorUserId: requester.id,
        bookingId: defender.id,
        resourceType: 'equipment',
        resourceId: eq.id,
        bookingType: 'pencil',
        status: 'penciled',
        payload: { note: 'Showcase created event for audit trail testing.' },
      },
      {
        eventId: 'uat-admin-showcase-audit-booking-converted',
        eventType: 'booking.converted_to_firm',
        occurredAt: setTime(addDays(now, -1), 9, 5),
        topic: TOPIC,
        partition: 0,
        offset: '1001b',
        actorUserId: requester.id,
        bookingId: defender.id,
        resourceType: 'equipment',
        resourceId: eq.id,
        bookingType: 'firm',
        status: 'pending_approval',
        payload: {
          requestType: 'equipment_inhouse',
          previousBookingType: 'pencil',
          previousStatus: 'penciled',
          note: 'Requester converted a penciled booking to firm after uploading requirements.',
        },
      },
      {
        eventId: 'uat-admin-showcase-audit-booking-approved',
        eventType: 'booking.approved',
        occurredAt: setTime(addDays(now, -1), 9, 8),
        topic: TOPIC,
        partition: 0,
        offset: '1001c',
        actorUserId: staff.id,
        bookingId: defender.id,
        resourceType: 'equipment',
        resourceId: eq.id,
        bookingType: 'firm',
        status: 'approved',
        payload: {
          requestType: 'equipment_loan',
          approvedByUserId: staff.id,
          note: 'Staff approved a complete request after checking submitted details.',
        },
      },
      {
        eventId: 'uat-admin-showcase-audit-contention-started',
        eventType: 'booking.contention_started',
        occurredAt: setTime(addDays(now, -1), 9, 10),
        topic: TOPIC,
        partition: 0,
        offset: '1002',
        actorUserId: staff.id,
        bookingId: challenger.id,
        resourceType: 'equipment',
        resourceId: eq.id,
        bookingType: 'pencil',
        status: 'penciled',
        payload: {
          defender: { bookingId: defender.id, email: requester.email },
          challenger: { bookingId: challenger.id, email: staff.email },
          note: 'Sample contention start for dashboard audit checks.',
        },
      },
      {
        eventId: 'uat-admin-showcase-audit-contention-resolved',
        eventType: 'booking.contention_resolved',
        occurredAt: setTime(addDays(now, -1), 9, 20),
        topic: TOPIC,
        partition: 0,
        offset: '1003',
        actorUserId: staff.id,
        bookingId: defender.id,
        resourceType: 'equipment',
        resourceId: eq.id,
        bookingType: 'pencil',
        status: 'displaced',
        payload: {
          resolutionReason: 'defender_missed_deadline',
          note: 'Sample contention resolution event.',
        },
      },
      {
        eventId: 'uat-admin-showcase-audit-booking-on-hold',
        eventType: 'booking.on_hold',
        occurredAt: setTime(addDays(now, -1), 9, 30),
        topic: TOPIC,
        partition: 0,
        offset: '1003b',
        actorUserId: staff.id,
        bookingId: challenger.id,
        resourceType: 'equipment',
        resourceId: eq.id,
        bookingType: 'pencil',
        status: 'on_hold',
        payload: {
          requestType: 'equipment_inhouse',
          causingBookingId: defender.id,
          causingReferenceCode: defender.referenceCode || null,
          source: 'booking.convert_to_firm',
          note: 'Penciled request moved to on-hold while a firm request is under review.',
        },
      },
      {
        eventId: 'uat-admin-showcase-audit-booking-on-hold-released',
        eventType: 'booking.on_hold_released',
        occurredAt: setTime(addDays(now, -1), 9, 40),
        topic: TOPIC,
        partition: 0,
        offset: '1003c',
        actorUserId: staff.id,
        bookingId: challenger.id,
        resourceType: 'equipment',
        resourceId: eq.id,
        bookingType: 'pencil',
        status: 'penciled',
        payload: {
          requestType: 'equipment_inhouse',
          causingBookingId: defender.id,
          causingReferenceCode: defender.referenceCode || null,
          releaseReason: 'firm_denied',
          note: 'On-hold booking was released after the blocking firm request was denied.',
        },
      },
      {
        eventId: 'uat-admin-showcase-audit-booking-displaced',
        eventType: 'booking.displaced',
        occurredAt: setTime(addDays(now, -1), 9, 50),
        topic: TOPIC,
        partition: 0,
        offset: '1003d',
        actorUserId: staff.id,
        bookingId: challenger.id,
        resourceType: 'equipment',
        resourceId: eq.id,
        bookingType: 'pencil',
        status: 'displaced',
        payload: {
          requestType: 'equipment_inhouse',
          displacingBookingId: defender.id,
          displacingReferenceCode: defender.referenceCode || null,
          displacementReason: 'firm_approved_overlap',
          note: 'Penciled slot was displaced because an overlapping firm request was approved.',
        },
      },
      {
        eventId: 'uat-admin-showcase-audit-booking-denied',
        eventType: 'booking.denied',
        occurredAt: setTime(addDays(now, -1), 9, 55),
        topic: TOPIC,
        partition: 0,
        offset: '1003e',
        actorUserId: staff.id,
        bookingId: defender.id,
        resourceType: 'equipment',
        resourceId: eq.id,
        bookingType: 'firm',
        status: 'denied',
        payload: {
          requestType: 'equipment_loan',
          note: 'Firm request was denied because supporting details were incomplete.',
        },
      },
      {
        eventId: 'uat-admin-showcase-audit-booking-cancelled',
        eventType: 'booking.cancelled',
        occurredAt: setTime(addDays(now, -1), 9, 58),
        topic: TOPIC,
        partition: 0,
        offset: '1003f',
        actorUserId: requester.id,
        bookingId: defender.id,
        resourceType: 'room',
        resourceId: rm.id,
        bookingType: 'firm',
        status: 'cancelled',
        payload: {
          requestType: 'room',
          cancellationReason: 'Requester had an unavoidable class conflict.',
          probableRebookDate: setTime(addDays(now, 3), 10, 0).toISOString(),
          note: 'Requester cancelled and indicated intent to rebook.',
        },
      },
      {
        eventId: 'uat-admin-showcase-audit-booking-expiring-soon',
        eventType: 'booking.expiring_soon',
        occurredAt: setTime(addDays(now, -1), 10, 5),
        topic: TOPIC,
        partition: 0,
        offset: '1003g',
        actorUserId: null,
        bookingId: challenger.id,
        resourceType: 'equipment',
        resourceId: eq.id,
        bookingType: 'pencil',
        status: 'penciled',
        payload: {
          requestType: 'equipment_inhouse',
          hoursLeft: 24,
          note: 'System reminder: penciled booking is approaching expiry.',
        },
      },
      {
        eventId: 'uat-admin-showcase-audit-booking-expired',
        eventType: 'booking.expired',
        occurredAt: setTime(addDays(now, -1), 10, 10),
        topic: TOPIC,
        partition: 0,
        offset: '1003h',
        actorUserId: null,
        bookingId: challenger.id,
        resourceType: 'equipment',
        resourceId: eq.id,
        bookingType: 'pencil',
        status: 'expired',
        payload: {
          requestType: 'equipment_inhouse',
          note: 'System marked this penciled booking as expired after the allowable window.',
        },
      },
      {
        eventId: 'uat-admin-showcase-audit-user-role',
        eventType: 'user.role_changed',
        occurredAt: setTime(addDays(now, -1), 10, 0),
        topic: 'app.audit',
        partition: null,
        offset: null,
        actorUserId: admin.id,
        bookingId: null,
        resourceType: null,
        resourceId: null,
        bookingType: null,
        status: 'ptcf_staff',
        payload: {
          targetUserId: requester.id,
          targetEmail: requester.email,
          previousAccountType: 'regular_user',
          newAccountType: 'ptcf_staff',
          note: 'Showcase role-change event for admin audit filters.',
        },
      },
      {
        eventId: 'uat-admin-showcase-audit-user-deleted',
        eventType: 'user.deleted',
        occurredAt: setTime(addDays(now, -1), 10, 8),
        topic: 'app.audit',
        partition: null,
        offset: null,
        actorUserId: admin.id,
        bookingId: null,
        resourceType: null,
        resourceId: null,
        bookingType: null,
        status: null,
        payload: {
          targetUserId: 999001,
          targetEmail: 'former.tester+archive@uplb.edu.ph',
          targetAccountType: 'regular_user',
          targetUserCategory: 'student',
          note: 'Demo-only deletion record for audit trail filter checks.',
        },
      },
      {
        eventId: 'uat-admin-showcase-audit-resource-equipment-created',
        eventType: 'resource.equipment_created',
        occurredAt: setTime(addDays(now, -1), 10, 12),
        topic: 'app.audit',
        partition: null,
        offset: null,
        actorUserId: staff.id,
        bookingId: null,
        resourceType: 'equipment',
        resourceId: eq.id,
        bookingType: null,
        status: null,
        payload: {
          current: {
            name: `${eq.row.name} (demo copy)`,
            category: eq.row.category || 'Laboratory Equipment',
            status: 'available',
            description: 'Added for UAT showcase demonstration.',
          },
          note: 'Showcase equipment-create event.',
        },
      },
      {
        eventId: 'uat-admin-showcase-audit-resource-update',
        eventType: 'resource.equipment_updated',
        occurredAt: setTime(addDays(now, -1), 10, 15),
        topic: 'app.audit',
        partition: null,
        offset: null,
        actorUserId: staff.id,
        bookingId: null,
        resourceType: 'equipment',
        resourceId: eq.id,
        bookingType: null,
        status: null,
        payload: {
          resourceName: eq.row.name,
          changes: { status: ['in-use', 'available'] },
          note: 'Showcase equipment update audit event.',
        },
      },
      {
        eventId: 'uat-admin-showcase-audit-resource-equipment-deleted',
        eventType: 'resource.equipment_deleted',
        occurredAt: setTime(addDays(now, -1), 10, 18),
        topic: 'app.audit',
        partition: null,
        offset: null,
        actorUserId: staff.id,
        bookingId: null,
        resourceType: 'equipment',
        resourceId: eq.id,
        bookingType: null,
        status: null,
        payload: {
          previous: {
            name: `${eq.row.name} (retired unit)`,
            status: 'in-use',
            description: 'Unit removed after lifecycle replacement.',
          },
          note: 'Showcase equipment-delete event.',
        },
      },
      {
        eventId: 'uat-admin-showcase-audit-resource-room-created',
        eventType: 'resource.room_created',
        occurredAt: setTime(addDays(now, -1), 10, 20),
        topic: 'app.audit',
        partition: null,
        offset: null,
        actorUserId: admin.id,
        bookingId: null,
        resourceType: 'room',
        resourceId: rm.id,
        bookingType: null,
        status: null,
        payload: {
          current: {
            name: `${rm.row.name} (orientation setup)`,
            location: rm.row.location || 'PTCF Main Building',
            capacity: rm.row.capacity || 12,
            status: 'available',
          },
          note: 'Showcase room-create event.',
        },
      },
      {
        eventId: 'uat-admin-showcase-audit-resource-room-updated',
        eventType: 'resource.room_updated',
        occurredAt: setTime(addDays(now, -1), 10, 23),
        topic: 'app.audit',
        partition: null,
        offset: null,
        actorUserId: admin.id,
        bookingId: null,
        resourceType: 'room',
        resourceId: rm.id,
        bookingType: null,
        status: null,
        payload: {
          previous: {
            name: rm.row.name,
            capacity: rm.row.capacity || 10,
            status: 'available',
          },
          current: {
            name: rm.row.name,
            capacity: (rm.row.capacity || 10) + 2,
            status: 'in-use',
          },
          note: 'Showcase room-update event.',
        },
      },
      {
        eventId: 'uat-admin-showcase-audit-resource-room-deleted',
        eventType: 'resource.room_deleted',
        occurredAt: setTime(addDays(now, -1), 10, 26),
        topic: 'app.audit',
        partition: null,
        offset: null,
        actorUserId: admin.id,
        bookingId: null,
        resourceType: 'room',
        resourceId: rm.id,
        bookingType: null,
        status: null,
        payload: {
          previous: {
            name: `${rm.row.name} (temporary overflow)`,
            location: rm.row.location || 'PTCF Main Building',
            capacity: rm.row.capacity || 10,
          },
          note: 'Showcase room-delete event.',
        },
      },
    ];

    const analyticsRows = [
      ['booking.created', 'equipment', 'pencil', 'penciled'],
      ['booking.converted_to_firm', 'equipment', 'firm', 'pending_approval'],
      ['booking.approved', 'room', 'firm', 'approved'],
      ['booking.denied', 'equipment', 'firm', 'denied'],
      ['booking.cancelled', 'room', 'firm', 'cancelled'],
      ['booking.expired', 'equipment', 'pencil', 'expired'],
      ['booking.on_hold', 'equipment', 'pencil', 'on_hold'],
      ['booking.on_hold_released', 'equipment', 'pencil', 'penciled'],
      ['booking.displaced', 'equipment', 'pencil', 'displaced'],
      ['booking.contention_started', 'equipment', 'pencil', 'penciled'],
      ['booking.contention_resolved', 'equipment', 'pencil', 'displaced'],
      ['booking.expiring_soon', 'equipment', 'pencil', 'penciled'],
    ].map((entry, idx) => ({
      eventId: `uat-admin-showcase-analytics-${idx + 1}`,
      eventType: entry[0],
      occurredAt: setTime(addDays(now, -1), 11, idx),
      topic: TOPIC,
      partition: 0,
      offset: String(2000 + idx),
      actorUserId: idx % 2 === 0 ? staff.id : admin.id,
      bookingId: defender.id,
      resourceType: entry[1],
      resourceId: entry[1] === 'equipment' ? eq.id : rm.id,
      bookingType: entry[2],
      status: entry[3],
    }));

    let auditCreated = 0;
    for (const row of auditRows) {
      const created = await createAuditIfMissing(AuditLog, row);
      if (created) auditCreated += 1;
    }

    let analyticsCreated = 0;
    for (const row of analyticsRows) {
      const created = await createAnalyticsIfMissing(BookingAnalyticsEvent, row);
      if (created) analyticsCreated += 1;
    }

    console.log(
      'Admin showcase seed complete. audit created: %d, analytics created: %d (shared dataset).',
      auditCreated,
      analyticsCreated
    );
  } catch (error) {
    console.error('Admin showcase seed failed:', error.message);
    process.exitCode = 1;
  } finally {
    await db.sequelize.close();
  }
})();
