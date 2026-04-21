import { formatBookingDateRange } from '@/lib/formatBookingDateRange';

/** Passed to react-big-calendar tooltipAccessor to avoid native `title` (duplicate of our custom tooltip). */
export function suppressNativeEventTooltip() {
  return undefined;
}

/** Hover copy: headline + full local date/time range (esp. when month cell label truncates). */
export function formatBookingHoverDetail(event) {
  if (!event?.resource) return '';
  const id = event.id ?? event.resource?.id;
  const idPrefix = id != null && id !== '' ? `#${id} ` : '';
  const { resourceName, bookingType, status, contentionChallenger } = event.resource;
  const name = resourceName ?? '';
  const kind = bookingType ?? '';
  let st = status ?? '';
  if (status === 'penciled' && contentionChallenger) {
    st = 'contesting (challenger)';
  }
  if (!name && !kind && !st) return '';
  const headline = `${idPrefix}${name} - ${kind} (${st})`;
  if (event.start != null && event.end != null) {
    return `${headline}\n${formatBookingDateRange(event.start, event.end)}`;
  }
  return headline;
}
