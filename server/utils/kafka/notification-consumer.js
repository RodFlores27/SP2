const kafkaConfig = require('../../config/kafka');
const { Booking, User, Equipment, Room } = require('../../models');
const {
  notifyBookingApproved,
  notifyBookingCancelled,
  notifyBookingCreated,
  notifyBookingDenied,
  notifyBookingExpired,
  notifyBookingExpiringSoon,
  notifyBookingOnHold,
  notifyBookingOnHoldReleased,
  notifyBookingDisplaced,
  notifyContentionResolved,
  notifyContentionStarted,
  notifyDisplacedUsersSlotReopened,
} = require('../booking-notifications');
const { BOOKING_EVENT_TYPES } = require('./booking-events');
const { ensureBookingEventsTopic, getKafkaClient, isKafkaEnabled } = require('./producer');

let notificationConsumer;
let notificationConsumerStartPromise;

function parseEventPayload(message) {
  try {
    const value = message?.value?.toString?.() || '{}';
    return JSON.parse(value);
  } catch (error) {
    return null;
  }
}

async function resolveResourceName(resourceType, resourceId) {
  try {
    if (resourceType === 'equipment') {
      const eq = await Equipment.findByPk(resourceId, { attributes: ['name'] });
      return eq?.name ?? `Equipment #${resourceId}`;
    }
    if (resourceType === 'room') {
      const rm = await Room.findByPk(resourceId, { attributes: ['name'] });
      return rm?.name ?? `Room #${resourceId}`;
    }
  } catch {
    // non-fatal fallback
  }
  return `Resource #${resourceId}`;
}

async function loadBookingForNotification(bookingId) {
  if (!bookingId) return null;
  return Booking.findByPk(bookingId, {
    include: [{ model: User, as: 'user', attributes: ['id', 'email'] }],
  });
}

async function processBookingNotificationEvent(event) {
  if (!event || !event.eventType) {
    return { handled: false, reason: 'Invalid event payload' };
  }

  const payload = event.payload || {};
  const eventMeta = { eventId: event.eventId || null, eventType: event.eventType };
  const booking = await loadBookingForNotification(event.bookingId);
  const resourceName = await resolveResourceName(event.resourceType, event.resourceId);

  switch (event.eventType) {
    case BOOKING_EVENT_TYPES.CREATED: {
      if (!booking) return { handled: false, reason: 'Booking not found' };
      await notifyBookingCreated(booking, resourceName, { eventMeta });
      return { handled: true, action: 'notifyBookingCreated' };
    }
    case BOOKING_EVENT_TYPES.APPROVED: {
      if (!booking) return { handled: false, reason: 'Booking not found' };
      await notifyBookingApproved(booking, resourceName, { eventMeta });
      return { handled: true, action: 'notifyBookingApproved' };
    }
    case BOOKING_EVENT_TYPES.DENIED: {
      if (!booking) return { handled: false, reason: 'Booking not found' };
      await notifyBookingDenied(booking, resourceName, { eventMeta });
      return { handled: true, action: 'notifyBookingDenied' };
    }
    case BOOKING_EVENT_TYPES.CANCELLED: {
      if (!booking) return { handled: false, reason: 'Booking not found' };
      const cancelledByUserId = payload.cancelledByUserId || event.actorUserId || null;
      await notifyBookingCancelled(booking, resourceName, cancelledByUserId, { eventMeta });
      return { handled: true, action: 'notifyBookingCancelled' };
    }
    case BOOKING_EVENT_TYPES.EXPIRED: {
      if (!booking) return { handled: false, reason: 'Booking not found' };
      await notifyBookingExpired(booking, resourceName, { eventMeta });
      return { handled: true, action: 'notifyBookingExpired' };
    }
    case BOOKING_EVENT_TYPES.EXPIRING_SOON: {
      if (!booking) return { handled: false, reason: 'Booking not found' };
      const hoursLeft = Number(payload.hoursLeft) === 24 ? 24 : 48;
      await notifyBookingExpiringSoon(booking, resourceName, hoursLeft, { eventMeta });
      return { handled: true, action: 'notifyBookingExpiringSoon' };
    }
    case BOOKING_EVENT_TYPES.ON_HOLD: {
      if (!booking) return { handled: false, reason: 'Booking not found' };
      await notifyBookingOnHold(booking, resourceName, { eventMeta });
      return { handled: true, action: 'notifyBookingOnHold' };
    }
    case BOOKING_EVENT_TYPES.ON_HOLD_RELEASED: {
      if (!booking) return { handled: false, reason: 'Booking not found' };
      await notifyBookingOnHoldReleased(booking, resourceName, { eventMeta });
      return { handled: true, action: 'notifyBookingOnHoldReleased' };
    }
    case BOOKING_EVENT_TYPES.DISPLACED: {
      if (!booking) return { handled: false, reason: 'Booking not found' };
      await notifyBookingDisplaced(booking, resourceName, { eventMeta });
      return { handled: true, action: 'notifyBookingDisplaced' };
    }
    case BOOKING_EVENT_TYPES.CONTENTION_RESOLVED: {
      // Backward-compatible: old payload shape (recipient-oriented event)
      if (payload.recipientOutcome != null) {
        if (!booking) return { handled: false, reason: 'Booking not found' };
        const counterpartyBooking = await loadBookingForNotification(payload.counterpartyBookingId || null);
        await notifyContentionResolved(booking, counterpartyBooking, resourceName, payload, { eventMeta });
        return { handled: true, action: 'notifyContentionResolvedLegacy' };
      }

      // New payload shape: one event with both defender/challenger details.
      const defenderId = payload?.defender?.bookingId || null;
      const challengerId = payload?.challenger?.bookingId || null;
      const [defenderBooking, challengerBooking] = await Promise.all([
        loadBookingForNotification(defenderId),
        loadBookingForNotification(challengerId),
      ]);

      const notifications = [];
      if (defenderBooking) {
        notifications.push(
          notifyContentionResolved(defenderBooking, challengerBooking, resourceName, {
            recipientOutcome: payload?.defender?.outcome || 'active',
            resolutionReason: payload.resolutionReason || null,
            resolvedByBookingId: payload.resolvedByBookingId || null,
            recipientContentionRole: 'defender',
          }, { eventMeta })
        );
      }
      if (challengerBooking) {
        notifications.push(
          notifyContentionResolved(challengerBooking, defenderBooking, resourceName, {
            recipientOutcome: payload?.challenger?.outcome || 'active',
            resolutionReason: payload.resolutionReason || null,
            resolvedByBookingId: payload.resolvedByBookingId || null,
            recipientContentionRole: 'challenger',
          }, { eventMeta })
        );
      }
      if (notifications.length === 0) {
        return { handled: false, reason: 'Defender and challenger not found' };
      }
      await Promise.all(notifications);
      return { handled: true, action: 'notifyContentionResolved' };
    }
    case BOOKING_EVENT_TYPES.CONTENTION_STARTED: {
      const defenderId = payload?.defender?.bookingId || payload.defenderBookingId || null;
      const challengerId = payload?.challenger?.bookingId || payload.challengerBookingId || event.bookingId || null;
      const [defender, challenger] = await Promise.all([
        loadBookingForNotification(defenderId),
        loadBookingForNotification(challengerId),
      ]);
      if (!defender || !challenger) {
        return { handled: false, reason: 'Defender or challenger not found' };
      }
      await notifyContentionStarted({ defender, challenger }, resourceName, { eventMeta });
      return { handled: true, action: 'notifyContentionStarted' };
    }
    case BOOKING_EVENT_TYPES.DISPLACED_SLOT_REOPENED: {
      const displacedBooking = await loadBookingForNotification(event.bookingId);
      const firmBookingId = payload.firmBookingId || payload.reopenedByBookingId || null;
      const firmBooking = await loadBookingForNotification(firmBookingId);
      if (!displacedBooking || !firmBooking) {
        return { handled: false, reason: 'Displaced or firm booking not found' };
      }
      await notifyDisplacedUsersSlotReopened(displacedBooking, firmBooking, resourceName, { eventMeta });
      return { handled: true, action: 'notifyDisplacedUsersSlotReopened' };
    }
    default:
      return { handled: false, reason: `No notification handler for ${event.eventType}` };
  }
}

