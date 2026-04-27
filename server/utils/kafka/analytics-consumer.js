const kafkaConfig = require('../../config/kafka');
const { BookingAnalyticsEvent } = require('../../models');
const { ensureBookingEventsTopic, getKafkaClient, isKafkaEnabled } = require('./producer');

let analyticsConsumer;
let analyticsConsumerStartPromise;

function parseEventPayload(message) {
  try {
    const value = message?.value?.toString?.() || '{}';
    return JSON.parse(value);
  } catch (error) {
    return null;
  }
}

async function persistAnalyticsEvent(event, metadata = {}) {
  if (!event || !event.eventType) {
    return {
      handled: false,
      reason: 'Invalid event payload',
    };
  }

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
  };

  if (Number.isNaN(record.occurredAt.getTime())) {
    record.occurredAt = new Date();
  }

  try {
    await BookingAnalyticsEvent.create(record);
    return {
      handled: true,
      action: 'analyticsEventCreated',
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

async function processAnalyticsEvent(event, metadata = {}) {
  try {
    return await persistAnalyticsEvent(event, metadata);
  } catch (error) {
    return {
      handled: false,
      reason: error.message,
    };
  }
}

async function startAnalyticsConsumer() {
  if (!isKafkaEnabled()) {
    return {
      enabled: false,
      connected: false,
      reason: 'Kafka is disabled',
    };
  }

  if (analyticsConsumerStartPromise) {
    return analyticsConsumerStartPromise;
  }

  analyticsConsumerStartPromise = (async () => {
    try {
      await ensureBookingEventsTopic();
      const client = getKafkaClient();
      analyticsConsumer = client.consumer({
        groupId: kafkaConfig.consumerGroups.analytics,
      });

      await analyticsConsumer.connect();
      await analyticsConsumer.subscribe({
        topic: kafkaConfig.topics.bookingEvents,
        fromBeginning: false,
      });
      await analyticsConsumer.run({
        eachMessage: async ({ topic, partition, message }) => {
          const event = parseEventPayload(message);
          if (!event) {
            console.error('[kafka:analytics] Skipping unreadable event payload');
            return;
          }

          const result = await processAnalyticsEvent(event, {
            topic,
            partition,
            offset: message.offset,
          });

          if (!result.handled && result.reason && !result.duplicate) {
            console.error(
              `[kafka:analytics] Failed handling ${event.eventType}: ${result.reason}`
            );
          }
        },
      });

      console.log(
        `[kafka:analytics] Consumer connected (group: ${kafkaConfig.consumerGroups.analytics})`
      );
      return {
        enabled: true,
        connected: true,
      };
    } catch (error) {
      console.error('[kafka:analytics] Consumer startup failed:', error.message);
      analyticsConsumerStartPromise = null;
      return {
        enabled: true,
        connected: false,
        error: error.message,
      };
    }
  })();

  return analyticsConsumerStartPromise;
}

async function stopAnalyticsConsumer() {
  if (!analyticsConsumer) return;
  await analyticsConsumer.disconnect();
  analyticsConsumer = null;
  analyticsConsumerStartPromise = null;
}

module.exports = {
  parseEventPayload,
  persistAnalyticsEvent,
  processAnalyticsEvent,
  startAnalyticsConsumer,
  stopAnalyticsConsumer,
};
