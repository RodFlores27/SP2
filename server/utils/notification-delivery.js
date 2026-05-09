'use strict';

const { NotificationDelivery } = require('../models');
const { sendEmail } = require('./email');

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

async function sendNotificationEmail({
  to,
  subject,
  html,
  text,
  bookingId = null,
  notificationType,
  eventMeta = null,
}) {
  const recipientEmail = normalizeEmail(to);
  if (!recipientEmail) return { skipped: true, reason: 'missing_recipient' };

  const eventId = eventMeta?.eventId || null;
  const eventType = eventMeta?.eventType || null;
  const canDedupe = Boolean(eventId && eventType && notificationType);
  let delivery = null;

  if (canDedupe) {
    const [row, created] = await NotificationDelivery.findOrCreate({
      where: {
        eventId,
        notificationType,
        recipientEmail,
      },
      defaults: {
        eventId,
        eventType,
        notificationType,
        recipientEmail,
        bookingId,
        status: 'processing',
        attemptCount: 1,
        lastError: null,
        sentAt: null,
      },
    });
    delivery = row;

    if (!created && row.status === 'sent') {
      return { skipped: true, reason: 'already_sent' };
    }

    if (!created) {
      await row.update({
        eventType,
        bookingId,
        status: 'processing',
        attemptCount: (row.attemptCount || 0) + 1,
        lastError: null,
      });
    }
  }

  try {
    const ok = await sendEmail({ to: recipientEmail, subject, html, text, throwOnError: true });
    if (!ok) {
      throw new Error('Email transport returned false');
    }

    if (delivery) {
      await delivery.update({
        status: 'sent',
        sentAt: new Date(),
        lastError: null,
      });
    }

    return { sent: true };
  } catch (error) {
    if (delivery) {
      await delivery.update({
        status: 'failed',
        lastError: error.message || 'Unknown email failure',
      });
    }
    throw error;
  }
}

module.exports = {
  sendNotificationEmail,
};
