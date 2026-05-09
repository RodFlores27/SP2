import { useState, useEffect, useCallback, useMemo } from 'react';
import { format } from 'date-fns';
import { useAuth } from '@/contexts/useAuth';
import axiosInstance from '@/lib/axios';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import {
  AlertTriangle,
  Activity,
  BarChart3,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Clock3,
  Download,
  RefreshCw,
  Search,
  Shield,
  SlidersHorizontal,
  Trash2,
  Users,
  X,
} from 'lucide-react';

const ROLE_LABELS = {
  regular_user: 'Regular User',
  ptcf_staff: 'PTCF Staff',
  system_admin: 'System Admin',
};

const ROLE_OPTIONS = [
  { value: 'regular_user', label: 'Regular User' },
  { value: 'ptcf_staff', label: 'PTCF Staff' },
  { value: 'system_admin', label: 'System Admin' },
];

const AUDIT_LIMIT_OPTIONS = [25, 50, 100, 200];

const AUDIT_CATEGORY_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'booking', label: 'Booking' },
  { value: 'user', label: 'User' },
  { value: 'resource', label: 'Resource' },
];

const EMPTY_ROLE_DIALOG = {
  open: false,
  userId: null,
  email: '',
  fromRole: '',
  toRole: '',
};

const EMPTY_ANALYTICS = {
  totalEvents: 0,
  countsByEventType: [],
  countsByResourceType: [],
  countsByBookingType: [],
  countsByStatus: [],
};

const ANALYTICS_RANGE_OPTIONS = [
  { value: 'all', label: 'All Time' },
  { value: 'today', label: 'Today' },
  { value: 'last_7_days', label: 'Last 7 Days' },
  { value: 'last_30_days', label: 'Last 30 Days' },
  { value: 'custom', label: 'Custom' },
];

const USERS_FILTER_DEFAULTS = {
  query: '',
  role: 'all',
  category: 'all',
  joinedWindow: 'all',
  sort: 'joined_desc',
};

const USERS_SORT_OPTIONS = [
  { value: 'joined_desc', label: 'Joined: Newest' },
  { value: 'joined_asc', label: 'Joined: Oldest' },
  { value: 'email_asc', label: 'Email: A-Z' },
  { value: 'role_then_email', label: 'Role then Email' },
];

const USERS_JOINED_WINDOW_OPTIONS = [
  { value: 'all', label: 'Any Join Date' },
  { value: 'today', label: 'Joined Today' },
  { value: 'last_7_days', label: 'Joined Last 7 Days' },
  { value: 'last_30_days', label: 'Joined Last 30 Days' },
];

const USER_ROLE_FILTER_OPTIONS = [
  { value: 'all', label: 'All Roles' },
  { value: 'system_admin', label: 'System Admin' },
  { value: 'ptcf_staff', label: 'PTCF Staff' },
  { value: 'regular_user', label: 'Regular User' },
];

const USER_GROUP_ORDER = ['system_admin', 'ptcf_staff', 'regular_user'];
const ADMIN_USERS_FILTERS_STORAGE_KEY = 'ptcf.admin.users.filters.v1';
const ADMIN_USERS_ACCORDION_STORAGE_KEY = 'ptcf.admin.users.accordion.v1';

function formatCountBadge(count, max = 99) {
  if (!Number.isFinite(count) || count <= 0) return '0';
  if (count > max) return `${max}+`;
  return String(count);
}

function safeParseStorageObject(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch {
    // ignore malformed persisted state
  }
  return null;
}

function loadUsersFiltersState() {
  if (typeof sessionStorage === 'undefined') return { ...USERS_FILTER_DEFAULTS };
  const parsed = safeParseStorageObject(sessionStorage.getItem(ADMIN_USERS_FILTERS_STORAGE_KEY));
  if (!parsed) return { ...USERS_FILTER_DEFAULTS };
  return {
    query: typeof parsed.query === 'string' ? parsed.query : USERS_FILTER_DEFAULTS.query,
    role:
      typeof parsed.role === 'string' &&
      USER_ROLE_FILTER_OPTIONS.some((o) => o.value === parsed.role)
        ? parsed.role
        : USERS_FILTER_DEFAULTS.role,
    category: typeof parsed.category === 'string' ? parsed.category : USERS_FILTER_DEFAULTS.category,
    joinedWindow:
      typeof parsed.joinedWindow === 'string' &&
      USERS_JOINED_WINDOW_OPTIONS.some((o) => o.value === parsed.joinedWindow)
        ? parsed.joinedWindow
        : USERS_FILTER_DEFAULTS.joinedWindow,
    sort:
      typeof parsed.sort === 'string' && USERS_SORT_OPTIONS.some((o) => o.value === parsed.sort)
        ? parsed.sort
        : USERS_FILTER_DEFAULTS.sort,
  };
}

function loadUsersAccordionState() {
  if (typeof sessionStorage === 'undefined') return {};
  return safeParseStorageObject(sessionStorage.getItem(ADMIN_USERS_ACCORDION_STORAGE_KEY)) || {};
}

function roleChangeConsequence(fromRole, toRole) {
  if (fromRole === toRole) return '';
  if (fromRole === 'ptcf_staff' && toRole === 'system_admin') {
    return 'This will grant them full system administration access, in addition to their existing staff capabilities.';
  }
  if (fromRole === 'system_admin' && toRole === 'ptcf_staff') {
    return 'This will remove their administrator access; they will keep PTCF Staff approval permissions.';
  }
  if (toRole === 'ptcf_staff') {
    return 'This will grant them approval permissions.';
  }
  if (toRole === 'system_admin') {
    return 'This will grant them full system administration access, including user management.';
  }
  if (toRole === 'regular_user' && fromRole === 'ptcf_staff') {
    return 'This will remove their approval permissions.';
  }
  if (toRole === 'regular_user' && fromRole === 'system_admin') {
    return 'This will remove their administrator and staff permissions.';
  }
  return '';
}

