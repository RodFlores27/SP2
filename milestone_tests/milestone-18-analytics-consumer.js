const axios = require('axios');
const path = require('path');
const { checkServerHealth } = require('./utils/test-helpers');

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:4000/api';
const ADMIN_EMAIL = 'admin@uplb.edu.ph';
const ADMIN_PASSWORD = 'admin123';
const SERVER_ROOT = path.join(__dirname, '..', 'server');

require(path.join(SERVER_ROOT, 'node_modules', 'dotenv')).config({
  path: path.join(SERVER_ROOT, '.env'),
});

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

function hasAnalyticsShape(data) {
  return (
    typeof data.totalEvents === 'number' &&
    Array.isArray(data.countsByEventType) &&
    Array.isArray(data.countsByResourceType) &&
    Array.isArray(data.countsByBookingType) &&
    Array.isArray(data.countsByStatus) &&
    Array.isArray(data.recentEvents)
  );
}

async function testMilestone18() {
  console.log('==============================================');
  console.log('Milestone 18 Verification: Analytics Consumer');
  console.log('==============================================\n');

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
    process.env.KAFKA_ANALYTICS_CONSUMER_GROUP =
      process.env.KAFKA_ANALYTICS_CONSUMER_GROUP ||
      `analytics-consumer-test-${Date.now()}-${process.pid}`;
  }

  const adminHeaders = { Authorization: `Bearer ${adminToken}` };
  const {
    BOOKING_EVENT_TYPES,
    disconnectKafkaProducer,
    publishBookingEvent,
    processAnalyticsEvent,
    startAnalyticsConsumer,
    stopAnalyticsConsumer,
  } = loadServerModule('utils/kafka');
  const { BookingAnalyticsEvent } = loadServerModule('models');

  try {
    if (BOOKING_EVENT_TYPES.CREATED && BOOKING_EVENT_TYPES.APPROVED) {
      pass('Booking event constants are available');
    } else {
      fail('Booking event constants', 'Missing expected lifecycle constants');
    }

    try {
      const res = await axios.get(`${BASE_URL}/admin/analytics`, {
        headers: adminHeaders,
      });
      if (hasAnalyticsShape(res.data)) {
        pass('GET /admin/analytics returns structured response');
      } else {
        fail('GET /admin/analytics response shape', 'Expected analytics arrays and totalEvents');
      }
    } catch (error) {
      const msg = error.response?.data?.error || error.message;
      fail('GET /admin/analytics', msg);
    }

    const directEventId = `analytics-direct-test-${Date.now()}`;
    const directEvent = {
      eventId: directEventId,
      eventType: 'booking.analytics_direct_test',
      occurredAt: new Date().toISOString(),
      actorUserId: null,
      bookingId: null,
      resourceType: 'equipment',
      resourceId: 1,
      bookingType: 'pencil',
      status: 'penciled',
      payload: {
        source: 'milestone-18-direct-test',
      },
    };

    const firstPersist = await processAnalyticsEvent(directEvent, {
      topic: 'booking-events',
      partition: 0,
      offset: directEventId,
    });
    const duplicatePersist = await processAnalyticsEvent(directEvent, {
      topic: 'booking-events',
      partition: 0,
      offset: `${directEventId}-duplicate`,
    });
    const directRows = await BookingAnalyticsEvent.count({
      where: { eventId: directEventId },
    });

    if (firstPersist.handled && duplicatePersist.duplicate && directRows === 1) {
      pass('Analytics event persistence deduplicates by eventId');
    } else {
      fail(
        'Analytics event deduplication',
        `handled=${firstPersist.handled}, duplicate=${duplicatePersist.duplicate}, rows=${directRows}`
      );
    }

    if (!kafkaEnabled) {
      const result = await startAnalyticsConsumer();
      if (result.enabled === false && result.connected === false) {
        pass('Analytics consumer stays disabled cleanly when Kafka is disabled');
      } else {
        fail('Analytics consumer disabled mode', 'Expected enabled=false, connected=false');
      }
    } else {
      const startResult = await startAnalyticsConsumer();
      if (!startResult.connected) {
        fail('Analytics consumer startup', startResult.error || 'Not connected');
      } else {
        pass('Analytics consumer startup succeeds when Kafka is enabled');
      }

      const eventId = `analytics-kafka-test-${Date.now()}`;
      const testEventType = 'booking.analytics_test';
      const publishResult = await publishBookingEvent(testEventType, {
        eventId,
        actorUserId: null,
        bookingId: null,
        resourceType: 'room',
        resourceId: 1,
        bookingType: 'firm',
        status: 'approved',
        payload: {
          source: 'milestone-18-test',
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
        const row = await BookingAnalyticsEvent.findOne({ where: { eventId } });
        if (row) {
          found = true;
          break;
        }
      }

      if (found) {
        pass('Published event is persisted to BookingAnalyticsEvents by consumer');
      } else {
        fail('Analytics persistence', 'Published eventId not found in BookingAnalyticsEvents');
      }
    }
  } catch (error) {
    fail('Milestone 18 test execution', error.message);
  } finally {
    await stopAnalyticsConsumer().catch(() => {});
    await disconnectKafkaProducer().catch(() => {});
  }

  console.log('\n========================================');
  console.log('Milestone 18 Verification Summary');
  console.log('========================================');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Kafka enabled: ${kafkaEnabled}`);

  if (failed > 0) {
    process.exitCode = 1;
  }
}

testMilestone18().catch((error) => {
  console.error('❌ Milestone 18 verification crashed:', error.message);
  process.exitCode = 1;
});
