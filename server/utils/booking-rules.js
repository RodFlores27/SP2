'use strict';

const { domain } = require('../messages/bookingMessages');

const LOCK_HOURS = 24;
const IN_HOUSE_MIN_HOURS = 48;
const LOAN_MIN_HOURS = 168;
const ROOM_MIN_HOURS = 168;
const IN_HOUSE_CANCEL_MIN_HOURS = 2;
const DEFAULT_CANCEL_MIN_HOURS = 24;
const PENCIL_MAX_DAYS = 3;

const MS_HOUR = 60 * 60 * 1000;
const MS_DAY = 24 * MS_HOUR;

function hoursUntilStart(startTime, now = new Date()) {
  return (new Date(startTime).getTime() - now.getTime()) / MS_HOUR;
}

/**
 * G1 / F1: block when start is within 24 hours of now (inclusive boundary).
 */
function isWithinLockHours(startTime, now = new Date()) {
  return hoursUntilStart(startTime, now) <= LOCK_HOURS;
}

function assertStartNotWithinLockHours(startTime, now = new Date()) {
  if (isWithinLockHours(startTime, now)) {
    const err = new Error(domain.bookingLockWindow);
    err.code = 'BOOKING_LOCK_WINDOW';
    err.statusCode = 400;
    throw err;
  }
}

function resolveMinimumLeadHours(resourceType, equipmentRequestType) {
  if (resourceType === 'room') return ROOM_MIN_HOURS;
  if (resourceType === 'equipment') {
    return equipmentRequestType === 'loan' ? LOAN_MIN_HOURS : IN_HOUSE_MIN_HOURS;
  }
  return LOCK_HOURS;
}

function assertStartMeetsMinimumLeadTime(startTime, resourceType, equipmentRequestType, now = new Date()) {
  const minimumLeadHours = resolveMinimumLeadHours(resourceType, equipmentRequestType);
  if (hoursUntilStart(startTime, now) < minimumLeadHours) {
    const err = new Error(
      domain.bookingMinimumLeadTime({
        resourceType,
        equipmentRequestType,
        minimumLeadHours,
      })
    );
    err.code = 'BOOKING_MIN_LEAD_TIME';
    err.statusCode = 400;
    throw err;
  }
}

function resolveCancellationCutoffHours(resourceType, equipmentRequestType) {
  if (resourceType === 'equipment' && equipmentRequestType === 'in_house') {
    return IN_HOUSE_CANCEL_MIN_HOURS;
  }
  return DEFAULT_CANCEL_MIN_HOURS;
}

function assertCancellationBeforeCutoff(startTime, resourceType, equipmentRequestType, now = new Date()) {
  const cutoffHours = resolveCancellationCutoffHours(resourceType, equipmentRequestType);
  if (hoursUntilStart(startTime, now) < cutoffHours) {
    const err = new Error(
      domain.bookingCancellationCutoff({
        resourceType,
        equipmentRequestType,
        cutoffHours,
      })
    );
    err.code = 'BOOKING_CANCELLATION_CUTOFF';
    err.statusCode = 400;
    throw err;
  }
}

/**
 * Pencil expiry: min(issuedAt + 3d, startTime - 24h).
 */
function computePencilExpiryAt(issuedAt, startTime) {
  const issued = new Date(issuedAt).getTime();
  const start = new Date(startTime).getTime();
  const threeDay = issued + PENCIL_MAX_DAYS * MS_DAY;
  const preStart = start - LOCK_HOURS * MS_HOUR;
  return new Date(Math.min(threeDay, preStart));
}

/**
 * C3: min(24h from now, start−24h, pencil expiryAt).
 */
function computeContentionDeadline(now, startTime, pencilExpiryAt) {
  const t = new Date(now).getTime();
  const start = new Date(startTime).getTime();
  const exp = new Date(pencilExpiryAt).getTime();
  const a = t + LOCK_HOURS * MS_HOUR;
  const b = start - LOCK_HOURS * MS_HOUR;
  return new Date(Math.min(a, b, exp));
}

function assertPositiveContentionDeadline(deadlineAt, now = new Date()) {
  if (new Date(deadlineAt).getTime() <= new Date(now).getTime()) {
    const err = new Error(domain.contentionDeadlineInvalid);
    err.code = 'CONTENTION_DEADLINE_INVALID';
    err.statusCode = 400;
    throw err;
  }
}

module.exports = {
  LOCK_HOURS,
  IN_HOUSE_MIN_HOURS,
  LOAN_MIN_HOURS,
  ROOM_MIN_HOURS,
  PENCIL_MAX_DAYS,
  hoursUntilStart,
  isWithinLockHours,
  assertStartNotWithinLockHours,
  assertStartMeetsMinimumLeadTime,
  assertCancellationBeforeCutoff,
  computePencilExpiryAt,
  computeContentionDeadline,
  assertPositiveContentionDeadline
};
