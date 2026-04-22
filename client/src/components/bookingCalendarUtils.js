import { formatBookingDateRange, formatCalendarEventTimeRange } from '@/lib/formatBookingDateRange';

/** Passed to react-big-calendar tooltipAccessor to avoid native `title` (duplicate of our custom tooltip). */
export function suppressNativeEventTooltip() {
  return undefined;
}

export const CALENDAR_STATUS_STYLES = {
  approved: {
    backgroundColor: '#22c55e',
    borderColor: '#16a34a',
    color: '#fff',
  },
  pending_approval: {
    backgroundColor: '#eab308',
    borderColor: '#ca8a04',
    color: '#000',
    borderStyle: 'dashed',
  },
  penciled: {
    backgroundColor: '#d1d5db',
    borderColor: '#9ca3af',
    color: '#374151',
  },
  contesting: {
    backgroundColor: '#0ea5e9',
    borderColor: '#0284c7',
    color: '#fff',
  },
  contested: {
    backgroundColor: '#fb923c',
    borderColor: '#ea580c',
    color: '#fff',
  },
  queued: {
    backgroundColor: '#ede9fe',
    borderColor: '#a78bfa',
    color: '#5b21b6',
  },
  completed: {
    backgroundColor: '#a7f3d0',
    borderColor: '#34d399',
    color: '#064e3b',
  },
  displaced: {
    backgroundColor: '#94a3b8',
    borderColor: '#64748b',
    color: '#fff',
  },
};

export const CALENDAR_STATUS_PRIORITY = {
  approved: 1,
  pending_approval: 2,
  contested: 3,
  contesting: 4,
  queued: 5,
  penciled: 6,
  completed: 7,
  displaced: 8,
};

export function toCalendarStatus(booking) {
  if (!booking) return 'penciled';
  if (booking.status === 'penciled' && booking.contentionChallenger) return 'contesting';
  return booking.status || 'penciled';
}

/**
 * Order rows in a contention overlap list: defender → challenger → other penciled (same window, not in episode yet)
 * → queued by position → everything else.
 */
function overlapDisplaySortRank(resource) {
  if (!resource) return 99;
  const st = resource.status;
  if (st === 'contested' || resource.contentionRole === 'defender') return 0;
  if (st === 'penciled' && resource.contentionChallenger) return 1;
  if (resource.contentionRole === 'challenger') return 1;
  if (st === 'penciled' && !resource.contentionChallenger && resource.contentionRole !== 'queued') return 2;
  if (st === 'queued' || resource.contentionRole === 'queued') return 3;
  return 4;
}

/**
 * Sort overlapping calendar events for contention display within one time cluster.
 * @param {Array<{ start: Date, end: Date, resource: object }>} events
 */
export function sortCalendarContentionOverlaps(events) {
  return [...events].sort((a, b) => {
    const ra = a.resource || {};
    const rb = b.resource || {};

    const raRank = overlapDisplaySortRank(ra);
    const rbRank = overlapDisplaySortRank(rb);
    if (raRank !== rbRank) return raRank - rbRank;

    if (raRank === 3 && rbRank === 3) {
      const qa = ra.contentionQueuePosition ?? 0;
      const qb = rb.contentionQueuePosition ?? 0;
      if (qa !== qb) return qa - qb;
    }

    const pa = CALENDAR_STATUS_PRIORITY[toCalendarStatus(ra)] ?? 99;
    const pb = CALENDAR_STATUS_PRIORITY[toCalendarStatus(rb)] ?? 99;
    if (pa !== pb) return pa - pb;

    const ts = a.start - b.start;
    if (ts !== 0) return ts;
    return Number(ra.id) - Number(rb.id);
  });
}

export function formatAggregateMemberRoleLabel(resource) {
  if (!resource) return '';
  if (resource.contentionRole === 'defender') return 'Defender (contested)';
  if (resource.contentionRole === 'challenger') return 'Challenger';
  if (resource.contentionRole === 'queued') {
    return resource.contentionQueuePosition != null
      ? `Queued · position ${resource.contentionQueuePosition}`
      : 'Queued';
  }
  if (resource.status === 'contested') return 'Defender (contested)';
  if (resource.status === 'queued') return 'Queued';
  if (resource.status === 'penciled' && resource.contentionChallenger) return 'Challenger';
  if (resource.status === 'penciled' && !resource.contentionChallenger) return 'Penciled';
  return resource.status ?? '';
}

/** @param {Array<{ start: Date, end: Date, resource: object }>} participantEvents */
export function buildAggregateMemberRows(participantEvents) {
  const sorted = sortCalendarContentionOverlaps(participantEvents);
  return sorted.map((ev) => {
    const res = ev.resource;
    const calendarStatus = toCalendarStatus(res);
    return {
      bookingId: res.id,
      calendarStatus,
      timeRange: formatCalendarEventTimeRange(res.startTime, res.endTime),
      roleLabel: formatAggregateMemberRoleLabel(res),
    };
  });
}

/** Hover copy: headline + full local date/time range (esp. when month cell label truncates). */
export function formatBookingHoverDetail(event) {
  if (!event?.resource) return '';
  if (event.resource.aggregateSummary) {
    const name = event.resource.resourceName ?? '';
    const summary = event.resource.aggregateSummary;
    const headline = `${name} - contention group`;
    const parts = [
      `${summary.contestedCount} contested`,
      `${summary.challengerCount} challenger`,
      `${summary.queuedCount} queued`,
    ];
    if ((summary.plainPencilCount ?? 0) > 0) {
      parts.push(`${summary.plainPencilCount} penciled`);
    }
    const countLine = `Active overlaps: ${summary.total} (${parts.join(', ')})`;
    const hint = 'Click the stack icon to show or hide queue order.';
    if (event.start != null && event.end != null) {
      return `${headline}\n${formatBookingDateRange(event.start, event.end)}\n${countLine}\n${hint}`;
    }
    return `${headline}\n${countLine}\n${hint}`;
  }
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
