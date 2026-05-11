/**
 * Provision UAT users from a CSV (create/update local users + Supabase Auth login readiness).
 *
 * CSV columns:
 *   email,role,user_category,seed_defender,seed_global_target
 *
 * Optional args:
 *   --csv <path>                 CSV path (default: server/docs/uat-respondents.csv)
 *   --password-mode <shared|unique>  Temporary password strategy (default: unique)
 *   --shared-password <value>    Shared temporary password (default: UATTemp#2026)
 *   --passwords-out <path>       Output CSV for generated credentials
 */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcrypt');

const resolvedEnv =
  process.env.NODE_ENV ||
  (process.env.ALLOW_MVP_DEMO_RESET === '1' ? 'production' : 'development');
const envFile = resolvedEnv === 'production' ? '.env.production' : '.env';
require('dotenv').config({ path: envFile });
require('dotenv').config();

const db = require(path.join(__dirname, '..', 'models'));
const {
  createSupabaseAdminClient,
  isSupabaseAuthEnabled,
} = require('../utils/supabase-auth');
const { listAllAuthUsers } = require('./supabase-auth-admin');

const SALT = 12;
const ALLOWED_ROLES = new Set(['regular_user', 'ptcf_staff', 'system_admin']);
const DEFAULT_CSV = path.resolve(__dirname, '..', 'docs', 'uat-respondents.csv');
const DEFAULT_SHARED_PASSWORD = process.env.UAT_SHARED_PASSWORD || 'UATTemp#2026';
const DEFAULT_PASSWORDS_OUT = path.resolve(__dirname, '..', 'docs', 'uat-account-passwords.csv');

