'use strict';

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');

const DEFAULT_ROOM_LOCATION = 'Plant Tissue Culture Facility';

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

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeOptionalText(value) {
  const text = String(value || '').trim();
  return text || null;
}

function normalizeCodeGroup(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
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

function normalizeRoomCode(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
}

function parseRoomsCsv(csvText) {
  const rows = parseCsv(csvText);
  if (rows.length === 0) throw new Error('Rooms CSV is empty');
  const header = rows[0].map((c) => c.toLowerCase());
  const idx = {
    resourceCode: header.indexOf('room code'),
    name: header.indexOf('room name'),
    zone: header.indexOf('zone'),
    ppe: header.indexOf('ppe'),
    capacity: header.indexOf('capacity'),
    description: header.indexOf('description'),
  };
  Object.entries(idx).forEach(([key, value]) => {
    if (value < 0) throw new Error(`Rooms CSV missing required column: ${key}`);
  });

  const now = new Date();
  return rows.slice(1).map((row) => {
    const capacity = parseInt(row[idx.capacity], 10);
    return {
      name: row[idx.name],
      description: row[idx.description],
      location: DEFAULT_ROOM_LOCATION,
      zone: normalizeOptionalText(row[idx.zone]),
      ppe: normalizeOptionalText(row[idx.ppe]),
      capacity: Number.isFinite(capacity) && capacity > 0 ? capacity : 1,
      imageUrl: null,
      resourceCode: normalizeRoomCode(row[idx.resourceCode]),
      status: 'available',
      createdAt: now,
      updatedAt: now,
    };
  }).filter((row) => row.name && row.resourceCode);
}

function parseEquipmentCsv(csvText) {
  const rows = parseCsv(csvText);
  const headerRowIndex = rows.findIndex((row) => {
    const normalized = row.map((c) => c.toLowerCase());
    return normalized.includes('name') &&
      normalized.includes('category') &&
      normalized.includes('category code') &&
      normalized.includes('equipment code');
  });
  if (headerRowIndex < 0) throw new Error('Equipment CSV header row not found');

  const header = rows[headerRowIndex].map((c) => c.toLowerCase());
  const idx = {
    name: header.indexOf('name'),
    category: header.indexOf('category'),
    codeGroup: header.indexOf('category code'),
    resourceCode: header.indexOf('equipment code'),
    description: header.indexOf('description'),
  };
  Object.entries(idx).forEach(([key, value]) => {
    if (value < 0) throw new Error(`Equipment CSV missing required column: ${key}`);
  });

  const now = new Date();
  return rows.slice(headerRowIndex + 1).map((row) => {
    const codeGroup = normalizeCodeGroup(row[idx.codeGroup]);
    let resourceCode = normalizeEquipmentCode(row[idx.resourceCode]);
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
      createdAt: now,
      updatedAt: now,
    };
  }).filter((row) => row.name && row.codeGroup && row.resourceCode);
}

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const saltRounds = 12;

    const regularUserPassword = await bcrypt.hash('password123', saltRounds);
    const staffPassword = await bcrypt.hash('staff123', saltRounds);
    const adminPassword = await bcrypt.hash('admin123', saltRounds);
    const extraAdminEmail = normalizeEmail(process.env.SEED_EXTRA_ADMIN_EMAIL);
    const extraAdminPassword = String(process.env.SEED_EXTRA_ADMIN_PASSWORD || '');
    const extraAdminUserCategory = normalizeOptionalText(process.env.SEED_EXTRA_ADMIN_USER_CATEGORY);

    if (extraAdminEmail && !extraAdminPassword) {
      throw new Error('SEED_EXTRA_ADMIN_PASSWORD is required when SEED_EXTRA_ADMIN_EMAIL is set.');
    }

    const seedUsers = [
      {
        email: 'student@uplb.edu.ph',
        passwordHash: regularUserPassword,
        accountType: 'regular_user',
        userCategory: 'student',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        email: 'staff@uplb.edu.ph',
        passwordHash: staffPassword,
        accountType: 'ptcf_staff',
        userCategory: 'lab_technician',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        email: 'admin@uplb.edu.ph',
        passwordHash: adminPassword,
        accountType: 'system_admin',
        userCategory: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        email: 'researcher1@uplb.edu.ph',
        passwordHash: regularUserPassword,
        accountType: 'regular_user',
        userCategory: 'graduate_student',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        email: 'researcher2@uplb.edu.ph',
        passwordHash: regularUserPassword,
        accountType: 'regular_user',
        userCategory: 'faculty',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    if (extraAdminEmail) {
      const existingEmails = new Set(seedUsers.map((u) => normalizeEmail(u.email)));
      if (!existingEmails.has(extraAdminEmail)) {
        seedUsers.push({
          email: extraAdminEmail,
          passwordHash: await bcrypt.hash(extraAdminPassword, saltRounds),
          accountType: 'system_admin',
          userCategory: extraAdminUserCategory,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    }

    const roomsPath = resolveCsvPath('PTCF rooms list.csv');
    const equipmentPath = resolveCsvPath('PTCF equipment list.csv');
    const roomsSeed = parseRoomsCsv(fs.readFileSync(roomsPath, 'utf8'));
    const equipmentSeed = parseEquipmentCsv(fs.readFileSync(equipmentPath, 'utf8'));

    await queryInterface.bulkInsert('Users', seedUsers, {});
    await queryInterface.bulkInsert('Equipment', equipmentSeed, {});
    await queryInterface.bulkInsert('Rooms', roomsSeed, {});
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('Bookings', null, {});
    await queryInterface.bulkDelete('Users', null, {});
    await queryInterface.bulkDelete('Equipment', null, {});
    await queryInterface.bulkDelete('Rooms', null, {});
  },
};

