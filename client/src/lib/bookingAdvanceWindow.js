export const ADVANCE_BOOKING_MAX_DAYS = 7;

const MS_DAY = 24 * 60 * 60 * 1000;

function toDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function getAdvanceBookingMaxStart(now = new Date()) {
  const base = toDate(now) || new Date();
  return new Date(base.getTime() + ADVANCE_BOOKING_MAX_DAYS * MS_DAY);
}

export function isBeyondAdvanceBookingWindow(startTime, now = new Date()) {
  const start = toDate(startTime);
  if (!start) return false;
  return start.getTime() > getAdvanceBookingMaxStart(now).getTime();
}

export function formatDatetimeLocalValue(value) {
  const date = toDate(value);
  if (!date) return '';

  const pad = (part) => String(part).padStart(2, '0');
  return [
    date.getFullYear(),
    '-',
    pad(date.getMonth() + 1),
    '-',
    pad(date.getDate()),
    'T',
    pad(date.getHours()),
    ':',
    pad(date.getMinutes()),
  ].join('');
}
