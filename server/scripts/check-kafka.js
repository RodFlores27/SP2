require('dotenv').config();

const kafkaConfig = require('../config/kafka');
const {
  ensureBookingEventsTopic,
  publishBookingEvent,
  disconnectKafkaProducer,
} = require('../utils/kafka');

async function main() {
  console.log('--- Kafka Foundation Check ---');
  console.log(`Enabled: ${kafkaConfig.enabled}`);
  console.log(`Mode: ${kafkaConfig.inferKafkaMode()}`);
  console.log(`Client ID: ${kafkaConfig.clientId}`);
  console.log(`Brokers: ${kafkaConfig.brokers.join(', ')}`);
  console.log(`SSL: ${kafkaConfig.ssl}`);
  console.log(`SASL configured: ${kafkaConfig.sasl ? 'yes' : 'no'}`);
  console.log(`Booking events topic: ${kafkaConfig.topics.bookingEvents}`);

  if (!kafkaConfig.enabled) {
    console.log('Kafka is disabled. Set KAFKA_ENABLED=true to test broker connectivity.');
    return;
  }

  const validation = kafkaConfig.validateKafkaConfig();
  if (!validation.valid) {
    console.error('Kafka configuration is invalid:');
    validation.errors.forEach((error) => {
      console.error(`- ${error}`);
    });
    if (validation.warnings.length > 0) {
      console.warn('Warnings:');
      validation.warnings.forEach((warning) => {
        console.warn(`- ${warning}`);
      });
    }
    process.exitCode = 1;
    return;
  }

  if (validation.warnings.length > 0) {
    console.warn('Kafka configuration warnings:');
    validation.warnings.forEach((warning) => {
      console.warn(`- ${warning}`);
    });
  }

  const topicResult = await ensureBookingEventsTopic();
  console.log(
    `Topic ${topicResult.topic}: ${topicResult.created ? 'created' : 'already available'}`
  );

  const publishResult = await publishBookingEvent('booking.kafka_foundation_checked', {
    bookingId: 0,
    payload: {
      source: 'server/scripts/check-kafka.js',
      note: 'Milestone 14 connectivity check',
    },
  });

  if (!publishResult.published) {
    throw new Error(publishResult.error || publishResult.reason || 'Kafka publish failed');
  }

  console.log(`Published foundation check event: ${publishResult.event.eventId}`);
}

main()
  .catch((error) => {
    console.error('Kafka foundation check failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectKafkaProducer().catch(() => {});
  });
