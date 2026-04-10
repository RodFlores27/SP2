import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { format } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import axiosInstance from '@/lib/axios';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { BookingStatusBadge } from '@/components/BookingStatusBadge';
import {
  AlertTriangle,
  CalendarDays,
  Upload,
  FileText,
  X,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  PlusCircle,
  ExternalLink,
} from 'lucide-react';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

const ACCEPTED_FILE_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
];
const MAX_FILE_SIZE = 5 * 1024 * 1024;

function formatBookingTypeLabel(bookingType) {
  if (!bookingType) return '';
  const map = { firm: 'Firm', pencil: 'Pencil' };
  return map[bookingType] ?? bookingType.charAt(0).toUpperCase() + bookingType.slice(1);
}

function formatStatusLabel(status) {
  if (!status) return '';
  return status
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function getResourceName(booking, equipment, rooms) {
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

function isCancellable(booking) {
  if (['cancelled', 'denied', 'expired'].includes(booking.status)) return false;
  const hoursUntilStart = (new Date(booking.startTime) - new Date()) / (1000 * 60 * 60);
  return hoursUntilStart >= 24;
}

function isConvertible(booking) {
  return (
    booking.bookingType === 'pencil' &&
    !['cancelled', 'denied', 'expired'].includes(booking.status)
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [bookings, setBookings] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [cancelDialog, setCancelDialog] = useState({ open: false, bookingId: null });
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelError, setCancelError] = useState(null);

  const [convertOpenId, setConvertOpenId] = useState(null);
  const [convertFile, setConvertFile] = useState(null);
  const [convertFileError, setConvertFileError] = useState(null);
  const [convertLoading, setConvertLoading] = useState(false);
  const [convertError, setConvertError] = useState(null);
  const [convertConflicts, setConvertConflicts] = useState(null);

  const fileInputRef = useRef(null);

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

      if (equipmentRes.ok) {
        const data = await equipmentRes.json();
        setEquipment(data);
      }
      if (roomsRes.ok) {
        const data = await roomsRes.json();
        setRooms(data);
      }
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
      setError('Failed to load your bookings. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

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

    if (!file) {
      setConvertFile(null);
      return;
    }

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
        headers: {
          ...(token && { Authorization: `Bearer ${token}` }),
        },
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

  const activeBookings = bookings.filter(
    (b) => !['cancelled', 'denied', 'expired'].includes(b.status)
  );
  const inactiveBookings = bookings.filter((b) =>
    ['cancelled', 'denied', 'expired'].includes(b.status)
  );

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
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

      {/* Cancel error toast */}
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

      {/* Active bookings */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Active Bookings</h2>
        {activeBookings.length === 0 ? (
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
        ) : (
          <div className="space-y-3">
            {activeBookings.map((booking) => (
              <BookingCard
                key={booking.id}
                booking={booking}
                resourceName={getResourceName(booking, equipment, rooms)}
                equipment={equipment}
                rooms={rooms}
                onCancel={(id) => setCancelDialog({ open: true, bookingId: id })}
                convertOpenId={convertOpenId}
                onOpenConvert={openConvert}
                onCloseConvert={closeConvert}
                convertFile={convertFile}
                convertFileError={convertFileError}
                convertLoading={convertLoading}
                convertError={convertError}
                convertConflicts={convertConflicts}
                onConvertFileChange={handleConvertFileChange}
                onConvertSubmit={handleConvertSubmit}
                onRemoveConvertFile={() => {
                  setConvertFile(null);
                  setConvertFileError(null);
                }}
                fileInputRef={fileInputRef}
              />
            ))}
          </div>
        )}
      </section>

      {/* Past / inactive bookings */}
      {inactiveBookings.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3 text-muted-foreground">Past Bookings</h2>
          <div className="space-y-3">
            {inactiveBookings.map((booking) => (
              <BookingCard
                key={booking.id}
                booking={booking}
                resourceName={getResourceName(booking, equipment, rooms)}
                equipment={equipment}
                rooms={rooms}
                onCancel={null}
                convertOpenId={null}
                onOpenConvert={null}
                onCloseConvert={null}
                convertFile={null}
                convertFileError={null}
                convertLoading={false}
                convertError={null}
                convertConflicts={null}
                onConvertFileChange={null}
                onConvertSubmit={null}
                onRemoveConvertFile={null}
                fileInputRef={null}
              />
            ))}
          </div>
        </section>
      )}

      {/* Cancel confirmation dialog */}
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

function BookingCard({
  booking,
  resourceName,
  equipment,
  rooms,
  onCancel,
  convertOpenId,
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
}) {
  const isConvertOpen = convertOpenId === booking.id;
  const canCancel = onCancel && isCancellable(booking);
  const canConvert = onOpenConvert && isConvertible(booking);
  const isInactive = ['cancelled', 'denied', 'expired'].includes(booking.status);

  return (
    <Card className={isInactive ? 'opacity-60' : ''}>
      <CardContent className="pt-4 pb-4">
        {/* Contested inline alert */}
        {booking.status === 'contested' && (
          <div className="mb-3 flex items-start gap-2 bg-orange-50 border border-orange-200 text-orange-800 px-3 py-2 rounded-md text-sm">
            <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0 text-orange-600" />
            <span>
              This booking is <strong>contested</strong> — it overlaps with another booking for the
              same resource. A staff member will review and resolve the conflict.
            </span>
          </div>
        )}

        {/* Main booking info */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm">#{booking.id}</span>
              <span className="font-medium truncate">{resourceName}</span>
              <span className="text-xs text-muted-foreground capitalize">{booking.resourceType}</span>
            </div>

            <BookingStatusBadge status={booking.status} bookingType={booking.bookingType} />

            <div className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
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

            {booking.staffRemark && (
              <p className="text-sm">
                <span className="font-medium">Staff remark:</span>{' '}
                <span className="text-muted-foreground">{booking.staffRemark}</span>
              </p>
            )}

            {booking.expiryAt && booking.status === 'penciled' && (
              <p className="text-xs text-muted-foreground">
                Expires: {format(new Date(booking.expiryAt), 'MMM d, yyyy h:mm a')}
              </p>
            )}

            {booking.authorizationDocUrl && (
              <a
                href={booking.authorizationDocUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary underline underline-offset-2 mt-1"
              >
                <FileText className="h-3.5 w-3.5" />
                View Authorization Doc
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>

          {/* Action buttons */}
          {!isInactive && (
            <div className="flex flex-row sm:flex-col gap-2 flex-shrink-0">
              {canConvert && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => (isConvertOpen ? onCloseConvert() : onOpenConvert(booking.id))}
                >
                  {isConvertOpen ? (
                    <>
                      <ChevronUp className="h-4 w-4 mr-1" />
                      Close
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-4 w-4 mr-1" />
                      Convert to Firm
                    </>
                  )}
                </Button>
              )}
              {canCancel && (
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => onCancel(booking.id)}
                >
                  Cancel
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Convert-to-firm inline panel */}
        {isConvertOpen && (
          <div className="mt-4 border-t pt-4 space-y-3">
            <p className="text-sm font-medium">Convert to Firm Booking</p>
            <p className="text-xs text-muted-foreground">
              An authorization document is required. Once converted, the booking will be submitted
              for staff approval.
            </p>

            {/* Conflict errors */}
            {convertError && (
              <div className="bg-red-50 border border-red-200 text-red-800 px-3 py-2 rounded-md text-sm">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <div>
                    <p>{convertError}</p>
                    {convertConflicts && convertConflicts.length > 0 && (
                      <div className="mt-2 space-y-1">
                        <p className="font-medium text-xs">Conflicting bookings:</p>
                        {convertConflicts.map((c) => (
                          <p key={c.id} className="text-xs">
                            {resourceName} &mdash; {formatBookingTypeLabel(c.bookingType)} (
                            {formatStatusLabel(c.status)}) &mdash;{' '}
                            {format(new Date(c.startTime), 'MMM d, yyyy h:mm a')} to{' '}
                            {format(new Date(c.endTime), 'h:mm a')}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* File upload */}
            {convertFile ? (
              <div className="flex items-center gap-2 p-2 bg-secondary rounded-md text-sm">
                <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span className="truncate flex-1">{convertFile.name}</span>
                <button
                  type="button"
                  onClick={onRemoveConvertFile}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div>
                <label
                  htmlFor={`convert-file-${booking.id}`}
                  className="flex flex-col items-center justify-center w-full border-2 border-dashed border-border rounded-md p-4 cursor-pointer hover:bg-accent transition-colors"
                >
                  <Upload className="h-5 w-5 text-muted-foreground mb-1" />
                  <span className="text-xs text-muted-foreground text-center">
                    Click to upload authorization document
                    <br />
                    PDF, DOC, DOCX, JPG, PNG — max 5 MB
                  </span>
                  <input
                    id={`convert-file-${booking.id}`}
                    type="file"
                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                    className="hidden"
                    onChange={onConvertFileChange}
                  />
                </label>
                {convertFileError && (
                  <p className="text-xs text-red-600 mt-1">{convertFileError}</p>
                )}
              </div>
            )}

            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => onConvertSubmit(booking.id)}
                disabled={convertLoading || !convertFile}
              >
                {convertLoading ? 'Converting...' : 'Submit for Approval'}
              </Button>
              <Button size="sm" variant="outline" onClick={onCloseConvert} disabled={convertLoading}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
