'use strict';

const { EventEmitter } = require('events');

/**
 * In-process event dispatcher.
 *
 * Used when KAFKA_ENABLED=false so that booking lifecycle events still
 * reach audit-log and analytics handlers without a running Kafka broker.
 *
 * IMPORTANT: Do NOT register notification handlers here.
 * Email notifications are already handled via the isKafkaEnabled() fallbacks
 * in booking.controller.js and booking-expiry.js. Registering a notification
 * handler here would cause duplicate emails.
 *
 * When KAFKA_ENABLED=true this module is imported but the dispatcher is never
 * emitted to — the Kafka producer sends events to the broker instead.
 */
const dispatcher = new EventEmitter();

// Default Node.js max is 10. We register 1 listener (audit + analytics combined).
// 20 provides headroom without suppressing legitimate leak warnings.
dispatcher.setMaxListeners(20);

module.exports = dispatcher;
