const fs = require('fs');
const path = require('path');
const { checkServerHealth } = require('./utils/test-helpers');

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:4000/api';
const ROOT = path.join(__dirname, '..');
const SERVER_ROOT = path.join(ROOT, 'server');

let passed = 0;
let failed = 0;

function pass(label) {
  console.log(`✅ ${label}`);
  passed += 1;
}

function fail(label, error) {
  console.log(`❌ ${label}`);
  console.log(`   ${error?.message || error}`);
  failed += 1;
}

async function step(label, fn) {
  try {
    await fn();
    pass(label);
  } catch (error) {
    fail(label, error);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function loadServerModule(relativePath) {
  return require(path.join(SERVER_ROOT, relativePath));
}

function readServerFile(relativePath) {
  return fs.readFileSync(path.join(SERVER_ROOT, relativePath), 'utf8');
}

async function testMilestone16() {
  console.log('========================================');
  console.log('Milestone 16 Verification: Notification Consumer');
  console.log('========================================\n');

  await step('Server health check passes', async () => {
    const health = await checkServerHealth(BASE_URL);
    assert(health.success, health.error || 'Server health check failed');
  });

  await step('Kafka notification consumer module exports expected API', async () => {
    const kafka = loadServerModule('utils/kafka');
    assert(typeof kafka.startNotificationConsumer === 'function', 'startNotificationConsumer export missing');
    assert(typeof kafka.stopNotificationConsumer === 'function', 'stopNotificationConsumer export missing');
    assert(
      typeof kafka.processBookingNotificationEvent === 'function',
      'processBookingNotificationEvent export missing'
    );
  });

  await step('Booking event contract includes notification lifecycle event names', async () => {
    const { BOOKING_EVENT_TYPES } = loadServerModule('utils/kafka');
    const required = [
      'CREATED',
      'APPROVED',
      'DENIED',
      'CANCELLED',
      'EXPIRED',
      'EXPIRING_SOON',
      'CONTENTION_STARTED',
      'DISPLACED_SLOT_REOPENED',
    ];
    for (const key of required) {
      assert(BOOKING_EVENT_TYPES[key], `Missing BOOKING_EVENT_TYPES.${key}`);
    }
  });

  await step('Controller uses Kafka-enabled guard around direct notification sends', async () => {
    const source = readServerFile('controllers/booking.controller.js');
    assert(source.includes('if (!isKafkaEnabled())'), 'Expected fallback guard around notification calls');
    assert(source.includes('notifyBookingCreated'), 'Expected notifyBookingCreated usage');
    assert(source.includes('notifyBookingApproved'), 'Expected notifyBookingApproved usage');
    assert(source.includes('notifyBookingDenied'), 'Expected notifyBookingDenied usage');
    assert(source.includes('notifyBookingCancelled'), 'Expected notifyBookingCancelled usage');
  });

  await step('Expiry job uses Kafka-enabled guard around direct notification sends', async () => {
    const source = readServerFile('jobs/booking-expiry.js');
    assert(source.includes('if (!isKafkaEnabled())'), 'Expected fallback guard in cron notifications');
    assert(source.includes('notifyBookingExpired'), 'Expected notifyBookingExpired usage');
    assert(source.includes('notifyBookingExpiringSoon'), 'Expected notifyBookingExpiringSoon usage');
  });

  await step('Notification processor skips invalid and unsupported events safely', async () => {
    const { processBookingNotificationEvent } = loadServerModule('utils/kafka');
    const invalidResult = await processBookingNotificationEvent(null);
    assert(invalidResult.handled === false, 'Invalid event should not be handled');

    const unsupportedResult = await processBookingNotificationEvent({
      eventType: 'booking.some_new_event',
      payload: {},
    });
    assert(unsupportedResult.handled === false, 'Unsupported event should not be handled');
  });

  await step('Notification consumer returns controlled startup result', async () => {
    const {
      ensureBookingEventsTopic,
      isKafkaEnabled,
      startNotificationConsumer,
      stopNotificationConsumer,
    } = loadServerModule('utils/kafka');

    if (isKafkaEnabled()) {
      await ensureBookingEventsTopic();
      const result = await startNotificationConsumer();
      assert(
        result.connected || result.error,
        'Enabled mode should connect consumer or return clear startup error'
      );
      await stopNotificationConsumer().catch(() => {});
    } else {
      const result = await startNotificationConsumer();
      assert(result.enabled === false, 'Disabled mode should report enabled=false');
      assert(result.connected === false, 'Disabled mode should report connected=false');
    }
  });

  console.log('\n========================================');
  console.log('Milestone 16 Verification Summary');
  console.log('========================================');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Kafka enabled: ${process.env.KAFKA_ENABLED === 'true'}`);

  if (failed > 0) process.exitCode = 1;
}

testMilestone16().catch((error) => {
  console.error('Milestone 16 verification crashed:', error.message);
  process.exitCode = 1;
});
