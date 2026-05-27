/**
 * Seeds foundation data (users + rooms + equipment) from CSV files.
 * No bookings are created.
 *
 * Default mode: idempotent (findOrCreate by email/resourceCode).
 * Reset mode: pass --replace-resources to replace Rooms/Equipment from CSV.
 *
 * Run:
 *   node scripts/seed-foundation-only.js
 *   node scripts/seed-foundation-only.js --replace-resources
 */
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const db = require(path.join(__dirname, '..', 'models'));

const SALT = 12;
const DEFAULT_ROOM_LOCATION = 'Plant Tissue Culture Facility';
const REPLACE_RESOURCES = process.argv.includes('--replace-resources');

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const normalizeOptionalText = (value) => {
  const text = String(value || '').trim();
  return text || null;
};

const normalizeCodeGroup = (value) =>
  String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
const normalizeEquipmentCode = (value) =>
  String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
const normalizeRoomCode = (value) =>
  String(value || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');

const USERS = [
  { email: 'student@uplb.edu.ph', password: 'password123', accountType: 'regular_user', userCategory: 'student' },
  { email: 'staff@uplb.edu.ph', password: 'staff123', accountType: 'ptcf_staff', userCategory: 'lab_technician' },
  { email: 'admin@uplb.edu.ph', password: 'admin123', accountType: 'system_admin', userCategory: null },
  { email: 'researcher1@uplb.edu.ph', password: 'password123', accountType: 'regular_user', userCategory: 'graduate_student' },
  { email: 'researcher2@uplb.edu.ph', password: 'password123', accountType: 'regular_user', userCategory: 'faculty' },
];

function resolveOptionalExtraAdmin() {
  const email = normalizeEmail(process.env.SEED_EXTRA_ADMIN_EMAIL);
  if (!email) return null;
  const password = String(process.env.SEED_EXTRA_ADMIN_PASSWORD || '');
  if (!password) {
    throw new Error('SEED_EXTRA_ADMIN_PASSWORD is required when SEED_EXTRA_ADMIN_EMAIL is set.');
  }
  return {
    email,
    password,
    accountType: 'system_admin',
    userCategory: normalizeOptionalText(process.env.SEED_EXTRA_ADMIN_USER_CATEGORY),
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

function resolveCsvPath(fileName) {
  const candidates = [
    path.resolve(__dirname, '..', '..', '..', fileName),
    path.resolve(process.cwd(), '..', fileName),
    path.resolve(process.cwd(), fileName),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(`CSV file not found: ${fileName}`);
}

function parseRoomsCsv(csvText) {
  const rows = parseCsv(csvText);
  if (!rows.length) throw new Error('Rooms CSV is empty');
  const header = rows[0].map((c) => c.toLowerCase());
  const idx = {
    code: header.indexOf('room code'),
    name: header.indexOf('room name'),
    zone: header.indexOf('zone'),
    ppe: header.indexOf('ppe'),
    capacity: header.indexOf('capacity'),
    description: header.indexOf('description'),
  };
  Object.entries(idx).forEach(([k, v]) => {
    if (v < 0) throw new Error(`Rooms CSV missing required column: ${k}`);
  });

  return rows
    .slice(1)
    .map((row) => {
      const capacity = parseInt(row[idx.capacity], 10);
      return {
        name: row[idx.name],
        description: row[idx.description],
        location: DEFAULT_ROOM_LOCATION,
        zone: normalizeOptionalText(row[idx.zone]),
        ppe: normalizeOptionalText(row[idx.ppe]),
        capacity: Number.isFinite(capacity) && capacity > 0 ? capacity : 1,
        imageUrl: null,
        resourceCode: normalizeRoomCode(row[idx.code]),
        status: 'available',
      };
    })
    .filter((row) => row.name && row.resourceCode);
}

function parseEquipmentCsv(csvText) {
  const rows = parseCsv(csvText);
  const headerRowIndex = rows.findIndex((row) => {
    const h = row.map((c) => c.toLowerCase());
    return h.includes('name') && h.includes('category') && h.includes('category code') && h.includes('equipment code');
  });
  if (headerRowIndex < 0) throw new Error('Equipment CSV header row not found');
  const header = rows[headerRowIndex].map((c) => c.toLowerCase());
  const idx = {
    name: header.indexOf('name'),
    category: header.indexOf('category'),
    codeGroup: header.indexOf('category code'),
    code: header.indexOf('equipment code'),
    description: header.indexOf('description'),
  };
  Object.entries(idx).forEach(([k, v]) => {
    if (v < 0) throw new Error(`Equipment CSV missing required column: ${k}`);
  });

  return rows
    .slice(headerRowIndex + 1)
    .map((row) => {
      const codeGroup = normalizeCodeGroup(row[idx.codeGroup]);
      let resourceCode = normalizeEquipmentCode(row[idx.code]);
      if (codeGroup && resourceCode.startsWith(`${codeGroup}-`)) {
        resourceCode = resourceCode.slice(codeGroup.length + 1);
      }
      return {
        name: row[idx.name],
        category: row[idx.category],
        description: row[idx.description],
        imageUrl: null,
        codeGroup,
        resourceCode,
        status: 'available',
      };
    })
    .filter((row) => row.name && row.codeGroup && row.resourceCode);
}

(async () => {
  const { User, Equipment, Room, Booking, sequelize } = db;
  const created = { users: 0, equipment: 0, rooms: 0 };
  const updated = { equipment: 0, rooms: 0 };

  try {
    await sequelize.authenticate();

    const roomsPath = resolveCsvPath('PTCF-rooms-list.csv');
    const equipmentPath = resolveCsvPath('PTCF-equipments-list.csv');
    const roomRows = parseRoomsCsv(fs.readFileSync(roomsPath, 'utf8'));
    const equipmentRows = parseEquipmentCsv(fs.readFileSync(equipmentPath, 'utf8'));

    const usersToSeed = [...USERS];
    const optionalExtraAdmin = resolveOptionalExtraAdmin();
    if (optionalExtraAdmin) {
      const existingEmails = new Set(usersToSeed.map((u) => normalizeEmail(u.email)));
      if (!existingEmails.has(optionalExtraAdmin.email)) usersToSeed.push(optionalExtraAdmin);
    }

    for (const u of usersToSeed) {
      const hash = await bcrypt.hash(u.password, SALT);
      const [, wasCreated] = await User.findOrCreate({
        where: { email: u.email },
        defaults: {
          passwordHash: hash,
          accountType: u.accountType,
          userCategory: u.userCategory,
        },
      });
      if (wasCreated) created.users += 1;
    }

    if (REPLACE_RESOURCES) {
      await sequelize.transaction(async (transaction) => {
        await Booking.destroy({ where: {}, force: true, transaction });
        await Equipment.destroy({ where: {}, force: true, transaction });
        await Room.destroy({ where: {}, force: true, transaction });
      });
      console.log('[seed] Cleared bookings, equipment, and rooms before CSV seed.');
    }

    for (const e of equipmentRows) {
      const [row, wasCreated] = await Equipment.findOrCreate({
        where: { resourceCode: e.resourceCode, codeGroup: e.codeGroup },
        defaults: { ...e },
      });
      if (wasCreated) {
        created.equipment += 1;
      } else if (REPLACE_RESOURCES) {
        await row.update({ ...e });
        updated.equipment += 1;
      }
    }

    for (const r of roomRows) {
      const [row, wasCreated] = await Room.findOrCreate({
        where: { resourceCode: r.resourceCode },
        defaults: { ...r },
      });
      if (wasCreated) {
        created.rooms += 1;
      } else if (REPLACE_RESOURCES) {
        await row.update({ ...r });
        updated.rooms += 1;
      }
    }

    console.log(
      'Foundation seed complete. Created: %d user(s), %d equipment, %d room(s). Updated (replace mode): %d equipment, %d room(s).',
      created.users,
      created.equipment,
      created.rooms,
      updated.equipment,
      updated.rooms
    );
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
})();
