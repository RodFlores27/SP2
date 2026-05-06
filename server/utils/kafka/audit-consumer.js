const kafkaConfig = require('../../config/kafka');
const { AuditLog } = require('../../models');
const { ensureBookingEventsTopic, getKafkaClient, isKafkaEnabled } = require('./producer');

let auditConsumer;
let auditConsumerStartPromise;

const IGNORED_AUDIT_EVENT_TYPES = new Set([
  'booking.displaced_slot_reopened',
]);

function parseEventPayload(message) {
  try {
    const value = message?.value?.toString?.() || '{}';
    return JSON.parse(value);
  } catch (error) {
    return null;
  }
}

async function persistAuditLogFromEvent(event, metadata = {}) {
  if (!event || !event.eventType) {
    return {
      handled: false,
      reason: 'Invalid event payload',
    };
  }

  if (IGNORED_AUDIT_EVENT_TYPES.has(String(event.eventType))) {
    return {
      handled: false,
      reason: 'Ignored audit event type',
      ignored: true,
    };
  }

  const payload = event.payload && typeof event.payload === 'object' ? event.payload : {};
  const eventId =
    String(event.eventId || '').trim() ||
    `${metadata.topic || kafkaConfig.topics.bookingEvents}:${metadata.partition}:${metadata.offset}`;

  const record = {
    eventId,
    eventType: String(event.eventType),
    occurredAt: event.occurredAt ? new Date(event.occurredAt) : new Date(),
    topic: metadata.topic || kafkaConfig.topics.bookingEvents,
    partition:
      metadata.partition !== undefined && metadata.partition !== null
        ? Number(metadata.partition)
        : null,
    offset: metadata.offset != null ? String(metadata.offset) : null,
    actorUserId: event.actorUserId ?? null,
    bookingId: event.bookingId ?? null,
    resourceType: event.resourceType ?? null,
    resourceId: event.resourceId ?? null,
    bookingType: event.bookingType ?? null,
    status: event.status ?? null,
    payload,
  };

  if (Number.isNaN(record.occurredAt.getTime())) {
    record.occurredAt = new Date();
  }

  try {
    await AuditLog.create(record);
    return {
      handled: true,
      action: 'auditLogCreated',
      eventId: record.eventId,
    };
  } catch (error) {
    if (error?.name === 'SequelizeUniqueConstraintError') {
      return {
        handled: false,
        reason: 'Duplicate eventId',
        duplicate: true,
      };
    }
    throw error;
  }
}

async function processAuditEvent(event, metadata = {}) {
  try {
    return await persistAuditLogFromEvent(event, metadata);
  } catch (error) {
    return {
      handled: false,
      reason: error.message,
    };
  }
}

async function startAuditConsumer() {
  if (!isKafkaEnabled()) {
    return {
      enabled: false,
      connected: false,
      reason: 'Kafka is disabled',
    };
  }

  if (auditConsumerStartPromise) {
    return auditConsumerStartPromise;
  }

  auditConsumerStartPromise = (async () => {
    try {
      await ensureBookingEventsTopic();
      const client = getKafkaClient();
      auditConsumer = client.consumer({
        groupId: kafkaConfig.consumerGroups.audit,
      });

      await auditConsumer.connect();
      await auditConsumer.subscribe({
        topic: kafkaConfig.topics.bookingEvents,
        fromBeginning: false,
      });
      await auditConsumer.run({
        eachMessage: async ({ topic, partition, message }) => {
          const event = parseEventPayload(message);
          if (!event) {
            console.error('[kafka:audit] Skipping unreadable event payload');
            return;
          }

          const result = await processAuditEvent(event, {
            topic,
            partition,
            offset: message.offset,
          });

          if (!result.handled && result.reason && !result.duplicate && !result.ignored) {
            console.error(
              `[kafka:audit] Failed handling ${event.eventType}: ${result.reason}`
            );
          }
        },
      });

      console.log(
        `[kafka:audit] Consumer connected (group: ${kafkaConfig.consumerGroups.audit})`
      );
      return {
        enabled: true,
        connected: true,
      };
    } catch (error) {
      console.error('[kafka:audit] Consumer startup failed:', error.message);
      auditConsumerStartPromise = null;
      return {
        enabled: true,
        connected: false,
        error: error.message,
      };
    }
  })();

  return auditConsumerStartPromise;
}

async function stopAuditConsumer() {
  if (!auditConsumer) return;
  await auditConsumer.disconnect();
  auditConsumer = null;
  auditConsumerStartPromise = null;
}

module.exports = {
  parseEventPayload,
  persistAuditLogFromEvent,
  processAuditEvent,
  startAuditConsumer,
  stopAuditConsumer,
};
