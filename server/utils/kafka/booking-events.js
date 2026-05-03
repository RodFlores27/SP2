const { publishBookingEvent } = require('./producer');

const BOOKING_EVENT_TYPES = Object.freeze({
  CREATED: 'booking.created',
  APPROVED: 'booking.approved',
  DENIED: 'booking.denied',
  CANCELLED: 'booking.cancelled',
  EXPIRED: 'booking.expired',
  EXPIRING_SOON: 'booking.expiring_soon',
  ON_HOLD: 'booking.on_hold',
  DISPLACED: 'booking.displaced',
  CONTENTION_STARTED: 'booking.contention_started',
  CONTENTION_RESOLVED: 'booking.contention_resolved',
  CONVERTED_TO_FIRM: 'booking.converted_to_firm',
  DISPLACED_SLOT_REOPENED: 'booking.displaced_slot_reopened',
});

function toPlainBooking(booking) {
  if (!booking) return {};
  if (typeof booking.toJSON === 'function') return booking.toJSON();
  return booking;
}

function bookingEventData(booking, options = {}) {
  const b = toPlainBooking(booking);
  return {
    actorUserId: options.actorUserId ?? null,
    bookingId: b.id ?? options.bookingId ?? null,
    resourceType: b.resourceType ?? options.resourceType ?? null,
    resourceId: b.resourceId ?? options.resourceId ?? null,
    bookingType: b.bookingType ?? options.bookingType ?? null,
    status: b.status ?? options.status ?? null,
    payload: {
      userId: b.userId ?? null,
      startTime: b.startTime ?? null,
      endTime: b.endTime ?? null,
      contentionRole: b.contentionRole ?? null,
      challengingBookingId: b.challengingBookingId ?? null,
      resourceName: options.resourceName ?? null,
      ...options.payload,
    },
  };
}

async function publishBookingLifecycleEvent(eventType, booking, options = {}) {
  try {
    const result = await publishBookingEvent(eventType, bookingEventData(booking, options));
    if (result.error) {
      console.error(`[kafka] Failed to publish ${eventType}: ${result.error}`);
    }
    return result;
  } catch (error) {
    console.error(`[kafka] Failed to publish ${eventType}: ${error.message}`);
    return {
      published: false,
      enabled: true,
      error: error.message,
    };
  }
}

module.exports = {
  BOOKING_EVENT_TYPES,
  bookingEventData,
  publishBookingLifecycleEvent,
};