function buildRoleChangeDescription(email, fromRole, toRole) {
  const fromLabel = ROLE_LABELS[fromRole] ?? fromRole;
  const toLabel = ROLE_LABELS[toRole] ?? toRole;
  const consequence = roleChangeConsequence(fromRole, toRole);
  const main = `Change role for ${email} from ${fromLabel} to ${toLabel}?`;
  return consequence ? `${main} ${consequence}` : main;
}

function RoleBadge({ accountType }) {
  const colors = {
    regular_user: 'bg-secondary text-secondary-foreground',
    ptcf_staff: 'bg-secondary text-up-forest-green',
    system_admin: 'bg-primary/10 text-primary',
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
        colors[accountType] ?? 'bg-secondary text-secondary-foreground'
      }`}
    >
      {ROLE_LABELS[accountType] ?? accountType}
    </span>
  );
}

function formatUserCategory(cat) {
  if (!cat) return '-';
  return cat
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function formatLabel(label) {
  if (!label) return 'Unspecified';
  return String(label)
    .replace(/^booking\./, '')
    .replace(/^resource\./, '')
    .replace(/^user\./, '')
    .replaceAll('_', ' ')
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function formatEventLabel(eventType) {
  if (!eventType) return 'Unknown Event';
  const [namespace, ...rest] = String(eventType).split('.');
  const action = formatLabel(rest.join('.') || eventType);
  if (namespace === 'booking') return `Booking ${action}`;
  if (namespace === 'user') return `User ${action}`;
  if (namespace === 'resource') return `Resource ${action}`;
  return formatLabel(eventType);
}

function getEventCategory(eventType) {
  const category = String(eventType || '').split('.')[0];
  return ['booking', 'user', 'resource'].includes(category) ? category : 'system';
}

function getAuditBadgeClass(eventType) {
  if (['booking.expiring_soon'].includes(eventType)) {
    return 'bg-amber-100 text-amber-900 border-amber-200';
  }
  if (['booking.approved'].includes(eventType)) {
    return 'bg-emerald-100 text-emerald-900 border-emerald-200';
  }
  if (
    [
      'booking.cancelled',
      'booking.denied',
      'booking.displaced',
      'booking.expired',
      'user.deleted',
    ].includes(eventType)
  ) {
    return 'bg-destructive/10 text-destructive border-destructive/20';
  }
  if (String(eventType || '').startsWith('user.')) {
    return 'bg-primary/10 text-primary border-primary/20';
  }
  if (String(eventType || '').startsWith('resource.')) {
    return 'bg-accent text-accent-foreground border-up-gold/30';
  }
  return 'bg-secondary text-secondary-foreground border-border';
}

function CountList({ title, items }) {
  const maxCount = Math.max(...items.map((item) => item.count), 1);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <BarChart3 className="h-4 w-4" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No events recorded yet.</p>
        ) : (
          items.map((item) => (
            <div key={item.label} className="space-y-1.5">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium truncate">{formatLabel(item.label)}</span>
                <span className="text-muted-foreground">{item.count}</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${Math.max((item.count / maxCount) * 100, 8)}%` }}
                />
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function AdminTabButton({ active, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-shrink-0 whitespace-nowrap px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
        active
          ? 'border-primary text-primary'
          : 'border-transparent text-muted-foreground hover:text-foreground'
      }`}
    >
      {label}
    </button>
  );
}

function formatAuditTime(value) {
  if (!value) return 'Unknown time';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown time';
  return format(date, 'MMM d, yyyy h:mm a');
}

function formatJsonValue(value) {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function getChangedFields(previous = {}, current = {}) {
  const keys = new Set([...Object.keys(previous || {}), ...Object.keys(current || {})]);
  return [...keys].filter((key) => {
    const before = previous?.[key];
    const after = current?.[key];
    return JSON.stringify(before ?? null) !== JSON.stringify(after ?? null);
  });
}

function getAuditActor(log) {
  if (log.actor?.email) return log.actor.email;
  if (log.actorUserId) return `User #${log.actorUserId}`;
  return 'System';
}

function getAuditTarget(log) {
  const payload = log.payload || {};
  if (log.eventType === 'user.role_changed' || log.eventType === 'user.deleted') {
    return payload.targetEmail || (payload.targetUserId ? `User #${payload.targetUserId}` : 'User');
  }
  if (String(log.eventType || '').startsWith('resource.')) {
    const current = payload.current || {};
    const previous = payload.previous || {};
    const name = current.name || previous.name;
    const type = formatLabel(log.resourceType || 'resource');
    return name ? `${type} ${name}` : `${type} #${log.resourceId || 'n/a'}`;
  }
  if (String(log.eventType || '').startsWith('booking.')) {
    const reference = log.booking?.referenceCode || payload.referenceCode;
    const ownerEmail = log.booking?.user?.email || null;
    const ownerId = payload.userId || log.booking?.user?.id || null;
    const owner = ownerEmail || (ownerId ? `User #${ownerId}` : null);
    const bookingLabel = reference || (log.bookingId ? `Booking #${log.bookingId}` : 'Booking');
    if (
      [
        'booking.approved',
        'booking.denied',
        'booking.expiring_soon',
        'booking.expired',
        'booking.on_hold',
      ].includes(log.eventType)
    ) {
      return owner ? `${bookingLabel} (${owner})` : bookingLabel;
    }
    return bookingLabel;
  }
  return 'System';
}

function inferRequestType(log) {
  const payload = log?.payload || {};
  if (payload.requestType) return payload.requestType;
  const resourceType = log?.booking?.resourceType || log?.resourceType || null;
  const equipmentRequestType = log?.booking?.equipmentRequestType || null;
  if (resourceType === 'room') return 'room';
  if (resourceType === 'equipment') {
    if (equipmentRequestType === 'loan') return 'equipment_loan';
    return 'equipment_inhouse';
  }
  return null;
}

