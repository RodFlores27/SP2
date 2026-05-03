import { useState, useEffect, useCallback } from 'react';
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
  recentEvents: [],
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
  if (!cat) return '—';
  return cat
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function formatAnalyticsLabel(label) {
  if (!label) return 'Unspecified';
  return String(label)
    .replace(/^booking\./, '')
    .replaceAll('_', ' ')
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
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
                <span className="font-medium truncate">{formatAnalyticsLabel(item.label)}</span>
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

  const refreshAdminData = useCallback(() => {
    fetchUsers();
    fetchAnalytics();
  }, [fetchUsers, fetchAnalytics]);

  useEffect(() => {
    refreshAdminData();
  }, [refreshAdminData]);

  const handleRoleChange = async (userId, newRole) => {
    setRoleLoading(userId);
    setRoleError(null);
    try {
      await axiosInstance.patch(`/admin/users/${userId}/role`, { accountType: newRole });
      await fetchUsers();
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
      await fetchUsers();
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

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6" />
            Admin Panel
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {user?.email} &mdash; System Admin
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={refreshAdminData}
          disabled={loading || analyticsLoading}
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Global errors */}
      {error && (
        <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-md text-sm flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {roleError && (
        <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-md text-sm flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>{roleError}</span>
          <button onClick={() => setRoleError(null)} className="ml-auto text-destructive/80 hover:text-destructive">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      {deleteError && (
        <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-md text-sm flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>{deleteError}</span>
          <button onClick={() => setDeleteError(null)} className="ml-auto text-destructive/80 hover:text-destructive">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      {analyticsError && (
        <div className="bg-accent border border-up-gold/30 text-accent-foreground px-4 py-3 rounded-md text-sm flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>{analyticsError}</span>
          <button onClick={() => setAnalyticsError(null)} className="ml-auto text-accent-foreground/75 hover:text-accent-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="flex gap-1 border-b border-border overflow-x-auto pb-px">
        <AdminTabButton
          active={activeTab === 'analytics'}
          label="Analytics"
          onClick={() => setActiveTab('analytics')}
        />
        <AdminTabButton
          active={activeTab === 'recentEvents'}
          label="Recent Events"
          onClick={() => setActiveTab('recentEvents')}
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
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Activity className="h-4 w-4" />
                    Booking Event Analytics
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    Counts are populated by the Kafka analytics consumer from booking lifecycle events.
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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

      {activeTab === 'recentEvents' && (
        <section className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock3 className="h-4 w-4" />
                Recent Event Summaries
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Latest booking lifecycle events captured by the analytics consumer.
              </p>
            </CardHeader>
            <CardContent className="p-0">
              {analyticsLoading ? (
                <div className="py-10">
                  <LoadingSpinner />
                </div>
              ) : analytics.recentEvents.length === 0 ? (
                <div className="py-10 text-center text-muted-foreground text-sm">
                  No analytics events recorded yet.
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {analytics.recentEvents.map((event) => (
                    <div key={event.id} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {formatAnalyticsLabel(event.eventType)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Booking {event.booking?.referenceCode || (event.bookingId != null ? `#${event.bookingId}` : 'n/a')} - {formatAnalyticsLabel(event.resourceType)} - {formatAnalyticsLabel(event.bookingType)} - {formatAnalyticsLabel(event.status)}
                        </p>
                      </div>
                      <div className="text-xs text-muted-foreground sm:text-right">
                        {event.occurredAt
                          ? format(new Date(event.occurredAt), 'MMM d, yyyy h:mm a')
                          : 'Unknown time'}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      )}

      {activeTab === 'users' && (
        <section className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {['regular_user', 'ptcf_staff', 'system_admin'].map((role) => (
              <Card key={role}>
                <CardContent className="pt-4 pb-4">
                  <p className="text-xs text-muted-foreground">{ROLE_LABELS[role]}</p>
                  <p className="text-2xl font-bold mt-1">
                    {users.filter((u) => u.accountType === role).length}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
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
                    className="pl-8 pr-3 py-1.5 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring w-full sm:w-64"
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
                <div className="py-10 text-center text-muted-foreground text-sm">
                  {search ? 'No users match your search.' : 'No users found.'}
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {filtered.map((u) => {
                    const isSelf = u.id === user?.id;
                    return (
                      <div
                        key={u.id}
                        className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3"
                      >
                        <div className="flex-1 min-w-0 space-y-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium truncate">{u.email}</span>
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

                        <div className="flex items-center gap-2 flex-shrink-0">
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
                            className="text-xs rounded-md border border-input bg-background px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
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
                            className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 w-8 p-0"
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

      {/* Delete confirmation dialog */}
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
