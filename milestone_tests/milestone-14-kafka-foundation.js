const path = require('path');
const { checkServerHealth } = require('./utils/test-helpers');

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:4000/api';
const SERVER_ROOT = path.join(__dirname, '..', 'server');

function loadServerModule(relativePath) {
  return require(path.join(SERVER_ROOT, relativePath));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function runStep(name, fn) {
  try {
    await fn();
    console.log(`✅ ${name}`);
    return true;
  } catch (error) {
    console.log(`❌ ${name}`);
    console.log(`   ${error.message}`);
    return false;
  }
}

async function testMilestone14() {
  console.log('========================================');
  console.log('Milestone 14 Verification: Kafka Foundation');
  console.log('========================================\n');

  const results = [];

  results.push(await runStep('Server health check passes', async () => {
    const healthCheck = await checkServerHealth(BASE_URL);
    assert(healthCheck.success, healthCheck.error || 'Server health check failed');
  }));

  results.push(await runStep('Kafka config exposes safe defaults', async () => {
    const kafkaConfig = loadServerModule('config/kafka');
    assert(Array.isArray(kafkaConfig.brokers), 'kafkaConfig.brokers should be an array');
    assert(kafkaConfig.brokers.length > 0, 'At least one Kafka broker should be configured');
    assert(kafkaConfig.clientId, 'Kafka client ID should be configured');
    assert(
      kafkaConfig.topics.bookingEvents === 'booking-events' || Boolean(process.env.KAFKA_BOOKING_EVENTS_TOPIC),
      'Booking events topic should default to booking-events'
    );
  }));

  results.push(await runStep('Booking event builder creates the expected event envelope', async () => {
    const { buildBookingEvent } = loadServerModule('utils/kafka');
    const event = buildBookingEvent('booking.created', {
      actorUserId: 1,
      bookingId: 123,
      resourceType: 'equipment',
      resourceId: 2,
      bookingType: 'pencil',
      status: 'penciled',
      payload: { test: true },
    });

    assert(event.eventId, 'eventId is required');
    assert(event.eventType === 'booking.created', 'eventType should be preserved');
    assert(event.occurredAt, 'occurredAt is required');
    assert(event.actorUserId === 1, 'actorUserId should be preserved');
    assert(event.bookingId === 123, 'bookingId should be preserved');
    assert(event.payload.test === true, 'payload should be preserved');
  }));

  results.push(await runStep('Producer helper skips safely when Kafka is disabled', async () => {
    const { publishBookingEvent, disconnectKafkaProducer } = loadServerModule('utils/kafka');
    const result = await publishBookingEvent('booking.created', {
      bookingId: 999,
      payload: { test: 'disabled-path' },
    });

    if (process.env.KAFKA_ENABLED === 'true') {
      assert(
        result.published || result.error,
        'When Kafka is enabled, publish should either succeed or return a clear error'
      );
    } else {
      assert(result.published === false, 'Publish should be skipped when Kafka is disabled');
      assert(result.enabled === false, 'Result should say Kafka is disabled');
    }

    await disconnectKafkaProducer().catch(() => {});
  }));

  if (process.env.KAFKA_ENABLED === 'true') {
    results.push(await runStep('Kafka topic check succeeds when Kafka is enabled', async () => {
      const {
        ensureBookingEventsTopic,
        publishBookingEvent,
        disconnectKafkaProducer,
      } = loadServerModule('utils/kafka');

      const topicResult = await ensureBookingEventsTopic();
      assert(topicResult.enabled === true, 'Topic check should run when Kafka is enabled');
      assert(topicResult.topic, 'Topic name should be returned');

      const publishResult = await publishBookingEvent('booking.kafka_foundation_checked', {
        bookingId: 0,
        payload: { source: 'milestone-14-test' },
      });
      assert(publishResult.published === true, publishResult.error || 'Kafka publish failed');

      await disconnectKafkaProducer().catch(() => {});
    }));
  } else {
    console.log('ℹ️ Kafka broker connectivity test skipped because KAFKA_ENABLED is not true.');
  }

  const passed = results.filter(Boolean).length;
  const failed = results.length - passed;

  console.log('\n========================================');
  console.log('Milestone 14 Verification Summary');
  console.log('========================================');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Kafka enabled: ${process.env.KAFKA_ENABLED === 'true'}`);

  if (failed > 0) {
    process.exitCode = 1;
  }
}

testMilestone14().catch((error) => {
  console.error('❌ Milestone 14 verification crashed:', error.message);
  process.exitCode = 1;
});