function formatRequestType(value) {
  if (!value) return '-';
  if (value === 'equipment_inhouse') return 'Equipment In-house';
  if (value === 'equipment_loan') return 'Equipment Loan';
  if (value === 'room') return 'Room';
  return formatLabel(value);
}

function formatContentionParty(party) {
  if (!party) return '-';
  const booking = party.referenceCode || (party.bookingId ? `#${party.bookingId}` : '?');
  const user = party.email || (party.userId ? `User #${party.userId}` : null);
  return user ? `${booking} (${user})` : booking;
}

function getAuditDetails(log) {
  const payload = log.payload || {};
  if (log.eventType === 'user.role_changed') {
    return `${formatLabel(payload.previousAccountType)} to ${formatLabel(payload.newAccountType)}`;
  }
  if (log.eventType === 'user.deleted') {
    return `${formatLabel(payload.targetAccountType)} account deleted`;
  }
  if (String(log.eventType || '').startsWith('resource.')) {
    const changed = getChangedFields(payload.previous, payload.current);
    return changed.length > 0
      ? `${changed.length} field${changed.length === 1 ? '' : 's'} changed: ${changed.slice(0, 3).map(formatLabel).join(', ')}`
      : 'Resource details updated';
  }
  if (String(log.eventType || '').startsWith('booking.')) {
    if (log.eventType === 'booking.contention_started') {
      const requestType = formatRequestType(inferRequestType(log));
      const defender = formatContentionParty(payload.defender);
      const challenger = formatContentionParty(payload.challenger);
      return `${requestType} - Defender: ${defender} - Challenger: ${challenger}`;
    }
    if (log.eventType === 'booking.contention_resolved') {
      const requestType = formatRequestType(inferRequestType(log));
      return `${requestType} - ${formatLabel(payload.resolutionReason || 'resolved')}`;
    }
    if (log.eventType === 'booking.displaced') {
      const requestType = formatRequestType(inferRequestType(log));
      return `${requestType} - ${formatLabel(payload.displacementReason || 'displaced')}`;
    }
    if (log.eventType === 'booking.on_hold') {
      const requestType = formatRequestType(inferRequestType(log));
      const cause = payload.causingReferenceCode || (payload.causingBookingId ? `#${payload.causingBookingId}` : 'booking overlap');
      return `${requestType} - Caused by ${cause}`;
    }
    if (log.eventType === 'booking.on_hold_released') {
      const requestType = formatRequestType(inferRequestType(log));
      const cause = payload.causingReferenceCode || (payload.causingBookingId ? `#${payload.causingBookingId}` : 'booking update');
      const reason = formatLabel(payload.releaseReason || 'released');
      return `${requestType} - Released by ${cause} (${reason})`;
    }
    const bookingType = formatLabel(log.bookingType || log.booking?.bookingType);
    const status = formatLabel(log.status || log.booking?.status);
    const startTime = payload.startTime ? formatAuditTime(payload.startTime) : null;
    return [bookingType, status, startTime].filter(Boolean).join(' - ');
  }
  return 'Audit event recorded';
}

function getAuditStatusResource(log) {
  if (String(log.eventType || '').startsWith('booking.')) {
    const reference = log.booking?.referenceCode || log.payload?.referenceCode;
    const status = log.status ? formatLabel(log.status) : '';
    return [reference, status].filter(Boolean).join(' - ') || status || '-';
  }

  const resource = log.resourceType
    ? `${formatLabel(log.resourceType)} #${log.resourceId || 'n/a'}`
    : '';
  const status = log.status ? formatLabel(log.status) : '';
  return [resource, status].filter(Boolean).join(' - ') || '-';
}

function shouldShowBookingOwner(log) {
  if (!String(log?.eventType || '').startsWith('booking.')) return false;
  const ownerUserId = log?.booking?.user?.id ?? log?.payload?.userId ?? null;
  const actorUserId = log?.actorUserId ?? log?.actor?.id ?? null;
  const ownerMatchesActor =
    ownerUserId != null && actorUserId != null && Number(ownerUserId) === Number(actorUserId);

  if (
    ['booking.created', 'booking.cancelled', 'booking.converted_to_firm'].includes(log?.eventType) &&
    ownerMatchesActor
  ) {
    return false;
  }

  return true;
}

