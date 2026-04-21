import { format, isSameDay } from 'date-fns';

/**
 * Booking interval for UI: repeats the calendar date on the end when it differs
 * from the start (local timezone). Same calendar day uses a compact end time only.
 *
 * @param {Date|string|number} startTime
 * @param {Date|string|number} endTime
 * @returns {string}
 */
export function formatBookingDateRange(startTime, endTime) {
  const start = startTime instanceof Date ? startTime : new Date(startTime);
  const end = endTime instanceof Date ? endTime : new Date(endTime);
  const startLabel = format(start, 'MMM d, yyyy h:mm a');
  if (isSameDay(start, end)) {
    return `${startLabel} — ${format(end, 'h:mm a')}`;
  }
  return `${startLabel} — ${format(end, 'MMM d, yyyy h:mm a')}`;
}

/**
 * Event title snippet for react-big-calendar: same local day keeps compact `hh:mm a`
 * (matches existing month/week labels). Different days include full date on both ends
 * so a wide bar is not read as a short same-day slot.
 *
 * @param {Date|string|number} startTime
 * @param {Date|string|number} endTime
 * @returns {string}
 */
export function formatCalendarEventTimeRange(startTime, endTime) {
  const start = startTime instanceof Date ? startTime : new Date(startTime);
  const end = endTime instanceof Date ? endTime : new Date(endTime);
  if (isSameDay(start, end)) {
    return `${format(start, 'hh:mm a')} - ${format(end, 'hh:mm a')}`;
  }
  return `${format(start, 'MMM d, yyyy h:mm a')} - ${format(end, 'MMM d, yyyy h:mm a')}`;
}
