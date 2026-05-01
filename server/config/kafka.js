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

function normalizePem(raw) {
  if (!raw || !String(raw).trim()) return null;
  return String(raw)
    .replace(/\\n/g, '\n')
    .trim();
}

function buildSslConfig() {
  const sslEnabled = readBoolean(process.env.KAFKA_SSL, false);
  if (!sslEnabled) return false;

  const ca = normalizePem(process.env.KAFKA_CA_CERT);
  if (!ca) return true;

  return {
    rejectUnauthorized: true,
    ca: [ca],
  };
}

function isLocalBroker(broker) {
  const normalized = String(broker || '').trim().toLowerCase();
  return (
    normalized.startsWith('localhost:') ||
    normalized.startsWith('127.0.0.1:') ||
    normalized.startsWith('0.0.0.0:')
  );
}

const kafkaConfig = {
  enabled: readBoolean(process.env.KAFKA_ENABLED, false),
  clientId: process.env.KAFKA_CLIENT_ID || 'ptcf-booking-system',
  brokers: readList(process.env.KAFKA_BROKERS, 'localhost:9092'),
  ssl: buildSslConfig(),
  sslCaConfigured: Boolean(normalizePem(process.env.KAFKA_CA_CERT)),
  sasl: buildSaslConfig(),
  autoCreateTopics: readBoolean(process.env.KAFKA_AUTO_CREATE_TOPICS, false),
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

function inferKafkaMode(config = kafkaConfig) {
  if (!config.enabled) return 'disabled';
  const brokers = Array.isArray(config.brokers) ? config.brokers : [];
  if (brokers.length === 0) return 'invalid';
  return brokers.every(isLocalBroker) && !config.ssl && !config.sasl
    ? 'local'
    : 'hosted';
}

function validateKafkaConfig(config = kafkaConfig) {
  const errors = [];
  const warnings = [];

  if (!config.enabled) {
    return {
      enabled: false,
      valid: true,
      mode: 'disabled',
      errors,
      warnings,
    };
  }

  const brokers = Array.isArray(config.brokers) ? config.brokers : [];
  const rawUsername = process.env.KAFKA_USERNAME;
  const rawPassword = process.env.KAFKA_PASSWORD;
  const rawMechanism = process.env.KAFKA_SASL_MECHANISM;
  const rawCaCert = normalizePem(process.env.KAFKA_CA_CERT);
  const hasUsername = Boolean(rawUsername && String(rawUsername).trim());
  const hasPassword = Boolean(rawPassword && String(rawPassword).trim());
  const hasMechanism = Boolean(rawMechanism && String(rawMechanism).trim());
  const hasCaCert = Boolean(rawCaCert);
  const mode = inferKafkaMode(config);

  if (brokers.length === 0) {
    errors.push(
      'KAFKA_BROKERS must include at least one broker when KAFKA_ENABLED=true.'
    );
  }

  if (hasUsername !== hasPassword) {
    errors.push(
      'KAFKA_USERNAME and KAFKA_PASSWORD must either both be set or both be omitted.'
    );
  }

  if (hasMechanism && !config.sasl) {
    errors.push(
      'KAFKA_SASL_MECHANISM was provided, but Kafka SASL credentials are incomplete.'
    );
  }

  if (mode === 'hosted' && !config.ssl) {
    errors.push(
      'Hosted Kafka configuration detected, but KAFKA_SSL is false. Aiven production Kafka should use KAFKA_SSL=true.'
    );
  }

  if (mode === 'hosted' && !config.sasl) {
    warnings.push(
      'Hosted Kafka configuration detected without SASL credentials. Aiven production Kafka normally requires KAFKA_USERNAME and KAFKA_PASSWORD.'
    );
  }

  if (mode === 'hosted' && !hasCaCert) {
    warnings.push(
      'Hosted Kafka configuration detected without KAFKA_CA_CERT. If Aiven Quick Connect shows ssl.ca.location/ca.pem, add the CA certificate to Render.'
    );
  }

  if (mode === 'local' && config.ssl) {
    warnings.push(
      'Local Kafka configuration is using SSL. Confirm this is intentional for your development broker.'
    );
  }

  return {
    enabled: true,
    valid: errors.length === 0,
    mode,
    errors,
    warnings,
  };
}

module.exports = {
  ...kafkaConfig,
  inferKafkaMode,
  validateKafkaConfig,
};
