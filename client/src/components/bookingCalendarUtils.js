/** Passed to react-big-calendar tooltipAccessor to avoid native `title` (duplicate of our custom tooltip). */
export function suppressNativeEventTooltip() {
  return undefined;
}

/** Hover copy: "#id [Resource] - firm|pencil (status)" */
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
  return `${idPrefix}${name} - ${kind} (${st})`;
}
