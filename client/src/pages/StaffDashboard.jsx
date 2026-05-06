import { useState, useEffect, useCallback, useMemo } from 'react';
import { format } from 'date-fns';
import { useAuth } from '@/contexts/useAuth';
import axiosInstance from '@/lib/axios';
import { formatBookingDateRange } from '@/lib/formatBookingDateRange';
import { getBookingReference, getBookingReferenceText } from '@/lib/bookingReference';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { BookingStatusBadge } from '@/components/BookingStatusBadge';
import { AuthorizationDocButton } from '@/components/my-bookings/AuthorizationDocButton';
import { isWithinStartLockWindow } from '@/components/my-bookings/bookingDashboardUtils';
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle,
  XCircle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
  Users,
  CornerDownRight,
} from 'lucide-react';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
const selectClass =
  'h-9 rounded-md border border-input bg-background px-3 text-sm min-w-[140px]';

const APPROVALS_FILTER_DEFAULTS = {
  query: '',
  resourceType: '',
  sort: 'event_date_closest',
  requesterCategory: '',
  startWindow: '',
};

const RESUBMISSIONS_FILTER_DEFAULTS = {
  query: '',
  resourceType: '',
  sort: 'recently_created',
  startWindow: '',
  sourceDeniedBy: '',
};

const CONTENTION_FILTER_DEFAULTS = {
  query: '',
  resourceType: '',
  sort: 'defender_deadline_soonest',
  participantEmail: '',
};

const APPROVED_FILTER_DEFAULTS = {
  query: '',
  resourceType: '',
  sort: 'recently_updated',
  approvedAtRange: '',
  requesterCategory: '',
  hasStaffRemark: '',
};

const RESOURCE_TYPE_OPTIONS = [
  { value: '', label: 'All Types' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'room', label: 'Room' },
];

const BOOKING_SORT_OPTIONS = [
  { value: 'event_date_closest', label: 'Event Date: Closest' },
  { value: 'event_date_furthest', label: 'Event Date: Furthest' },
  { value: 'recently_created', label: 'Recently Created' },
  { value: 'recently_updated', label: 'Recently Updated' },
  { value: 'duration_longest', label: 'Longest Duration' },
  { value: 'duration_shortest', label: 'Shortest Duration' },
];

const CONTENTION_SORT_OPTIONS = [
  { value: 'defender_deadline_soonest', label: 'Defender Deadline: Soonest' },
  { value: 'defender_deadline_latest', label: 'Defender Deadline: Latest' },
  { value: 'event_date_closest', label: 'Event Date: Closest' },
  { value: 'event_date_furthest', label: 'Event Date: Furthest' },
];

const START_WINDOW_OPTIONS = [
  { value: '', label: 'Any Start Window' },
  { value: 'within_24h', label: 'Starts Within 24h' },
  { value: '24h_to_72h', label: 'Starts 24h to 72h' },
  { value: 'later_than_72h', label: 'Starts After 72h' },
];

const APPROVED_AT_RANGE_OPTIONS = [
  { value: '', label: 'Any Approval Date' },
  { value: 'today', label: 'Approved Today' },
  { value: 'last_7_days', label: 'Approved Last 7 Days' },
  { value: 'last_30_days', label: 'Approved Last 30 Days' },
];

const HAS_STAFF_REMARK_OPTIONS = [
  { value: '', label: 'Staff Remark: Any' },
  { value: 'with', label: 'With Staff Remark' },
  { value: 'without', label: 'Without Staff Remark' },
];

