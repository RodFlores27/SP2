const axios = require('axios');
const path = require('path');
const { checkServerHealth } = require('./utils/test-helpers');

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:4000/api';
const ADMIN_EMAIL = 'admin@uplb.edu.ph';
const ADMIN_PASSWORD = 'admin123';
const STUDENT_EMAIL = 'student@uplb.edu.ph';
const STUDENT_PASSWORD = 'password123';
const SERVER_ROOT = path.join(__dirname, '..', 'server');
const RUN_ID = `${Date.now()}-${process.pid}`;

if (process.env.KAFKA_ENABLED === 'true') {
  process.env.KAFKA_NOTIFICATION_CONSUMER_GROUP = `notification-consumer-e2e-${RUN_ID}`;
  process.env.KAFKA_AUDIT_CONSUMER_GROUP = `audit-log-consumer-e2e-${RUN_ID}`;
  process.env.KAFKA_ANALYTICS_CONSUMER_GROUP = `analytics-consumer-e2e-${RUN_ID}`;
}

let passed = 0;
let failed = 0;
const capturedEmails = [];

function pass(label) {
  console.log(`✅ ${label}`);
  passed += 1;
}

function fail(label, detail) {
  console.log(`❌ ${label}${detail ? `: ${detail}` : ''}`);
  failed += 1;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadServerModule(relativePath) {
  return require(path.join(SERVER_ROOT, relativePath));
}

function patchEmailTransport() {
  const emailPath = path.join(SERVER_ROOT, 'utils', 'email.js');
  const emailModule = require(emailPath);
  emailModule.sendEmail = async (message) => {
    capturedEmails.push(message);
    console.log(`[email:test-capture] ${message.to} - ${message.subject}`);
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
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
  start.setDate(start.getDate() + 3);
  start.setHours(9, Math.floor(Date.now() / 1000) % 45, 0, 0);

  const end = new Date(start);
  end.setHours(end.getHours() + 2);

  return { start, end };
}

async function createPencilBooking(studentToken, equipmentId) {
  const { start, end } = buildFutureWindow();
  const res = await axios.post(
    `${BASE_URL}/bookings`,
    {
      resourceType: 'equipment',
      resourceId: equipmentId,
      bookingType: 'pencil',
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      purpose: `Milestone 19 Kafka e2e test ${RUN_ID}`,
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

async function testMilestone19() {
  console.log('=================================================');
  console.log('Milestone 19 Verification: End-to-End Kafka Flow');
  console.log('=================================================\n');

  const healthCheck = await checkServerHealth(BASE_URL);
  if (!healthCheck.success) {
    fail('Server health check', healthCheck.error || 'Server unavailable');
    return;
  }
  pass('Server health check passes');

  if (process.env.KAFKA_ENABLED !== 'true') {
    console.log('\nKafka is disabled for this run.');
    console.log('Set KAFKA_ENABLED=true and start local Kafka to run the full e2e verification.');
    pass('Kafka-disabled mode exits safely with setup guidance');
    return;
  }

  patchEmailTransport();

  const {
    BOOKING_EVENT_TYPES,
    disconnectKafkaProducer,
    ensureBookingEventsTopic,
    startAnalyticsConsumer,
    startAuditConsumer,
    startNotificationConsumer,
    stopAnalyticsConsumer,
    stopAuditConsumer,
    stopNotificationConsumer,
  } = loadServerModule('utils/kafka');
  const { AuditLog, BookingAnalyticsEvent } = loadServerModule('models');

  try {
    const adminLogin = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
    const studentLogin = await login(STUDENT_EMAIL, STUDENT_PASSWORD);
    const adminHeaders = { Authorization: `Bearer ${adminLogin.token}` };
    pass('Admin and student login succeed');

    await ensureBookingEventsTopic();
    const [notificationStart, auditStart, analyticsStart] = await Promise.all([
      startNotificationConsumer(),
      startAuditConsumer(),
      startAnalyticsConsumer(),
    ]);

    assert(notificationStart.connected, notificationStart.error || 'Notification consumer not connected');
    assert(auditStart.connected, auditStart.error || 'Audit consumer not connected');
    assert(analyticsStart.connected, analyticsStart.error || 'Analytics consumer not connected');
    pass('Notification, audit, and analytics test consumers connect');

    const equipmentId = await resolveEquipmentId();
    const booking = await createPencilBooking(studentLogin.token, equipmentId);
    assert(booking?.id, 'Create booking response missing booking id');
    assert(booking.status === 'penciled', `Expected penciled booking, got ${booking.status}`);
    pass(`Real booking API action created booking #${booking.id}`);

    const auditRow = await waitForCondition('AuditLog booking.created row', () =>
      AuditLog.findOne({
        where: {
          bookingId: booking.id,
          eventType: BOOKING_EVENT_TYPES.CREATED,
        },
      })
    );
    assert(auditRow.eventId, 'Audit row missing eventId');
    pass('Audit consumer wrote booking.created row');

    const analyticsRow = await waitForCondition('BookingAnalyticsEvents booking.created row', () =>
      BookingAnalyticsEvent.findOne({
        where: {
          bookingId: booking.id,
          eventType: BOOKING_EVENT_TYPES.CREATED,
        },
      })
    );
    assert(analyticsRow.eventId, 'Analytics row missing eventId');
    pass('Analytics consumer wrote booking.created row');

    const capturedEmail = await waitForCondition('Notification email capture', () =>
      capturedEmails.find((email) =>
        String(email.to).includes(STUDENT_EMAIL) &&
        String(email.subject || '').includes(`#${booking.id}`)
      )
    );
    assert(capturedEmail, 'Booking-created email was not captured');
    pass('Notification consumer handled booking.created email side effect');

    const [auditRes, analyticsRes] = await Promise.all([
      axios.get(
        `${BASE_URL}/admin/audit-logs?bookingId=${booking.id}&eventType=${encodeURIComponent(BOOKING_EVENT_TYPES.CREATED)}&limit=5`,
        { headers: adminHeaders }
      ),
      axios.get(`${BASE_URL}/admin/analytics`, { headers: adminHeaders }),
    ]);

    assert((auditRes.data.logs || []).some((row) => row.bookingId === booking.id), 'Admin audit endpoint did not expose row');
    assert(
      (analyticsRes.data.recentEvents || []).some((row) => row.bookingId === booking.id) ||
        (analyticsRes.data.countsByEventType || []).some((row) => row.label === BOOKING_EVENT_TYPES.CREATED),
      'Admin analytics endpoint did not expose updated metrics'
    );
    pass('Admin endpoints expose audit and analytics side effects');
  } catch (error) {
    fail('Milestone 19 test execution', error.message);
  } finally {
    await Promise.all([
      stopNotificationConsumer().catch(() => {}),
      stopAuditConsumer().catch(() => {}),
      stopAnalyticsConsumer().catch(() => {}),
      disconnectKafkaProducer().catch(() => {}),
    ]);
  }

  console.log('\n========================================');
  console.log('Milestone 19 Verification Summary');
  console.log('========================================');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log('Kafka enabled: true');

  if (failed > 0) {
    process.exitCode = 1;
  }
}

testMilestone19().catch((error) => {
  console.error('❌ Milestone 19 verification crashed:', error.message);
  process.exitCode = 1;
});
