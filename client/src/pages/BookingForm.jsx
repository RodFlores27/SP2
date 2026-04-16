import { useState, useEffect, useMemo } from 'react';
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

  const [equipment, setEquipment] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [loadingResources, setLoadingResources] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [submitSuccess, setSubmitSuccess] = useState(null);
  const [conflicts, setConflicts] = useState(null);
  const [docFile, setDocFile] = useState(null);
  const [docError, setDocError] = useState(null);
  const [pendingConfirmation, setPendingConfirmation] = useState(null);

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
          setEquipment(data.filter((e) => ['available', 'in-use'].includes(e.status)));
        }
        if (roomsRes.ok) {
          const data = await roomsRes.json();
          setRooms(data.filter((r) => ['available', 'in-use'].includes(r.status)));
        }
      } catch (err) {
        console.error('Error fetching resources:', err);
      } finally {
        setLoadingResources(false);
      }
    };

    fetchResources();
  }, []);

  // Reset resourceId when resourceType changes (but not on initial load)
  const [initialLoad, setInitialLoad] = useState(true);
  useEffect(() => {
    if (initialLoad) {
      setInitialLoad(false);
      return;
    }
    form.setValue('resourceId', '');
  }, [watchedResourceType]);

  const getResourceOptions = () => {
    if (watchedResourceType === 'equipment') {
      return equipment.map((e) => ({ id: e.id.toString(), name: e.name }));
    }
    if (watchedResourceType === 'room') {
      return rooms.map((r) => ({ id: r.id.toString(), name: r.name }));
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
  };

  const removeFile = () => {
    setDocFile(null);
    setDocError(null);
  };

  const submitBooking = async (data, confirmOverlapOwn = false) => {
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
        formData.append('authorizationDoc', docFile);

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
          throw axiosErr;
        }
      }

      const result = response.data;

      if (result.conflicts && result.conflicts.length > 0) {
        setConflicts(result.conflicts);
        setSubmitSuccess({
          message: result.message,
          booking: result.booking,
          isContested: true,
        });
      } else {
        setSubmitSuccess({
          message: result.message,
          booking: result.booking,
          isContested: false,
          cancelledPencilBookings: result.cancelledPencilBookings || [],
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
    await submitBooking(data, false);
  };

  const handleConfirmOverlap = async () => {
    if (!pendingConfirmation) return;
    setPendingConfirmation(null);
    await submitBooking(pendingConfirmation.formData, true);
  };

  const handleCancelOverlap = () => {
    setPendingConfirmation(null);
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
                {submitSuccess.isContested && (
                  <div className="flex items-start gap-2 mt-2 p-2 bg-orange-50 border border-orange-200 rounded">
                    <AlertTriangle className="h-4 w-4 text-orange-600 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-orange-700">
                      Your booking overlaps with existing bookings and has been marked as <strong>contested</strong>. 
                      A staff member will review and resolve the conflict.
                    </p>
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

      {!submitSuccess && !pendingConfirmation && (
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
                      <Select onValueChange={field.onChange} value={field.value}>
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
                        disabled={!watchedResourceType}
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
                            Confirmed reservation. No overlaps allowed. Pending staff approval after submission.
                          </p>
                        </button>
                      </div>
                      {field.value === 'firm' && (
                        <div className="flex items-start gap-2 mt-2 p-3 bg-blue-50 border border-blue-200 rounded-md">
                          <Info className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                          <p className="text-sm text-blue-700">
                            Firm bookings cannot overlap with existing firm bookings. After submission, a staff member will review and approve your booking.
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
