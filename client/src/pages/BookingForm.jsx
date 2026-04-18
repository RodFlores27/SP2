import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { format } from 'date-fns';
import axiosInstance from '@/lib/axios';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { AuthorizationDocButton } from '@/components/my-bookings/AuthorizationDocButton';
import { ArrowLeft, Upload, FileText, X, AlertTriangle, CheckCircle, Info } from 'lucide-react';

const ACCEPTED_FILE_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

const bookingSchema = z.object({
  resourceType: z.enum(['equipment', 'room'], {
    required_error: 'Select a resource type',
  }),
  resourceId: z.string().min(1, 'Select a resource'),
  bookingType: z.enum(['pencil', 'firm'], {
    required_error: 'Select a booking type',
  }),
  startTime: z.string().min(1, 'Start time is required'),
  endTime: z.string().min(1, 'End time is required'),
  purpose: z.string().optional(),
});

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

function formatBookingTypeLabel(bookingType) {
  if (!bookingType || typeof bookingType !== 'string') return String(bookingType ?? '');
  const map = { firm: 'Firm', pencil: 'Pencil' };
  if (map[bookingType]) return map[bookingType];
  return bookingType.charAt(0).toUpperCase() + bookingType.slice(1).toLowerCase();
}

function formatStatusLabel(status) {
  if (!status || typeof status !== 'string') return String(status ?? '');
  return status
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

export default function BookingForm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const prefilledBookingType = searchParams.get('bookingType');
  const rebookedFromBookingId = searchParams.get('rebookedFromBookingId');
  const isRebookMode = Boolean(rebookedFromBookingId);
  const prefilledAuthorizationDocUrl = searchParams.get('authorizationDocUrl') || '';

  const [equipment, setEquipment] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [loadingResources, setLoadingResources] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [submitSuccess, setSubmitSuccess] = useState(null);
  const [conflicts, setConflicts] = useState(null);
  const [docFile, setDocFile] = useState(null);
  const [existingDocUrl, setExistingDocUrl] = useState(prefilledAuthorizationDocUrl);
  const [docError, setDocError] = useState(null);
  const [pendingConfirmation, setPendingConfirmation] = useState(null);
  const [pendingContentionConfirmation, setPendingContentionConfirmation] = useState(null);

  // Format ISO string to datetime-local value
  const toDatetimeLocal = (isoString) => {
    if (!isoString) return '';
    try {
      const date = new Date(isoString);
      if (isNaN(date.getTime())) return '';
      return format(date, "yyyy-MM-dd'T'HH:mm");
    } catch {
      return '';
    }
  };

  const form = useForm({
    resolver: zodResolver(bookingSchema),
    defaultValues: {
      resourceType: searchParams.get('resourceType') || '',
      resourceId: searchParams.get('resourceId') || '',
      bookingType: prefilledBookingType === 'firm' || prefilledBookingType === 'pencil'
        ? prefilledBookingType
        : 'pencil',
      startTime: toDatetimeLocal(searchParams.get('startTime')),
      endTime: toDatetimeLocal(searchParams.get('endTime')),
      purpose: searchParams.get('purpose') || '',
    },
  });

  const watchedResourceType = form.watch('resourceType');
  const watchedResourceId = form.watch('resourceId');
  const watchedBookingType = form.watch('bookingType');

  const selectedResourceName = useMemo(() => {
    if (!watchedResourceId) return 'Resource';
    if (watchedResourceType === 'room') {
      const r = rooms.find((x) => String(x.id) === String(watchedResourceId));
      return r?.name ?? `Resource #${watchedResourceId}`;
    }
    if (watchedResourceType === 'equipment') {
      const e = equipment.find((x) => String(x.id) === String(watchedResourceId));
      return e?.name ?? `Resource #${watchedResourceId}`;
    }
    return `Resource #${watchedResourceId}`;
  }, [watchedResourceType, watchedResourceId, equipment, rooms]);

  // Fetch resources on mount
  useEffect(() => {
    const fetchResources = async () => {
      try {
        const [equipmentRes, roomsRes] = await Promise.all([
          fetch(`${BASE_URL}/equipment`),
          fetch(`${BASE_URL}/rooms`),
        ]);

        if (equipmentRes.ok) {
          const data = await equipmentRes.json();
          setEquipment(data);
        }
        if (roomsRes.ok) {
          const data = await roomsRes.json();
          setRooms(data);
        }
      } catch (err) {
        console.error('Error fetching resources:', err);
      } finally {
        setLoadingResources(false);
      }
    };

    fetchResources();
  }, []);

  // Reset resourceId only when the user actually changes resourceType.
  // Keep prefilled resourceId intact during initial rebook load/rerenders.
  const previousResourceTypeRef = useRef(watchedResourceType);
  useEffect(() => {
    const previousResourceType = previousResourceTypeRef.current;
    if (
      previousResourceType &&
      watchedResourceType &&
      previousResourceType !== watchedResourceType
    ) {
      form.setValue('resourceId', '');
    }
    previousResourceTypeRef.current = watchedResourceType;
  }, [watchedResourceType, form]);

  const getResourceOptions = () => {
    const isBookable = (status) => ['available', 'in-use'].includes(status);
    if (watchedResourceType === 'equipment') {
      return equipment
        .filter((e) => isBookable(e.status) || String(e.id) === String(watchedResourceId))
        .map((e) => ({ id: e.id.toString(), name: e.name }));
    }
    if (watchedResourceType === 'room') {
      return rooms
        .filter((r) => isBookable(r.status) || String(r.id) === String(watchedResourceId))
        .map((r) => ({ id: r.id.toString(), name: r.name }));
    }
    return [];
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    setDocError(null);

    if (!file) {
      setDocFile(null);
      return;
    }

    if (!ACCEPTED_FILE_TYPES.includes(file.type)) {
      setDocError('Invalid file type. Only PDF, DOC, DOCX, JPG, and PNG are allowed.');
      setDocFile(null);
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setDocError('File size exceeds 5MB limit.');
      setDocFile(null);
      return;
    }

    setDocFile(file);
    setExistingDocUrl('');
  };

  const removeFile = () => {
    setDocFile(null);
    setDocError(null);
    setExistingDocUrl('');
  };

  const submitBooking = async (data, confirmOverlapOwn = false, confirmContention = false) => {
    try {
      setIsSubmitting(true);
      setSubmitError(null);
      setSubmitSuccess(null);
      setConflicts(null);

      const startTime = new Date(data.startTime).toISOString();
      const endTime = new Date(data.endTime).toISOString();

      let response;

      if (docFile) {
        // Use multipart/form-data when a file is attached
        const formData = new FormData();
        formData.append('resourceType', data.resourceType);
        formData.append('resourceId', data.resourceId);
        formData.append('bookingType', data.bookingType);
        formData.append('startTime', startTime);
        formData.append('endTime', endTime);
        if (data.purpose) {
          formData.append('purpose', data.purpose);
        }
        if (confirmOverlapOwn) {
          formData.append('confirmOverlapOwn', 'true');
        }
        if (confirmContention) {
          formData.append('confirmContention', 'true');
        }
        if (rebookedFromBookingId) {
          formData.append('rebookedFromBookingId', rebookedFromBookingId);
        }
        if (docFile) {
          formData.append('authorizationDoc', docFile);
        } else if (existingDocUrl) {
          formData.append('authorizationDocUrl', existingDocUrl);
        }

        const token = localStorage.getItem('token');
        const apiBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

        const res = await fetch(`${apiBaseUrl}/bookings`, {
          method: 'POST',
          headers: {
            ...(token && { Authorization: `Bearer ${token}` }),
          },
          body: formData,
        });

        const resData = await res.json();

        if (!res.ok) {
          if (res.status === 409) {
            // Check if this is a confirmation prompt for own pencil overlap
            if (resData.requiresConfirmation) {
              setPendingConfirmation({
                formData: data,
                ownPencilConflicts: resData.ownPencilConflicts,
              });
              return;
            }
            if (resData.requiresContentionConfirmation) {
              setPendingContentionConfirmation({
                formData: data,
                conflicts: resData.conflicts || [],
              });
              return;
            }
            setConflicts(resData.conflicts || []);
            setSubmitError(resData.error || 'Booking conflicts with existing bookings.');
            return;
          }
          throw { response: { data: resData, status: res.status } };
        }

        response = { data: resData };
      } else {
        // Use JSON when no file is attached
        const payload = {
          resourceType: data.resourceType,
          resourceId: parseInt(data.resourceId, 10),
          bookingType: data.bookingType,
          startTime,
          endTime,
          purpose: data.purpose || undefined,
        };
        if (confirmOverlapOwn) {
          payload.confirmOverlapOwn = true;
        }
        if (confirmContention) {
          payload.confirmContention = true;
        }
        if (rebookedFromBookingId) {
          payload.rebookedFromBookingId = parseInt(rebookedFromBookingId, 10);
        }
        if (existingDocUrl) {
          payload.authorizationDocUrl = existingDocUrl;
        }

        try {
          response = await axiosInstance.post('/bookings', payload);
        } catch (axiosErr) {
          if (axiosErr.response?.status === 409 && axiosErr.response?.data?.requiresConfirmation) {
            setPendingConfirmation({
              formData: data,
              ownPencilConflicts: axiosErr.response.data.ownPencilConflicts,
            });
            return;
          }
          if (axiosErr.response?.status === 409 && axiosErr.response?.data?.requiresContentionConfirmation) {
            setPendingContentionConfirmation({
              formData: data,
              conflicts: axiosErr.response.data.conflicts || [],
            });
            return;
          }
          throw axiosErr;
        }
      }

      const result = response.data;

      const st = result.booking?.status;
      const contentionSuccess =
        result.booking?.bookingType === 'pencil' &&
        (st === 'contested' || st === 'queued');

      if (result.conflicts && result.conflicts.length > 0) {
        setConflicts(result.conflicts);
        setSubmitSuccess({
          message: result.message,
          booking: result.booking,
          isContested: contentionSuccess,
        });
      } else {
        setSubmitSuccess({
          message: result.message,
          booking: result.booking,
          isContested: false,
          cancelledPencilBookings: result.cancelledPencilBookings || [],
          overlappingPencils: result.overlappingPencils || [],
        });
      }
    } catch (err) {
      console.error('Error creating booking:', err);
      const errorData = err.response?.data;

      if (err.response?.status === 409) {
        setConflicts(errorData?.conflicts || []);
        setSubmitError(errorData?.error || 'Booking conflicts with existing bookings.');
      } else {
        setSubmitError(errorData?.error || 'Failed to create booking. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const onSubmit = async (data) => {
    setPendingConfirmation(null);
    setPendingContentionConfirmation(null);
    await submitBooking(data, false, false);
  };

  const handleConfirmOverlap = async () => {
    if (!pendingConfirmation) return;
    setPendingConfirmation(null);
    await submitBooking(pendingConfirmation.formData, true, false);
  };

  const handleCancelOverlap = () => {
    setPendingConfirmation(null);
  };

  const handleConfirmContention = async () => {
    if (!pendingContentionConfirmation) return;
    setPendingContentionConfirmation(null);
    await submitBooking(pendingContentionConfirmation.formData, false, true);
  };

  const handleCancelContention = () => {
    setPendingContentionConfirmation(null);
  };

  if (loadingResources) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <Link to="/calendar">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Calendar
          </Button>
        </Link>
      </div>

      {/* Success message */}
      {submitSuccess && (
        <Card className="mb-6 border-green-200 bg-green-50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
              <div className="space-y-2">
                <p className="font-medium text-green-800">{submitSuccess.message}</p>
                {submitSuccess.booking && (
                  <div className="text-sm text-green-700 space-y-1">
                    <p>Booking ID: #{submitSuccess.booking.id}</p>
                    <p>Status: <span className="font-medium capitalize">{submitSuccess.booking.status?.replace('_', ' ')}</span></p>
                    <p>Type: <span className="font-medium capitalize">{submitSuccess.booking.bookingType}</span></p>
                  </div>
                )}
                {submitSuccess.isContested && submitSuccess.booking?.status === 'contested' && (
                  <div className="flex items-start gap-2 mt-2 p-2 bg-orange-50 border border-orange-200 rounded">
                    <AlertTriangle className="h-4 w-4 text-orange-600 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-orange-700">
                      You are challenging an existing pencil booking. A contention timer is running — the current holder must convert to a firm booking before the deadline, or you will take the slot.
                    </p>
                  </div>
                )}
                {submitSuccess.isContested && submitSuccess.booking?.status === 'queued' && (
                  <div className="flex items-start gap-2 mt-2 p-2 bg-violet-50 border border-violet-200 rounded">
                    <Info className="h-4 w-4 text-violet-600 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-violet-800">
                      Your booking is <strong>queued</strong> behind an earlier contention on this resource. You will be notified when your turn starts.
                    </p>
                  </div>
                )}
                {submitSuccess.booking?.bookingType === 'firm' &&
                  submitSuccess.overlappingPencils?.length > 0 && (
                    <div className="flex items-start gap-2 mt-2 p-2 bg-amber-50 border border-amber-200 rounded">
                      <Info className="h-4 w-4 text-amber-700 mt-0.5 flex-shrink-0" />
                      <div className="text-sm text-amber-900 space-y-1">
                        <p>
                          This request overlaps existing pencil bookings. If staff approves your firm booking,
                          those holders will be <strong>displaced</strong> (they can rebook).
                        </p>
                        <p className="font-medium">Overlapping pencils:</p>
                        <ul className="list-disc pl-4 space-y-0.5 text-xs">
                          {submitSuccess.overlappingPencils.map((c) => (
                            <li key={c.id}>
                              #{c.id} — {format(new Date(c.startTime), 'MMM d, yyyy h:mm a')} to{' '}
                              {format(new Date(c.endTime), 'h:mm a')}
                              {c.user?.email ? ` (${c.user.email})` : ''}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}
                <div className="flex gap-3 mt-3">
                  <Button size="sm" variant="outline" onClick={() => navigate('/calendar')}>
                    View Calendar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setSubmitSuccess(null);
                      setConflicts(null);
                      form.reset();
                      setDocFile(null);
                    }}
                  >
                    Create Another Booking
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pencil overlap confirmation dialog */}
      {pendingConfirmation && (
        <Card className="mb-6 border-orange-200 bg-orange-50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-orange-600 mt-0.5 flex-shrink-0" />
              <div className="space-y-3">
                <p className="font-medium text-orange-800">
                  This firm booking overlaps with your existing pencil booking(s).
                </p>
                <p className="text-sm text-orange-700">
                  Creating this firm booking will automatically cancel the following pencil booking(s):
                </p>
                <div className="space-y-1">
                  {pendingConfirmation.ownPencilConflicts.map((c) => (
                    <div key={c.id} className="text-sm bg-white/60 border border-orange-200 rounded px-3 py-2">
                      <p className="font-medium">Pencil Booking #{c.id}</p>
                      <p className="text-xs text-orange-600">
                        {format(new Date(c.startTime), 'MMM d, yyyy h:mm a')} — {format(new Date(c.endTime), 'h:mm a')}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="flex gap-3 pt-1">
                  <Button
                    size="sm"
                    onClick={handleConfirmOverlap}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? 'Creating...' : 'Confirm & Cancel Pencil Booking(s)'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleCancelOverlap}
                    disabled={isSubmitting}
                  >
                    Go Back
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {pendingContentionConfirmation && (
        <Card className="mb-6 border-amber-200 bg-amber-50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-700 mt-0.5 flex-shrink-0" />
              <div className="space-y-3">
                <p className="font-medium text-amber-900">
                  This pencil booking would contest an existing pencil on the same resource.
                </p>
                <p className="text-sm text-amber-800">
                  Contention is resolved automatically: the holder must convert to a firm booking before the deadline, or you receive the slot. Later challengers may be queued (first come, first served).
                </p>
                <div className="space-y-1">
                  {pendingContentionConfirmation.conflicts.map((c) => (
                    <div key={c.id} className="text-sm bg-white/60 border border-amber-200 rounded px-3 py-2">
                      <p className="font-medium">Booking #{c.id}</p>
                      <p className="text-xs text-amber-800">
                        {format(new Date(c.startTime), 'MMM d, yyyy h:mm a')} — {format(new Date(c.endTime), 'h:mm a')}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="flex gap-3 pt-1">
                  <Button size="sm" onClick={handleConfirmContention} disabled={isSubmitting}>
                    {isSubmitting ? 'Creating...' : 'Confirm & place booking'}
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleCancelContention} disabled={isSubmitting}>
                    Go Back
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {!submitSuccess && !pendingConfirmation && !pendingContentionConfirmation && (
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Create New Booking</CardTitle>
            <p className="text-muted-foreground">
              Reserve equipment or a room at the Plant Tissue Culture Facility
            </p>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                {/* Error display */}
                {submitError && (
                  <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-md text-sm">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                      <div>
                        <p>{submitError}</p>
                        {conflicts && conflicts.length > 0 && (
                          <div className="mt-2 space-y-1">
                            <p className="font-medium">Conflicting bookings:</p>
                            {conflicts.map((c) => (
                              <p key={c.id} className="text-xs">
                                #{c.id} {selectedResourceName} — {formatBookingTypeLabel(c.bookingType)} ({formatStatusLabel(c.status)}) — {format(new Date(c.startTime), 'MMM d, yyyy h:mm a')} to {format(new Date(c.endTime), 'h:mm a')}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Resource Type */}
                <FormField
                  control={form.control}
                  name="resourceType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Resource Type</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value} disabled={isRebookMode}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select resource type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="equipment">Equipment</SelectItem>
                          <SelectItem value="room">Room</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                      {isRebookMode && (
                        <p className="text-xs text-muted-foreground">
                          Locked for rebook: keep the original resource type.
                        </p>
                      )}
                    </FormItem>
                  )}
                />

                {/* Resource */}
                <FormField
                  control={form.control}
                  name="resourceId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {watchedResourceType === 'room' ? 'Room' : 'Equipment'}
                      </FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                        disabled={!watchedResourceType || isRebookMode}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue
                              placeholder={
                                watchedResourceType
                                  ? `Select ${watchedResourceType === 'room' ? 'a room' : 'equipment'}`
                                  : 'Select resource type first'
                              }
                            />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {getResourceOptions().map((resource) => (
                            <SelectItem key={resource.id} value={resource.id}>
                              {resource.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                      {isRebookMode && (
                        <p className="text-xs text-muted-foreground">
                          Locked for rebook: keep the original resource.
                        </p>
                      )}
                    </FormItem>
                  )}
                />

                {/* Booking Type */}
                <FormField
                  control={form.control}
                  name="bookingType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Booking Type</FormLabel>
                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => field.onChange('pencil')}
                          className={`flex-1 px-4 py-3 rounded-lg border-2 text-left transition-colors ${
                            field.value === 'pencil'
                              ? 'border-primary bg-primary/5'
                              : 'border-border hover:border-muted-foreground/50'
                          }`}
                        >
                          <p className="font-medium">Pencil</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Tentative reservation. Expires in 3 days if not converted to firm.
                          </p>
                        </button>
                        <button
                          type="button"
                          onClick={() => field.onChange('firm')}
                          className={`flex-1 px-4 py-3 rounded-lg border-2 text-left transition-colors ${
                            field.value === 'firm'
                              ? 'border-primary bg-primary/5'
                              : 'border-border hover:border-muted-foreground/50'
                          }`}
                        >
                          <p className="font-medium">Firm</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Confirmed reservation. Cannot overlap other firms; may overlap pencils (displaced if
                            approved). Pending staff approval after submission.
                          </p>
                        </button>
                      </div>
                      {field.value === 'firm' && (
                        <div className="flex items-start gap-2 mt-2 p-3 bg-blue-50 border border-blue-200 rounded-md">
                          <Info className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                          <p className="text-sm text-blue-700">
                            Firm bookings cannot overlap other firm bookings. They may overlap pencil bookings —
                            overlapping pencils are displaced only after staff approves your request.
                          </p>
                        </div>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Time slot pickers */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="startTime"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Start Time</FormLabel>
                        <FormControl>
                          <Input type="datetime-local" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="endTime"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>End Time</FormLabel>
                        <FormControl>
                          <Input type="datetime-local" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Purpose */}
                <FormField
                  control={form.control}
                  name="purpose"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Purpose (optional)</FormLabel>
                      <FormControl>
                        <textarea
                          placeholder="Describe the purpose of your booking..."
                          className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Authorization Document Upload */}
                <div className="space-y-2">
                  <label className="text-sm font-medium leading-none">
                    Authorization Document {watchedBookingType === 'firm' ? '' : '(optional)'}
                  </label>
                  <p className="text-xs text-muted-foreground">
                    {watchedBookingType === 'firm'
                      ? 'Upload an authorization letter or supporting document for your firm booking.'
                      : 'You may attach an authorization document now, or upload it later when converting to a firm booking.'}
                  </p>

                  {!docFile ? (
                    existingDocUrl ? (
                      <div className="space-y-2 p-3 border rounded-lg bg-muted/30">
                        <p className="text-sm text-muted-foreground">
                          Using authorization document from previous attempt.
                        </p>
                        <div className="flex items-center justify-between gap-2">
                          <AuthorizationDocButton url={existingDocUrl} />
                          <label className="cursor-pointer">
                            <Button type="button" variant="outline" size="sm" asChild>
                              <span>Replace File</span>
                            </Button>
                            <input
                              type="file"
                              className="hidden"
                              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                              onChange={handleFileChange}
                            />
                          </label>
                        </div>
                      </div>
                    ) : (
                      <div className="border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-muted-foreground/50 transition-colors">
                        <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                        <p className="text-sm text-muted-foreground mb-2">
                          PDF, DOC, DOCX, JPG, or PNG (max 5MB)
                        </p>
                        <label className="cursor-pointer">
                          <Button type="button" variant="outline" size="sm" asChild>
                            <span>Choose File</span>
                          </Button>
                          <input
                            type="file"
                            className="hidden"
                            accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                            onChange={handleFileChange}
                          />
                        </label>
                      </div>
                    )
                  ) : (
                    <div className="flex items-center gap-3 p-3 border rounded-lg bg-muted/50">
                      <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{docFile.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {(docFile.size / 1024).toFixed(1)} KB
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={removeFile}
                        className="flex-shrink-0"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  )}

                  {docError && (
                    <p className="text-sm text-red-600">{docError}</p>
                  )}
                </div>

                {/* Submit */}
                <div className="flex gap-3 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => navigate(-1)}
                    disabled={isSubmitting}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isSubmitting} className="flex-1">
                    {isSubmitting ? 'Creating Booking...' : 'Create Booking'}
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
