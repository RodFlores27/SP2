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
  ChevronRight,
  Clock3,
  RefreshCw,
  Search,
  Shield,
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
    return reference || (log.bookingId ? `Booking #${log.bookingId}` : 'Booking');
  }
  return 'System';
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
          </dl>
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
              <DetailRow
                label="Equipment Request Type"
                value={formatLabel(log.booking?.equipmentRequestType)}
              />
              <DetailRow label="Loan Reason" value={log.booking?.loanReason || '-'} />
              <DetailRow label="Loan Workflow Note" value={log.booking?.loanWorkflowNote || '-'} />
              <DetailRow label="Loan Transport Plan" value={log.booking?.loanTransportPlan || '-'} />
              <DetailRow
                label="Expected Participants"
                value={log.booking?.roomParticipantCount != null ? String(log.booking.roomParticipantCount) : '-'}
              />
              <DetailRow label="Event Equipment Needs" value={log.booking?.roomEquipmentNeeds || '-'} />
              <DetailRow
                label="Setup and Catering Requirements"
                value={log.booking?.roomSetupRequirements || '-'}
              />
              <DetailRow label="Program or Event Details" value={log.booking?.roomProgramDetails || '-'} />
              <DetailRow label="Cancellation Reason" value={log.booking?.cancellationReason || '-'} />
              <DetailRow
                label="Probable Rebook Date"
                value={log.booking?.probableRebookDate ? formatAuditTime(log.booking.probableRebookDate) : '-'}
              />
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
  const [search, setSearch] = useState('');

  const [roleLoading, setRoleLoading] = useState(null);
  const [roleError, setRoleError] = useState(null);

  const [deleteDialog, setDeleteDialog] = useState({ open: false, userId: null, email: '' });
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  const [roleDialog, setRoleDialog] = useState(EMPTY_ROLE_DIALOG);
  const [analytics, setAnalytics] = useState(EMPTY_ANALYTICS);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [analyticsError, setAnalyticsError] = useState(null);

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
      const res = await axiosInstance.get('/admin/analytics');
      setAnalytics({ ...EMPTY_ANALYTICS, ...res.data });
    } catch (err) {
      console.error('Error fetching analytics:', err);
      setAnalyticsError('Failed to load analytics. Please try again.');
    } finally {
      setAnalyticsLoading(false);
    }
  }, []);

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

  useEffect(() => {
    refreshAdminData();
  }, [refreshAdminData]);

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

  const filtered = users.filter((u) =>
    u.email.toLowerCase().includes(search.toLowerCase())
  );

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
            {['regular_user', 'ptcf_staff', 'system_admin'].map((role) => (
              <Card key={role}>
                <CardContent className="pb-4 pt-4">
                  <p className="text-xs text-muted-foreground">{ROLE_LABELS[role]}</p>
                  <p className="mt-1 text-2xl font-bold">
                    {users.filter((u) => u.accountType === role).length}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Users className="h-4 w-4" />
                  Users ({filtered.length})
                </CardTitle>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search by email..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full rounded-md border border-input bg-background py-1.5 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring sm:w-64"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="py-10">
                  <LoadingSpinner />
                </div>
              ) : filtered.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  {search ? 'No users match your search.' : 'No users found.'}
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {filtered.map((u) => {
                    const isSelf = u.id === user?.id;
                    return (
                      <div
                        key={u.id}
                        className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center"
                      >
                        <div className="min-w-0 flex-1 space-y-0.5">
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

                        <div className="flex flex-shrink-0 items-center gap-2">
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
