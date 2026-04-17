import { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import { useAuth } from '@/contexts/useAuth';
import axiosInstance from '@/lib/axios';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { BookingStatusBadge } from '@/components/BookingStatusBadge';
import { AuthorizationDocButton } from '@/components/my-bookings/AuthorizationDocButton';
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle,
  XCircle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Users,
  Clock,
  CornerDownRight,
} from 'lucide-react';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

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
    <p className="text-xs text-blue-800">
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

function groupContestedBookings(bookings) {
  const byResource = {};
  for (const b of bookings) {
    const key = `${b.resourceType}:${b.resourceId}`;
    if (!byResource[key]) byResource[key] = [];
    byResource[key].push(b);
  }

  const groups = [];
  for (const [, list] of Object.entries(byResource)) {
    const visited = new Set();
    for (const b of list) {
      if (visited.has(b.id)) continue;
      const cluster = [b];
      visited.add(b.id);
      for (const other of list) {
        if (visited.has(other.id)) continue;
        const overlaps = cluster.some(
          (c) =>
            new Date(c.startTime) < new Date(other.endTime) &&
            new Date(c.endTime) > new Date(other.startTime)
        );
        if (overlaps) {
          cluster.push(other);
          visited.add(other.id);
        }
      }
      groups.push(cluster);
    }
  }
  return groups;
}