function formatUserCategory(cat) {
  if (!cat) return '';
  return cat
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function formatAccountType(type) {
  if (!type) return '';
  return type
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function normalizeText(value) {
  return String(value ?? '').toLowerCase();
}

function getStartWindowBucket(startTime, nowMs = Date.now()) {
  const diffHours = (new Date(startTime).getTime() - nowMs) / (1000 * 60 * 60);
  if (diffHours <= 24) return 'within_24h';
  if (diffHours <= 72) return '24h_to_72h';
  return 'later_than_72h';
}

function matchesApprovedAtRange(approvedAt, range, now = new Date()) {
  if (!range) return true;
  if (!approvedAt) return false;
  const date = new Date(approvedAt);
  if (Number.isNaN(date.getTime())) return false;

  if (range === 'today') {
    return (
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate()
    );
  }
  if (range === 'last_7_days') {
    return date.getTime() >= now.getTime() - 7 * 24 * 60 * 60 * 1000;
  }
  if (range === 'last_30_days') {
    return date.getTime() >= now.getTime() - 30 * 24 * 60 * 60 * 1000;
  }
  return true;
}

function sortBookingRows(rows, sortKey) {
  const list = [...rows];
  if (sortKey === 'event_date_furthest') {
    return list.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
  }
  if (sortKey === 'recently_created') {
    return list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }
  if (sortKey === 'recently_updated') {
    return list.sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
  }
  if (sortKey === 'duration_longest') {
    return list.sort((a, b) => {
      const aDuration = new Date(a.endTime) - new Date(a.startTime);
      const bDuration = new Date(b.endTime) - new Date(b.startTime);
      if (aDuration !== bDuration) return bDuration - aDuration;
      return new Date(a.startTime) - new Date(b.startTime);
    });
  }
  if (sortKey === 'duration_shortest') {
    return list.sort((a, b) => {
      const aDuration = new Date(a.endTime) - new Date(a.startTime);
      const bDuration = new Date(b.endTime) - new Date(b.startTime);
      if (aDuration !== bDuration) return aDuration - bDuration;
      return new Date(a.startTime) - new Date(b.startTime);
    });
  }
  return list.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
}

function getSourceDeniedByInfo(booking) {
  if (!booking?.rebookedFromBookingId) return null;
  const sourceAttempt = booking.threadBookings?.find((attempt) => attempt.id === booking.rebookedFromBookingId);
  const deniedBy = sourceAttempt?.deniedBy;
  if (deniedBy?.id && deniedBy?.email) {
    return { id: String(deniedBy.id), email: deniedBy.email };
  }
  return { id: 'unknown', email: 'Unknown/Legacy' };
}

function getConflictParticipants(group) {
  const defenderBookingIdFromDetail =
    group.bookings.find((booking) => booking?.contentionDetail?.defender?.bookingId)?.contentionDetail?.defender?.bookingId || null;
  const defenderBooking =
    group.bookings.find((booking) => booking.contentionRole === 'defender') ||
    group.bookings.find((booking) => booking.id === defenderBookingIdFromDetail) ||
    group.bookings[0] ||
    null;
  const challengerBooking =
    group.bookings.find(
      (booking) =>
        booking.id !== defenderBooking?.id &&
        (booking.contentionRole === 'challenger' ||
          booking.contentionChallenger === true ||
          booking.challengingBookingId === defenderBooking?.id)
    ) ||
    group.bookings.find((booking) => booking.id !== defenderBooking?.id) ||
    null;
  return { defenderBooking, challengerBooking };
}

function sortConflictGroups(groups, sortKey) {
  const list = [...groups];
  if (sortKey === 'defender_deadline_latest') {
    return list.sort((a, b) => {
      const aTime = a.urgencyAt ? new Date(a.urgencyAt).getTime() : Number.NEGATIVE_INFINITY;
      const bTime = b.urgencyAt ? new Date(b.urgencyAt).getTime() : Number.NEGATIVE_INFINITY;
      if (aTime !== bTime) return bTime - aTime;
      return new Date(a.windowStart) - new Date(b.windowStart);
    });
  }
  if (sortKey === 'event_date_furthest') {
    return list.sort((a, b) => new Date(b.windowStart) - new Date(a.windowStart));
  }
  if (sortKey === 'event_date_closest') {
    return list.sort((a, b) => new Date(a.windowStart) - new Date(b.windowStart));
  }
  return list.sort((a, b) => {
    const aTime = a.urgencyAt ? new Date(a.urgencyAt).getTime() : Number.POSITIVE_INFINITY;
    const bTime = b.urgencyAt ? new Date(b.urgencyAt).getTime() : Number.POSITIVE_INFINITY;
    if (aTime !== bTime) return aTime - bTime;
    return new Date(a.windowStart) - new Date(b.windowStart);
  });
}

function StaffBookingToolbar({
  tab,
  filters,
  defaultFilters,
  onFiltersChange,
  requesterCategoryOptions = [],
  sourceDeniedByOptions = [],
  approvedByFilter = '',
  onApprovedByFilterChange = () => {},
  approverOptions = [],
  currentUserEmail = '',
}) {
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const set = (key, value) => onFiltersChange({ ...filters, [key]: value });
  const hasLocalFilters = Object.keys(defaultFilters).some((key) => filters[key] !== defaultFilters[key]);
  const hasAnyFilter = hasLocalFilters || (tab === 'approved' && approvedByFilter !== '');
  const sortOptions = tab === 'contention' ? CONTENTION_SORT_OPTIONS : BOOKING_SORT_OPTIONS;
  const isCollapsibleTab = ['approvals', 'resubmissions', 'contention', 'approved'].includes(tab);

  if (isCollapsibleTab) {
    return (
      <div className="space-y-2">
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="search"
            placeholder="Search by ID, resource, email, purpose..."
            value={filters.query || ''}
            onChange={(e) => set('query', e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm flex-1 min-w-[220px]"
          />
          <button
            type="button"
            onClick={() => setShowAdvancedFilters((prev) => !prev)}
            className={`inline-flex items-center justify-center gap-1 px-3 h-9 text-sm border rounded-md transition-colors ${
              hasAnyFilter
                ? 'border-primary/30 text-primary bg-primary/5 hover:bg-primary/10'
                : 'hover:bg-accent'
            }`}
            aria-expanded={showAdvancedFilters}
            aria-label="Toggle filters"
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filters
            {!showAdvancedFilters && hasAnyFilter && (
              <span className="inline-block h-2 w-2 rounded-full bg-primary" aria-hidden="true" />
            )}
            {showAdvancedFilters ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>

        {showAdvancedFilters && (
          <div className="rounded-md border border-border p-3 bg-muted/20">
            <div className="flex flex-col sm:flex-row gap-2 flex-wrap">
              <select
                value={filters.resourceType || ''}
                onChange={(e) => set('resourceType', e.target.value)}
                className={selectClass}
                aria-label="Filter by resource type"
              >
                {RESOURCE_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              {tab !== 'contention' && (tab === 'approvals' || tab === 'approved') && (
                <select
                  value={filters.requesterCategory || ''}
                  onChange={(e) => set('requesterCategory', e.target.value)}
                  className={selectClass}
                  aria-label="Filter by requester category"
                >
                  <option value="">All Requester Categories</option>
                  {requesterCategoryOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              )}
              {(tab === 'approvals' || tab === 'resubmissions') && (
                <select
                  value={filters.startWindow || ''}
                  onChange={(e) => set('startWindow', e.target.value)}
                  className={selectClass}
                  aria-label="Filter by start window"
                >
                  {START_WINDOW_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              )}
              {tab === 'resubmissions' && (
                <select
                  value={filters.sourceDeniedBy || ''}
                  onChange={(e) => set('sourceDeniedBy', e.target.value)}
                  className={selectClass}
                  aria-label="Filter by source denied by"
                >
                  <option value="">Denied By: Any</option>
                  {sourceDeniedByOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              )}
              {tab === 'contention' && (
                <input
                  type="search"
                  placeholder="Participant email..."
                  value={filters.participantEmail || ''}
                  onChange={(e) => set('participantEmail', e.target.value)}
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm min-w-[220px]"
                />
              )}
              {tab === 'approved' && (
                <select
                  value={filters.approvedAtRange || ''}
                  onChange={(e) => set('approvedAtRange', e.target.value)}
                  className={selectClass}
                  aria-label="Filter by approved at date"
                >
                  {APPROVED_AT_RANGE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              )}
              {tab === 'approved' && (
                <select
                  value={approvedByFilter}
                  onChange={(e) => onApprovedByFilterChange(e.target.value)}
                  className={selectClass}
                  aria-label="Filter by approved by"
                >
                  <option value="">All staff</option>
                  <option value="me">Me ({currentUserEmail || 'current user'})</option>
                  {approverOptions.map((option) => (
                    <option key={option.id} value={String(option.id)}>
                      {option.email}
                    </option>
                  ))}
                </select>
              )}
              {tab === 'approved' && (
                <select
                  value={filters.hasStaffRemark || ''}
                  onChange={(e) => set('hasStaffRemark', e.target.value)}
                  className={selectClass}
                  aria-label="Filter by staff remark"
                >
                  {HAS_STAFF_REMARK_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              )}
              <select
                value={filters.sort || ''}
                onChange={(e) => set('sort', e.target.value)}
                className={selectClass}
                aria-label="Sort results"
              >
                {sortOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              {hasAnyFilter && (
                <button
                  type="button"
                  onClick={() => {
                    onFiltersChange({ ...defaultFilters });
                    if (tab === 'approved') onApprovedByFilterChange('');
                  }}
                  className="inline-flex items-center px-2.5 py-1.5 text-xs text-muted-foreground border rounded-md hover:bg-accent transition-colors"
                >
                  Clear filters
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col sm:flex-row gap-2 flex-wrap">
      <input
        type="search"
        placeholder="Search by ID, resource, email, purpose..."
        value={filters.query || ''}
        onChange={(e) => set('query', e.target.value)}
        className="h-9 rounded-md border border-input bg-background px-3 text-sm flex-1 min-w-[220px]"
      />
      <select
        value={filters.resourceType || ''}
        onChange={(e) => set('resourceType', e.target.value)}
        className={selectClass}
        aria-label="Filter by resource type"
      >
        {RESOURCE_TYPE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {tab !== 'contention' && (tab === 'approvals' || tab === 'approved') && (
        <select
          value={filters.requesterCategory || ''}
          onChange={(e) => set('requesterCategory', e.target.value)}
          className={selectClass}
          aria-label="Filter by requester category"
        >
          <option value="">All Requester Categories</option>
          {requesterCategoryOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
      {(tab === 'approvals' || tab === 'resubmissions') && (
        <select
          value={filters.startWindow || ''}
          onChange={(e) => set('startWindow', e.target.value)}
          className={selectClass}
          aria-label="Filter by start window"
        >
          {START_WINDOW_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
      {tab === 'resubmissions' && (
        <select
          value={filters.sourceDeniedBy || ''}
          onChange={(e) => set('sourceDeniedBy', e.target.value)}
          className={selectClass}
          aria-label="Filter by source denied by"
        >
          <option value="">Denied By: Any</option>
          {sourceDeniedByOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
      {tab === 'contention' && (
        <input
          type="search"
          placeholder="Participant email..."
          value={filters.participantEmail || ''}
          onChange={(e) => set('participantEmail', e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm min-w-[220px]"
        />
      )}
      {tab === 'approved' && (
        <select
          value={filters.approvedAtRange || ''}
          onChange={(e) => set('approvedAtRange', e.target.value)}
          className={selectClass}
          aria-label="Filter by approved at date"
        >
          {APPROVED_AT_RANGE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
      {tab === 'approved' && (
        <select
          value={filters.hasStaffRemark || ''}
          onChange={(e) => set('hasStaffRemark', e.target.value)}
          className={selectClass}
          aria-label="Filter by staff remark"
        >
          {HAS_STAFF_REMARK_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
      <select
        value={filters.sort || ''}
        onChange={(e) => set('sort', e.target.value)}
        className={selectClass}
        aria-label="Sort results"
      >
        {sortOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hasAnyFilter && (
        <button
          type="button"
          onClick={() => onFiltersChange({ ...defaultFilters })}
          className="inline-flex items-center px-2.5 py-1.5 text-xs text-muted-foreground border rounded-md hover:bg-accent transition-colors"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}

async function fetchResources() {
  const [eqRes, rmRes] = await Promise.all([
    fetch(`${BASE_URL}/equipment`),
    fetch(`${BASE_URL}/rooms`),
  ]);
  const equipment = eqRes.ok ? await eqRes.json() : [];
  const rooms = rmRes.ok ? await rmRes.json() : [];
  return { equipment, rooms };
}

function getResourceName(booking, equipment, rooms) {
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

function getPreviousAttempts(booking) {
  if (!booking?.threadBookings?.length) return [];

  return booking.threadBookings
    .filter((attempt) => attempt.id !== booking.id)
    .filter((attempt) => {
      if (!attempt.createdAt || !booking.createdAt) return true;
      return new Date(attempt.createdAt) < new Date(booking.createdAt);
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function formatChangeValue(field, value) {
  if (value === null || value === undefined || value === '') return 'empty';
  if (field === 'startTime' || field === 'endTime') {
    return format(new Date(value), 'MMM d, yyyy h:mm a');
  }
  if (field === 'authorizationDocUrl') {
    return value ? 'On file' : 'None';
  }
  if (field === 'bookingType') {
    return String(value).charAt(0).toUpperCase() + String(value).slice(1);
  }
  return String(value);
}

function hasAuthDocUrl(value) {
  return Boolean(value && String(value).trim().length > 0);
}

/** Short staff-facing line for auth doc diffs (avoids "uploaded -> uploaded" when the file changed). */
function summarizeAuthorizationDocRebookChange(before, after) {
  const had = hasAuthDocUrl(before);
  const has = hasAuthDocUrl(after);
  if (!had && has) {
    return { detail: 'New document uploaded' };
  }
  if (had && !has) {
    return { detail: 'Document removed' };
  }
  if (had && has) {
    return { detail: 'Document replaced' };
  }
  return {
    before: formatChangeValue('authorizationDocUrl', before),
    after: formatChangeValue('authorizationDocUrl', after),
  };
}

function getRebookChangeItems(booking) {
  const changedFields = booking?.rebookChangeSummary?.changedFields || [];
  const changes = booking?.rebookChangeSummary?.changes || {};
  if (!changedFields.length) return [];

  const labels = {
    startTime: 'Start time',
    endTime: 'End time',
    bookingType: 'Booking type',
    purpose: 'Purpose',
    authorizationDocUrl: 'Authorization document'
  };

  return changedFields
    .filter((field) => changes[field])
    .map((field) => {
      const label = labels[field] || field;
      if (field === 'authorizationDocUrl') {
        const { before: b, after: a } = changes[field];
        const auth = summarizeAuthorizationDocRebookChange(b, a);
        if (auth.detail != null) {
          return { field, label, detail: auth.detail };
        }
        return { field, label, before: auth.before, after: auth.after };
      }
      return {
        field,
        label,
        before: formatChangeValue(field, changes[field].before),
        after: formatChangeValue(field, changes[field].after),
      };
    });
}

function RebookChangeRow({ item }) {
  return (
    <p className="text-xs text-up-forest-green/90">
      {item.detail != null ? (
        <>
          {item.label}: {item.detail}
        </>
      ) : (
        <>
          {item.label}: {item.before} {'->'} {item.after}
        </>
      )}
    </p>
  );
}

/** Prefer server-persisted rebookedFromStatus; fall back to thread history for legacy rows. */
function getEffectiveRebookSourceStatus(booking) {
  if (!booking?.rebookedFromBookingId) return null;
  if (booking.rebookedFromStatus) return booking.rebookedFromStatus;
  const sourceAttempt = booking.threadBookings?.find(
    (attempt) => attempt.id === booking.rebookedFromBookingId
  );
  return sourceAttempt?.status || null;
}

function getConflictAnchorId(booking) {
  const defenderId = booking?.contentionDetail?.defender?.bookingId;
  if (defenderId) return `defender-${defenderId}`;
  if (booking?.contentionRole === 'defender') return `defender-${booking.id}`;
  if (booking?.challengingBookingId) return `defender-${booking.challengingBookingId}`;
  return null;
}

function overlapsRange(aStart, aEnd, bStart, bEnd) {
  return new Date(aStart) < new Date(bEnd) && new Date(aEnd) > new Date(bStart);
}

function computeActiveConflictGroups(bookings, equipment, rooms) {
  if (!bookings.length) return [];

  const groups = [];
  const keyedGroups = new Map();

  const putBookingInGroup = (booking, groupKey) => {
    if (groupKey && keyedGroups.has(groupKey)) {
      keyedGroups.get(groupKey).bookings.push(booking);
      return;
    }
    const nextGroup = { key: groupKey ?? `resource-${groups.length + 1}`, bookings: [booking] };
    groups.push(nextGroup);
    if (groupKey) keyedGroups.set(groupKey, nextGroup);
  };

  for (const booking of bookings) {
    const anchorKey = getConflictAnchorId(booking);
    if (anchorKey) {
      putBookingInGroup(booking, anchorKey);
      continue;
    }

    const matched = groups.find((group) => {
      const candidate = group.bookings[0];
      const sameResource =
        candidate.resourceType === booking.resourceType && candidate.resourceId === booking.resourceId;
      if (!sameResource) return false;
      return group.bookings.some((member) =>
        overlapsRange(member.startTime, member.endTime, booking.startTime, booking.endTime)
      );
    });

    if (matched) {
      matched.bookings.push(booking);
      continue;
    }
    putBookingInGroup(booking, null);
  }

  return groups
    .map((group, index) => {
      const sorted = [...group.bookings].sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
      const starts = sorted.map((entry) => new Date(entry.startTime).getTime());
      const ends = sorted.map((entry) => new Date(entry.endTime).getTime());
      const deadlines = sorted
        .map((entry) => entry?.contentionDetail?.deadlineAt || entry?.contentionDeadlineAt || entry?.expiryAt || null)
        .filter(Boolean)
        .map((raw) => new Date(raw).getTime());
      const topBooking = sorted[0];
      const resourceName = getResourceName(topBooking, equipment, rooms);

      return {
        id: `${group.key}-${index + 1}`,
        resourceName,
        resourceType: topBooking.resourceType,
        bookings: sorted,
        windowStart: new Date(Math.min(...starts)).toISOString(),
        windowEnd: new Date(Math.max(...ends)).toISOString(),
        urgencyAt: deadlines.length ? new Date(Math.min(...deadlines)).toISOString() : null,
      };
    })
    .sort((a, b) => {
      const aUrgency = a.urgencyAt ? new Date(a.urgencyAt).getTime() : Number.MAX_SAFE_INTEGER;
      const bUrgency = b.urgencyAt ? new Date(b.urgencyAt).getTime() : Number.MAX_SAFE_INTEGER;
      if (aUrgency !== bUrgency) return aUrgency - bUrgency;
      return new Date(a.windowStart) - new Date(b.windowStart);
    });
}

function isActiveContentionBooking(booking) {
  return Boolean(
    booking?.contentionRole ||
    booking?.contentionDetail ||
    booking?.challengingBookingId ||
    booking?.contentionDeadlineAt
  );
}

function mergeUniqueBookings(bookings) {
  const deduped = new Map();
  for (const booking of bookings) {
    if (!booking?.id) continue;
    deduped.set(booking.id, booking);
  }
  return [...deduped.values()];
}

export default function StaffDashboard() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('approvals');

  const [pendingBookings, setPendingBookings] = useState([]);
  const [approvedBookings, setApprovedBookings] = useState([]);
  const [staffApprovers, setStaffApprovers] = useState([]);
  const [contestedBookings, setContestedBookings] = useState([]);
  const [queuedPencilBookings, setQueuedPencilBookings] = useState([]);
  const [activePenciledContentions, setActivePenciledContentions] = useState([]);
  const [deniedRebookPending, setDeniedRebookPending] = useState([]);
  const [approvedByFilter, setApprovedByFilter] = useState('');
  const [equipment, setEquipment] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [reviewOpenId, setReviewOpenId] = useState(null);
  const [remarkMap, setRemarkMap] = useState({});
  const [actionLoading, setActionLoading] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [approvalsFilters, setApprovalsFilters] = useState(() => ({ ...APPROVALS_FILTER_DEFAULTS }));
  const [resubmissionsFilters, setResubmissionsFilters] = useState(() => ({ ...RESUBMISSIONS_FILTER_DEFAULTS }));
  const [contentionFilters, setContentionFilters] = useState(() => ({ ...CONTENTION_FILTER_DEFAULTS }));
  const [approvedFilters, setApprovedFilters] = useState(() => ({ ...APPROVED_FILTER_DEFAULTS }));

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const approvedParams = new URLSearchParams({ status: 'approved' });
      if (approvedByFilter === 'me') {
        approvedParams.set('approvedBy', 'me');
      } else if (approvedByFilter) {
        approvedParams.set('approvedByUserId', approvedByFilter);
      }

      const [pendingRes, approvedRes, approversRes, contestedRes, queuedRes, penciledRes, deniedPendRes, resources] = await Promise.all([
        axiosInstance.get('/bookings?status=pending_approval&excludeRebookSourceDenied=true'),
        axiosInstance.get(`/bookings?${approvedParams.toString()}`),
        axiosInstance.get('/bookings/approvers'),
        axiosInstance.get('/bookings?status=contested'),
        axiosInstance.get('/bookings?status=queued'),
        axiosInstance.get('/bookings?status=penciled'),
        axiosInstance.get('/bookings?status=pending_approval&rebookSourceDenied=true'),
        fetchResources(),
      ]);
      setPendingBookings(pendingRes.data);
      setApprovedBookings(approvedRes.data);
      setStaffApprovers(Array.isArray(approversRes.data) ? approversRes.data : []);
      setContestedBookings(contestedRes.data);
      setQueuedPencilBookings(queuedRes.data);
      setActivePenciledContentions(
        Array.isArray(penciledRes.data) ? penciledRes.data.filter(isActiveContentionBooking) : []
      );
      setDeniedRebookPending(deniedPendRes.data);
      setEquipment(resources.equipment);
      setRooms(resources.rooms);
    } catch (err) {
      console.error('Error fetching staff dashboard data:', err);
      setError('Failed to load bookings. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [approvedByFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAction = async (bookingId, action) => {
    setActionLoading(bookingId + action);
    setActionError(null);
    try {
      const remark = remarkMap[bookingId] || '';
      await axiosInstance.patch(`/bookings/${bookingId}/${action}`, {
        staffRemark: remark || undefined,
      });
      setReviewOpenId(null);
      setRemarkMap((prev) => {
        const next = { ...prev };
        delete next[bookingId];
        return next;
      });
      await fetchData();
    } catch (err) {
      const msg = err.response?.data?.error || `Failed to ${action} booking.`;
      setActionError(msg);
    } finally {
      setActionLoading(null);
    }
  };

  const toggleReview = (id) => {
    setReviewOpenId((prev) => (prev === id ? null : id));
    setActionError(null);
  };

  const activeConflictGroups = useMemo(
    () =>
      computeActiveConflictGroups(
        mergeUniqueBookings([...contestedBookings, ...queuedPencilBookings, ...activePenciledContentions]),
        equipment,
        rooms
      ),
    [contestedBookings, queuedPencilBookings, activePenciledContentions, equipment, rooms]
  );
  const activeConflictGroupCount = activeConflictGroups.length;
  const deniedRebookQueueCount = deniedRebookPending.length;
  const approverOptions = [...new Map(
    staffApprovers
      .filter((u) => u?.id && u?.email)
      .map((u) => [u.id, { id: u.id, email: u.email }])
  ).values()].filter((opt) => opt.email !== user?.email);
  const approvalsRequesterCategoryOptions = useMemo(() => {
    const unique = [...new Set(
      pendingBookings.map((booking) => booking.user?.userCategory).filter(Boolean)
    )];
    return unique.map((value) => ({ value, label: formatUserCategory(value) }));
  }, [pendingBookings]);
  const approvedRequesterCategoryOptions = useMemo(() => {
    const unique = [...new Set(
      approvedBookings.map((booking) => booking.user?.userCategory).filter(Boolean)
    )];
    return unique.map((value) => ({ value, label: formatUserCategory(value) }));
  }, [approvedBookings]);
  const sourceDeniedByOptions = useMemo(() => {
    const map = new Map();
    deniedRebookPending.forEach((booking) => {
      const info = getSourceDeniedByInfo(booking);
      if (!info) return;
      map.set(info.id, info.email);
    });
    return [...map.entries()].map(([value, label]) => ({ value, label }));
  }, [deniedRebookPending]);
  const filteredPendingBookings = useMemo(() => {
    const query = normalizeText(approvalsFilters.query);
    const filtered = pendingBookings.filter((booking) => {
      if (approvalsFilters.resourceType && booking.resourceType !== approvalsFilters.resourceType) return false;
      if (approvalsFilters.requesterCategory && booking.user?.userCategory !== approvalsFilters.requesterCategory) return false;
      if (approvalsFilters.startWindow && getStartWindowBucket(booking.startTime) !== approvalsFilters.startWindow) return false;
      if (query) {
        const searchable = [
          String(booking.id),
          getBookingReferenceText(booking),
          getResourceName(booking, equipment, rooms),
          booking.purpose || '',
          booking.user?.email || '',
        ]
          .join(' ')
          .toLowerCase();
        if (!searchable.includes(query)) return false;
      }
      return true;
    });
    return sortBookingRows(filtered, approvalsFilters.sort);
  }, [approvalsFilters, pendingBookings, equipment, rooms]);
  const filteredDeniedRebookPending = useMemo(() => {
    const query = normalizeText(resubmissionsFilters.query);
    const filtered = deniedRebookPending.filter((booking) => {
      if (resubmissionsFilters.resourceType && booking.resourceType !== resubmissionsFilters.resourceType) return false;
      if (resubmissionsFilters.startWindow && getStartWindowBucket(booking.startTime) !== resubmissionsFilters.startWindow) return false;
      if (resubmissionsFilters.sourceDeniedBy) {
        const info = getSourceDeniedByInfo(booking);
        if ((info?.id || 'unknown') !== resubmissionsFilters.sourceDeniedBy) return false;
      }
      if (query) {
        const sourceInfo = getSourceDeniedByInfo(booking);
        const searchable = [
          String(booking.id),
          getBookingReferenceText(booking),
          getResourceName(booking, equipment, rooms),
          booking.purpose || '',
          booking.user?.email || '',
          sourceInfo?.email || '',
        ]
          .join(' ')
          .toLowerCase();
        if (!searchable.includes(query)) return false;
      }
      return true;
    });
    return sortBookingRows(filtered, resubmissionsFilters.sort);
  }, [resubmissionsFilters, deniedRebookPending, equipment, rooms]);
  const filteredActiveConflictGroups = useMemo(() => {
    const query = normalizeText(contentionFilters.query);
    const participantEmailQuery = normalizeText(contentionFilters.participantEmail);
    const filtered = activeConflictGroups.filter((group) => {
      if (contentionFilters.resourceType && group.resourceType !== contentionFilters.resourceType) return false;
      const { defenderBooking, challengerBooking } = getConflictParticipants(group);
      const defenderEmail = defenderBooking?.user?.email || '';
      const challengerEmail = challengerBooking?.user?.email || '';
      if (participantEmailQuery) {
        const participants = `${defenderEmail} ${challengerEmail}`.toLowerCase();
        if (!participants.includes(participantEmailQuery)) return false;
      }
      if (query) {
        const bookingIds = group.bookings.map((booking) => getBookingReference(booking)).join(' ');
        const searchable = [
          group.resourceName,
          group.resourceType,
          defenderEmail,
          challengerEmail,
          bookingIds,
        ]
          .join(' ')
          .toLowerCase();
        if (!searchable.includes(query)) return false;
      }
      return true;
    });
    return sortConflictGroups(filtered, contentionFilters.sort);
  }, [contentionFilters, activeConflictGroups]);
  const filteredApprovedBookings = useMemo(() => {
    const query = normalizeText(approvedFilters.query);
    const filtered = approvedBookings.filter((booking) => {
      if (approvedFilters.resourceType && booking.resourceType !== approvedFilters.resourceType) return false;
      if (approvedFilters.requesterCategory && booking.user?.userCategory !== approvedFilters.requesterCategory) return false;
      if (approvedFilters.approvedAtRange && !matchesApprovedAtRange(booking.approvedAt, approvedFilters.approvedAtRange)) return false;
      if (approvedFilters.hasStaffRemark === 'with' && !booking.staffRemark) return false;
      if (approvedFilters.hasStaffRemark === 'without' && booking.staffRemark) return false;
      if (query) {
        const searchable = [
          String(booking.id),
          getBookingReferenceText(booking),
          getResourceName(booking, equipment, rooms),
          booking.purpose || '',
          booking.user?.email || '',
          booking.approvedBy?.email || '',
          booking.staffRemark || '',
        ]
          .join(' ')
          .toLowerCase();
        if (!searchable.includes(query)) return false;
      }
      return true;
    });
    return sortBookingRows(filtered, approvedFilters.sort);
  }, [approvedFilters, approvedBookings, equipment, rooms]);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Staff Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {user?.email} &mdash; {formatAccountType(user?.accountType)}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-md text-sm flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {actionError && (
        <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-md text-sm flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border overflow-x-auto pb-px">
        <button
          onClick={() => setActiveTab('approvals')}
          className={`flex-shrink-0 whitespace-nowrap px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'approvals'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Pending Approvals
          {pendingBookings.length > 0 && (
            <span className="ml-2 inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground text-xs w-5 h-5">
              {pendingBookings.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('deniedRebooks')}
          className={`flex-shrink-0 whitespace-nowrap px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'deniedRebooks'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Resubmissions
          {deniedRebookQueueCount > 0 && (
            <span className="ml-2 inline-flex items-center justify-center rounded-full bg-up-forest-green text-white text-xs min-w-5 h-5 px-1">
              {deniedRebookQueueCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('contention')}
          className={`flex-shrink-0 whitespace-nowrap px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'contention'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Active conflicts
          {activeConflictGroupCount > 0 && (
            <span className="ml-2 inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground text-xs min-w-5 h-5 px-1">
              {activeConflictGroupCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('approved')}
          className={`flex-shrink-0 whitespace-nowrap px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'approved'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Approved Bookings
          {approvedBookings.length > 0 && (
            <span className="ml-2 inline-flex items-center justify-center rounded-full bg-up-forest-green text-white text-xs min-w-5 h-5 px-1">
              {approvedBookings.length}
            </span>
          )}
        </button>
      </div>

      {/* Pending Approvals Tab */}
      {activeTab === 'approvals' && (
        <section className="space-y-3">
          <Card className="border-muted">
            <CardContent className="py-4">
              <StaffBookingToolbar
                tab="approvals"
                filters={approvalsFilters}
                defaultFilters={APPROVALS_FILTER_DEFAULTS}
                onFiltersChange={setApprovalsFilters}
                requesterCategoryOptions={approvalsRequesterCategoryOptions}
              />
            </CardContent>
          </Card>
          {pendingBookings.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <CheckCircle className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No pending approvals</p>
                <p className="text-sm mt-1">All firm bookings have been reviewed.</p>
              </CardContent>
            </Card>
          ) : filteredPendingBookings.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <CheckCircle className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No pending approvals match the current filters</p>
              </CardContent>
            </Card>
          ) : (
            filteredPendingBookings.map((booking) => (
              <ApprovalCard
                key={booking.id}
                booking={booking}
                resourceName={getResourceName(booking, equipment, rooms)}
                reviewOpen={reviewOpenId === booking.id}
                remark={remarkMap[booking.id] || ''}
                onRemarkChange={(val) =>
                  setRemarkMap((prev) => ({ ...prev, [booking.id]: val }))
                }
                onToggleReview={() => toggleReview(booking.id)}
                onApprove={() => handleAction(booking.id, 'approve')}
                onDeny={() => handleAction(booking.id, 'deny')}
                actionLoading={actionLoading}
              />
            ))
          )}
        </section>
      )}

      {activeTab === 'contention' && (
        <section className="space-y-4">
          <Card className="border-muted">
            <CardContent className="py-4 text-sm text-muted-foreground space-y-3">
              <p className="text-foreground font-medium mb-1">Automated pencil contention</p>
              <p>
                Overlapping pencil bookings are resolved automatically by timers and conversion to firm. Each card below summarizes one active contention group.
              </p>
              <div className="text-foreground">
                <StaffBookingToolbar
                  tab="contention"
                  filters={contentionFilters}
                  defaultFilters={CONTENTION_FILTER_DEFAULTS}
                  onFiltersChange={setContentionFilters}
                />
              </div>
            </CardContent>
          </Card>
          {activeConflictGroupCount === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <CheckCircle className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No active conflicts in the latest-attempt view</p>
                <p className="text-sm mt-1">Contention groups will appear here when present.</p>
              </CardContent>
            </Card>
          ) : filteredActiveConflictGroups.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <CheckCircle className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No active conflicts match the current filters</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filteredActiveConflictGroups.map((group) => (
                <ActiveConflictGroupCard
                  key={group.id}
                  group={group}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {activeTab === 'approved' && (
        <section className="space-y-4">
          <Card className="border-muted">
            <CardContent className="py-4 space-y-3">
              <p className="text-xs text-muted-foreground">
                Master list of approved firm bookings. Use filters for personal review or staff-level audits.
              </p>
              <StaffBookingToolbar
                tab="approved"
                filters={approvedFilters}
                defaultFilters={APPROVED_FILTER_DEFAULTS}
                onFiltersChange={setApprovedFilters}
                requesterCategoryOptions={approvedRequesterCategoryOptions}
                approvedByFilter={approvedByFilter}
                onApprovedByFilterChange={setApprovedByFilter}
                approverOptions={approverOptions}
                currentUserEmail={user?.email || ''}
              />
            </CardContent>
          </Card>
          {approvedBookings.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <CheckCircle className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No approved bookings in this view</p>
                <p className="text-sm mt-1">Try changing filters or check again later.</p>
              </CardContent>
            </Card>
          ) : filteredApprovedBookings.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <CheckCircle className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No approved bookings match the current filters</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filteredApprovedBookings.map((booking) => (
                <ApprovedBookingCard
                  key={booking.id}
                  booking={booking}
                  resourceName={getResourceName(booking, equipment, rooms)}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {activeTab === 'deniedRebooks' && (
        <section className="space-y-6">
          <Card className="border-muted">
            <CardContent className="py-4 space-y-3">
              <p className="text-sm text-muted-foreground">
                Latest attempts that were rebooked after a <span className="font-medium text-foreground">denied</span>{' '}
                decision and are now waiting for staff review.
              </p>
              <StaffBookingToolbar
                tab="resubmissions"
                filters={resubmissionsFilters}
                defaultFilters={RESUBMISSIONS_FILTER_DEFAULTS}
                onFiltersChange={setResubmissionsFilters}
                sourceDeniedByOptions={sourceDeniedByOptions}
              />
            </CardContent>
          </Card>
          {deniedRebookQueueCount === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <CheckCircle className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No resubmissions in queue</p>
                <p className="text-sm mt-1">Nothing needs attention here right now.</p>
              </CardContent>
            </Card>
          ) : filteredDeniedRebookPending.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <CheckCircle className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No resubmissions match the current filters</p>
              </CardContent>
            </Card>
          ) : (
            <>
              {filteredDeniedRebookPending.length > 0 && (
                <div className="space-y-3">
                  <h2 className="text-sm font-semibold text-foreground">Pending approval</h2>
                  {filteredDeniedRebookPending.map((booking) => (
                    <ApprovalCard
                      key={booking.id}
                      booking={booking}
                      resourceName={getResourceName(booking, equipment, rooms)}
                      reviewOpen={reviewOpenId === booking.id}
                      remark={remarkMap[booking.id] || ''}
                      onRemarkChange={(val) =>
                        setRemarkMap((prev) => ({ ...prev, [booking.id]: val }))
                      }
                      onToggleReview={() => toggleReview(booking.id)}
                      onApprove={() => handleAction(booking.id, 'approve')}
                      onDeny={() => handleAction(booking.id, 'deny')}
                      actionLoading={actionLoading}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}

function ApprovedBookingCard({ booking, resourceName }) {
  const approvedAt = booking.approvedAt ? format(new Date(booking.approvedAt), 'MMM d, yyyy h:mm a') : '—';
  const approvedBy = booking.approvedBy?.email || 'Unknown';
  const requesterLine = booking.user?.userCategory
    ? `${booking.user?.email || 'Unknown user'} (${formatUserCategory(booking.user.userCategory)})`
    : booking.user?.email || 'Unknown user';

  return (
    <Card className="border-up-forest-green/20">
      <CardContent className="pt-4 pb-4">
        <div className="space-y-1.5 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm">{getBookingReference(booking)}</span>
            <span className="font-medium truncate">{resourceName}</span>
            <span className="text-xs text-muted-foreground capitalize">{booking.resourceType}</span>
          </div>
          <BookingStatusBadge status={booking.status} bookingType={booking.bookingType} />
          <div className="space-y-1.5 pt-1">
            <p className="text-sm">
              <span className="font-medium text-foreground">Requester:</span>{' '}
              <span className="text-muted-foreground">{requesterLine}</span>
            </p>
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <CalendarDays className="h-3.5 w-3.5 flex-shrink-0" />
              <span>{formatBookingDateRange(booking.startTime, booking.endTime)}</span>
            </div>
          </div>
          <div className="border-t border-border/70 pt-2 mt-1 text-xs text-muted-foreground space-y-1">
            <p>
              <span className="font-medium text-foreground/80">Approved by:</span>{' '}
              <span>{approvedBy}</span>
            </p>
            <p>
              <span className="font-medium text-foreground/80">Approved at:</span>{' '}
              <span>{approvedAt}</span>
            </p>
          </div>
          {booking.staffRemark && (
            <p className="text-sm">
              <span className="font-medium">Staff remark:</span>{' '}
              <span className="text-muted-foreground">{booking.staffRemark}</span>
            </p>
          )}
          <AuthorizationDocButton url={booking.authorizationDocUrl} />
        </div>
      </CardContent>
    </Card>
  );
}

function ActiveConflictGroupCard({ group }) {
  const [showDetails, setShowDetails] = useState(false);
  const { defenderBooking, challengerBooking } = getConflictParticipants(group);
  const defenderDeadline = group.urgencyAt ? format(new Date(group.urgencyAt), 'MMM d, yyyy h:mm a') : 'No active deadline';

  return (
    <Card className="border-primary/20">
      <CardContent className="pt-4 pb-4 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold">{group.resourceName}</span>
              <span className="text-xs text-muted-foreground capitalize">{group.resourceType}</span>
            </div>
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <CalendarDays className="h-3.5 w-3.5 flex-shrink-0" />
              <span>{formatBookingDateRange(group.windowStart, group.windowEnd)}</span>
            </div>
          </div>
          <div className="flex gap-1.5 flex-wrap justify-end">
            <span className="inline-flex items-center rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
              Defender deadline: {defenderDeadline}
            </span>
          </div>
        </div>

        <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-primary">Defender</span>
            <span className="font-semibold text-sm">
              {defenderBooking ? getBookingReference(defenderBooking) : '—'}
            </span>
            {defenderBooking ? (
              <BookingStatusBadge status={defenderBooking.status} bookingType={defenderBooking.bookingType} />
            ) : (
              <span className="text-xs text-muted-foreground">Missing booking</span>
            )}
            <span className="text-sm text-muted-foreground">{defenderBooking?.user?.email || 'Unknown user'}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-up-forest-green">Challenger</span>
            <span className="font-semibold text-sm">
              {challengerBooking ? getBookingReference(challengerBooking) : '—'}
            </span>
            {challengerBooking ? (
              <BookingStatusBadge status={challengerBooking.status} bookingType={challengerBooking.bookingType} />
            ) : (
              <span className="text-xs text-muted-foreground">Missing booking</span>
            )}
            <span className="text-sm text-muted-foreground">{challengerBooking?.user?.email || 'Unknown user'}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowDetails((prev) => !prev)}
          className="inline-flex items-center gap-1 text-xs font-medium text-primary"
          aria-expanded={showDetails}
        >
          {showDetails ? 'Hide member bookings' : 'View member bookings'}
          {showDetails ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
        </button>

        {showDetails && (
          <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 space-y-2">
            {group.bookings.map((booking) => (
              <div key={booking.id} className="space-y-1 border-b border-primary/10 pb-2 last:border-b-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-sm">{getBookingReference(booking)}</span>
                  <BookingStatusBadge status={booking.status} bookingType={booking.bookingType} />
                  {booking.contentionRole && (
                    <span className="inline-flex items-center rounded-full bg-card px-2 py-0.5 text-[10px] font-medium capitalize text-primary border border-primary/20">
                      {booking.contentionRole}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Users className="h-3.5 w-3.5 flex-shrink-0" />
                  <span>{booking.user?.email || 'Unknown user'}</span>
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <CalendarDays className="h-3.5 w-3.5 flex-shrink-0" />
                  <span>{formatBookingDateRange(booking.startTime, booking.endTime)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ApprovalCard({
  booking,
  resourceName,
  reviewOpen,
  remark,
  onRemarkChange,
  onToggleReview,
  onApprove,
  onDeny,
  actionLoading,
}) {
  const isLoading = (action) => actionLoading === booking.id + action;
  const firmApprovePastDeadline =
    booking.bookingType === 'firm' &&
    booking.status === 'pending_approval' &&
    isWithinStartLockWindow(booking.startTime);
  const previousAttempts = getPreviousAttempts(booking);
  const rebookChanges = getRebookChangeItems(booking);
  const isRebookAttempt = Boolean(booking.rebookedFromBookingId);
  const rebookSourceStatus = getEffectiveRebookSourceStatus(booking);
  const showUrgentRebookBadge = isRebookAttempt && rebookSourceStatus === 'denied';
  const [showPreviousAttempts, setShowPreviousAttempts] = useState(false);
  const [showRebookChanges, setShowRebookChanges] = useState(true);

  return (
    <Card>
      <CardContent className="pt-4 pb-4">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="space-y-1.5 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm">{getBookingReference(booking)}</span>
              <span className="font-medium truncate">{resourceName}</span>
              <span className="text-xs text-muted-foreground capitalize">{booking.resourceType}</span>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <BookingStatusBadge status={booking.status} bookingType={booking.bookingType} />
              {showUrgentRebookBadge && (
                <span className="inline-flex items-center rounded-full border border-up-forest-green/20 bg-secondary px-2 py-0.5 text-[11px] font-medium text-up-forest-green">
                  Rebooked
                </span>
              )}
            </div>

            {isRebookAttempt && (
              <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
                <CornerDownRight className="h-3 w-3" />
                <span className="underline decoration-dotted underline-offset-2">
                  Rebooked from {booking.rebookedFromBooking?.referenceCode
                    || booking.threadBookings?.find((attempt) => attempt.id === booking.rebookedFromBookingId)?.referenceCode
                    || `#${booking.rebookedFromBookingId}`}
                </span>
              </p>
            )}

            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <Users className="h-3.5 w-3.5 flex-shrink-0" />
              <span>
                {booking.user?.email}
                {booking.user?.userCategory && (
                  <span className="ml-1 text-xs">
                    ({formatUserCategory(booking.user.userCategory)})
                  </span>
                )}
              </span>
            </div>

            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <CalendarDays className="h-3.5 w-3.5 flex-shrink-0" />
              <span>{formatBookingDateRange(booking.startTime, booking.endTime)}</span>
            </div>

            {booking.purpose && (
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">Purpose:</span> {booking.purpose}
              </p>
            )}

            <AuthorizationDocButton url={booking.authorizationDocUrl} />
          </div>

          <div className="flex-shrink-0">
            <Button size="sm" variant="outline" onClick={onToggleReview}>
              {reviewOpen ? (
                <>
                  <ChevronUp className="h-4 w-4 mr-1" />
                  Close
                </>
              ) : (
                <>
                  <ChevronDown className="h-4 w-4 mr-1" />
                  Review
                </>
              )}
            </Button>
          </div>
        </div>

        {reviewOpen && (
          <div className="mt-4 border-t pt-4 space-y-3">
            {isRebookAttempt && (
              <div className="rounded-md border border-up-forest-green/20 bg-secondary px-3 py-2">
                <button
                  type="button"
                  onClick={() => setShowRebookChanges((prev) => !prev)}
                  className="flex w-full items-center justify-between gap-2 text-left"
                >
                  <span className="text-sm font-medium text-up-forest-green">Changes from previous attempt</span>
                  <span className="text-xs text-up-forest-green/80">
                    {showRebookChanges ? 'Hide' : 'Show'}
                  </span>
                </button>
                {showRebookChanges && (
                  rebookChanges.length > 0 ? (
                    <div className="mt-1 space-y-1">
                      {rebookChanges.map((item) => (
                        <RebookChangeRow key={item.field} item={item} />
                      ))}
                    </div>
                  ) : (
                    <p className="mt-1 text-xs text-up-forest-green/90">
                      No changed fields detected from the previous attempt.
                    </p>
                  )
                )}
              </div>
            )}
            {previousAttempts.length > 0 && (
              <div className="rounded-md border border-up-gold/30 bg-accent px-3 py-2">
                <button
                  type="button"
                  onClick={() => setShowPreviousAttempts((prev) => !prev)}
                  className="flex w-full items-center justify-between gap-2 text-left"
                >
                  <span className="text-sm font-medium text-accent-foreground">
                    Previous attempts ({previousAttempts.length})
                  </span>
                  <span className="text-xs text-accent-foreground/75">
                    {showPreviousAttempts ? 'Hide' : 'Show'}
                  </span>
                </button>
                {showPreviousAttempts && (
                  <div className="mt-2 space-y-2">
                    {previousAttempts.map((attempt) => (
                      <div key={attempt.id} className="text-sm text-accent-foreground">
                        <p className="font-medium">
                          Booking {getBookingReference(attempt)} ({attempt.status?.replace('_', ' ')})
                        </p>
                        <p className="text-xs text-accent-foreground/75">
                          {formatBookingDateRange(attempt.startTime, attempt.endTime)}
                        </p>
                        {!!attempt.staffRemark && (
                          <p className="mt-1 text-sm text-accent-foreground">{attempt.staffRemark}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {firmApprovePastDeadline && (
              <div className="rounded-md border border-up-gold/30 bg-accent px-3 py-2 text-sm text-accent-foreground">
                <p className="font-medium">Approval deadline passed</p>
                <p className="text-xs text-accent-foreground/90 mt-1">
                  This start time is within 24 hours. Firm requests must be approved at least 24 hours before start;
                  Approve is disabled. The request will show as expired after the next system check, or you can still
                  Deny to close it out.
                </p>
              </div>
            )}
            <div>
              <label className="text-sm font-medium block mb-1">
                Staff Remark{' '}
                <span className="text-muted-foreground font-normal">(optional for approve, recommended for deny)</span>
              </label>
              <textarea
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                rows={3}
                placeholder="Add a comment for the requester..."
                value={remark}
                onChange={(e) => onRemarkChange(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                className="bg-up-forest-green hover:bg-up-forest-green/90 text-white"
                onClick={onApprove}
                disabled={firmApprovePastDeadline || isLoading('approve') || isLoading('deny')}
              >
                <CheckCircle className="h-4 w-4 mr-1" />
                {isLoading('approve') ? 'Approving...' : 'Approve'}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={onDeny}
                disabled={isLoading('approve') || isLoading('deny')}
              >
                <XCircle className="h-4 w-4 mr-1" />
                {isLoading('deny') ? 'Denying...' : 'Deny'}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