async function startNotificationConsumer() {
  if (!isKafkaEnabled()) {
    return {
      enabled: false,
      connected: false,
      reason: 'Kafka is disabled',
    };
  }

  if (notificationConsumerStartPromise) {
    return notificationConsumerStartPromise;
  }

  notificationConsumerStartPromise = (async () => {
    try {
      await ensureBookingEventsTopic();
      const client = getKafkaClient();
      notificationConsumer = client.consumer({
        groupId: kafkaConfig.consumerGroups.notification,
      });

      await notificationConsumer.connect();
      await notificationConsumer.subscribe({
        topic: kafkaConfig.topics.bookingEvents,
        fromBeginning: false,
      });
      await notificationConsumer.run({
        eachMessage: async ({ message }) => {
          const event = parseEventPayload(message);
          if (!event) {
            console.error('[kafka:notification] Skipping unreadable event payload');
            return;
          }

          try {
            const result = await processBookingNotificationEvent(event);
            if (!result.handled && result.reason) {
              console.log(`[kafka:notification] Skipped ${event.eventType}: ${result.reason}`);
            }
          } catch (error) {
            console.error(
              `[kafka:notification] Failed handling ${event.eventType}: ${error.message}`
            );
            throw error;
          }
        },
      });

      console.log(
        `[kafka:notification] Consumer connected (group: ${kafkaConfig.consumerGroups.notification})`
      );
      return {
        enabled: true,
        connected: true,
      };
    } catch (error) {
      console.error('[kafka:notification] Consumer startup failed:', error.message);
      notificationConsumerStartPromise = null;
      return {
        enabled: true,
        connected: false,
        error: error.message,
      };
    }
  })();

  return notificationConsumerStartPromise;
}

async function stopNotificationConsumer() {
  if (!notificationConsumer) return;
  await notificationConsumer.disconnect();
  notificationConsumer = null;
  notificationConsumerStartPromise = null;
}

module.exports = {
  processBookingNotificationEvent,
  startNotificationConsumer,
  stopNotificationConsumer,
};