function argValue(flag, fallback = null) {
  const idx = process.argv.indexOf(flag);
  if (idx < 0 || idx + 1 >= process.argv.length) return fallback;
  return process.argv[idx + 1];
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeOptional(value) {
  const text = String(value || '').trim();
  return text || null;
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
  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV file not found: ${csvPath}`);
  }
  const rows = parseCsv(fs.readFileSync(csvPath, 'utf8'));
  if (!rows.length) throw new Error('CSV is empty.');

  const header = rows[0].map((h) => h.toLowerCase());
  const idx = {
    email: header.indexOf('email'),
    role: header.indexOf('role'),
    userCategory: header.indexOf('user_category'),
  };
  if (idx.email < 0 || idx.role < 0 || idx.userCategory < 0) {
    throw new Error('CSV must include email, role, and user_category columns.');
  }

  return rows.slice(1).map((row, rowIndex) => ({
    rowNumber: rowIndex + 2,
    email: normalizeEmail(row[idx.email]),
    role: String(row[idx.role] || '').trim(),
    userCategory: normalizeOptional(row[idx.userCategory]),
  }));
}

function buildPasswordForEmail(email, mode, sharedPassword) {
  if (mode === 'shared') return sharedPassword;
  const digest = crypto.createHash('sha256').update(email).digest('hex').slice(0, 8);
  return `UAT#${digest}`;
}

async function upsertSupabaseAuthUsers(users, passwordMapByEmail) {
  if (!isSupabaseAuthEnabled()) {
    return { created: 0, updated: 0, skipped: true };
  }

  const admin = createSupabaseAdminClient();
  const authUsers = await listAllAuthUsers(admin);
  const authByEmail = new Map(
    authUsers
      .filter((u) => u.email)
      .map((u) => [String(u.email).trim().toLowerCase(), u])
  );

  let created = 0;
  let updated = 0;

  for (const user of users) {
    const email = normalizeEmail(user.email);
    const password = passwordMapByEmail.get(email);
    let authUser = authByEmail.get(email);

    if (!authUser) {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (error) throw error;
      authUser = data.user;
      created += 1;
    } else {
      const { error } = await admin.auth.admin.updateUserById(authUser.id, {
        password,
        email_confirm: true,
      });
      if (error) throw error;
      updated += 1;
    }

    if (authUser?.id && user.supabaseAuthId !== authUser.id) {
      user.supabaseAuthId = authUser.id;
      if (user.passwordHash) user.passwordHash = null;
      await user.save();
    }
  }

  return { created, updated, skipped: false };
}

(async () => {
  const csvPath = path.resolve(process.cwd(), argValue('--csv', DEFAULT_CSV));
  const passwordMode = String(argValue('--password-mode', 'unique')).trim().toLowerCase();
  const sharedPassword = String(argValue('--shared-password', DEFAULT_SHARED_PASSWORD));
  const passwordsOut = path.resolve(process.cwd(), argValue('--passwords-out', DEFAULT_PASSWORDS_OUT));

  if (!['shared', 'unique'].includes(passwordMode)) {
    throw new Error('--password-mode must be "shared" or "unique".');
  }

  const { User, sequelize } = db;
  const summary = { created: 0, updated: 0, unchanged: 0, invalid: 0 };
  const invalidRows = [];
  const credentialRows = [['email', 'temporary_password', 'role', 'user_category']];
  const passwordMapByEmail = new Map();

  try {
    await sequelize.authenticate();
    const rows = resolveCsvRows(csvPath);
    const normalizedRows = [];

    for (const row of rows) {
      if (!row.email || !ALLOWED_ROLES.has(row.role)) {
        summary.invalid += 1;
        invalidRows.push({
          rowNumber: row.rowNumber,
          email: row.email || '<missing>',
          role: row.role || '<missing>',
        });
        continue;
      }
      normalizedRows.push(row);
    }

    const dedupedByEmail = new Map();
    for (const row of normalizedRows) dedupedByEmail.set(row.email, row);

    const effectiveRows = Array.from(dedupedByEmail.values());
    for (const row of effectiveRows) {
      const password = buildPasswordForEmail(row.email, passwordMode, sharedPassword);
      passwordMapByEmail.set(row.email, password);
      credentialRows.push([row.email, password, row.role, row.userCategory || '']);
    }

    const seededUsers = [];
    for (const row of effectiveRows) {
      const existing = await User.findOne({
        where: { email: row.email },
        paranoid: false,
      });

      if (!existing) {
        const passwordHash = await bcrypt.hash(passwordMapByEmail.get(row.email), SALT);
        const user = await User.create({
          email: row.email,
          passwordHash,
          accountType: row.role,
          userCategory: row.userCategory,
        });
        seededUsers.push(user);
        summary.created += 1;
        continue;
      }

      const needsRestore = Boolean(existing.deletedAt);
      const needsRoleChange = existing.accountType !== row.role;
      const needsCategoryChange = (existing.userCategory || null) !== row.userCategory;
      const needsPasswordHash =
        !isSupabaseAuthEnabled() &&
        !existing.passwordHash;

      if (!needsRestore && !needsRoleChange && !needsCategoryChange && !needsPasswordHash) {
        seededUsers.push(existing);
        summary.unchanged += 1;
        continue;
      }

      const patch = {};
      if (needsRoleChange) patch.accountType = row.role;
      if (needsCategoryChange) patch.userCategory = row.userCategory;
      if (needsPasswordHash) patch.passwordHash = await bcrypt.hash(passwordMapByEmail.get(row.email), SALT);
      if (needsRestore) patch.deletedAt = null;

      await existing.update(patch, { paranoid: false });
      seededUsers.push(existing);
      summary.updated += 1;
    }

    const supabaseResult = await upsertSupabaseAuthUsers(seededUsers, passwordMapByEmail);
    writeCsv(passwordsOut, credentialRows);

    console.log('UAT account seed complete.');
    console.log(
      'Local users -> created: %d, updated: %d, unchanged: %d, invalid rows: %d',
      summary.created,
      summary.updated,
      summary.unchanged,
      summary.invalid
    );
    console.log(
      'Supabase auth -> %s%s',
      supabaseResult.skipped ? 'skipped (AUTH_PROVIDER is not supabase)' : `created: ${supabaseResult.created}, updated: ${supabaseResult.updated}`,
      ''
    );
    console.log('Credential output: %s', passwordsOut);

    if (invalidRows.length) {
      console.log('Invalid rows:');
      for (const row of invalidRows) {
        console.log(`  line ${row.rowNumber}: email="${row.email}" role="${row.role}"`);
      }
    }
  } catch (error) {
    console.error('UAT account seed failed:', error.message);
    process.exitCode = 1;
  } finally {
    await db.sequelize.close();
  }
})();
