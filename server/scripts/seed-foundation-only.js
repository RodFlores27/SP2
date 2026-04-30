/**
 * Inserts the same users, equipment, and rooms as 20260330100000-seed-initial-data,
 * but without any bookings — for a clean calendar + targeted seeds (e.g. showcase day).
 * Idempotent: skips rows that already exist (matched by email / name).
 *
 * Run from server: node scripts/seed-foundation-only.js
 */
require('dotenv').config();

const path = require('path');
const bcrypt = require('bcrypt');
const db = require(path.join(__dirname, '..', 'models'));

const SALT = 12;
const normalizeEmail = (value) =>
  String(value || '')
    .trim()
    .toLowerCase();
const normalizeOptionalText = (value) => {
  const text = String(value || '').trim();
  return text || null;
};

const USERS = [
  {
    email: 'student@uplb.edu.ph',
    password: 'password123',
    accountType: 'regular_user',
    userCategory: 'student',
  },
  {
    email: 'staff@uplb.edu.ph',
    password: 'staff123',
    accountType: 'ptcf_staff',
    userCategory: 'lab_technician',
  },
  {
    email: 'admin@uplb.edu.ph',
    password: 'admin123',
    accountType: 'system_admin',
    userCategory: null,
  },
  {
    email: 'researcher1@uplb.edu.ph',
    password: 'password123',
    accountType: 'regular_user',
    userCategory: 'graduate_student',
  },
  {
    email: 'researcher2@uplb.edu.ph',
    password: 'password123',
    accountType: 'regular_user',
    userCategory: 'faculty',
  },
];

function resolveOptionalExtraAdmin() {
  const email = normalizeEmail(process.env.SEED_EXTRA_ADMIN_EMAIL);
  if (!email) return null;

  const password = String(process.env.SEED_EXTRA_ADMIN_PASSWORD || '');
  if (!password) {
    throw new Error(
      'SEED_EXTRA_ADMIN_PASSWORD is required when SEED_EXTRA_ADMIN_EMAIL is set.'
    );
  }

  const userCategory = normalizeOptionalText(process.env.SEED_EXTRA_ADMIN_USER_CATEGORY);
  return {
    email,
    password,
    accountType: 'system_admin',
    userCategory,
  };
}

const EQUIPMENT = [
  {
    name: 'Laminar Flow Hood',
    category: 'Sterilization Equipment',
    description: 'Class II Biological Safety Cabinet for sterile tissue culture work',
    imageUrl: null,
    codeGroup: 'STE',
    resourceCode: 'LFH',
    status: 'available',
  },
  {
    name: 'Autoclave',
    category: 'Sterilization Equipment',
    description: 'High-pressure steam sterilizer for media and glassware',
    imageUrl: null,
    codeGroup: 'STE',
    resourceCode: 'AUT',
    status: 'available',
  },
  {
    name: 'Growth Chamber',
    category: 'Incubation Equipment',
    description: 'Temperature and light-controlled chamber for plant tissue culture',
    imageUrl: null,
    codeGroup: 'INC',
    resourceCode: 'GCH',
    status: 'available',
  },
];

const ROOMS = [
  {
    name: 'Culture Room A',
    description: 'Primary tissue culture laboratory with laminar flow hoods',
    location: 'ICropS Building, 2nd Floor',
    capacity: 8,
    codeGroup: 'ICR',
    resourceCode: 'CRA',
    status: 'available',
  },
  {
    name: 'Preparation Room',
    description: 'Media preparation and sterilization area',
    location: 'ICropS Building, 2nd Floor',
    capacity: 4,
    codeGroup: 'ICR',
    resourceCode: 'PRM',
    status: 'available',
  },
];

(async () => {
  const { User, Equipment, Room, sequelize } = db;
  let created = { users: 0, equipment: 0, rooms: 0 };

  try {
    await sequelize.authenticate();

    const usersToSeed = [...USERS];
    const optionalExtraAdmin = resolveOptionalExtraAdmin();
    if (optionalExtraAdmin) {
      const existingEmails = new Set(usersToSeed.map((u) => normalizeEmail(u.email)));
      if (existingEmails.has(optionalExtraAdmin.email)) {
        console.log(
          `[seed] Skipping env-driven extra admin (${optionalExtraAdmin.email}) because it already exists in base seed users.`
        );
      } else {
        usersToSeed.push(optionalExtraAdmin);
        console.log(`[seed] Added env-driven extra admin: ${optionalExtraAdmin.email}`);
      }
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

    for (const e of EQUIPMENT) {
      const [, wasCreated] = await Equipment.findOrCreate({
        where: { name: e.name },
        defaults: { ...e },
      });
      if (wasCreated) created.equipment += 1;
    }

    for (const r of ROOMS) {
      const [, wasCreated] = await Room.findOrCreate({
        where: { name: r.name },
        defaults: { ...r },
      });
      if (wasCreated) created.rooms += 1;
    }

    console.log(
      'Foundation seed complete. Created: %d user(s), %d equipment, %d room(s). (Existing rows were left unchanged.)',
      created.users,
      created.equipment,
      created.rooms
    );
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
})();
