/**
 * Seed UAT contention data:
 * 1) Global challenge targets owned by student@uplb.edu.ph
 * 2) Defender/challenger contention pairs per participant row (seed_defender=yes)
 *
 * CSV columns:
 *   email,role,user_category,seed_defender,seed_global_target
 *
 * Args:
 *   --csv <path>                  CSV path (default: server/docs/uat-respondents.csv)
 *   --mode <full|refresh>         default: full
 *   --global-target-count <n>     minimum active global targets (default: 24)
 *   --manifest-out <path>         CSV output (default: server/docs/uat-contention-manifest.csv)
 */
const path = require('path');
const fs = require('fs');
const { Op } = require('sequelize');

const resolvedEnv =
  process.env.NODE_ENV ||
  (process.env.ALLOW_MVP_DEMO_RESET === '1' ? 'production' : 'development');
const envFile = resolvedEnv === 'production' ? '.env.production' : '.env';
require('dotenv').config({ path: envFile });
require('dotenv').config();

const db = require(path.join(__dirname, '..', 'models'));
const { computeContentionDeadline, computePencilExpiryAt } = require('../utils/booking-rules');

const DEFAULT_CSV = path.resolve(__dirname, '..', 'docs', 'uat-respondents.csv');
const DEFAULT_MANIFEST_OUT = path.resolve(__dirname, '..', 'docs', 'uat-contention-manifest.csv');
const CHALLENGER_EMAIL = 'student@uplb.edu.ph';
const GLOBAL_PURPOSE_PREFIX = 'UAT:GLOBAL_TARGET:';
const GLOBAL_TARGET_MARKER = '[UAT Global Target]';
const CHALLENGER_PURPOSE_PREFIX = 'UAT:CHALLENGER:';
const APPROVED_FIRM_PURPOSE_PREFIX = 'UAT:APPROVED_FIRM:';
const STAFF_PENDING_A_PREFIX = 'UAT:STAFF:PENDING:A:';
const STAFF_PENDING_B_PREFIX = 'UAT:STAFF:PENDING:B:';
const STAFF_RESUB_SOURCE_PREFIX = 'UAT:STAFF:RESUB:SOURCE:';
const STAFF_RESUB_PENDING_PREFIX = 'UAT:STAFF:RESUB:PENDING:';
const STAFF_CONFLICT_DEF_PREFIX = 'UAT:STAFF:CONFLICT:DEF:';
const STAFF_CONFLICT_CHAL_PREFIX = 'UAT:STAFF:CONFLICT:CHAL:';
const STAFF_APPROVED_LOAN_PREFIX = 'UAT:STAFF:APPROVED:LOAN:';
const STAFF_APPROVED_ROOM_PREFIX = 'UAT:STAFF:APPROVED:ROOM:';
const STAFF_MY_APPROVED_PREFIX = 'UAT:STAFF:MYBOOKINGS:APPROVED:';
const ADMIN_PENDING_A_PREFIX = 'UAT:ADMIN:PENDING:A:';
const ADMIN_PENDING_B_PREFIX = 'UAT:ADMIN:PENDING:B:';
const ADMIN_RESUB_SOURCE_PREFIX = 'UAT:ADMIN:RESUB:SOURCE:';
const ADMIN_RESUB_PENDING_PREFIX = 'UAT:ADMIN:RESUB:PENDING:';
const ADMIN_CONFLICT_DEF_PREFIX = 'UAT:ADMIN:CONFLICT:DEF:';
const ADMIN_CONFLICT_CHAL_PREFIX = 'UAT:ADMIN:CONFLICT:CHAL:';
const ADMIN_APPROVED_LOAN_PREFIX = 'UAT:ADMIN:APPROVED:LOAN:';
const ADMIN_APPROVED_ROOM_PREFIX = 'UAT:ADMIN:APPROVED:ROOM:';

function argValue(flag, fallback = null) {
  const idx = process.argv.indexOf(flag);
  if (idx < 0 || idx + 1 >= process.argv.length) return fallback;
  return process.argv[idx + 1];
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function parseYesNo(value) {
  const v = String(value || '').trim().toLowerCase();
  return v === 'yes' || v === 'y' || v === 'true' || v === '1';
}

function displayNameFromEmail(email) {
  const local = String(email || '').split('@')[0] || 'Participant';
  const cleaned = local.replace(/[._-]+/g, ' ').trim();
  return cleaned
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ') || 'Participant';
}

function globalTargetPurpose(slotKey, index) {
  const themes = [
    'Equipment calibration session',
    'Room preparation block',
    'Tissue culture materials setup',
    'Short protocol run',
    'Lab workflow practice',
    'Sample handling dry run',
  ];
  const theme = themes[index % themes.length];
  return `${theme} (${slotKey}) ${GLOBAL_TARGET_MARKER}`;
}

function approvedFirmPurposeForRequester(email, index) {
  const name = displayNameFromEmail(email);
  const topics = [
    'Plant tissue culture briefing',
    'Microscope-assisted observation',
    'Culture media preparation demo',
    'Research planning consultation',
  ];
  return `${topics[index % topics.length]} for ${name}`;
}

function staffPurposeSet(email) {
  const name = displayNameFromEmail(email);
  return {
    pendingA: `Request for equipment use review (${name})`,
    pendingB: `Room reservation request pending staff decision (${name})`,
    resubSource: `Initial request requiring revision (${name})`,
    resubPending: `Revised request resubmitted for approval (${name})`,
    conflictDef: `Current penciled reservation under contention (${name})`,
    conflictCh: `Challenger reservation for active contention review (${name})`,
    approvedLoan: `Approved equipment loan request sample (${name})`,
    approvedRoom: `Approved room reservation sample (${name})`,
    myApproved: `Staff personal approved booking sample (${name})`,
    myChallenger: `Challenge entry linked to staff contention sample (${name})`,
  };
}

function adminDashboardPurposeSet(email) {
  const name = displayNameFromEmail(email);
  return {
    pendingA: `Pending equipment request for admin dashboard review (${name})`,
    pendingB: `Pending room request for admin dashboard review (${name})`,
    resubSource: `Denied request kept as resubmission source (${name})`,
    resubPending: `Resubmitted booking waiting for decision (${name})`,
    conflictDef: `Defender booking visible in admin conflict list (${name})`,
    conflictCh: `Challenger booking paired for admin conflict list (${name})`,
    approvedLoan: `Approved equipment loan visible to admin (${name})`,
    approvedRoom: `Approved room reservation visible to admin (${name})`,
  };
}

function parseCsvLine(line) {
  const cells = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      cells.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  cells.push(current);
  return cells.map((cell) => String(cell || '').trim());
}

function parseCsv(content) {
  return String(content || '')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() !== '')
    .map(parseCsvLine);
}

