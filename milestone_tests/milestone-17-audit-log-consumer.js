const axios = require('axios');
const path = require('path');
const { checkServerHealth } = require('./utils/test-helpers');

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:4000/api';
const ADMIN_EMAIL = 'admin@uplb.edu.ph';
const ADMIN_PASSWORD = 'admin123';
const SERVER_ROOT = path.join(__dirname, '..', 'server');

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

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadServerModule(relativePath) {
  return require(path.join(SERVER_ROOT, relativePath));
}

async function loginAdmin() {
  const res = await axios.post(`${BASE_URL}/auth/login`, {
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
  });
  return res.data.token;
}

async function testMilestone17() {
  console.log('========================================');
  console.log('Milestone 17 Verification: Audit Log Consumer');
  console.log('========================================\n');

  const healthCheck = await checkServerHealth(BASE_URL);
  if (!healthCheck.success) {
    fail('Server health check', healthCheck.error || 'Server unavailable');
    return;
  }
  pass('Server health check passes');

  let adminToken = '';
  try {
    adminToken = await loginAdmin();
    pass('Admin login succeeds');
  } catch (error) {
    fail('Admin login', error.response?.data?.message || error.message);
    return;
  }

  const kafkaEnabled = process.env.KAFKA_ENABLED === 'true';
  if (kafkaEnabled) {
    // Avoid partition assignment races with any already-running server consumer.
    process.env.KAFKA_AUDIT_CONSUMER_GROUP =
      process.env.KAFKA_AUDIT_CONSUMER_GROUP ||
      `audit-log-consumer-test-${Date.now()}-${process.pid}`;
  }

  const adminHeaders = { Authorization: `Bearer ${adminToken}` };
  const { BOOKING_EVENT_TYPES, disconnectKafkaProducer, publishBookingEvent } =
    loadServerModule('utils/kafka');
  const { startAuditConsumer, stopAuditConsumer } = loadServerModule('utils/kafka');

  try {
    if (BOOKING_EVENT_TYPES.CREATED && BOOKING_EVENT_TYPES.APPROVED) {
      pass('Booking event constants are available');
    } else {
      fail('Booking event constants', 'Missing expected lifecycle constants');
    }

    try {
      const res = await axios.get(`${BASE_URL}/admin/audit-logs?limit=5`, {
        headers: adminHeaders,
      });
      if (Array.isArray(res.data.logs) && typeof res.data.count === 'number') {
        pass('GET /admin/audit-logs returns structured response');
      } else {
        fail('GET /admin/audit-logs response shape', 'Expected {count, logs[]}');
      }
    } catch (error) {
      const msg = error.response?.data?.error || error.message;
      fail('GET /admin/audit-logs', msg);
    }

    if (!kafkaEnabled) {
      const result = await startAuditConsumer();
      if (result.enabled === false && result.connected === false) {
        pass('Audit consumer stays disabled cleanly when Kafka is disabled');
      } else {
        fail('Audit consumer disabled mode', 'Expected enabled=false, connected=false');
      }
    } else {
      const startResult = await startAuditConsumer();
      if (!startResult.connected) {
        fail('Audit consumer startup', startResult.error || 'Not connected');
      } else {
        pass('Audit consumer startup succeeds when Kafka is enabled');
      }

      const eventId = `audit-test-${Date.now()}`;
      const testEventType = 'booking.audit_test';
      const publishResult = await publishBookingEvent(testEventType, {
        eventId,
        actorUserId: null,
        bookingId: null,
        resourceType: 'equipment',
        resourceId: 1,
        bookingType: 'pencil',
        status: 'penciled',
        payload: {
          source: 'milestone-17-test',
        },
      });

      if (!publishResult.published) {
        fail('Publish test event to Kafka', publishResult.error || publishResult.reason);
      } else {
        pass('Publish test event to Kafka succeeds');
      }

      let found = false;
      for (let i = 0; i < 10; i += 1) {
        await wait(500);
        const res = await axios.get(
          `${BASE_URL}/admin/audit-logs?eventType=${encodeURIComponent(testEventType)}&limit=25`,
          { headers: adminHeaders }
        );
        const match = (res.data.logs || []).find((row) => row.eventId === eventId);
        if (match) {
          found = true;
          break;
        }
      }

      if (found) {
        pass('Published event is persisted to AuditLogs by consumer');
      } else {
        fail('Audit log persistence', 'Published eventId not found in /admin/audit-logs');
      }
    }
  } catch (error) {
    fail('Milestone 17 test execution', error.message);
  } finally {
    await stopAuditConsumer().catch(() => {});
    await disconnectKafkaProducer().catch(() => {});
  }

  console.log('\n========================================');
  console.log('Milestone 17 Verification Summary');
  console.log('========================================');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Kafka enabled: ${kafkaEnabled}`);

  if (failed > 0) {
    process.exitCode = 1;
  }
}

testMilestone17().catch((error) => {
  console.error('❌ Milestone 17 verification crashed:', error.message);
  process.exitCode = 1;
});
