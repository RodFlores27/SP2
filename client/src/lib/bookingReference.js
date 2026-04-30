export function getBookingReference(booking) {
  return booking?.referenceCode || (booking?.id != null ? `#${booking.id}` : 'n/a');
}

export function getBookingReferenceText(booking) {
  return booking?.referenceCode || (booking?.id != null ? String(booking.id) : 'n/a');
}