function csvCell(value) {
  const s = value == null ? '' : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function writeCsv(filePath, rows) {
  const lines = rows.map((row) => row.map(csvCell).join(','));
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${lines.join('\n')}\n`, 'utf8');
}

function resolveCsvRows(csvPath) {
  if (!fs.existsSync(csvPath)) throw new Error(`CSV file not found: ${csvPath}`);
  const rows = parseCsv(fs.readFileSync(csvPath, 'utf8'));
  if (!rows.length) throw new Error('CSV is empty.');
  const header = rows[0].map((h) => h.toLowerCase());
  const idx = {
    email: header.indexOf('email'),
    role: header.indexOf('role'),
    seedDefender: header.indexOf('seed_defender'),
    seedGlobalTarget: header.indexOf('seed_global_target'),
  };
  if (Object.values(idx).some((v) => v < 0)) {
    throw new Error('CSV must include email, role, seed_defender, seed_global_target.');
  }

  return rows.slice(1).map((row) => ({
    email: normalizeEmail(row[idx.email]),
    role: String(row[idx.role] || '').trim().toLowerCase(),
    seedDefender: parseYesNo(row[idx.seedDefender]),
    seedGlobalTarget: parseYesNo(row[idx.seedGlobalTarget]),
  }));
}

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

async function createPencilBooking({
  Booking,
  BookingReferenceSequence,
  transaction,
  userId,
  resourceType,
  resourceId,
  resourceRow,
  startTime,
  endTime,
  purpose,
  contentionRole = null,
  contentionDeadlineAt = null,
  challengingBookingId = null,
}) {
  const createdAt = new Date();
  const expiryAt = computePencilExpiryAt(createdAt, startTime);
  const referenceCode = await generateBookingReferenceCode({
    BookingReferenceSequence,
    resourceType,
    resource: resourceRow,
    createdAt,
    transaction,
  });

  const booking = await Booking.create({
    userId,
    resourceType,
    resourceId,
    bookingType: 'pencil',
    bookingThreadId: 0,
    status: 'penciled',
    startTime,
    endTime,
    purpose,
    referenceCode,
    equipmentRequestType: resourceType === 'equipment' ? 'in_house' : null,
    roomParticipantCount: resourceType === 'room' ? 6 : null,
    roomEquipmentNeeds: resourceType === 'room' ? 'Projector, markers' : null,
    roomSetupRequirements: resourceType === 'room' ? 'Standard classroom setup' : null,
    roomProgramDetails: resourceType === 'room' ? 'UAT seeded room booking' : null,
    expiryAt,
    contentionRole,
    contentionDeadlineAt,
    challengingBookingId,
  }, { transaction });

  booking.bookingThreadId = booking.id;
  await booking.save({ transaction });
  return booking;
}

async function createApprovedFirmBooking({
  Booking,
  BookingReferenceSequence,
  transaction,
  userId,
  approverUserId,
  resourceType,
  resourceId,
  resourceRow,
  startTime,
  endTime,
  purpose,
}) {
  const createdAt = new Date();
  const referenceCode = await generateBookingReferenceCode({
    BookingReferenceSequence,
    resourceType,
    resource: resourceRow,
    createdAt,
    transaction,
  });

  const booking = await Booking.create({
    userId,
    resourceType,
    resourceId,
    bookingType: 'firm',
    bookingThreadId: 0,
    status: 'approved',
    startTime,
    endTime,
    purpose,
    referenceCode,
    authorizationDocUrl: 'https://res.cloudinary.com/demo/sample.pdf',
    equipmentRequestType: resourceType === 'equipment' ? 'in_house' : null,
    roomParticipantCount: resourceType === 'room' ? 10 : null,
    roomEquipmentNeeds: resourceType === 'room' ? 'Projector, audio' : null,
    roomSetupRequirements: resourceType === 'room' ? 'UAT standard setup' : null,
    roomProgramDetails: resourceType === 'room' ? 'UAT predefined approved booking' : null,
    approvedByUserId: approverUserId || null,
    approvedAt: createdAt,
  }, { transaction });

  booking.bookingThreadId = booking.id;
  await booking.save({ transaction });
  return booking;
}

async function createFirmBooking({
  Booking,
  BookingReferenceSequence,
  transaction,
  userId,
  approverUserId = null,
  denierUserId = null,
  resourceType,
  resourceId,
  resourceRow,
  startTime,
  endTime,
  purpose,
  status = 'pending_approval',
  equipmentRequestType = null,
  loanReason = null,
  loanWorkflowNote = null,
  loanTransportPlan = null,
  roomParticipantCount = null,
  roomEquipmentNeeds = null,
  roomSetupRequirements = null,
  roomProgramDetails = null,
  rebookedFromBookingId = null,
  rebookedFromStatus = null,
  bookingThreadId = null,
  staffRemark = null,
}) {
  const createdAt = new Date();
  const referenceCode = await generateBookingReferenceCode({
    BookingReferenceSequence,
    resourceType,
    resource: resourceRow,
    createdAt,
    transaction,
  });

  const booking = await Booking.create({
    userId,
    resourceType,
    resourceId,
    bookingType: 'firm',
    bookingThreadId: bookingThreadId || 0,
    status,
    startTime,
    endTime,
    purpose,
    referenceCode,
    authorizationDocUrl: 'https://res.cloudinary.com/demo/sample.pdf',
    equipmentRequestType: resourceType === 'equipment' ? (equipmentRequestType || 'in_house') : null,
    loanReason: resourceType === 'equipment' ? loanReason : null,
    loanWorkflowNote: resourceType === 'equipment' ? loanWorkflowNote : null,
    loanTransportPlan: resourceType === 'equipment' ? loanTransportPlan : null,
    roomParticipantCount: resourceType === 'room' ? (roomParticipantCount ?? 10) : null,
    roomEquipmentNeeds: resourceType === 'room' ? (roomEquipmentNeeds || 'Projector, audio') : null,
    roomSetupRequirements: resourceType === 'room' ? (roomSetupRequirements || 'UAT standard setup') : null,
    roomProgramDetails: resourceType === 'room' ? (roomProgramDetails || 'UAT staff dashboard seed') : null,
    approvedByUserId: status === 'approved' ? approverUserId : null,
    approvedAt: status === 'approved' ? createdAt : null,
    deniedByUserId: status === 'denied' ? denierUserId : null,
    staffRemark: staffRemark || null,
    rebookedFromBookingId,
    rebookedFromStatus,
  }, { transaction });

  if (!bookingThreadId) {
    booking.bookingThreadId = booking.id;
    await booking.save({ transaction });
  }
  return booking;
}

function buildGlobalSlots(now) {
  const baseDay = addDays(now, 9);
  const slotTemplates = [
    [8, 0, 9, 30],
    [9, 30, 11, 0],
    [11, 0, 12, 30],
    [13, 0, 14, 30],
    [14, 30, 16, 0],
    [16, 0, 17, 30],
  ];

  const slots = [];
  for (let dayOffset = 0; dayOffset < 7; dayOffset += 1) {
    const day = addDays(baseDay, dayOffset);
    for (const [sh, sm, eh, em] of slotTemplates) {
      slots.push({
        slotKey: `${day.toISOString().slice(0, 10)}-${String(sh).padStart(2, '0')}${String(sm).padStart(2, '0')}`,
        startTime: setTime(day, sh, sm),
        endTime: setTime(day, eh, em),
      });
    }
  }
  return slots;
}

function isOverlapping(aStart, aEnd, bStart, bEnd) {
  return new Date(aStart).getTime() < new Date(bEnd).getTime() &&
    new Date(aEnd).getTime() > new Date(bStart).getTime();
}

(async () => {
  const csvPath = path.resolve(process.cwd(), argValue('--csv', DEFAULT_CSV));
  const mode = String(argValue('--mode', 'full')).trim().toLowerCase();
  const globalTargetCount = Math.max(0, parseInt(argValue('--global-target-count', '24'), 10) || 24);
  const manifestOut = path.resolve(process.cwd(), argValue('--manifest-out', DEFAULT_MANIFEST_OUT));

  if (!['full', 'refresh'].includes(mode)) {
    throw new Error('--mode must be "full" or "refresh".');
  }

  const {
    User,
    Equipment,
    Room,
    Booking,
    BookingReferenceSequence,
    sequelize,
  } = db;

  const manifestRows = [[
    'entry_type',
    'participant_email',
    'defender_reference',
    'challenger_reference',
    'resource_type',
    'resource_id',
    'resource_name',
    'start_time_iso',
    'end_time_iso',
    'purpose',
  ]];

  try {
    await sequelize.authenticate();
    const rows = resolveCsvRows(csvPath);
    const now = new Date();

    const challengerUser = await User.findOne({ where: { email: CHALLENGER_EMAIL } });
    if (!challengerUser) {
      throw new Error(`Challenger user not found: ${CHALLENGER_EMAIL}. Run account seed first.`);
    }

    const participants = rows.filter((r) => r.email && r.email !== CHALLENGER_EMAIL);
    const defenderParticipants = participants.filter((r) => r.seedDefender && r.role === 'regular_user');
    const regularParticipants = participants.filter((r) => r.role === 'regular_user');
    const staffParticipants = participants.filter((r) => r.role === 'ptcf_staff');
    const adminParticipants = participants.filter((r) => r.role === 'system_admin');
    const wantsGlobalTargets = rows.some((r) => r.seedGlobalTarget);
    const approverUser = await User.findOne({
      where: { accountType: { [Op.in]: ['ptcf_staff', 'system_admin'] } },
      order: [['id', 'ASC']],
    });

    const [equipmentRows, roomRows] = await Promise.all([
      Equipment.findAll({ where: { status: { [Op.in]: ['available', 'in-use'] } }, order: [['id', 'ASC']] }),
      Room.findAll({ where: { status: { [Op.in]: ['available', 'in-use'] } }, order: [['id', 'ASC']] }),
    ]);
    const resources = [
      ...equipmentRows.map((row) => ({ type: 'equipment', id: row.id, row })),
      ...roomRows.map((row) => ({ type: 'room', id: row.id, row })),
    ];
    if (!resources.length) throw new Error('No available/in-use resources found for seeding.');

    const summary = {
      globalCreated: 0,
      approvedFirmCreated: 0,
      approvedFirmExisting: 0,
      defenderPairsCreated: 0,
      defenderPairsExisting: 0,
      staffDashboardCreated: 0,
      staffDashboardExisting: 0,
      staffMyBookingsCreated: 0,
      staffMyBookingsExisting: 0,
      adminDashboardCreated: 0,
      adminDashboardExisting: 0,
      adminMyBookingsCreated: 0,
      adminMyBookingsExisting: 0,
      skippedMissingUsers: 0,
    };

    if (wantsGlobalTargets) {
      const existingGlobal = await Booking.findAll({
        where: {
          userId: challengerUser.id,
          bookingType: 'pencil',
          status: 'penciled',
          contentionRole: null,
          purpose: { [Op.like]: `%${GLOBAL_TARGET_MARKER}%` },
          startTime: { [Op.gt]: now },
        },
        order: [['startTime', 'ASC']],
      });
      const existingByPurpose = new Map(existingGlobal.map((b) => [b.purpose, b]));
      const slots = buildGlobalSlots(now);

      let createdNeeded = Math.max(0, globalTargetCount - existingGlobal.length);
      for (let i = 0; i < slots.length && createdNeeded > 0; i += 1) {
        const slot = slots[i];
        const legacyPurpose = `${GLOBAL_PURPOSE_PREFIX}${slot.slotKey}`;
        const purpose = globalTargetPurpose(slot.slotKey, i);
        if (existingByPurpose.has(legacyPurpose) || existingByPurpose.has(purpose)) continue;
        const resource = resources[i % resources.length];

        const created = await sequelize.transaction(async (transaction) =>
          createPencilBooking({
            Booking,
            BookingReferenceSequence,
            transaction,
            userId: challengerUser.id,
            resourceType: resource.type,
            resourceId: resource.id,
            resourceRow: resource.row,
            startTime: slot.startTime,
            endTime: slot.endTime,
            purpose,
          })
        );

        manifestRows.push([
          'global_target',
          '',
          '',
          created.referenceCode || '',
          resource.type,
          resource.id,
          resource.row?.name || '',
          created.startTime.toISOString(),
          created.endTime.toISOString(),
          created.purpose,
        ]);
        summary.globalCreated += 1;
        createdNeeded -= 1;
      }
    }

    for (let i = 0; i < regularParticipants.length; i += 1) {
      const participant = regularParticipants[i];
      const participantUser = await User.findOne({ where: { email: participant.email } });
      if (!participantUser) {
        summary.skippedMissingUsers += 1;
        continue;
      }

      const approvedPurpose = approvedFirmPurposeForRequester(participant.email, i);
      const legacyApprovedPurpose = `${APPROVED_FIRM_PURPOSE_PREFIX}${participant.email}`;
      const participantDefenders = await Booking.findAll({
        where: {
          userId: participantUser.id,
          bookingType: 'pencil',
          status: 'penciled',
          contentionRole: 'defender',
          startTime: { [Op.gt]: now },
        },
        order: [['startTime', 'ASC']],
      });

      const existingApproved = await Booking.findOne({
        where: {
          userId: participantUser.id,
          purpose: {
            [Op.in]: [approvedPurpose, legacyApprovedPurpose],
          },
          bookingType: 'firm',
          status: 'approved',
          startTime: { [Op.gt]: now },
        },
      });
      if (existingApproved) {
        const overlapsDefender = participantDefenders.some((d) =>
          d.resourceType === existingApproved.resourceType &&
          d.resourceId === existingApproved.resourceId &&
          isOverlapping(existingApproved.startTime, existingApproved.endTime, d.startTime, d.endTime)
        );
        if (overlapsDefender) {
          const resource = resources[(i + 3) % resources.length];
          const safeDay = addDays(now, 30 + (i % 7));
          const safeStart = setTime(safeDay, 18, 0);
          const safeEnd = setTime(safeDay, 19, 30);
          await existingApproved.update({
            resourceType: resource.type,
            resourceId: resource.id,
            startTime: safeStart,
            endTime: safeEnd,
            purpose: approvedPurpose,
          });
        } else if (existingApproved.purpose !== approvedPurpose) {
          await existingApproved.update({ purpose: approvedPurpose });
        }
        summary.approvedFirmExisting += 1;
        manifestRows.push([
          'approved_firm_existing',
          participant.email,
          existingApproved.referenceCode || '',
          '',
          existingApproved.resourceType,
          existingApproved.resourceId,
          '',
          new Date(existingApproved.startTime).toISOString(),
          new Date(existingApproved.endTime).toISOString(),
          approvedPurpose,
        ]);
        continue;
      }

      const resource = resources[(i + 1) % resources.length];
      // Keep approved-firm showcases in a dedicated far-future lane so they
      // cannot block defender conversion scenarios.
      const day = addDays(now, 30 + (i % 7));
      const baseHour = 18; // 18:00 - 19:30
      const firmStart = setTime(day, baseHour, 0);
      const firmEnd = setTime(day, baseHour + 1, 30);

      const approvedBooking = await sequelize.transaction(async (transaction) =>
        createApprovedFirmBooking({
          Booking,
          BookingReferenceSequence,
          transaction,
          userId: participantUser.id,
          approverUserId: approverUser?.id || null,
          resourceType: resource.type,
          resourceId: resource.id,
          resourceRow: resource.row,
          startTime: firmStart,
          endTime: firmEnd,
          purpose: approvedPurpose,
        })
      );

      summary.approvedFirmCreated += 1;
      manifestRows.push([
        'approved_firm_created',
        participant.email,
        approvedBooking.referenceCode || '',
        '',
        resource.type,
        resource.id,
        resource.row?.name || '',
        approvedBooking.startTime.toISOString(),
        approvedBooking.endTime.toISOString(),
        approvedPurpose,
      ]);
    }

    const regularUserRows = await User.findAll({
      where: { accountType: 'regular_user' },
      order: [['id', 'ASC']],
    });
    const requesterPool = regularUserRows.filter((u) => u.email !== CHALLENGER_EMAIL);
    const requesterFor = (index) =>
      requesterPool[index % Math.max(requesterPool.length, 1)] || challengerUser;

    for (let i = 0; i < staffParticipants.length; i += 1) {
      const participant = staffParticipants[i];
      const staffUser = await User.findOne({ where: { email: participant.email } });
      if (!staffUser) {
        summary.skippedMissingUsers += 1;
        continue;
      }

      const resourceEqA = resources[(i + 2) % resources.length];
      const resourceEqB = resources[(i + 3) % resources.length];
      const resourceRoom = resources.find((r) => r.type === 'room') || resources[(i + 4) % resources.length];
      const resourceConflict = resources[(i + 5) % resources.length];
      const requesterA = requesterFor(i * 2);
      const requesterB = requesterFor(i * 2 + 1);
      const requesterC = requesterFor(i * 2 + 2);

      const day = addDays(now, 45 + (i % 7));
      const pendingAStart = setTime(day, 8, 0);
      const pendingAEnd = setTime(day, 9, 30);
      const pendingBStart = setTime(day, 10, 0);
      const pendingBEnd = setTime(day, 11, 30);
      const approvedLoanStart = setTime(day, 13, 0);
      const approvedLoanEnd = setTime(day, 14, 30);
      const approvedRoomStart = setTime(day, 15, 0);
      const approvedRoomEnd = setTime(day, 16, 30);
      const conflictDefStart = setTime(day, 17, 0);
      const conflictDefEnd = setTime(day, 19, 0);
      const conflictChStart = setTime(day, 17, 30);
      const conflictChEnd = setTime(day, 18, 30);
      const myApprovedStart = setTime(day, 20, 0);
      const myApprovedEnd = setTime(day, 21, 0);
      const resubSourceStart = setTime(addDays(day, -1), 9, 0);
      const resubSourceEnd = setTime(addDays(day, -1), 10, 0);
      const resubPendingStart = setTime(day, 11, 45);
      const resubPendingEnd = setTime(day, 12, 45);

      const friendly = staffPurposeSet(participant.email);
      const pendingAPurpose = friendly.pendingA;
      const pendingBPurpose = friendly.pendingB;
      const resubSourcePurpose = friendly.resubSource;
      const resubPendingPurpose = friendly.resubPending;
      const conflictDefPurpose = friendly.conflictDef;
      const conflictChPurpose = friendly.conflictCh;
      const approvedLoanPurpose = friendly.approvedLoan;
      const approvedRoomPurpose = friendly.approvedRoom;
      const myApprovedPurpose = friendly.myApproved;
      const myChallengerPurpose = friendly.myChallenger;
      const legacyPurposes = [
        `${STAFF_PENDING_A_PREFIX}${participant.email}`,
        `${STAFF_PENDING_B_PREFIX}${participant.email}`,
        `${STAFF_RESUB_SOURCE_PREFIX}${participant.email}`,
        `${STAFF_RESUB_PENDING_PREFIX}${participant.email}`,
        `${STAFF_CONFLICT_DEF_PREFIX}${participant.email}`,
        `${STAFF_CONFLICT_CHAL_PREFIX}${participant.email}`,
        `${STAFF_APPROVED_LOAN_PREFIX}${participant.email}`,
        `${STAFF_APPROVED_ROOM_PREFIX}${participant.email}`,
        `${STAFF_MY_APPROVED_PREFIX}${participant.email}`,
        `${CHALLENGER_PURPOSE_PREFIX}${participant.email}:staff`,
      ];

      const existingStaffSet = await Booking.findAll({
        where: {
          purpose: { [Op.in]: [pendingAPurpose,pendingBPurpose,resubSourcePurpose,resubPendingPurpose,conflictDefPurpose,conflictChPurpose,approvedLoanPurpose,approvedRoomPurpose, ...legacyPurposes] },
          startTime: { [Op.gt]: now },
        },
      });
      for (const row of existingStaffSet) {
        let nextPurpose = null;
        if (String(row.purpose || '').startsWith(STAFF_PENDING_A_PREFIX)) nextPurpose = pendingAPurpose;
        else if (String(row.purpose || '').startsWith(STAFF_PENDING_B_PREFIX)) nextPurpose = pendingBPurpose;
        else if (String(row.purpose || '').startsWith(STAFF_RESUB_SOURCE_PREFIX)) nextPurpose = resubSourcePurpose;
        else if (String(row.purpose || '').startsWith(STAFF_RESUB_PENDING_PREFIX)) nextPurpose = resubPendingPurpose;
        else if (String(row.purpose || '').startsWith(STAFF_CONFLICT_DEF_PREFIX)) nextPurpose = conflictDefPurpose;
        else if (String(row.purpose || '').startsWith(STAFF_CONFLICT_CHAL_PREFIX)) nextPurpose = conflictChPurpose;
        else if (String(row.purpose || '').startsWith(STAFF_APPROVED_LOAN_PREFIX)) nextPurpose = approvedLoanPurpose;
        else if (String(row.purpose || '').startsWith(STAFF_APPROVED_ROOM_PREFIX)) nextPurpose = approvedRoomPurpose;
        if (nextPurpose && row.purpose !== nextPurpose) {
          await row.update({ purpose: nextPurpose });
        }
      }
      const existingStaffPurposes = new Set(existingStaffSet.map((b) => b.purpose));

      const existingMyApproved = await Booking.findOne({
        where: {
          userId: staffUser.id,
          purpose: { [Op.in]: [myApprovedPurpose, `${STAFF_MY_APPROVED_PREFIX}${participant.email}`] },
          bookingType: 'firm',
          status: 'approved',
          startTime: { [Op.gt]: now },
        },
      });
      if (existingMyApproved && String(existingMyApproved.purpose || '').startsWith(STAFF_MY_APPROVED_PREFIX)) {
        await existingMyApproved.update({ purpose: myApprovedPurpose });
      }
      const existingMyDefender = await Booking.findOne({
        where: {
          userId: staffUser.id,
          bookingType: 'pencil',
          status: 'penciled',
          contentionRole: 'defender',
          purpose: null,
          startTime: { [Op.gt]: now },
        },
        order: [['startTime', 'ASC']],
      });
      const existingMyChallenger = existingMyDefender
        ? await Booking.findOne({
            where: {
              userId: challengerUser.id,
              purpose: { [Op.in]: [myChallengerPurpose, `${CHALLENGER_PURPOSE_PREFIX}${participant.email}:staff`] },
              bookingType: 'pencil',
              status: 'penciled',
              contentionRole: 'challenger',
              challengingBookingId: existingMyDefender.id,
              startTime: { [Op.gt]: now },
            },
          })
        : null;
      if (existingMyChallenger && String(existingMyChallenger.purpose || '').startsWith(CHALLENGER_PURPOSE_PREFIX)) {
        await existingMyChallenger.update({ purpose: myChallengerPurpose });
      }

      const needsStaffDashboardSet = [
        pendingAPurpose,
        pendingBPurpose,
        resubSourcePurpose,
        resubPendingPurpose,
        conflictDefPurpose,
        conflictChPurpose,
        approvedLoanPurpose,
        approvedRoomPurpose,
      ].some((p) => !existingStaffPurposes.has(p));

      if (needsStaffDashboardSet) {
        await sequelize.transaction(async (transaction) => {
          if (!existingStaffPurposes.has(pendingAPurpose)) {
            await createFirmBooking({
              Booking,
              BookingReferenceSequence,
              transaction,
              userId: requesterA.id,
              resourceType: resourceEqA.type,
              resourceId: resourceEqA.id,
              resourceRow: resourceEqA.row,
              startTime: pendingAStart,
              endTime: pendingAEnd,
              purpose: pendingAPurpose,
              status: 'pending_approval',
            });
          }

          if (!existingStaffPurposes.has(pendingBPurpose)) {
            await createFirmBooking({
              Booking,
              BookingReferenceSequence,
              transaction,
              userId: requesterB.id,
              resourceType: resourceEqB.type,
              resourceId: resourceEqB.id,
              resourceRow: resourceEqB.row,
              startTime: pendingBStart,
              endTime: pendingBEnd,
              purpose: pendingBPurpose,
              status: 'pending_approval',
            });
          }

          let sourceDeniedBooking = await Booking.findOne({
            where: { purpose: resubSourcePurpose },
            transaction,
          });
          if (!sourceDeniedBooking && !existingStaffPurposes.has(resubSourcePurpose)) {
            sourceDeniedBooking = await createFirmBooking({
              Booking,
              BookingReferenceSequence,
              transaction,
              userId: requesterC.id,
              denierUserId: staffUser.id,
              resourceType: resourceEqA.type,
              resourceId: resourceEqA.id,
              resourceRow: resourceEqA.row,
              startTime: resubSourceStart,
              endTime: resubSourceEnd,
              purpose: resubSourcePurpose,
              status: 'denied',
              staffRemark: 'UAT seeded denial source for resubmission testing.',
            });
          }

          if (!existingStaffPurposes.has(resubPendingPurpose)) {
            await createFirmBooking({
              Booking,
              BookingReferenceSequence,
              transaction,
              userId: requesterC.id,
              resourceType: resourceEqA.type,
              resourceId: resourceEqA.id,
              resourceRow: resourceEqA.row,
              startTime: resubPendingStart,
              endTime: resubPendingEnd,
              purpose: resubPendingPurpose,
              status: 'pending_approval',
              rebookedFromBookingId: sourceDeniedBooking?.id || null,
              rebookedFromStatus: 'denied',
              bookingThreadId: sourceDeniedBooking?.id || null,
            });
          }

          if (!existingStaffPurposes.has(conflictDefPurpose)) {
            const defCreatedAt = new Date();
            const defExpiry = computePencilExpiryAt(defCreatedAt, conflictDefStart);
            const defDeadline = computeContentionDeadline(defCreatedAt, conflictDefStart, defExpiry);
            const defender = await createPencilBooking({
              Booking,
              BookingReferenceSequence,
              transaction,
              userId: requesterA.id,
              resourceType: resourceConflict.type,
              resourceId: resourceConflict.id,
              resourceRow: resourceConflict.row,
              startTime: conflictDefStart,
              endTime: conflictDefEnd,
              purpose: conflictDefPurpose,
              contentionRole: 'defender',
              contentionDeadlineAt: defDeadline,
            });
            if (!existingStaffPurposes.has(conflictChPurpose)) {
              await createPencilBooking({
                Booking,
                BookingReferenceSequence,
                transaction,
                userId: challengerUser.id,
                resourceType: resourceConflict.type,
                resourceId: resourceConflict.id,
                resourceRow: resourceConflict.row,
                startTime: conflictChStart,
                endTime: conflictChEnd,
                purpose: conflictChPurpose,
                contentionRole: 'challenger',
                challengingBookingId: defender.id,
              });
            }
          }

          if (!existingStaffPurposes.has(approvedLoanPurpose)) {
            await createFirmBooking({
              Booking,
              BookingReferenceSequence,
              transaction,
              userId: requesterA.id,
              approverUserId: staffUser.id,
              resourceType: 'equipment',
              resourceId: (resources.find((r) => r.type === 'equipment') || resourceEqA).id,
              resourceRow: (resources.find((r) => r.type === 'equipment') || resourceEqA).row,
              startTime: approvedLoanStart,
              endTime: approvedLoanEnd,
              purpose: approvedLoanPurpose,
              status: 'approved',
              equipmentRequestType: 'loan',
              loanReason: 'UAT loan approved seed',
              loanWorkflowNote: 'UAT workflow note',
              loanTransportPlan: 'UAT transport plan',
            });
          }

          if (!existingStaffPurposes.has(approvedRoomPurpose)) {
            const roomResource = resources.find((r) => r.type === 'room') || resourceRoom;
            await createFirmBooking({
              Booking,
              BookingReferenceSequence,
              transaction,
              userId: requesterB.id,
              approverUserId: staffUser.id,
              resourceType: 'room',
              resourceId: roomResource.id,
              resourceRow: roomResource.row,
              startTime: approvedRoomStart,
              endTime: approvedRoomEnd,
              purpose: approvedRoomPurpose,
              status: 'approved',
              roomParticipantCount: 12,
              roomEquipmentNeeds: 'Projector and microphones',
              roomSetupRequirements: 'U-shape seats',
              roomProgramDetails: 'UAT approved room listing',
            });
          }
        });
        summary.adminDashboardCreated += 1;
      } else {
        summary.adminDashboardExisting += 1;
      }

      if (!existingMyApproved || !(existingMyDefender && existingMyChallenger)) {
        await sequelize.transaction(async (transaction) => {
          if (!existingMyApproved) {
            const roomResource = resources.find((r) => r.type === 'room') || resourceRoom;
            await createFirmBooking({
              Booking,
              BookingReferenceSequence,
              transaction,
              userId: staffUser.id,
              approverUserId: approverUser?.id || staffUser.id,
              resourceType: 'room',
              resourceId: roomResource.id,
              resourceRow: roomResource.row,
              startTime: myApprovedStart,
              endTime: myApprovedEnd,
              purpose: myApprovedPurpose,
              status: 'approved',
            });
          }

          if (!(existingMyDefender && existingMyChallenger)) {
            const defCreatedAt = new Date();
            const myDefStart = setTime(day, 21, 0);
            const myDefEnd = setTime(day, 23, 0);
            const myChStart = setTime(day, 21, 30);
            const myChEnd = setTime(day, 22, 30);
            const defExpiry = computePencilExpiryAt(defCreatedAt, myDefStart);
            const defDeadline = computeContentionDeadline(defCreatedAt, myDefStart, defExpiry);
            const myDefender = existingMyDefender || await createPencilBooking({
              Booking,
              BookingReferenceSequence,
              transaction,
              userId: staffUser.id,
              resourceType: resourceConflict.type,
              resourceId: resourceConflict.id,
              resourceRow: resourceConflict.row,
              startTime: myDefStart,
              endTime: myDefEnd,
              purpose: null,
              contentionRole: 'defender',
              contentionDeadlineAt: defDeadline,
            });
            if (!existingMyChallenger) {
              await createPencilBooking({
                Booking,
                BookingReferenceSequence,
                transaction,
                userId: challengerUser.id,
                resourceType: resourceConflict.type,
                resourceId: resourceConflict.id,
                resourceRow: resourceConflict.row,
                startTime: myChStart,
                endTime: myChEnd,
                purpose: myChallengerPurpose,
                contentionRole: 'challenger',
                challengingBookingId: myDefender.id,
              });
            }
          }
        });
        summary.staffMyBookingsCreated += 1;
      } else {
        summary.staffMyBookingsExisting += 1;
      }

      manifestRows.push([
        'staff_dashboard_seeded',
        participant.email,
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        'pending x2, resubmission x1, active conflict x1, approved loan+room',
      ]);
      manifestRows.push([
        'staff_my_bookings_seeded',
        participant.email,
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        'staff owned approved firm + defender contention pair',
      ]);
    }

    for (let i = 0; i < adminParticipants.length; i += 1) {
      const participant = adminParticipants[i];
      const adminUser = await User.findOne({ where: { email: participant.email } });
      if (!adminUser) {
        summary.skippedMissingUsers += 1;
        continue;
      }

      const resourceConflict = resources[(i + 6) % resources.length];
      const resourceEqA = resources[(i + 2) % resources.length];
      const resourceEqB = resources[(i + 3) % resources.length];
      const resourceRoom = resources.find((r) => r.type === 'room') || resources[(i + 4) % resources.length];
      const roomResource = resources.find((r) => r.type === 'room') || resources[(i + 7) % resources.length];
      const requesterA = requesterFor(i * 3 + 20);
      const requesterB = requesterFor(i * 3 + 21);
      const requesterC = requesterFor(i * 3 + 22);
      const day = addDays(now, 46 + (i % 7));
      const adminDashPurpose = adminDashboardPurposeSet(participant.email);
      const pendingAPurpose = adminDashPurpose.pendingA;
      const pendingBPurpose = adminDashPurpose.pendingB;
      const resubSourcePurpose = adminDashPurpose.resubSource;
      const resubPendingPurpose = adminDashPurpose.resubPending;
      const conflictDefPurpose = adminDashPurpose.conflictDef;
      const conflictChPurpose = adminDashPurpose.conflictCh;
      const approvedLoanPurpose = adminDashPurpose.approvedLoan;
      const approvedRoomPurpose = adminDashPurpose.approvedRoom;
      const myApprovedPurpose = `Admin approved booking sample (${displayNameFromEmail(participant.email)})`;
      const myChallengerPurpose = `Challenge entry linked to admin contention sample (${displayNameFromEmail(participant.email)})`;
      const adminLegacyPurposes = [
        `${ADMIN_PENDING_A_PREFIX}${participant.email}`,
        `${ADMIN_PENDING_B_PREFIX}${participant.email}`,
        `${ADMIN_RESUB_SOURCE_PREFIX}${participant.email}`,
        `${ADMIN_RESUB_PENDING_PREFIX}${participant.email}`,
        `${ADMIN_CONFLICT_DEF_PREFIX}${participant.email}`,
        `${ADMIN_CONFLICT_CHAL_PREFIX}${participant.email}`,
        `${ADMIN_APPROVED_LOAN_PREFIX}${participant.email}`,
        `${ADMIN_APPROVED_ROOM_PREFIX}${participant.email}`,
      ];

      const pendingAStart = setTime(day, 8, 0);
      const pendingAEnd = setTime(day, 9, 30);
      const pendingBStart = setTime(day, 10, 0);
      const pendingBEnd = setTime(day, 11, 30);
      const approvedLoanStart = setTime(day, 13, 0);
      const approvedLoanEnd = setTime(day, 14, 30);
      const approvedRoomStart = setTime(day, 15, 0);
      const approvedRoomEnd = setTime(day, 16, 30);
      const conflictDefStart = setTime(day, 17, 0);
      const conflictDefEnd = setTime(day, 19, 0);
      const conflictChStart = setTime(day, 17, 30);
      const conflictChEnd = setTime(day, 18, 30);
      const resubSourceStart = setTime(addDays(day, -1), 9, 0);
      const resubSourceEnd = setTime(addDays(day, -1), 10, 0);
      const resubPendingStart = setTime(day, 11, 45);
      const resubPendingEnd = setTime(day, 12, 45);

      const existingAdminDashSet = await Booking.findAll({
        where: {
          purpose: {
            [Op.in]: [
              pendingAPurpose,
              pendingBPurpose,
              resubSourcePurpose,
              resubPendingPurpose,
              conflictDefPurpose,
              conflictChPurpose,
              approvedLoanPurpose,
              approvedRoomPurpose,
              ...adminLegacyPurposes,
            ],
          },
          startTime: { [Op.gt]: now },
        },
      });
      for (const row of existingAdminDashSet) {
        let nextPurpose = null;
        if (String(row.purpose || '').startsWith(ADMIN_PENDING_A_PREFIX)) nextPurpose = pendingAPurpose;
        else if (String(row.purpose || '').startsWith(ADMIN_PENDING_B_PREFIX)) nextPurpose = pendingBPurpose;
        else if (String(row.purpose || '').startsWith(ADMIN_RESUB_SOURCE_PREFIX)) nextPurpose = resubSourcePurpose;
        else if (String(row.purpose || '').startsWith(ADMIN_RESUB_PENDING_PREFIX)) nextPurpose = resubPendingPurpose;
        else if (String(row.purpose || '').startsWith(ADMIN_CONFLICT_DEF_PREFIX)) nextPurpose = conflictDefPurpose;
        else if (String(row.purpose || '').startsWith(ADMIN_CONFLICT_CHAL_PREFIX)) nextPurpose = conflictChPurpose;
        else if (String(row.purpose || '').startsWith(ADMIN_APPROVED_LOAN_PREFIX)) nextPurpose = approvedLoanPurpose;
        else if (String(row.purpose || '').startsWith(ADMIN_APPROVED_ROOM_PREFIX)) nextPurpose = approvedRoomPurpose;
        if (nextPurpose && row.purpose !== nextPurpose) await row.update({ purpose: nextPurpose });
      }
      const existingAdminDashPurposes = new Set(existingAdminDashSet.map((b) => b.purpose));
      const needsAdminDashSet = [
        pendingAPurpose,
        pendingBPurpose,
        resubSourcePurpose,
        resubPendingPurpose,
        conflictDefPurpose,
        conflictChPurpose,
        approvedLoanPurpose,
        approvedRoomPurpose,
      ].some((p) => !existingAdminDashPurposes.has(p));

      if (needsAdminDashSet) {
        await sequelize.transaction(async (transaction) => {
          if (!existingAdminDashPurposes.has(pendingAPurpose)) {
            await createFirmBooking({
              Booking, BookingReferenceSequence, transaction,
              userId: requesterA.id, resourceType: resourceEqA.type, resourceId: resourceEqA.id, resourceRow: resourceEqA.row,
              startTime: pendingAStart, endTime: pendingAEnd, purpose: pendingAPurpose, status: 'pending_approval',
            });
          }
          if (!existingAdminDashPurposes.has(pendingBPurpose)) {
            await createFirmBooking({
              Booking, BookingReferenceSequence, transaction,
              userId: requesterB.id, resourceType: resourceEqB.type, resourceId: resourceEqB.id, resourceRow: resourceEqB.row,
              startTime: pendingBStart, endTime: pendingBEnd, purpose: pendingBPurpose, status: 'pending_approval',
            });
          }

          let sourceDeniedBooking = await Booking.findOne({ where: { purpose: resubSourcePurpose }, transaction });
          if (!sourceDeniedBooking && !existingAdminDashPurposes.has(resubSourcePurpose)) {
            sourceDeniedBooking = await createFirmBooking({
              Booking, BookingReferenceSequence, transaction,
              userId: requesterC.id, denierUserId: adminUser.id,
              resourceType: resourceEqA.type, resourceId: resourceEqA.id, resourceRow: resourceEqA.row,
              startTime: resubSourceStart, endTime: resubSourceEnd, purpose: resubSourcePurpose, status: 'denied',
              staffRemark: 'Please add missing handling details before approval.',
            });
          }
          if (!existingAdminDashPurposes.has(resubPendingPurpose)) {
            await createFirmBooking({
              Booking, BookingReferenceSequence, transaction,
              userId: requesterC.id,
              resourceType: resourceEqA.type, resourceId: resourceEqA.id, resourceRow: resourceEqA.row,
              startTime: resubPendingStart, endTime: resubPendingEnd, purpose: resubPendingPurpose, status: 'pending_approval',
              rebookedFromBookingId: sourceDeniedBooking?.id || null, rebookedFromStatus: 'denied', bookingThreadId: sourceDeniedBooking?.id || null,
            });
          }

          if (!existingAdminDashPurposes.has(conflictDefPurpose)) {
            const defCreatedAt = new Date();
            const defExpiry = computePencilExpiryAt(defCreatedAt, conflictDefStart);
            const defDeadline = computeContentionDeadline(defCreatedAt, conflictDefStart, defExpiry);
            const defender = await createPencilBooking({
              Booking, BookingReferenceSequence, transaction,
              userId: requesterA.id, resourceType: resourceConflict.type, resourceId: resourceConflict.id, resourceRow: resourceConflict.row,
              startTime: conflictDefStart, endTime: conflictDefEnd, purpose: conflictDefPurpose, contentionRole: 'defender', contentionDeadlineAt: defDeadline,
            });
            if (!existingAdminDashPurposes.has(conflictChPurpose)) {
              await createPencilBooking({
                Booking, BookingReferenceSequence, transaction,
                userId: challengerUser.id, resourceType: resourceConflict.type, resourceId: resourceConflict.id, resourceRow: resourceConflict.row,
                startTime: conflictChStart, endTime: conflictChEnd, purpose: conflictChPurpose, contentionRole: 'challenger', challengingBookingId: defender.id,
              });
            }
          }

          if (!existingAdminDashPurposes.has(approvedLoanPurpose)) {
            await createFirmBooking({
              Booking, BookingReferenceSequence, transaction,
              userId: requesterA.id, approverUserId: adminUser.id,
              resourceType: 'equipment', resourceId: (resources.find((r) => r.type === 'equipment') || resourceEqA).id,
              resourceRow: (resources.find((r) => r.type === 'equipment') || resourceEqA).row,
              startTime: approvedLoanStart, endTime: approvedLoanEnd, purpose: approvedLoanPurpose, status: 'approved',
              equipmentRequestType: 'loan', loanReason: 'Approved loan request for off-site protocol validation.',
              loanWorkflowNote: 'Follow checkout checklist and return before closing.', loanTransportPlan: 'Carry using padded case and labeled transport tray.',
            });
          }
          if (!existingAdminDashPurposes.has(approvedRoomPurpose)) {
            await createFirmBooking({
              Booking, BookingReferenceSequence, transaction,
              userId: requesterB.id, approverUserId: adminUser.id,
              resourceType: 'room', resourceId: resourceRoom.id, resourceRow: resourceRoom.row,
              startTime: approvedRoomStart, endTime: approvedRoomEnd, purpose: approvedRoomPurpose, status: 'approved',
              roomParticipantCount: 12, roomEquipmentNeeds: 'Projector, extension cord, marker set',
              roomSetupRequirements: 'U-shape layout with front demo table', roomProgramDetails: 'Brief orientation and planning session.',
            });
          }
        });
        summary.staffDashboardCreated += 1;
      } else {
        summary.staffDashboardExisting += 1;
      }

      const existingMyApproved = await Booking.findOne({
        where: {
          userId: adminUser.id,
          purpose: myApprovedPurpose,
          bookingType: 'firm',
          status: 'approved',
          startTime: { [Op.gt]: now },
        },
      });
      const existingMyDefender = await Booking.findOne({
        where: {
          userId: adminUser.id,
          bookingType: 'pencil',
          status: 'penciled',
          contentionRole: 'defender',
          purpose: null,
          startTime: { [Op.gt]: now },
        },
        order: [['startTime', 'ASC']],
      });
      const existingMyChallenger = existingMyDefender
        ? await Booking.findOne({
            where: {
              userId: challengerUser.id,
              purpose: myChallengerPurpose,
              bookingType: 'pencil',
              status: 'penciled',
              contentionRole: 'challenger',
              challengingBookingId: existingMyDefender.id,
              startTime: { [Op.gt]: now },
            },
          })
        : null;

      if (!existingMyApproved || !(existingMyDefender && existingMyChallenger)) {
        await sequelize.transaction(async (transaction) => {
          if (!existingMyApproved) {
            await createFirmBooking({
              Booking,
              BookingReferenceSequence,
              transaction,
              userId: adminUser.id,
              approverUserId: approverUser?.id || adminUser.id,
              resourceType: 'room',
              resourceId: roomResource.id,
              resourceRow: roomResource.row,
              startTime: setTime(day, 20, 0),
              endTime: setTime(day, 21, 0),
              purpose: myApprovedPurpose,
              status: 'approved',
            });
          }

          if (!(existingMyDefender && existingMyChallenger)) {
            const myDefStart = setTime(day, 21, 0);
            const myDefEnd = setTime(day, 23, 0);
            const myChStart = setTime(day, 21, 30);
            const myChEnd = setTime(day, 22, 30);
            const defCreatedAt = new Date();
            const defExpiry = computePencilExpiryAt(defCreatedAt, myDefStart);
            const defDeadline = computeContentionDeadline(defCreatedAt, myDefStart, defExpiry);
            const myDefender = existingMyDefender || await createPencilBooking({
              Booking,
              BookingReferenceSequence,
              transaction,
              userId: adminUser.id,
              resourceType: resourceConflict.type,
              resourceId: resourceConflict.id,
              resourceRow: resourceConflict.row,
              startTime: myDefStart,
              endTime: myDefEnd,
              purpose: null,
              contentionRole: 'defender',
              contentionDeadlineAt: defDeadline,
            });

            if (!existingMyChallenger) {
              await createPencilBooking({
                Booking,
                BookingReferenceSequence,
                transaction,
                userId: challengerUser.id,
                resourceType: resourceConflict.type,
                resourceId: resourceConflict.id,
                resourceRow: resourceConflict.row,
                startTime: myChStart,
                endTime: myChEnd,
                purpose: myChallengerPurpose,
                contentionRole: 'challenger',
                challengingBookingId: myDefender.id,
              });
            }
          }
        });
        summary.adminMyBookingsCreated += 1;
      } else {
        summary.adminMyBookingsExisting += 1;
      }

      manifestRows.push([
        'admin_dashboard_seeded',
        participant.email,
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        'pending x2, resubmission x1, active conflict x1, approved loan+room',
      ]);
      manifestRows.push([
        'admin_my_bookings_seeded',
        participant.email,
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        'admin owned approved firm + defender contention pair',
      ]);
    }

    for (let i = 0; i < defenderParticipants.length; i += 1) {
      const participant = defenderParticipants[i];
      const participantUser = await User.findOne({ where: { email: participant.email } });
      if (!participantUser) {
        summary.skippedMissingUsers += 1;
        continue;
      }

      const challengerPurpose = `${CHALLENGER_PURPOSE_PREFIX}${participant.email}`;

      const existingDefender = await Booking.findOne({
        where: {
          userId: participantUser.id,
          bookingType: 'pencil',
          status: 'penciled',
          contentionRole: 'defender',
          startTime: { [Op.gt]: now },
        },
        order: [['startTime', 'ASC']],
      });

      const existingChallenger = existingDefender
        ? await Booking.findOne({
            where: {
              userId: challengerUser.id,
              bookingType: 'pencil',
              status: 'penciled',
              contentionRole: 'challenger',
              challengingBookingId: existingDefender.id,
              startTime: { [Op.gt]: now },
            },
          })
        : null;

      if (existingDefender && existingChallenger) {
        summary.defenderPairsExisting += 1;
        manifestRows.push([
          'defender_pair_existing',
          participant.email,
          existingDefender.referenceCode || '',
          existingChallenger.referenceCode || '',
          existingDefender.resourceType,
          existingDefender.resourceId,
          '',
          new Date(existingDefender.startTime).toISOString(),
          new Date(existingDefender.endTime).toISOString(),
          '(purpose left empty by design)',
        ]);
        continue;
      }

      const resource = resources[i % resources.length];
      const day = addDays(now, 10 + (i % 7));
      const baseHour = 8 + ((i % 5) * 2); // 08,10,12,14,16
      const defenderStart = setTime(day, baseHour, 0);
      const defenderEnd = setTime(day, baseHour + 2, 0);
      const challengerStart = setTime(day, baseHour, 30);
      const challengerEnd = setTime(day, baseHour + 1, 30);

      const { defender, challenger } = await sequelize.transaction(async (transaction) => {
        const createdAt = new Date();
        const defenderExpiryAt = computePencilExpiryAt(createdAt, defenderStart);
        const defenderDeadlineAt = computeContentionDeadline(createdAt, defenderStart, defenderExpiryAt);

        const defenderBooking = await createPencilBooking({
          Booking,
          BookingReferenceSequence,
          transaction,
          userId: participantUser.id,
          resourceType: resource.type,
          resourceId: resource.id,
          resourceRow: resource.row,
          startTime: defenderStart,
          endTime: defenderEnd,
          purpose: null,
          contentionRole: 'defender',
          contentionDeadlineAt: defenderDeadlineAt,
        });

        const challengerBooking = await createPencilBooking({
          Booking,
          BookingReferenceSequence,
          transaction,
          userId: challengerUser.id,
          resourceType: resource.type,
          resourceId: resource.id,
          resourceRow: resource.row,
          startTime: challengerStart,
          endTime: challengerEnd,
          purpose: challengerPurpose,
          contentionRole: 'challenger',
          challengingBookingId: defenderBooking.id,
        });

        return { defender: defenderBooking, challenger: challengerBooking };
      });

      summary.defenderPairsCreated += 1;
      manifestRows.push([
        'defender_pair_created',
        participant.email,
        defender.referenceCode || '',
        challenger.referenceCode || '',
        resource.type,
        resource.id,
        resource.row?.name || '',
        defender.startTime.toISOString(),
        defender.endTime.toISOString(),
        '(purpose left empty by design)',
      ]);
    }

    writeCsv(manifestOut, manifestRows);
    console.log('UAT contention seed complete (%s mode).', mode);
    console.log(
      'global created: %d | approved firm created: %d | approved firm existing: %d | defender pairs created: %d | defender pairs existing: %d | staff dashboard sets created: %d | staff dashboard sets existing: %d | staff my-bookings sets created: %d | staff my-bookings sets existing: %d | admin dashboard sets created: %d | admin dashboard sets existing: %d | admin my-bookings sets created: %d | admin my-bookings sets existing: %d | missing users skipped: %d',
      summary.globalCreated,
      summary.approvedFirmCreated,
      summary.approvedFirmExisting,
      summary.defenderPairsCreated,
      summary.defenderPairsExisting,
      summary.staffDashboardCreated,
      summary.staffDashboardExisting,
      summary.staffMyBookingsCreated,
      summary.staffMyBookingsExisting,
      summary.adminDashboardCreated,
      summary.adminDashboardExisting,
      summary.adminMyBookingsCreated,
      summary.adminMyBookingsExisting,
      summary.skippedMissingUsers
    );
    console.log('Manifest output: %s', manifestOut);
  } catch (error) {
    console.error('UAT contention seed failed:', error.message);
    process.exitCode = 1;
  } finally {
    await db.sequelize.close();
  }
})();
