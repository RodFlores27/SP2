function readBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function readList(value, fallback) {
  const source = value || fallback;
  return String(source)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildSaslConfig() {
  const username = process.env.KAFKA_USERNAME;
  const password = process.env.KAFKA_PASSWORD;
  if (!username || !password) return null;

  return {
    mechanism: process.env.KAFKA_SASL_MECHANISM || 'plain',
    username,
    password,
  };
}

const kafkaConfig = {
  enabled: readBoolean(process.env.KAFKA_ENABLED, false),
  clientId: process.env.KAFKA_CLIENT_ID || 'ptcf-booking-system',
  brokers: readList(process.env.KAFKA_BROKERS, 'localhost:9092'),
  ssl: readBoolean(process.env.KAFKA_SSL, false),
  sasl: buildSaslConfig(),
  topics: {
    bookingEvents: process.env.KAFKA_BOOKING_EVENTS_TOPIC || 'booking-events',
  },
  consumerGroups: {
    notification:
      process.env.KAFKA_NOTIFICATION_CONSUMER_GROUP || 'notification-consumer',
    audit:
      process.env.KAFKA_AUDIT_CONSUMER_GROUP || 'audit-log-consumer',
    analytics:
      process.env.KAFKA_ANALYTICS_CONSUMER_GROUP || 'analytics-consumer',
  },
};

module.exports = kafkaConfig;