function buildAuditSearchText(log) {
  return [
    log.eventType,
    formatEventLabel(log.eventType),
    getAuditActor(log),
    getAuditTarget(log),
    getAuditDetails(log),
    getAuditStatusResource(log),
    log.booking?.referenceCode,
    log.bookingId,
    log.resourceId,
    JSON.stringify(log.payload || {}),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function AuditEventBadge({ eventType }) {
  return (
    <span
      className={`inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-xs font-medium ${getAuditBadgeClass(eventType)}`}
    >
      {formatEventLabel(eventType)}
    </span>
  );
}

function DetailRow({ label, value }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words text-sm font-medium">{value || '-'}</dd>
    </div>
  );
}

function AuditExpandedDetails({ log }) {
  const payload = log.payload || {};
  const requestType = inferRequestType(log);
  const isRoomRequest = requestType === 'room';
  const isEquipmentLoanRequest = requestType === 'equipment_loan';
  const changedFields =
    String(log.eventType || '').startsWith('resource.')
      ? getChangedFields(payload.previous, payload.current)
      : [];

  return (
    <div className="space-y-4 rounded-md border border-border bg-muted/20 p-4">
      {log.eventType === 'user.role_changed' && (
        <div className="rounded-md border border-border bg-background p-3 text-sm">
          <span className="font-medium">{payload.targetEmail || 'User'}</span>
          <span className="text-muted-foreground"> changed from </span>
          <span className="font-medium">{formatLabel(payload.previousAccountType)}</span>
          <span className="text-muted-foreground"> to </span>
          <span className="font-medium">{formatLabel(payload.newAccountType)}</span>
        </div>
      )}

      {log.eventType === 'user.deleted' && (
        <div className="rounded-md border border-destructive/20 bg-destructive/5 p-3 text-sm">
          <span className="font-medium">{payload.targetEmail || 'User'}</span>
          <span className="text-muted-foreground"> was deleted. Previous role: </span>
          <span className="font-medium">{formatLabel(payload.targetAccountType)}</span>
        </div>
      )}

      {changedFields.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b border-border">
                <th className="py-2 pr-3 font-medium">Field</th>
                <th className="py-2 pr-3 font-medium">Before</th>
                <th className="py-2 font-medium">After</th>
              </tr>
            </thead>
            <tbody>
              {changedFields.map((field) => (
                <tr key={field} className="border-b border-border/60 last:border-0">
                  <td className="py-2 pr-3 font-medium">{formatLabel(field)}</td>
                  <td className="py-2 pr-3 text-muted-foreground">
                    {formatJsonValue(payload.previous?.[field])}
                  </td>
                  <td className="py-2">{formatJsonValue(payload.current?.[field])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {String(log.eventType || '').startsWith('booking.') && (
        <div className="space-y-3 rounded-md border border-border bg-background p-3">
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <DetailRow label="Request Type" value={formatRequestType(requestType)} />
            <DetailRow label="Type" value={formatLabel(log.bookingType || log.booking?.bookingType)} />
            <DetailRow label="Status" value={formatLabel(log.status || log.booking?.status)} />
            <DetailRow
              label="Schedule"
              value={
                payload.startTime || payload.endTime
                  ? `${payload.startTime ? formatAuditTime(payload.startTime) : '?'} to ${payload.endTime ? formatAuditTime(payload.endTime) : '?'}`
                  : '-'
              }
            />
            {shouldShowBookingOwner(log) && (
              <DetailRow
                label="Booking Owner"
                value={log.booking?.user?.email || (payload.userId ? `User #${payload.userId}` : '-')}
              />
            )}
          </dl>
          {log.eventType === 'booking.contention_started' && (
            <dl className="grid grid-cols-1 gap-3 border-t border-border pt-3 sm:grid-cols-2">
              <DetailRow label="Defender" value={formatContentionParty(payload.defender)} />
              <DetailRow label="Challenger" value={formatContentionParty(payload.challenger)} />
              <DetailRow
                label="Contention Deadline"
                value={payload.contentionDeadlineAt ? formatAuditTime(payload.contentionDeadlineAt) : '-'}
              />
            </dl>
          )}
          {log.eventType === 'booking.contention_resolved' && (
            <dl className="grid grid-cols-1 gap-3 border-t border-border pt-3 sm:grid-cols-2">
              <DetailRow label="Resolution Reason" value={formatLabel(payload.resolutionReason)} />
              <DetailRow label="Defender" value={formatContentionParty(payload.defender)} />
              <DetailRow label="Challenger" value={formatContentionParty(payload.challenger)} />
              <DetailRow label="Defender Outcome" value={formatLabel(payload.defender?.outcome)} />
              <DetailRow label="Challenger Outcome" value={formatLabel(payload.challenger?.outcome)} />
            </dl>
          )}
          {log.eventType === 'booking.displaced' && (
            <dl className="grid grid-cols-1 gap-3 border-t border-border pt-3 sm:grid-cols-2">
              <DetailRow label="Displacement Reason" value={formatLabel(payload.displacementReason)} />
              <DetailRow
                label="Displacing Booking"
                value={payload.displacingReferenceCode || (payload.displacingBookingId ? `#${payload.displacingBookingId}` : '-')}
              />
            </dl>
          )}
          {log.eventType === 'booking.on_hold' && (
            <dl className="grid grid-cols-1 gap-3 border-t border-border pt-3 sm:grid-cols-2">
              <DetailRow
                label="Caused By Booking"
                value={payload.causingReferenceCode || (payload.causingBookingId ? `#${payload.causingBookingId}` : '-')}
              />
              <DetailRow label="Cause Source" value={formatLabel(payload.source)} />
            </dl>
          )}
          {log.eventType === 'booking.on_hold_released' && (
            <dl className="grid grid-cols-1 gap-3 border-t border-border pt-3 sm:grid-cols-2">
              <DetailRow
                label="Caused By Booking"
                value={payload.causingReferenceCode || (payload.causingBookingId ? `#${payload.causingBookingId}` : '-')}
              />
              <DetailRow label="Release Reason" value={formatLabel(payload.releaseReason)} />
            </dl>
          )}
          {(log.booking?.equipmentRequestType ||
            log.booking?.loanReason ||
            log.booking?.loanWorkflowNote ||
            log.booking?.loanTransportPlan ||
            log.booking?.roomParticipantCount != null ||
            log.booking?.roomEquipmentNeeds ||
            log.booking?.roomSetupRequirements ||
            log.booking?.roomProgramDetails ||
            log.booking?.cancellationReason ||
            log.booking?.probableRebookDate) && (
            <dl className="grid grid-cols-1 gap-3 border-t border-border pt-3 sm:grid-cols-2">
              {isEquipmentLoanRequest && <DetailRow label="Loan Reason" value={log.booking?.loanReason || '-'} />}
              {isEquipmentLoanRequest && (
                <DetailRow label="Loan Workflow Note" value={log.booking?.loanWorkflowNote || '-'} />
              )}
              {isEquipmentLoanRequest && (
                <DetailRow label="Loan Transport Plan" value={log.booking?.loanTransportPlan || '-'} />
              )}
              {isRoomRequest && (
                <DetailRow
                  label="Expected Participants"
                  value={log.booking?.roomParticipantCount != null ? String(log.booking.roomParticipantCount) : '-'}
                />
              )}
              {isRoomRequest && <DetailRow label="Event Equipment Needs" value={log.booking?.roomEquipmentNeeds || '-'} />}
              {isRoomRequest && (
                <DetailRow
                  label="Setup and Catering Requirements"
                  value={log.booking?.roomSetupRequirements || '-'}
                />
              )}
              {isRoomRequest && <DetailRow label="Program or Event Details" value={log.booking?.roomProgramDetails || '-'} />}
              {log.eventType === 'booking.cancelled' && (
                <DetailRow label="Cancellation Reason" value={log.booking?.cancellationReason || '-'} />
              )}
              {log.eventType === 'booking.cancelled' && (
                <DetailRow
                  label="Probable Rebook Date"
                  value={log.booking?.probableRebookDate ? formatAuditTime(log.booking.probableRebookDate) : '-'}
                />
              )}
            </dl>
          )}
        </div>
      )}
    </div>
  );
}

export default function AdminPanel() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('analytics');

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [usersFilters, setUsersFilters] = useState(() => loadUsersFiltersState());
  const [showUsersFilters, setShowUsersFilters] = useState(false);
  const [usersAccordionMap, setUsersAccordionMap] = useState(() => loadUsersAccordionState());

  const [roleLoading, setRoleLoading] = useState(null);
  const [roleError, setRoleError] = useState(null);

  const [deleteDialog, setDeleteDialog] = useState({ open: false, userId: null, email: '' });
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  const [roleDialog, setRoleDialog] = useState(EMPTY_ROLE_DIALOG);
  const [analytics, setAnalytics] = useState(EMPTY_ANALYTICS);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [analyticsError, setAnalyticsError] = useState(null);
  const [analyticsFilters, setAnalyticsFilters] = useState({
    range: 'all',
    startDate: '',
    endDate: '',
  });
  const [analyticsExporting, setAnalyticsExporting] = useState(false);

  const [auditLogs, setAuditLogs] = useState([]);
  const [auditLimit, setAuditLimit] = useState(50);
  const [auditSearch, setAuditSearch] = useState('');
  const [auditCategory, setAuditCategory] = useState('all');
  const [expandedAuditId, setExpandedAuditId] = useState(null);
  const [auditLoading, setAuditLoading] = useState(true);
  const [auditError, setAuditError] = useState(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axiosInstance.get('/admin/users');
      setUsers(res.data);
    } catch (err) {
      console.error('Error fetching users:', err);
      setError('Failed to load users. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);
    setAnalyticsError(null);
    try {
      const params = { range: analyticsFilters.range };
      if (analyticsFilters.startDate) params.startDate = analyticsFilters.startDate;
      if (analyticsFilters.endDate) params.endDate = analyticsFilters.endDate;
      const res = await axiosInstance.get('/admin/analytics', { params });
      setAnalytics({ ...EMPTY_ANALYTICS, ...res.data });
    } catch (err) {
      console.error('Error fetching analytics:', err);
      setAnalyticsError('Failed to load analytics. Please try again.');
    } finally {
      setAnalyticsLoading(false);
    }
  }, [analyticsFilters]);

  const fetchAuditLogs = useCallback(async () => {
    setAuditLoading(true);
    setAuditError(null);
    try {
      const res = await axiosInstance.get('/admin/audit-logs', {
        params: { limit: auditLimit },
      });
      setAuditLogs(Array.isArray(res.data?.logs) ? res.data.logs : []);
    } catch (err) {
      console.error('Error fetching audit logs:', err);
      setAuditError('Failed to load audit trail. Please try again.');
    } finally {
      setAuditLoading(false);
    }
  }, [auditLimit]);

  const refreshAdminData = useCallback(() => {
    fetchUsers();
    fetchAnalytics();
    fetchAuditLogs();
  }, [fetchUsers, fetchAnalytics, fetchAuditLogs]);

  const handleExportAnalyticsCsv = async () => {
    setAnalyticsExporting(true);
    setAnalyticsError(null);
    try {
      const params = { range: analyticsFilters.range };
      if (analyticsFilters.startDate) params.startDate = analyticsFilters.startDate;
      if (analyticsFilters.endDate) params.endDate = analyticsFilters.endDate;
      const res = await axiosInstance.get('/admin/analytics/export.csv', {
        params,
        responseType: 'blob',
      });

      const header = res.headers['content-disposition'] || '';
      const nameMatch = header.match(/filename="([^"]+)"/i);
      const filename = nameMatch?.[1] || `analytics-report-${Date.now()}.csv`;
      const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error exporting analytics CSV:', err);
      setAnalyticsError('Failed to export analytics CSV. Please try again.');
    } finally {
      setAnalyticsExporting(false);
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchAuditLogs();
  }, [fetchUsers, fetchAuditLogs]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  useEffect(() => {
    if (typeof sessionStorage === 'undefined') return;
    try {
      sessionStorage.setItem(ADMIN_USERS_FILTERS_STORAGE_KEY, JSON.stringify(usersFilters));
    } catch {
      // ignore
    }
  }, [usersFilters]);

  useEffect(() => {
    if (typeof sessionStorage === 'undefined') return;
    try {
      sessionStorage.setItem(ADMIN_USERS_ACCORDION_STORAGE_KEY, JSON.stringify(usersAccordionMap));
    } catch {
      // ignore
    }
  }, [usersAccordionMap]);

  const handleRoleChange = async (userId, newRole) => {
    setRoleLoading(userId);
    setRoleError(null);
    try {
      await axiosInstance.patch(`/admin/users/${userId}/role`, { accountType: newRole });
      await Promise.all([fetchUsers(), fetchAuditLogs()]);
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to update role.';
      setRoleError(msg);
    } finally {
      setRoleLoading(null);
    }
  };

  const handleRoleDialogConfirm = async () => {
    const { userId, toRole } = roleDialog;
    if (!userId || !toRole) return;
    await handleRoleChange(userId, toRole);
    setRoleDialog(EMPTY_ROLE_DIALOG);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteDialog.userId) return;
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      await axiosInstance.delete(`/admin/users/${deleteDialog.userId}`);
      setDeleteDialog({ open: false, userId: null, email: '' });
      await Promise.all([fetchUsers(), fetchAuditLogs()]);
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to delete user.';
      setDeleteError(msg);
      setDeleteDialog({ open: false, userId: null, email: '' });
    } finally {
      setDeleteLoading(false);
    }
  };

  const userCategoryOptions = useMemo(() => {
    const unique = [...new Set(users.map((u) => u.userCategory).filter(Boolean))];
    return unique
      .sort((a, b) => String(a).localeCompare(String(b)))
      .map((value) => ({ value, label: formatUserCategory(value) }));
  }, [users]);

  const filteredUsers = useMemo(() => {
    const query = usersFilters.query.trim().toLowerCase();
    const now = new Date();
    const list = users.filter((u) => {
      if (query && !String(u.email || '').toLowerCase().includes(query)) return false;
      if (usersFilters.role !== 'all' && u.accountType !== usersFilters.role) return false;
      if (usersFilters.category !== 'all' && String(u.userCategory || '') !== usersFilters.category) {
        return false;
      }
      if (usersFilters.joinedWindow !== 'all') {
        const createdAt = new Date(u.createdAt);
        if (Number.isNaN(createdAt.getTime())) return false;
        if (usersFilters.joinedWindow === 'today') {
          const sameDay =
            createdAt.getFullYear() === now.getFullYear() &&
            createdAt.getMonth() === now.getMonth() &&
            createdAt.getDate() === now.getDate();
          if (!sameDay) return false;
        } else if (usersFilters.joinedWindow === 'last_7_days') {
          if (createdAt.getTime() < now.getTime() - 7 * 24 * 60 * 60 * 1000) return false;
        } else if (usersFilters.joinedWindow === 'last_30_days') {
          if (createdAt.getTime() < now.getTime() - 30 * 24 * 60 * 60 * 1000) return false;
        }
      }
      return true;
    });

    const roleRank = {
      system_admin: 0,
      ptcf_staff: 1,
      regular_user: 2,
    };
    list.sort((a, b) => {
      if (usersFilters.sort === 'joined_asc') {
        return new Date(a.createdAt) - new Date(b.createdAt);
      }
      if (usersFilters.sort === 'email_asc') {
        return String(a.email || '').localeCompare(String(b.email || ''));
      }
      if (usersFilters.sort === 'role_then_email') {
        const rankDiff = (roleRank[a.accountType] ?? 99) - (roleRank[b.accountType] ?? 99);
        if (rankDiff !== 0) return rankDiff;
        return String(a.email || '').localeCompare(String(b.email || ''));
      }
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    return list;
  }, [users, usersFilters]);

  const usersByRole = useMemo(() => {
    const grouped = {
      system_admin: [],
      ptcf_staff: [],
      regular_user: [],
    };
    for (const u of filteredUsers) {
      if (grouped[u.accountType]) grouped[u.accountType].push(u);
    }
    return grouped;
  }, [filteredUsers]);

  const hasActiveUsersFilters = useMemo(
    () =>
      usersFilters.query !== USERS_FILTER_DEFAULTS.query ||
      usersFilters.role !== USERS_FILTER_DEFAULTS.role ||
      usersFilters.category !== USERS_FILTER_DEFAULTS.category ||
      usersFilters.joinedWindow !== USERS_FILTER_DEFAULTS.joinedWindow ||
      usersFilters.sort !== USERS_FILTER_DEFAULTS.sort,
    [usersFilters]
  );

  useEffect(() => {
    if (Object.keys(usersAccordionMap || {}).length > 0) return;
    const withCounts = USER_GROUP_ORDER.map((role) => ({
      role,
      count: usersByRole[role]?.length || 0,
    }));
    const largest = withCounts.sort((a, b) => b.count - a.count)[0];
    const next = {};
    USER_GROUP_ORDER.forEach((role) => {
      next[role] = role === largest?.role;
    });
    setUsersAccordionMap(next);
  }, [usersByRole, usersAccordionMap]);

  const filteredAuditLogs = useMemo(() => {
    const query = auditSearch.trim().toLowerCase();
    return auditLogs.filter((log) => {
      const categoryMatches =
        auditCategory === 'all' || getEventCategory(log.eventType) === auditCategory;
      const searchMatches = !query || buildAuditSearchText(log).includes(query);
      return categoryMatches && searchMatches;
    });
  }, [auditLogs, auditCategory, auditSearch]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Shield className="h-6 w-6" />
            Admin Panel
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {user?.email} &mdash; System Admin
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={refreshAdminData}
          disabled={loading || analyticsLoading || auditLoading}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {roleError && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{roleError}</span>
          <button onClick={() => setRoleError(null)} className="ml-auto text-destructive/80 hover:text-destructive">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      {deleteError && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{deleteError}</span>
          <button onClick={() => setDeleteError(null)} className="ml-auto text-destructive/80 hover:text-destructive">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      {analyticsError && (
        <div className="flex items-start gap-2 rounded-md border border-up-gold/30 bg-accent px-4 py-3 text-sm text-accent-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{analyticsError}</span>
          <button onClick={() => setAnalyticsError(null)} className="ml-auto text-accent-foreground/75 hover:text-accent-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      {auditError && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{auditError}</span>
          <button onClick={() => setAuditError(null)} className="ml-auto text-destructive/80 hover:text-destructive">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="flex gap-1 overflow-x-auto border-b border-border pb-px">
        <AdminTabButton
          active={activeTab === 'analytics'}
          label="Analytics"
          onClick={() => setActiveTab('analytics')}
        />
        <AdminTabButton
          active={activeTab === 'auditTrail'}
          label="Audit Trail"
          onClick={() => setActiveTab('auditTrail')}
        />
        <AdminTabButton
          active={activeTab === 'users'}
          label="Users"
          onClick={() => setActiveTab('users')}
        />
      </div>

      {activeTab === 'analytics' && (
        <section className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Activity className="h-4 w-4" />
                    Booking Event Analytics
                  </CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Counts are populated from booking lifecycle events.
                  </p>
                </div>
                <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
                  <p className="text-xs text-muted-foreground">Total events</p>
                  <p className="text-2xl font-bold">{analytics.totalEvents}</p>
                </div>
              </div>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  <select
                    value={analyticsFilters.range}
                    onChange={(e) =>
                      setAnalyticsFilters((prev) => ({
                        ...prev,
                        range: e.target.value,
                        ...(e.target.value !== 'custom' ? { startDate: '', endDate: '' } : {}),
                      }))
                    }
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    {ANALYTICS_RANGE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  {analyticsFilters.range === 'custom' && (
                    <>
                      <input
                        type="date"
                        value={analyticsFilters.startDate}
                        onChange={(e) =>
                          setAnalyticsFilters((prev) => ({ ...prev, startDate: e.target.value }))
                        }
                        className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        aria-label="Analytics start date"
                      />
                      <input
                        type="date"
                        value={analyticsFilters.endDate}
                        onChange={(e) =>
                          setAnalyticsFilters((prev) => ({ ...prev, endDate: e.target.value }))
                        }
                        className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        aria-label="Analytics end date"
                      />
                    </>
                  )}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleExportAnalyticsCsv}
                  disabled={analyticsLoading || analyticsExporting}
                  className="h-9"
                >
                  <Download className="mr-2 h-4 w-4" />
                  {analyticsExporting ? 'Exporting...' : 'Export CSV'}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {analyticsLoading ? (
                <LoadingSpinner />
              ) : (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <CountList title="By Event Type" items={analytics.countsByEventType} />
                  <CountList title="By Status" items={analytics.countsByStatus} />
                  <CountList title="By Resource Type" items={analytics.countsByResourceType} />
                  <CountList title="By Booking Type" items={analytics.countsByBookingType} />
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      )}

      {activeTab === 'auditTrail' && (
        <section className="space-y-4">
          <Card>
            <CardHeader className="space-y-4 pb-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Clock3 className="h-4 w-4" />
                    Audit Trail
                  </CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Booking lifecycle events, user administration changes, and resource updates.
                  </p>
                </div>
                <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
                  <p className="text-xs text-muted-foreground">Showing</p>
                  <p className="text-xl font-bold">
                    {filteredAuditLogs.length}
                    <span className="text-sm font-medium text-muted-foreground"> / {auditLogs.length}</span>
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2 lg:grid-cols-[1fr_160px_130px]">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search event, actor, target, booking, or resource..."
                    value={auditSearch}
                    onChange={(e) => setAuditSearch(e.target.value)}
                    className="w-full rounded-md border border-input bg-background py-2 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <select
                  value={auditCategory}
                  onChange={(e) => setAuditCategory(e.target.value)}
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {AUDIT_CATEGORY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <select
                  value={auditLimit}
                  onChange={(e) => {
                    setAuditLimit(Number(e.target.value));
                    setExpandedAuditId(null);
                  }}
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {AUDIT_LIMIT_OPTIONS.map((limit) => (
                    <option key={limit} value={limit}>
                      {limit} rows
                    </option>
                  ))}
                </select>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {auditLoading ? (
                <div className="py-10">
                  <LoadingSpinner />
                </div>
              ) : filteredAuditLogs.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  {auditLogs.length === 0
                    ? 'No audit events recorded yet.'
                    : 'No audit events match the current filters.'}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <div className="min-w-[920px]">
                    <div className="grid grid-cols-[130px_190px_170px_170px_1fr_150px_36px] gap-3 border-y border-border bg-muted/30 px-4 py-2 text-xs font-medium text-muted-foreground">
                      <div>Time</div>
                      <div>Event</div>
                      <div>Actor</div>
                      <div>Target</div>
                      <div>Details</div>
                      <div>Status/Resource</div>
                      <div />
                    </div>
                    <div className="divide-y divide-border">
                      {filteredAuditLogs.map((log) => {
                        const isExpanded = expandedAuditId === log.id;
                        return (
                          <div key={log.id}>
                            <button
                              type="button"
                              onClick={() => setExpandedAuditId(isExpanded ? null : log.id)}
                              className="grid w-full grid-cols-[130px_190px_170px_170px_1fr_150px_36px] gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-muted/30"
                            >
                              <div className="text-xs text-muted-foreground">
                                {formatAuditTime(log.occurredAt)}
                              </div>
                              <div>
                                <AuditEventBadge eventType={log.eventType} />
                              </div>
                              <div className="min-w-0 truncate">{getAuditActor(log)}</div>
                              <div className="min-w-0 truncate font-medium">{getAuditTarget(log)}</div>
                              <div className="min-w-0 truncate text-muted-foreground">{getAuditDetails(log)}</div>
                              <div className="min-w-0 truncate text-xs text-muted-foreground">
                                {getAuditStatusResource(log)}
                              </div>
                              <div className="flex justify-end text-muted-foreground">
                                {isExpanded ? (
                                  <ChevronDown className="h-4 w-4" />
                                ) : (
                                  <ChevronRight className="h-4 w-4" />
                                )}
                              </div>
                            </button>
                            {isExpanded && (
                              <div className="px-4 pb-4">
                                <AuditExpandedDetails log={log} />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      )}

      {activeTab === 'users' && (
        <section className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {USER_GROUP_ORDER.map((role) => (
              <Card key={role}>
                <CardContent className="pb-4 pt-4">
                  <p className="text-xs text-muted-foreground">{ROLE_LABELS[role]}</p>
                  <p className="mt-1 text-2xl font-bold">
                    {formatCountBadge(users.filter((u) => u.accountType === role).length)}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Users className="h-4 w-4" />
                  Users ({filteredUsers.length})
                </CardTitle>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="Search by email..."
                      value={usersFilters.query}
                      onChange={(e) =>
                        setUsersFilters((prev) => ({ ...prev, query: e.target.value }))
                      }
                      className="h-9 w-full rounded-md border border-input bg-background py-2 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowUsersFilters((prev) => !prev)}
                    className={`inline-flex h-9 items-center justify-center gap-1 rounded-md border px-3 text-sm transition-colors ${
                      hasActiveUsersFilters
                        ? 'border-primary/30 bg-primary/5 text-primary hover:bg-primary/10'
                        : 'hover:bg-accent'
                    }`}
                    aria-expanded={showUsersFilters}
                    aria-label="Toggle filters"
                  >
                    <SlidersHorizontal className="h-4 w-4" />
                    Filters
                    {!showUsersFilters && hasActiveUsersFilters && (
                      <span className="inline-block h-2 w-2 rounded-full bg-primary" aria-hidden="true" />
                    )}
                    {showUsersFilters ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                </div>

                {showUsersFilters && (
                  <div className="rounded-md border border-border bg-muted/20 p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                      <select
                        value={usersFilters.role}
                        onChange={(e) =>
                          setUsersFilters((prev) => ({ ...prev, role: e.target.value }))
                        }
                        className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      >
                        {USER_ROLE_FILTER_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>

                      <select
                        value={usersFilters.category}
                        onChange={(e) =>
                          setUsersFilters((prev) => ({ ...prev, category: e.target.value }))
                        }
                        className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      >
                        <option value="all">All Categories</option>
                        {userCategoryOptions.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>

                      <select
                        value={usersFilters.joinedWindow}
                        onChange={(e) =>
                          setUsersFilters((prev) => ({ ...prev, joinedWindow: e.target.value }))
                        }
                        className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      >
                        {USERS_JOINED_WINDOW_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>

                      <select
                        value={usersFilters.sort}
                        onChange={(e) =>
                          setUsersFilters((prev) => ({ ...prev, sort: e.target.value }))
                        }
                        className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      >
                        {USERS_SORT_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>

                      {hasActiveUsersFilters && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setUsersFilters({ ...USERS_FILTER_DEFAULTS })}
                          className="h-9"
                        >
                          Clear filters
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="py-10">
                  <LoadingSpinner />
                </div>
              ) : filteredUsers.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  {usersFilters.query ? 'No users match your filters.' : 'No users found.'}
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {USER_GROUP_ORDER.map((role) => {
                    const groupUsers = usersByRole[role] || [];
                    if (groupUsers.length === 0) return null;
                    const isOpen = usersAccordionMap[role] !== false;
                    return (
                      <div key={role}>
                        <button
                          type="button"
                          onClick={() =>
                            setUsersAccordionMap((prev) => ({ ...prev, [role]: !isOpen }))
                          }
                          className="flex w-full items-center gap-2 bg-muted/30 px-4 py-2 text-left"
                        >
                          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            {ROLE_LABELS[role]}
                          </span>
                          <span className="rounded-full border border-border bg-background px-2 py-0.5 text-xs font-medium">
                            {formatCountBadge(groupUsers.length)}
                          </span>
                          <span className="ml-auto text-muted-foreground">
                            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </span>
                        </button>
                        {isOpen && (
                          <div className="divide-y divide-border">
                            {groupUsers.map((u) => {
                              const isSelf = u.id === user?.id;
                              return (
                                <div
                                  key={u.id}
                                  className="grid grid-cols-1 gap-3 px-4 py-3 md:grid-cols-[minmax(0,1fr)_260px] md:items-center"
                                >
                                  <div className="min-w-0 space-y-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="truncate text-sm font-medium">{u.email}</span>
                                      {isSelf && (
                                        <span className="text-xs text-muted-foreground">(you)</span>
                                      )}
                                      <RoleBadge accountType={u.accountType} />
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                      {formatUserCategory(u.userCategory)}
                                      {u.createdAt && (
                                        <span className="ml-2">
                                          &mdash; Joined {format(new Date(u.createdAt), 'MMM d, yyyy')}
                                        </span>
                                      )}
                                    </p>
                                  </div>

                                  <div className="flex items-center justify-start gap-2 md:justify-end">
                                    <select
                                      value={u.accountType}
                                      disabled={isSelf || roleLoading === u.id}
                                      onChange={(e) => {
                                        const newRole = e.target.value;
                                        if (newRole === u.accountType) return;
                                        e.target.value = u.accountType;
                                        setRoleDialog({
                                          open: true,
                                          userId: u.id,
                                          email: u.email,
                                          fromRole: u.accountType,
                                          toRole: newRole,
                                        });
                                      }}
                                      className="rounded-md border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                      {ROLE_OPTIONS.map((opt) => (
                                        <option key={opt.value} value={opt.value}>
                                          {opt.label}
                                        </option>
                                      ))}
                                    </select>

                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      disabled={isSelf || deleteLoading}
                                      onClick={() =>
                                        setDeleteDialog({ open: true, userId: u.id, email: u.email })
                                      }
                                      className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                      title={isSelf ? 'Cannot delete your own account' : `Delete ${u.email}`}
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {USER_GROUP_ORDER.every((role) => (usersByRole[role] || []).length === 0) && (
                    <div className="py-10 text-center text-sm text-muted-foreground">
                      No users match your filters.
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      )}

      <ConfirmDialog
        open={roleDialog.open}
        onOpenChange={(open) => {
          if (!open) setRoleDialog(EMPTY_ROLE_DIALOG);
        }}
        onConfirm={handleRoleDialogConfirm}
        title="Change user role"
        description={
          roleDialog.open
            ? buildRoleChangeDescription(
                roleDialog.email,
                roleDialog.fromRole,
                roleDialog.toRole
              )
            : ''
        }
        confirmLabel="Change role"
      />

      <ConfirmDialog
        open={deleteDialog.open}
        onOpenChange={(open) => {
          if (!open) setDeleteDialog({ open: false, userId: null, email: '' });
        }}
        onConfirm={handleDeleteConfirm}
        title="Delete User Account"
        description={`Are you sure you want to permanently delete the account for "${deleteDialog.email}"? This action cannot be undone.`}
      />
    </div>
  );
}
