/** Lookup resource display name from the pre-fetched lists. */
export function getResourceName(booking, equipment, rooms) {
  if (!booking) return `Resource #${booking?.resourceId}`;
  if (booking.resourceType === 'equipment') {
    const e = equipment.find((x) => x.id === booking.resourceId);
    return e?.name ?? `Equipment #${booking.resourceId}`;
  }
  if (booking.resourceType === 'room') {
    const r = rooms.find((x) => x.id === booking.resourceId);
    return r?.name ?? `Room #${booking.resourceId}`;
  }
  return `Resource #${booking.resourceId}`;
}

export function formatBookingTypeLabel(bookingType) {
  if (!bookingType) return '';
  const map = { firm: 'Firm', pencil: 'Pencil' };
  return map[bookingType] ?? bookingType.charAt(0).toUpperCase() + bookingType.slice(1);
}

export function formatStatusLabel(status) {
  if (!status) return '';
  return status
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Same 24h pre-start boundary as the server (lock window for create / firm cancel / firm approval deadline). */
export function isWithinStartLockWindow(startTime, nowMs = Date.now()) {
  const hoursUntilStart = (new Date(startTime).getTime() - nowMs) / (1000 * 60 * 60);
  return hoursUntilStart <= 24;
}

export function isCancellable(booking) {
  if (['cancelled', 'denied', 'expired', 'displaced', 'completed'].includes(booking.status)) return false;
  if (
    booking.bookingType === 'firm' &&
    ['pending_approval', 'approved'].includes(booking.status)
  ) {
    return new Date(booking.startTime) > new Date();
  }
  return true;
}

/**
 * When a firm booking can’t be cancelled, explains why (for disabled Cancel UI).
 * Pencil bookings are not returned here.
 *
 * @returns {'started_or_past'|null}
 */
export function getFirmCancelBlockedReason(booking) {
  if (['cancelled', 'denied', 'expired', 'displaced', 'completed'].includes(booking.status)) return null;
  if (booking.bookingType !== 'firm') return null;
  if (!['pending_approval', 'approved'].includes(booking.status)) return null;
  if (isCancellable(booking)) return null;
  return 'started_or_past';
}

/** Human-readable explanation for firm cancel blocked reasons (tooltip / aria-label). */
export function getFirmCancelBlockedMessage(reason) {
  if (reason === 'started_or_past') {
    return 'The start time has passed; this booking can’t be cancelled here.';
  }
  return '';
}

export function isConvertible(booking) {
  return (
    booking.bookingType === 'pencil' &&
    !['cancelled', 'denied', 'expired', 'displaced', 'completed', 'queued', 'on_hold'].includes(booking.status)
  );
}

/** Returns a human-readable file type label from a Cloudinary/public URL. */
export function guessFileType(url) {
  if (!url) return 'unknown';
  const lower = url.toLowerCase().split('?')[0];
  if (lower.endsWith('.pdf')) return 'pdf';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png')) return 'image';
  if (lower.endsWith('.doc') || lower.endsWith('.docx')) return 'doc';
  return 'unknown';
}

/** Active-tab status order (highest priority first). */
const ACTIVE_STATUS_ORDER = ['contested', 'pending_approval', 'on_hold', 'penciled', 'approved'];
/** Past-tab status order (denied first — staff decision, highest visibility). */
const PAST_STATUS_ORDER = ['denied', 'displaced', 'cancelled', 'expired', 'completed'];

/** Group an array of bookings by status, returning ordered non-empty groups. */
export function groupByStatus(bookings, statusOrder) {
  const groups = [];
  for (const status of statusOrder) {
    const items = bookings.filter((b) => b.status === status);
    if (items.length > 0) {
      groups.push({ status, items });
    }
  }
  // Catch any status not in the order array (future-proofing).
  const known = new Set(statusOrder);
  const rest = bookings.filter((b) => !known.has(b.status));
  if (rest.length > 0) {
    groups.push({ status: 'other', items: rest });
  }
  return groups;
}

export { ACTIVE_STATUS_ORDER, PAST_STATUS_ORDER };

/**
 * Filter a booking list against the current toolbar state.
 * Matches search against booking #id, resource name, and purpose (case-insensitive).
 */
export function filterBookings(bookings, { query, statusFilter, resourceTypeFilter }, getNameFn) {
  let result = bookings;

  if (statusFilter) {
    result = result.filter((b) => b.status === statusFilter);
  }

  if (resourceTypeFilter) {
    result = result.filter((b) => b.resourceType === resourceTypeFilter);
  }

  if (query) {
    const q = query.toLowerCase();
    result = result.filter((b) => {
      const name = getNameFn(b).toLowerCase();
      return (
        String(b.id).includes(q) ||
        name.includes(q) ||
        (b.purpose ?? '').toLowerCase().includes(q)
      );
    });
  }

  return result;
}
