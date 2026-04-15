/** Passed to react-big-calendar tooltipAccessor to avoid native `title` (duplicate of our custom tooltip). */
export function suppressNativeEventTooltip() {
  return undefined;
}

/** Hover copy: "[Resource] - firm|pencil (status)" */
export function formatBookingHoverDetail(event) {
  if (!event?.resource) return '';
  const { resourceName, bookingType, status } = event.resource;
  const name = resourceName ?? '';
  const kind = bookingType ?? '';
  const st = status ?? '';
  if (!name && !kind && !st) return '';
  return `${name} - ${kind} (${st})`;
}
