'use strict';

const { randomUUID } = require('crypto');
const { AuditLog } = require('../models');

const AUDIT_EVENT_TYPES = Object.freeze({
  USER_ROLE_CHANGED: 'user.role_changed',
  USER_DELETED: 'user.deleted',
  RESOURCE_ROOM_UPDATED: 'resource.room_updated',
  RESOURCE_EQUIPMENT_UPDATED: 'resource.equipment_updated',
});

async function recordAuditEvent({
  eventType,
  actorUserId = null,
  bookingId = null,
  resourceType = null,
  resourceId = null,
  bookingType = null,
  status = null,
  payload = {},
  occurredAt = new Date(),
} = {}) {
  if (!eventType) {
    throw new Error('eventType is required to record an audit event');
  }

  try {
    const row = await AuditLog.create({
      eventId: randomUUID(),
      eventType,
      occurredAt,
      topic: 'app.audit',
      partition: null,
      offset: null,
      actorUserId,
      bookingId,
      resourceType,
      resourceId,
      bookingType,
      status,
      payload,
    });

    return {
      recorded: true,
      eventId: row.eventId,
    };
  } catch (error) {
    console.error(`[audit] Failed to record ${eventType}:`, error.message);
    return {
      recorded: false,
      error: error.message,
    };
  }
}

module.exports = {
  AUDIT_EVENT_TYPES,
  recordAuditEvent,
};
