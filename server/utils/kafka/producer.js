const { randomUUID } = require('crypto');
const { Kafka, Partitioners, logLevel } = require('kafkajs');
const kafkaConfig = require('../../config/kafka');

let kafkaClient;
let producer;
let connectPromise;

function isKafkaEnabled() {
  return kafkaConfig.enabled;
}

function getKafkaClient() {
  if (!isKafkaEnabled()) return null;
  if (!kafkaClient) {
    kafkaClient = new Kafka({
      clientId: kafkaConfig.clientId,
      brokers: kafkaConfig.brokers,
      ssl: kafkaConfig.ssl,
      sasl: kafkaConfig.sasl || undefined,
      connectionTimeout: 3000,
      requestTimeout: 5000,
      retry: {
        initialRetryTime: 300,
        retries: 3,
      },
      logLevel: logLevel.WARN,
    });
  }
  return kafkaClient;
}

async function ensureBookingEventsTopic() {
  const client = getKafkaClient();
  if (!client) {
    return {
      enabled: false,
      topic: kafkaConfig.topics.bookingEvents,
      created: false,
    };
  }

  const admin = client.admin();
  await admin.connect();
  try {
    const existingTopics = await admin.listTopics();
    const topic = kafkaConfig.topics.bookingEvents;
    if (!existingTopics.includes(topic)) {
      const shouldCreateTopic =
        kafkaConfig.autoCreateTopics || kafkaConfig.inferKafkaMode() === 'local';

      if (!shouldCreateTopic) {
        throw new Error(
          `Kafka topic "${topic}" does not exist. Create it in Aiven first, or set KAFKA_AUTO_CREATE_TOPICS=true if the service user is allowed to create topics.`
        );
      }

      await admin.createTopics({
        topics: [{ topic, numPartitions: 1, replicationFactor: 1 }],
        waitForLeaders: true,
      });
      return { enabled: true, topic, created: true };
    }
    return { enabled: true, topic, created: false };
  } catch (error) {
    const topic = kafkaConfig.topics.bookingEvents;
    const message = [
      `Unable to ensure Kafka topic "${topic}" is available.`,
      'If this is an Aiven production cluster, create the topic ahead of time or grant topic-management permissions to this service user.',
      `Original error: ${error.message}`,
    ].join(' ');
    throw new Error(message);
  } finally {
    await admin.disconnect();
  }
}

async function connectKafkaProducer() {
  const client = getKafkaClient();
  if (!client) {
    return {
      enabled: false,
      connected: false,
      reason: 'Kafka is disabled',
    };
  }

  if (!producer) {
    producer = client.producer({
      createPartitioner: Partitioners.LegacyPartitioner,
    });
  }

  if (!connectPromise) {
    connectPromise = producer.connect().then(() => {
      console.log(
        `[kafka] Producer connected to ${kafkaConfig.brokers.join(', ')}`
      );
      return {
        enabled: true,
        connected: true,
      };
    }).catch((error) => {
      connectPromise = null;
      console.error('[kafka] Producer connection failed:', error.message);
      return {
        enabled: true,
        connected: false,
        error: error.message,
      };
    });
  }

  return connectPromise;
}

function buildBookingEvent(eventType, data = {}) {
  const now = new Date().toISOString();
  return {
    eventId: data.eventId || randomUUID(),
    eventType,
    occurredAt: data.occurredAt || now,
    actorUserId: data.actorUserId ?? null,
    bookingId: data.bookingId ?? null,
    resourceType: data.resourceType ?? null,
    resourceId: data.resourceId ?? null,
    bookingType: data.bookingType ?? null,
    status: data.status ?? null,
    payload: data.payload || {},
  };
}

async function publishBookingEvent(eventType, data = {}) {
  if (!eventType) {
    throw new Error('eventType is required to publish a booking event');
  }

  // Build event once, before deciding the delivery path.
  const event = buildBookingEvent(eventType, data);

  if (!isKafkaEnabled()) {
    // Dispatch in-process so audit logs and analytics are still written.
    // Notifications are handled via existing isKafkaEnabled() fallbacks in
    // booking.controller.js and booking-expiry.js — do not register them here.
    // setImmediate defers emission to the next I/O cycle, matching the async
    // delivery semantics callers expect and keeping HTTP responses non-blocking.
    const dispatcher = require('../event-dispatcher');
    setImmediate(() => dispatcher.emit('booking-event', event));
    return {
      published: true,
      enabled: false,
      dispatched: 'local',
      topic: kafkaConfig.topics.bookingEvents,
      event,
    };
  }

  const connection = await connectKafkaProducer();
  if (!connection.connected) {
    return {
      published: false,
      enabled: true,
      topic: kafkaConfig.topics.bookingEvents,
      error: connection.error || 'Kafka producer is not connected',
    };
  }

  // event already built above — use it directly.
  const key = event.bookingId ? String(event.bookingId) : event.eventId;

  await producer.send({
    topic: kafkaConfig.topics.bookingEvents,
    messages: [{
      key,
      value: JSON.stringify(event),
      headers: {
        eventType,
      },
    }],
  });

  return {
    published: true,
    enabled: true,
    topic: kafkaConfig.topics.bookingEvents,
    event,
  };
}

async function disconnectKafkaProducer() {
  if (!producer) return;
  await producer.disconnect();
  producer = null;
  connectPromise = null;
}

module.exports = {
  buildBookingEvent,
  connectKafkaProducer,
  disconnectKafkaProducer,
  ensureBookingEventsTopic,
  getKafkaClient,
  isKafkaEnabled,
  publishBookingEvent,
};
