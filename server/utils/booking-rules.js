'use strict';

const LOCK_HOURS = 24;
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
    const err = new Error(
      'Bookings cannot be created or cancelled within 24 hours of the scheduled start time.'
    );
    err.code = 'BOOKING_LOCK_WINDOW';
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
    const err = new Error('Contention cannot start: resolution window has already lapsed.');
    err.code = 'CONTENTION_DEADLINE_INVALID';
    err.statusCode = 400;
    throw err;
  }
}

module.exports = {
  LOCK_HOURS,
  PENCIL_MAX_DAYS,
  hoursUntilStart,
  isWithinLockHours,
  assertStartNotWithinLockHours,
  computePencilExpiryAt,
  computeContentionDeadline,
  assertPositiveContentionDeadline
};
