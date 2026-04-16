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
  Lightbulb,
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
    ptcf_staff: 'bg-blue-100 text-blue-800',
    system_admin: 'bg-purple-100 text-purple-800',
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

export default function AdminPanel() {
  const { user } = useAuth();

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

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

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
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6" />
            Admin Panel
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {user?.email} &mdash; System Admin
          </p>
          <div className="mt-3 flex gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            <Lightbulb className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
            <p>
              <span className="font-medium text-foreground">Coming soon:</span>{' '}
              audit logs for administrative actions, plus reporting and analytics for facility
              utilization.
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={fetchUsers} disabled={loading}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Global errors */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-md text-sm flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {roleError && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-md text-sm flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>{roleError}</span>
          <button onClick={() => setRoleError(null)} className="ml-auto text-red-600 hover:text-red-800">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      {deleteError && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-md text-sm flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>{deleteError}</span>
          <button onClick={() => setDeleteError(null)} className="ml-auto text-red-600 hover:text-red-800">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Stats summary */}
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

      {/* User list */}
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
          {filtered.length === 0 ? (
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
                    {/* User info */}
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

                    {/* Role selector */}
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

                      {/* Delete button */}
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
