const fs = require('fs');
const path = require('path');
const { checkServerHealth } = require('./utils/test-helpers');

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:4000/api';
const ROOT = path.join(__dirname, '..');
const SERVER_ROOT = path.join(ROOT, 'server');

const REQUIRED_EVENT_TYPES = [
  'booking.created',
  'booking.approved',
  'booking.denied',
  'booking.cancelled',
  'booking.expired',
  'booking.expiring_soon',
  'booking.contention_started',
  'booking.converted_to_firm',
  'booking.displaced_slot_reopened',
];

const CONTROLLER_EVENT_CONSTANTS = [
  'CREATED',
  'APPROVED',
  'DENIED',
  'CANCELLED',
  'CONTENTION_STARTED',
  'CONVERTED_TO_FIRM',
  'DISPLACED_SLOT_REOPENED',
];

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

async function testMilestone15() {
  console.log('========================================');
  console.log('Milestone 15 Verification: Booking Event Publishing');
  console.log('========================================\n');

  await step('Server health check passes', async () => {
    const health = await checkServerHealth(BASE_URL);
    assert(health.success, health.error || 'Server health check failed');
  });

  await step('Booking event type contract includes the expected lifecycle events', async () => {
    const { BOOKING_EVENT_TYPES } = loadServerModule('utils/kafka');
    const actual = Object.values(BOOKING_EVENT_TYPES);
    for (const eventType of REQUIRED_EVENT_TYPES) {
      assert(actual.includes(eventType), `Missing event type: ${eventType}`);
    }
  });

  await step('Booking event data builder preserves booking metadata and payload', async () => {
    const { bookingEventData } = loadServerModule('utils/kafka/booking-events');
    const eventData = bookingEventData(
      {
        id: 42,
        userId: 7,
        resourceType: 'equipment',
        resourceId: 3,
        bookingType: 'firm',
        status: 'approved',
        startTime: '2026-05-01T01:00:00.000Z',
        endTime: '2026-05-01T03:00:00.000Z',
      },
      {
        actorUserId: 9,
        resourceName: 'Autoclave',
        payload: { approvedByUserId: 9 },
      }
    );

    assert(eventData.actorUserId === 9, 'actorUserId should be preserved');
    assert(eventData.bookingId === 42, 'bookingId should come from booking.id');
    assert(eventData.resourceType === 'equipment', 'resourceType should be preserved');
    assert(eventData.status === 'approved', 'status should be preserved');
    assert(eventData.payload.userId === 7, 'payload should include booking userId');
    assert(eventData.payload.resourceName === 'Autoclave', 'payload should include resourceName');
    assert(eventData.payload.approvedByUserId === 9, 'custom payload should be merged');
  });

  await step('Controller publishes booking lifecycle events after DB actions', async () => {
    const source = readServerFile('controllers/booking.controller.js');
    assert(source.includes('publishBookingLifecycleEvent'), 'Controller should import publisher helper');
    for (const constant of CONTROLLER_EVENT_CONSTANTS) {
      assert(
        source.includes(`BOOKING_EVENT_TYPES.${constant}`),
        `Controller missing BOOKING_EVENT_TYPES.${constant}`
      );
    }
  });

  await step('Cron job publishes expiry and warning events', async () => {
    const source = readServerFile('jobs/booking-expiry.js');
    assert(source.includes('BOOKING_EVENT_TYPES.EXPIRED'), 'Cron should publish EXPIRED events');
    assert(source.includes('BOOKING_EVENT_TYPES.EXPIRING_SOON'), 'Cron should publish EXPIRING_SOON events');
  });

  await step('Publisher returns a controlled result for the current Kafka mode', async () => {
    const { publishBookingLifecycleEvent, BOOKING_EVENT_TYPES } = loadServerModule('utils/kafka');
    const result = await publishBookingLifecycleEvent(BOOKING_EVENT_TYPES.CREATED, {
      id: 515,
      resourceType: 'equipment',
      resourceId: 1,
      bookingType: 'pencil',
      status: 'penciled',
    });

    if (process.env.KAFKA_ENABLED === 'true') {
      assert(result.published || result.error, 'Enabled publish should succeed or return a clear error');
    } else {
      assert(result.published === false, 'Disabled publish should be skipped');
      assert(result.enabled === false, 'Disabled publish should report enabled=false');
    }
  });

  if (process.env.KAFKA_ENABLED === 'true') {
    await step('Live Kafka publish works when KAFKA_ENABLED=true', async () => {
      const {
        BOOKING_EVENT_TYPES,
        disconnectKafkaProducer,
        ensureBookingEventsTopic,
        publishBookingLifecycleEvent,
      } = loadServerModule('utils/kafka');

      await ensureBookingEventsTopic();
      const result = await publishBookingLifecycleEvent(BOOKING_EVENT_TYPES.CREATED, {
        id: 1515,
        resourceType: 'equipment',
        resourceId: 1,
        bookingType: 'pencil',
        status: 'penciled',
      }, {
        payload: { source: 'milestone-15-test' },
      });
      assert(result.published === true, result.error || 'Live Kafka publish failed');
      await disconnectKafkaProducer().catch(() => {});
    });
  } else {
    console.log('Info: live Kafka publish skipped because KAFKA_ENABLED is not true.');
  }

  console.log('\n========================================');
  console.log('Milestone 15 Verification Summary');
  console.log('========================================');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Kafka enabled: ${process.env.KAFKA_ENABLED === 'true'}`);

  if (failed > 0) process.exitCode = 1;
}

testMilestone15().catch((error) => {
  console.error('Milestone 15 verification crashed:', error.message);
  process.exitCode = 1;
});
