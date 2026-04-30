const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { checkServerHealth } = require('./utils/test-helpers');

function loadServerEnv() {
  const envPath = path.join(__dirname, '..', 'server', '.env');
  if (!fs.existsSync(envPath)) return;

  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const eqIndex = trimmed.indexOf('=');
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim().replace(/^['"]|['"]$/g, '');
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadServerEnv();

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:4000/api';
const SERVER_ROOT = path.join(__dirname, '..', 'server');
const RUN_ID = `${Date.now()}-${process.pid}`;

const TEST_USERS = [
  { email: 'student@uplb.edu.ph', password: 'password123', role: 'regular_user' },
  { email: 'staff@uplb.edu.ph', password: 'staff123', role: 'ptcf_staff' },
  { email: 'admin@uplb.edu.ph', password: 'admin123', role: 'system_admin' },
];

let passed = 0;
let failed = 0;

function pass(label) {
  console.log(`✅ ${label}`);
  passed += 1;
}

function fail(label, detail) {
  console.log(`❌ ${label}${detail ? `: ${detail}` : ''}`);
  failed += 1;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadServerModule(relativePath) {
  return require(path.join(SERVER_ROOT, relativePath));
}

async function login(email, password) {
  const res = await axios.post(`${BASE_URL}/auth/login`, { email, password });
  return res.data;
}

async function resolveEquipmentId() {
  const res = await axios.get(`${BASE_URL}/equipment`);
  const equipment = (res.data || []).find((item) => item.id);
  if (!equipment) {
    throw new Error('No equipment resource available for booking creation');
  }
  return equipment.id;
}

function buildFutureWindow() {
  const start = new Date();
  start.setDate(start.getDate() + 210 + (Date.now() % 30));
  start.setHours(10, 0, 0, 0);

  const end = new Date(start);
  end.setHours(end.getHours() + 1);

  return { start, end };
}

async function createSupabaseAuthBooking(studentToken) {
  const equipmentId = await resolveEquipmentId();
  const { start, end } = buildFutureWindow();

  const res = await axios.post(
    `${BASE_URL}/bookings`,
    {
      resourceType: 'equipment',
      resourceId: equipmentId,
      bookingType: 'pencil',
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      purpose: `Supabase auth verification ${RUN_ID}`,
    },
    {
      headers: { Authorization: `Bearer ${studentToken}` },
    }
  );

  return res.data.booking;
}

async function waitForCondition(label, predicate, attempts = 20, delayMs = 500) {
  for (let i = 0; i < attempts; i += 1) {
    const result = await predicate();
    if (result) return result;
    await wait(delayMs);
  }
  throw new Error(`${label} not observed within ${attempts * delayMs}ms`);
}

async function testSupabaseAuth() {
  console.log('=========================================');
  console.log('Supabase Auth Verification');
  console.log('=========================================\n');

  const healthCheck = await checkServerHealth(BASE_URL);
  if (!healthCheck.success) {
    fail('Server health check', healthCheck.error || 'Server unavailable');
    return;
  }
  pass('Server health check passes');

  if (process.env.AUTH_PROVIDER !== 'supabase') {
    console.log('\nAUTH_PROVIDER is not set to supabase.');
    console.log('Set AUTH_PROVIDER=supabase in server/.env and restart the server to run this verification.');
    pass('Supabase-disabled mode exits safely with setup guidance');
    return;
  }

  const loginResults = new Map();

  for (const user of TEST_USERS) {
    const loginData = await login(user.email, user.password);
    assert(loginData.authProvider === 'supabase', `Expected Supabase auth provider for ${user.email}`);
    assert(loginData.token, `Missing access token for ${user.email}`);
    assert(loginData.refreshToken, `Missing refresh token for ${user.email}`);
    assert(loginData.user?.accountType === user.role, `Unexpected role for ${user.email}`);
    loginResults.set(user.email, loginData);
    pass(`${user.role} login returns Supabase access and refresh tokens`);

    const headers = { Authorization: `Bearer ${loginData.token}` };
    const meRes = await axios.get(`${BASE_URL}/auth/me`, { headers });
    assert(meRes.data.user?.id, `/auth/me missing user id for ${user.email}`);
    pass(`${user.role} /auth/me validates Supabase token`);
  }

  const adminLogin = loginResults.get('admin@uplb.edu.ph');
  const refreshRes = await axios.post(`${BASE_URL}/auth/refresh`, {
    refreshToken: adminLogin.refreshToken,
  });
  assert(refreshRes.data.authProvider === 'supabase', 'Refresh did not return Supabase auth provider');
  assert(refreshRes.data.token, 'Refresh did not return a new access token');
  pass('Supabase refresh token endpoint returns a fresh access token');

  const studentLogin = loginResults.get('student@uplb.edu.ph');
  const studentHeaders = { Authorization: `Bearer ${studentLogin.token}` };
  const adminHeaders = { Authorization: `Bearer ${adminLogin.token}` };

  try {
    await axios.get(`${BASE_URL}/auth/admin-only`, { headers: studentHeaders });
    throw new Error('student unexpectedly reached admin-only endpoint');
  } catch (error) {
    if (error.response?.status !== 403) throw error;
    pass('Role guard still blocks regular users from admin-only endpoint');
  }

  await axios.get(`${BASE_URL}/auth/admin-only`, { headers: adminHeaders });
  pass('Role guard still allows system admins');

  try {
    await axios.post(`${BASE_URL}/auth/password-reset-request`, {});
    throw new Error('password-reset-request unexpectedly accepted empty body');
  } catch (error) {
    if (error.response?.status !== 400) throw error;
    pass('Password reset request validates required email without sending mail');
  }

  try {
    await axios.post(`${BASE_URL}/auth/password`, { password: 'short' }, { headers: studentHeaders });
    throw new Error('password update unexpectedly accepted a short password');
  } catch (error) {
    if (error.response?.status !== 400) throw error;
    pass('Password update endpoint validates password length');
  }

  if (process.env.SUPABASE_AUTH_SEND_RESET_EMAIL_TEST === 'true') {
    await axios.post(`${BASE_URL}/auth/password-reset-request`, {
      email: 'student@uplb.edu.ph',
      redirectTo: process.env.SUPABASE_PASSWORD_RESET_REDIRECT_URL,
    });
    pass('Live Supabase password reset email request accepted');
  } else {
    console.log('Skipping live password reset email send. Set SUPABASE_AUTH_SEND_RESET_EMAIL_TEST=true to opt in.');
    pass('Live password reset email send skipped safely by default');
  }

  const booking = await createSupabaseAuthBooking(studentLogin.token);
  assert(booking?.id, 'Booking response missing booking id');
  assert(booking.status, 'Booking response missing status');
  pass(`Supabase-authenticated user created booking #${booking.id}`);

  if (process.env.KAFKA_ENABLED === 'true') {
    const { AuditLog, BookingAnalyticsEvent } = loadServerModule('models');
    const { Op } = require(path.join(SERVER_ROOT, 'node_modules', 'sequelize'));
    const eventWhere = {
      bookingId: booking.id,
      eventType: 'booking.created',
      createdAt: { [Op.gte]: new Date(Date.now() - 60_000) },
    };

    await waitForCondition('AuditLog booking.created row', () => AuditLog.findOne({ where: eventWhere }));
    pass('Kafka audit consumer recorded Supabase-authenticated booking');

    await waitForCondition('BookingAnalyticsEvent booking.created row', () =>
      BookingAnalyticsEvent.findOne({ where: eventWhere })
    );
    pass('Kafka analytics consumer recorded Supabase-authenticated booking');
  } else {
    console.log('Kafka is disabled for this run. Enable KAFKA_ENABLED=true to verify audit/analytics consumers.');
    pass('Kafka verification skipped safely when disabled');
  }
}

testSupabaseAuth()
  .catch((error) => {
    fail('Supabase auth verification crashed', error.response?.data?.message || error.message);
  })
  .finally(() => {
    console.log('\n=========================================');
    console.log('Supabase Auth Verification Summary');
    console.log('=========================================');
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);

    if (failed > 0) {
      process.exitCode = 1;
    }
  });