export default function StaffDashboard() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('approvals');

  const [pendingBookings, setPendingBookings] = useState([]);
  const [contestedBookings, setContestedBookings] = useState([]);
  const [deniedRebookPending, setDeniedRebookPending] = useState([]);
  const [deniedRebookContested, setDeniedRebookContested] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [reviewOpenId, setReviewOpenId] = useState(null);
  const [remarkMap, setRemarkMap] = useState({});
  const [actionLoading, setActionLoading] = useState(null);
  const [actionError, setActionError] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [pendingRes, contestedRes, deniedPendRes, deniedContRes, resources] = await Promise.all([
        axiosInstance.get('/bookings?status=pending_approval'),
        axiosInstance.get('/bookings?status=contested'),
        axiosInstance.get('/bookings?status=pending_approval&rebookSourceDenied=true'),
        axiosInstance.get('/bookings?status=contested&rebookSourceDenied=true'),
        fetchResources(),
      ]);
      setPendingBookings(pendingRes.data);
      setContestedBookings(contestedRes.data);
      setDeniedRebookPending(deniedPendRes.data);
      setDeniedRebookContested(deniedContRes.data);
      setEquipment(resources.equipment);
      setRooms(resources.rooms);
    } catch (err) {
      console.error('Error fetching staff dashboard data:', err);
      setError('Failed to load bookings. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

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

  const conflictGroups = groupContestedBookings(contestedBookings);
  const deniedRebookConflictGroups = groupContestedBookings(deniedRebookContested);
  const deniedRebookQueueCount = deniedRebookPending.length + deniedRebookConflictGroups.length;

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
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-md text-sm flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {actionError && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-md text-sm flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        <button
          onClick={() => setActiveTab('approvals')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
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
          onClick={() => setActiveTab('conflicts')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'conflicts'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Conflict Resolution
          {conflictGroups.length > 0 && (
            <span className="ml-2 inline-flex items-center justify-center rounded-full bg-orange-500 text-white text-xs w-5 h-5">
              {conflictGroups.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('deniedRebooks')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'deniedRebooks'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Denied rebooks
          {deniedRebookQueueCount > 0 && (
            <span className="ml-2 inline-flex items-center justify-center rounded-full bg-blue-600 text-white text-xs min-w-5 h-5 px-1">
              {deniedRebookQueueCount}
            </span>
          )}
        </button>
      </div>

      {/* Pending Approvals Tab */}
      {activeTab === 'approvals' && (
        <section className="space-y-3">
          {pendingBookings.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <CheckCircle className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No pending approvals</p>
                <p className="text-sm mt-1">All firm bookings have been reviewed.</p>
              </CardContent>
            </Card>
          ) : (
            pendingBookings.map((booking) => (
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

      {/* Conflict Resolution Tab */}
      {activeTab === 'conflicts' && (
        <section className="space-y-6">
          {conflictGroups.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <CheckCircle className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No contested bookings</p>
                <p className="text-sm mt-1">There are no active booking conflicts to resolve.</p>
              </CardContent>
            </Card>
          ) : (
            conflictGroups.map((group, idx) => (
              <ConflictGroup
                key={idx}
                group={group}
                equipment={equipment}
                rooms={rooms}
                remarkMap={remarkMap}
                onRemarkChange={(id, val) =>
                  setRemarkMap((prev) => ({ ...prev, [id]: val }))
                }
                onApprove={(id) => handleAction(id, 'approve')}
                onDeny={(id) => handleAction(id, 'deny')}
                actionLoading={actionLoading}
              />
            ))
          )}
        </section>
      )}

      {activeTab === 'deniedRebooks' && (
        <section className="space-y-6">
          <p className="text-sm text-muted-foreground">
            Latest attempts that were rebooked after a <span className="font-medium text-foreground">denied</span>{' '}
            decision (pending approval or contested).
          </p>
          {deniedRebookQueueCount === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <CheckCircle className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No denied-origin rebooks in queue</p>
                <p className="text-sm mt-1">Nothing needs attention here right now.</p>
              </CardContent>
            </Card>
          ) : (
            <>
              {deniedRebookPending.length > 0 && (
                <div className="space-y-3">
                  <h2 className="text-sm font-semibold text-foreground">Pending approval</h2>
                  {deniedRebookPending.map((booking) => (
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
              {deniedRebookConflictGroups.length > 0 && (
                <div className="space-y-3">
                  <h2 className="text-sm font-semibold text-foreground">Contested</h2>
                  {deniedRebookConflictGroups.map((group, idx) => (
                    <ConflictGroup
                      key={idx}
                      group={group}
                      equipment={equipment}
                      rooms={rooms}
                      remarkMap={remarkMap}
                      onRemarkChange={(id, val) =>
                        setRemarkMap((prev) => ({ ...prev, [id]: val }))
                      }
                      onApprove={(id) => handleAction(id, 'approve')}
                      onDeny={(id) => handleAction(id, 'deny')}
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
              <span className="font-semibold text-sm">#{booking.id}</span>
              <span className="font-medium truncate">{resourceName}</span>
              <span className="text-xs text-muted-foreground capitalize">{booking.resourceType}</span>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <BookingStatusBadge status={booking.status} bookingType={booking.bookingType} />
              {showUrgentRebookBadge && (
                <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                  Rebooked
                </span>
              )}
            </div>

            {isRebookAttempt && (
              <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
                <CornerDownRight className="h-3 w-3" />
                <span className="underline decoration-dotted underline-offset-2">
                  Rebooked from #{booking.rebookedFromBookingId}
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
              <span>
                {format(new Date(booking.startTime), 'MMM d, yyyy h:mm a')} &mdash;{' '}
                {format(new Date(booking.endTime), 'MMM d, yyyy h:mm a')}
              </span>
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
              <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2">
                <button
                  type="button"
                  onClick={() => setShowRebookChanges((prev) => !prev)}
                  className="flex w-full items-center justify-between gap-2 text-left"
                >
                  <span className="text-sm font-medium text-blue-900">Changes from previous attempt</span>
                  <span className="text-xs text-blue-700">
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
                    <p className="mt-1 text-xs text-blue-800">
                      No changed fields detected from the previous attempt.
                    </p>
                  )
                )}
              </div>
            )}
            {previousAttempts.length > 0 && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
                <button
                  type="button"
                  onClick={() => setShowPreviousAttempts((prev) => !prev)}
                  className="flex w-full items-center justify-between gap-2 text-left"
                >
                  <span className="text-sm font-medium text-amber-900">
                    Previous attempts ({previousAttempts.length})
                  </span>
                  <span className="text-xs text-amber-700">
                    {showPreviousAttempts ? 'Hide' : 'Show'}
                  </span>
                </button>
                {showPreviousAttempts && (
                  <div className="mt-2 space-y-2">
                    {previousAttempts.map((attempt) => (
                      <div key={attempt.id} className="text-sm text-amber-900">
                        <p className="font-medium">
                          Booking #{attempt.id} ({attempt.status?.replace('_', ' ')})
                        </p>
                        <p className="text-xs text-amber-700">
                          {format(new Date(attempt.startTime), 'MMM d, yyyy h:mm a')} &mdash;{' '}
                          {format(new Date(attempt.endTime), 'MMM d, yyyy h:mm a')}
                        </p>
                        {!!attempt.staffRemark && (
                          <p className="mt-1 text-sm text-amber-800">{attempt.staffRemark}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
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
                className="bg-green-600 hover:bg-green-700 text-white"
                onClick={onApprove}
                disabled={isLoading('approve') || isLoading('deny')}
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

function ConflictGroup({ group, equipment, rooms, remarkMap, onRemarkChange, onApprove, onDeny, actionLoading }) {
  const first = group[0];
  const resourceName = getResourceName(first, equipment, rooms);

  const timeMin = group.reduce(
    (min, b) => (new Date(b.startTime) < new Date(min) ? b.startTime : min),
    group[0].startTime
  );
  const timeMax = group.reduce(
    (max, b) => (new Date(b.endTime) > new Date(max) ? b.endTime : max),
    group[0].endTime
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-orange-500 flex-shrink-0" />
        <div>
          <span className="font-semibold text-sm">{resourceName}</span>
          <span className="text-xs text-muted-foreground ml-2 capitalize">{first.resourceType}</span>
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground ml-auto">
          <Clock className="h-3.5 w-3.5" />
          <span>
            {format(new Date(timeMin), 'MMM d, h:mm a')} &mdash;{' '}
            {format(new Date(timeMax), 'MMM d, h:mm a')}
          </span>
        </div>
      </div>

      <div
        className={`grid gap-3 ${
          group.length === 2 ? 'sm:grid-cols-2' : group.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'
        }`}
      >
        {group.map((booking) => (
          <ConflictBookingCard
            key={booking.id}
            booking={booking}
            remark={remarkMap[booking.id] || ''}
            onRemarkChange={(val) => onRemarkChange(booking.id, val)}
            onApprove={() => onApprove(booking.id)}
            onDeny={() => onDeny(booking.id)}
            actionLoading={actionLoading}
          />
        ))}
      </div>
    </div>
  );
}

function ConflictBookingCard({ booking, remark, onRemarkChange, onApprove, onDeny, actionLoading }) {
  const isLoading = (action) => actionLoading === booking.id + action;
  const previousAttempts = getPreviousAttempts(booking);
  const rebookChanges = getRebookChangeItems(booking);
  const isRebookAttempt = Boolean(booking.rebookedFromBookingId);
  const rebookSourceStatus = getEffectiveRebookSourceStatus(booking);
  const showUrgentRebookBadge = isRebookAttempt && rebookSourceStatus === 'denied';
  const [showPreviousAttempts, setShowPreviousAttempts] = useState(false);
  const [showRebookChanges, setShowRebookChanges] = useState(true);

  return (
    <Card className="border-orange-200">
      <CardHeader className="pb-2 pt-3 px-4">
        <CardTitle className="text-sm flex items-center gap-2 flex-wrap">
          <span>#{booking.id}</span>
          <BookingStatusBadge status={booking.status} bookingType={booking.bookingType} />
          {showUrgentRebookBadge && (
            <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
              Rebooked
            </span>
          )}
        </CardTitle>
        {isRebookAttempt && (
          <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
            <CornerDownRight className="h-3 w-3" />
            <span className="underline decoration-dotted underline-offset-2">
              Rebooked from #{booking.rebookedFromBookingId}
            </span>
          </p>
        )}
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-2">
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <Users className="h-3.5 w-3.5 flex-shrink-0" />
          <span className="truncate">
            {booking.user?.email}
            {booking.user?.userCategory && (
              <span className="ml-1 text-xs">({formatUserCategory(booking.user.userCategory)})</span>
            )}
          </span>
        </div>

        <div className="flex items-start gap-1 text-sm text-muted-foreground">
          <CalendarDays className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
          <span>
            {format(new Date(booking.startTime), 'MMM d, h:mm a')} &mdash;{' '}
            {format(new Date(booking.endTime), 'MMM d, h:mm a')}
          </span>
        </div>

        {booking.purpose && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            <span className="font-medium text-foreground">Purpose:</span> {booking.purpose}
          </p>
        )}

        {isRebookAttempt && (
          <div className="rounded-md border border-blue-200 bg-blue-50 px-2.5 py-2">
            <button
              type="button"
              onClick={() => setShowRebookChanges((prev) => !prev)}
              className="flex w-full items-center justify-between gap-2 text-left"
            >
              <span className="text-xs font-medium text-blue-900">Changes from previous attempt</span>
              <span className="text-[11px] text-blue-700">
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
                <p className="mt-1 text-xs text-blue-800">
                  No changed fields detected from the previous attempt.
                </p>
              )
            )}
          </div>
        )}

        {previousAttempts.length > 0 && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2">
            <button
              type="button"
              onClick={() => setShowPreviousAttempts((prev) => !prev)}
              className="flex w-full items-center justify-between gap-2 text-left"
            >
              <span className="text-xs font-medium text-amber-900">
                Previous attempts ({previousAttempts.length})
              </span>
              <span className="text-[11px] text-amber-700">
                {showPreviousAttempts ? 'Hide' : 'Show'}
              </span>
            </button>
            {showPreviousAttempts && (
              <div className="mt-1 space-y-1.5">
                {previousAttempts.map((attempt) => (
                  <div key={attempt.id} className="text-xs text-amber-900">
                    <p className="font-medium">
                      Booking #{attempt.id} ({attempt.status?.replace('_', ' ')})
                    </p>
                    {!!attempt.staffRemark && (
                      <p className="text-amber-700">{attempt.staffRemark}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <AuthorizationDocButton url={booking.authorizationDocUrl} />

        <div>
          <textarea
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-ring"
            rows={2}
            placeholder="Staff remark (optional)..."
            value={remark}
            onChange={(e) => onRemarkChange(e.target.value)}
          />
        </div>

        <div className="flex gap-2">
          <Button
            size="sm"
            className="flex-1 bg-green-600 hover:bg-green-700 text-white text-xs h-8"
            onClick={onApprove}
            disabled={isLoading('approve') || isLoading('deny')}
          >
            <CheckCircle className="h-3.5 w-3.5 mr-1" />
            {isLoading('approve') ? '...' : 'Approve'}
          </Button>
          <Button
            size="sm"
            variant="destructive"
            className="flex-1 text-xs h-8"
            onClick={onDeny}
            disabled={isLoading('approve') || isLoading('deny')}
          >
            <XCircle className="h-3.5 w-3.5 mr-1" />
            {isLoading('deny') ? '...' : 'Deny'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
