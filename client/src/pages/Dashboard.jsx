import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import axiosInstance from '@/lib/axios';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { AlertTriangle, CalendarDays, RefreshCw, PlusCircle, X } from 'lucide-react';
import { ActiveBookingCard } from '@/components/my-bookings/ActiveBookingCard';
import { PastBookingRow } from '@/components/my-bookings/PastBookingRow';
import { BookingToolbar } from '@/components/my-bookings/BookingToolbar';
import {
  getResourceName,
  groupByStatus,
  filterBookings,
  formatStatusLabel,
  ACTIVE_STATUS_ORDER,
  PAST_STATUS_ORDER,
} from '@/components/my-bookings/bookingDashboardUtils';
import {
  loadAccordionMap,
  saveAccordionMap,
  isAccordionGroupOpen,
  loadFilters,
  saveFilters,
  loadDashboardTab,
  saveDashboardTab,
} from '@/components/my-bookings/myBookingsDashboardSession';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

const ACCEPTED_FILE_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
];
const MAX_FILE_SIZE = 5 * 1024 * 1024;

function sortBookings(bookings, sort) {
  const list = [...bookings];
  if (sort === 'soonest') return list.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
  if (sort === 'latest') return list.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
  if (sort === 'newest') return list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return list;
}

export default function Dashboard() {
  const { user } = useAuth();

  const [bookings, setBookings] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [activeTab, setActiveTab] = useState(() => loadDashboardTab());
  const [activeFilters, setActiveFilters] = useState(() => loadFilters('active'));
  const [pastFilters, setPastFilters] = useState(() => loadFilters('past'));

  const [cancelDialog, setCancelDialog] = useState({ open: false, bookingId: null });
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelError, setCancelError] = useState(null);

  const [convertOpenId, setConvertOpenId] = useState(null);
  const [convertFile, setConvertFile] = useState(null);
  const [convertFileError, setConvertFileError] = useState(null);
  const [convertLoading, setConvertLoading] = useState(false);
  const [convertError, setConvertError] = useState(null);
  const [convertConflicts, setConvertConflicts] = useState(null);

  const [accordionActiveMap, setAccordionActiveMap] = useState(() => loadAccordionMap('active'));
  const [accordionPastMap, setAccordionPastMap] = useState(() => loadAccordionMap('past'));

  const fileInputRef = useRef(null);

  const toggleAccordion = (tab, status) => {
    if (tab === 'active') {
      setAccordionActiveMap((prev) => {
        const currentlyOpen = isAccordionGroupOpen('active', status, prev);
        const next = { ...prev, [status]: !currentlyOpen };
        saveAccordionMap('active', next);
        return next;
      });
    } else {
      setAccordionPastMap((prev) => {
        const currentlyOpen = isAccordionGroupOpen('past', status, prev);
        const next = { ...prev, [status]: !currentlyOpen };
        saveAccordionMap('past', next);
        return next;
      });
    }
  };

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [bookingsRes, equipmentRes, roomsRes] = await Promise.all([
        axiosInstance.get('/bookings'),
        fetch(`${BASE_URL}/equipment`),
        fetch(`${BASE_URL}/rooms`),
      ]);

      setBookings(bookingsRes.data);

      if (equipmentRes.ok) setEquipment(await equipmentRes.json());
      if (roomsRes.ok) setRooms(await roomsRes.json());
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
      setError('Failed to load your bookings. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    saveDashboardTab(activeTab);
  }, [activeTab]);

  useEffect(() => {
    saveFilters('active', activeFilters);
  }, [activeFilters]);

  useEffect(() => {
    saveFilters('past', pastFilters);
  }, [pastFilters]);

  const handleCancelConfirm = async () => {
    if (!cancelDialog.bookingId) return;
    setCancelLoading(true);
    setCancelError(null);
    try {
      await axiosInstance.patch(`/bookings/${cancelDialog.bookingId}/cancel`);
      setCancelDialog({ open: false, bookingId: null });
      await fetchData();
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to cancel booking.';
      setCancelError(msg);
      setCancelDialog({ open: false, bookingId: null });
    } finally {
      setCancelLoading(false);
    }
  };

  const openConvert = (bookingId) => {
    setConvertOpenId(bookingId);
    setConvertFile(null);
    setConvertFileError(null);
    setConvertError(null);
    setConvertConflicts(null);
  };

  const closeConvert = () => {
    setConvertOpenId(null);
    setConvertFile(null);
    setConvertFileError(null);
    setConvertError(null);
    setConvertConflicts(null);
  };

  const handleConvertFileChange = (e) => {
    const file = e.target.files?.[0];
    setConvertFileError(null);
    setConvertError(null);
    setConvertConflicts(null);

    if (!file) { setConvertFile(null); return; }

    if (!ACCEPTED_FILE_TYPES.includes(file.type)) {
      setConvertFileError('Invalid file type. Only PDF, DOC, DOCX, JPG, and PNG are allowed.');
      setConvertFile(null);
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setConvertFileError('File size exceeds 5MB limit.');
      setConvertFile(null);
      return;
    }

    setConvertFile(file);
  };

  const handleConvertSubmit = async (bookingId) => {
    if (!convertFile) {
      setConvertFileError('Authorization document is required to convert to firm booking.');
      return;
    }

    setConvertLoading(true);
    setConvertError(null);
    setConvertConflicts(null);

    try {
      const formData = new FormData();
      formData.append('authorizationDoc', convertFile);

      const token = localStorage.getItem('token');
      const res = await fetch(`${BASE_URL}/bookings/${bookingId}/convert-to-firm`, {
        method: 'PATCH',
        headers: { ...(token && { Authorization: `Bearer ${token}` }) },
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 409) {
          setConvertConflicts(data.conflicts || []);
          setConvertError(data.error || 'Booking conflicts with existing bookings.');
        } else {
          setConvertError(data.error || 'Failed to convert booking.');
        }
        return;
      }

      closeConvert();
      await fetchData();
    } catch (err) {
      console.error('Error converting booking:', err);
      setConvertError('Failed to convert booking. Please try again.');
    } finally {
      setConvertLoading(false);
    }
  };

  // Partition
  const activeBookings = bookings.filter(
    (b) => !['cancelled', 'denied', 'expired'].includes(b.status)
  );
  const pastBookings = bookings.filter((b) =>
    ['cancelled', 'denied', 'expired'].includes(b.status)
  );

  // Helper bound to current resource lists
  const getName = (b) => getResourceName(b, equipment, rooms);

  // Apply filters + sort
  const filteredActive = sortBookings(
    filterBookings(activeBookings, activeFilters, getName),
    activeFilters.sort
  );
  const filteredPast = sortBookings(
    filterBookings(pastBookings, pastFilters, getName),
    pastFilters.sort
  );

  // Group by status
  const activeGroups = groupByStatus(filteredActive, ACTIVE_STATUS_ORDER);
  const pastGroups = groupByStatus(filteredPast, PAST_STATUS_ORDER);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">My Bookings</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {user?.email} &mdash; {user?.accountType?.replace('_', ' ')}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Link to="/bookings/new">
            <Button size="sm">
              <PlusCircle className="h-4 w-4 mr-2" />
              New Booking
            </Button>
          </Link>
        </div>
      </div>

      {/* Global error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-md text-sm flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Cancel error */}
      {cancelError && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-md text-sm flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <span>{cancelError}</span>
          </div>
          <button onClick={() => setCancelError(null)} className="ml-auto text-red-600 hover:text-red-800">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-border">
        <div className="flex gap-0">
          {[
            { id: 'active', label: 'Active', count: activeBookings.length },
            { id: 'past', label: 'Past', count: pastBookings.length },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
              }`}
            >
              {tab.label}
              <span
                className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${
                  activeTab === tab.id
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Toolbar */}
      {activeTab === 'active' ? (
        <BookingToolbar
          tab="active"
          filters={activeFilters}
          onFiltersChange={setActiveFilters}
        />
      ) : (
        <BookingToolbar
          tab="past"
          filters={pastFilters}
          onFiltersChange={setPastFilters}
        />
      )}

      {/* Active tab */}
      {activeTab === 'active' && (
        <ActiveTabContent
          groups={activeGroups}
          filteredCount={filteredActive.length}
          totalCount={activeBookings.length}
          accordionMap={accordionActiveMap}
          onAccordionToggle={(status) => toggleAccordion('active', status)}
          convertOpenId={convertOpenId}
          onCancel={(id) => setCancelDialog({ open: true, bookingId: id })}
          onOpenConvert={openConvert}
          onCloseConvert={closeConvert}
          convertFile={convertFile}
          convertFileError={convertFileError}
          convertLoading={convertLoading}
          convertError={convertError}
          convertConflicts={convertConflicts}
          onConvertFileChange={handleConvertFileChange}
          onConvertSubmit={handleConvertSubmit}
          onRemoveConvertFile={() => { setConvertFile(null); setConvertFileError(null); }}
          fileInputRef={fileInputRef}
          getName={getName}
        />
      )}

      {/* Past tab */}
      {activeTab === 'past' && (
        <PastTabContent
          groups={pastGroups}
          filteredCount={filteredPast.length}
          totalCount={pastBookings.length}
          accordionMap={accordionPastMap}
          onAccordionToggle={(status) => toggleAccordion('past', status)}
          getName={getName}
        />
      )}

      <ConfirmDialog
        open={cancelDialog.open}
        onOpenChange={(open) => {
          if (!open) setCancelDialog({ open: false, bookingId: null });
        }}
        onConfirm={handleCancelConfirm}
        title="Cancel Booking"
        description="Are you sure you want to cancel this booking? This action cannot be undone."
      />
    </div>
  );
}

function ActiveTabContent({
  groups,
  filteredCount,
  totalCount,
  accordionMap,
  onAccordionToggle,
  convertOpenId,
  onCancel,
  onOpenConvert,
  onCloseConvert,
  convertFile,
  convertFileError,
  convertLoading,
  convertError,
  convertConflicts,
  onConvertFileChange,
  onConvertSubmit,
  onRemoveConvertFile,
  fileInputRef,
  getName,
}) {
  if (totalCount === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          <CalendarDays className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="font-medium">No active bookings</p>
          <p className="text-sm mt-1">
            <Link to="/bookings/new" className="text-primary underline underline-offset-2">
              Create a new booking
            </Link>{' '}
            to get started.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (filteredCount === 0) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        No active bookings match the current filters.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {groups.map(({ status, items }) => (
        <StatusGroup
          key={status}
          status={status}
          count={items.length}
          open={isAccordionGroupOpen('active', status, accordionMap)}
          onToggle={() => onAccordionToggle(status)}
        >
          <div className="space-y-3">
            {items.map((booking) => (
              <ActiveBookingCard
                key={booking.id}
                booking={booking}
                resourceName={getName(booking)}
                convertOpenId={convertOpenId}
                onCancel={onCancel}
                onOpenConvert={onOpenConvert}
                onCloseConvert={onCloseConvert}
                convertFile={convertFile}
                convertFileError={convertFileError}
                convertLoading={convertLoading}
                convertError={convertError}
                convertConflicts={convertConflicts}
                onConvertFileChange={onConvertFileChange}
                onConvertSubmit={onConvertSubmit}
                onRemoveConvertFile={onRemoveConvertFile}
                fileInputRef={fileInputRef}
              />
            ))}
          </div>
        </StatusGroup>
      ))}
    </div>
  );
}

function PastTabContent({ groups, filteredCount, totalCount, accordionMap, onAccordionToggle, getName }) {
  if (totalCount === 0) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        No past bookings yet.
      </p>
    );
  }

  if (filteredCount === 0) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        No past bookings match the current filters.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {groups.map(({ status, items }) => (
        <StatusGroup
          key={status}
          status={status}
          count={items.length}
          open={isAccordionGroupOpen('past', status, accordionMap)}
          onToggle={() => onAccordionToggle(status)}
        >
          <div className="space-y-2">
            {items.map((booking) => (
              <PastBookingRow
                key={booking.id}
                booking={booking}
                resourceName={getName(booking)}
              />
            ))}
          </div>
        </StatusGroup>
      ))}
    </div>
  );
}

/** Collapsible section heading with a status label + count badge. */
function StatusGroup({ status, count, children, open, onToggle }) {
  const labelMap = {
    contested: 'Contested',
    pending_approval: 'Pending Approval',
    penciled: 'Penciled',
    approved: 'Approved',
    cancelled: 'Cancelled',
    denied: 'Denied',
    expired: 'Expired',
    other: 'Other',
  };

  const accentMap = {
    contested: 'text-orange-700 border-orange-200 bg-orange-50',
    pending_approval: 'text-yellow-700 border-yellow-200 bg-yellow-50',
    penciled: 'text-blue-700 border-blue-200 bg-blue-50',
    approved: 'text-green-700 border-green-200 bg-green-50',
    cancelled: 'text-gray-500 border-gray-200 bg-gray-50',
    denied: 'text-red-700 border-red-200 bg-red-50',
    expired: 'text-gray-400 border-gray-200 bg-gray-50',
    other: 'text-gray-600 border-gray-200 bg-gray-50',
  };

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-2 mb-2 group w-full text-left"
      >
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground group-hover:text-foreground transition-colors">
          {labelMap[status] ?? formatStatusLabel(status)}
        </span>
        <span
          className={`text-xs px-1.5 py-0.5 rounded-full border font-medium ${accentMap[status] ?? accentMap.other}`}
        >
          {count}
        </span>
        <span className="ml-auto text-muted-foreground text-xs">
          {open ? '▲' : '▼'}
        </span>
      </button>
      {open && children}
    </div>
  );
}
