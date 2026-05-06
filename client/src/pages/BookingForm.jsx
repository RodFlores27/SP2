import { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { format } from 'date-fns';
import axiosInstance from '@/lib/axios';
import { formatBookingDateRange } from '@/lib/formatBookingDateRange';
import { getBookingReference } from '@/lib/bookingReference';
import {
  formatDatetimeLocalValue,
  getAdvanceBookingMaxStart,
  isBeyondAdvanceBookingWindow,
} from '@/lib/bookingAdvanceWindow';
import {
  peekConvertFirmSuccess,
  clearConvertFirmSuccessSession,
} from '@/lib/convertFirmSuccessSession';
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
import { bookingMessages } from '@/messages/bookingMessages';

const bf = bookingMessages.bookingForm;

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
    required_error: bf.schema.resourceTypeRequired,
  }),
  resourceId: z.string().min(1, bf.schema.resourceIdRequired),
  bookingType: z.enum(['pencil', 'firm'], {
    required_error: bf.schema.bookingTypeRequired,
  }),
  startTime: z
    .string()
    .min(1, bf.schema.startTimeRequired)
    .refine((value) => !isBeyondAdvanceBookingWindow(value), bf.schema.startBeyondAdvanceWindow),
  endTime: z.string().min(1, bf.schema.endTimeRequired),
  purpose: z.string().optional(),
});

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

function formatBookingTypeLabel(bookingType) {
  if (!bookingType || typeof bookingType !== 'string') return String(bookingType ?? '');
  const map = bf.labels.bookingType;
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
  const [pendingForeignOverlapConfirmation, setPendingForeignOverlapConfirmation] = useState(null);
  const [pendingContentionConfirmation, setPendingContentionConfirmation] = useState(null);
  const [activeContentionNotice, setActiveContentionNotice] = useState(null);
  const [firmPencilOverlapDetailsOpen, setFirmPencilOverlapDetailsOpen] = useState(false);
  const maxStartTimeLocal = useMemo(
    () => formatDatetimeLocalValue(getAdvanceBookingMaxStart()),
    []
  );

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

  const formatDeadlineForNotice = (isoString) => {
    if (!isoString) return bf.activeContentionUnavailable.deadlineUnknown;
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return bf.activeContentionUnavailable.deadlineUnknown;
    return date.toLocaleString('en-PH', {
      timeZone: 'Asia/Manila',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }) + ' (Asia/Manila)';
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

  useEffect(() => {
    if (watchedBookingType !== 'firm') {
      setFirmPencilOverlapDetailsOpen(false);
      if (docError === bf.docErrors.requiredForFirm) {
        setDocError(null);
      }
    }
  }, [watchedBookingType, docError]);

  const selectedResourceName = useMemo(() => {
    if (!watchedResourceId) return bf.fields.resourceFallback;
    if (watchedResourceType === 'room') {
      const r = rooms.find((x) => String(x.id) === String(watchedResourceId));
      return r?.name ?? bf.fields.resourceNumber(watchedResourceId);
    }
    if (watchedResourceType === 'equipment') {
      const e = equipment.find((x) => String(x.id) === String(watchedResourceId));
      return e?.name ?? bf.fields.resourceNumber(watchedResourceId);
    }
    return bf.fields.resourceNumber(watchedResourceId);
  }, [watchedResourceType, watchedResourceId, equipment, rooms]);

  useLayoutEffect(() => {
    const cs = peekConvertFirmSuccess();
    if (cs?.booking) {
      setSubmitSuccess({
        message: cs.message ?? bf.convertFirmDefaultSuccess,
        booking: cs.booking,
        isContested: false,
        cancelledPencilBookings: [],
        overlappingPencils: [],
        fromConvertToFirm: true,
      });
    }
  }, []);

  useLayoutEffect(() => {
    if (submitSuccess) {
      window.scrollTo(0, 0);
    }
  }, [submitSuccess]);

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
      setDocError(bf.docErrors.invalidType);
      setDocFile(null);
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setDocError(bf.docErrors.tooLarge);
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

  const submitBooking = async (
    data,
    confirmOverlapOwn = false,
    confirmContention = false,
    confirmOverlapForeign = false
  ) => {
    try {
      setIsSubmitting(true);
      setSubmitError(null);
      setSubmitSuccess(null);
      setConflicts(null);
      setActiveContentionNotice(null);
      clearConvertFirmSuccessSession();

      if (data.bookingType === 'firm' && !docFile && !existingDocUrl) {
        setDocError(bf.docErrors.requiredForFirm);
        setSubmitError(bf.docErrors.requiredForFirm);
        return;
      }

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
        if (confirmOverlapForeign) {
          formData.append('confirmOverlapForeign', 'true');
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
            if (resData.requiresForeignOverlapConfirmation) {
              setPendingForeignOverlapConfirmation({
                formData: data,
                foreignPencilConflicts: resData.foreignPencilConflicts || [],
              });
              return;
            }
            if (resData.code === 'PENCIL_OVERLAP_CHANGED') {
              setPendingContentionConfirmation(null);
              setConflicts(resData.conflicts || []);
              setSubmitError(resData.error || bf.apiFallbacks.pencilOverlapChanged);
              return;
            }
            if (resData.code === 'ACTIVE_CONTENTION_LOCKED') {
              setPendingContentionConfirmation(null);
              setConflicts(null);
              setSubmitError(null);
              setActiveContentionNotice({
                deadlineAt: resData.contentionDeadlineAt || null,
              });
              return;
            }
            if (resData.requiresContentionConfirmation) {
              setPendingContentionConfirmation({
                formData: data,
                conflicts: resData.conflicts || [],
                deadlineAt: resData.contentionDeadlineAt || null,
              });
              return;
            }
            setConflicts(resData.conflicts || []);
            setSubmitError(resData.error || bf.apiFallbacks.genericConflict);
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
        if (confirmOverlapForeign) {
          payload.confirmOverlapForeign = true;
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
          const st = axiosErr.response?.status;
          const d = axiosErr.response?.data;
          if (st === 409 && d?.requiresConfirmation) {
            setPendingConfirmation({
              formData: data,
              ownPencilConflicts: d.ownPencilConflicts,
            });
            return;
          }
          if (st === 409 && d?.requiresForeignOverlapConfirmation) {
            setPendingForeignOverlapConfirmation({
              formData: data,
              foreignPencilConflicts: d.foreignPencilConflicts || [],
            });
            return;
          }
          if (st === 409 && d?.code === 'PENCIL_OVERLAP_CHANGED') {
            setPendingContentionConfirmation(null);
            setConflicts(d.conflicts || []);
            setSubmitError(d.error || bf.apiFallbacks.pencilOverlapChanged);
            return;
          }
          if (st === 409 && d?.code === 'ACTIVE_CONTENTION_LOCKED') {
            setPendingContentionConfirmation(null);
            setConflicts(null);
            setSubmitError(null);
            setActiveContentionNotice({
              deadlineAt: d.contentionDeadlineAt || null,
            });
            return;
          }
          if (st === 409 && d?.requiresContentionConfirmation) {
            setPendingContentionConfirmation({
              formData: data,
              conflicts: d.conflicts || [],
              deadlineAt: d.contentionDeadlineAt || null,
            });
            return;
          }
          throw axiosErr;
        }
      }

      const result = response.data;
      setPendingContentionConfirmation(null);
      setPendingConfirmation(null);
      setPendingForeignOverlapConfirmation(null);
      setActiveContentionNotice(null);

      const b = result.booking;
      const contentionSuccess =
        b?.bookingType === 'pencil' &&
        (b?.contentionRole === 'challenger' ||
          b?.contentionChallenger === true ||
          b?.status === 'contested');

      if (result.conflicts && result.conflicts.length > 0) {
        setConflicts(result.conflicts);
      } else {
        setConflicts(null);
      }

      setSubmitSuccess({
        message: result.message,
        booking: result.booking,
        isContested: contentionSuccess,
        cancelledPencilBookings: result.cancelledPencilBookings || [],
        overlappingPencils: result.overlappingPencils || [],
        confirmedForeignOverlap: confirmOverlapForeign,
        confirmedContention: confirmContention,
      });
    } catch (err) {
      console.error('Error creating booking:', err);
      const errorData = err.response?.data;

      if (err.response?.status === 409) {
        setConflicts(errorData?.conflicts || []);
        setSubmitError(errorData?.error || bf.apiFallbacks.genericConflict);
      } else {
        setSubmitError(errorData?.error || bf.apiFallbacks.genericCreateFailed);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const onSubmit = async (data) => {
    setPendingConfirmation(null);
    setPendingForeignOverlapConfirmation(null);
    setPendingContentionConfirmation(null);
    setActiveContentionNotice(null);
    await submitBooking(data, false, false);
  };

  const handleConfirmOverlap = async () => {
    if (!pendingConfirmation) return;
    setPendingConfirmation(null);
    await submitBooking(pendingConfirmation.formData, true, false, false);
  };

  const handleCancelOverlap = () => {
    setPendingConfirmation(null);
  };

  const handleConfirmForeignOverlap = async () => {
    if (!pendingForeignOverlapConfirmation) return;
    const { formData: fd } = pendingForeignOverlapConfirmation;
    setPendingForeignOverlapConfirmation(null);
    await submitBooking(fd, false, false, true);
  };

  const handleCancelForeignOverlap = () => {
    setPendingForeignOverlapConfirmation(null);
  };

  const handleConfirmContention = async () => {
    if (!pendingContentionConfirmation) return;
    const { formData: fd } = pendingContentionConfirmation;
    await submitBooking(fd, false, true, false);
  };

  const handleCancelContention = () => {
    setPendingContentionConfirmation(null);
    setSubmitError(null);
    setActiveContentionNotice(null);
  };

  if (loadingResources && !submitSuccess) {
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
            {bf.nav.backToCalendar()}
          </Button>
        </Link>
      </div>

      {/* Success message */}
      {submitSuccess && (
        <Card className="mb-6 border-up-forest-green/25 bg-secondary">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-up-forest-green mt-0.5 flex-shrink-0" />
              <div className="space-y-2">
                <p className="font-medium text-up-forest-green">{submitSuccess.message}</p>
                {submitSuccess.booking && (
                  <div className="text-sm text-up-forest-green space-y-1">
                    <p>
                      {bf.success.bookingIdLabel()} {getBookingReference(submitSuccess.booking)}
                    </p>
                    <p>
                      {bf.success.statusLabel()}{' '}
                      <span className="font-medium capitalize">
                        {submitSuccess.booking.status?.replace('_', ' ')}
                      </span>
                    </p>
                    <p>
                      {bf.success.typeLabel()}{' '}
                      <span className="font-medium capitalize">{submitSuccess.booking.bookingType}</span>
                    </p>
                  </div>
                )}
                {submitSuccess.isContested && !submitSuccess.confirmedContention && (
                  <div className="flex items-start gap-2 mt-2 p-2 bg-primary/10 border border-primary/25 rounded">
                    <AlertTriangle className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    <div className="text-sm text-primary space-y-2 min-w-0">
                      <p>{bf.success.contentionBody()}</p>
                      {conflicts && conflicts.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-primary">
                            {bf.success.contentionConflictsHeading()}
                          </p>
                          <ul className="list-disc pl-4 text-xs space-y-0.5 mt-1">
                            {conflicts.map((c) => (
                              <li key={c.id}>
                                #{c.id} — {formatBookingDateRange(c.startTime, c.endTime)}
                                {c.user?.email ? ` (${c.user.email})` : ''}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {submitSuccess.booking?.bookingType === 'firm' &&
                  !submitSuccess.confirmedForeignOverlap &&
                  submitSuccess.overlappingPencils?.length > 0 && (
                    <div className="flex items-start gap-2 mt-2 p-2 bg-accent border border-up-gold/30 rounded">
                      <Info className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                      <div className="text-sm text-accent-foreground space-y-2">
                        <p>{bf.success.firmBlockingIntro()}</p>
                        <ul className="list-disc pl-4 space-y-1 text-xs">
                          <li>{bf.success.firmBlockingIfApprovedLine()}</li>
                          <li>{bf.success.firmBlockingIfDeniedLine()}</li>
                        </ul>
                        <p className="font-medium pt-0.5">{bf.success.overlappingPencilsHeading()}</p>
                        <ul className="list-disc pl-4 space-y-0.5 text-xs">
                          {submitSuccess.overlappingPencils.map((c) => (
                            <li key={c.id}>
                              #{c.id} — {formatBookingDateRange(c.startTime, c.endTime)}
                              {c.user?.email ? ` (${c.user.email})` : ''}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}
                <div className="flex gap-3 mt-3">
                  {submitSuccess.fromConvertToFirm ? (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          clearConvertFirmSuccessSession();
                          setSubmitSuccess(null);
                          setConflicts(null);
                          navigate('/dashboard');
                        }}
                      >
                        {bf.success.backToMyBookings()}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          clearConvertFirmSuccessSession();
                          navigate('/calendar');
                        }}
                      >
                        {bf.success.viewCalendar()}
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          clearConvertFirmSuccessSession();
                          navigate('/calendar');
                        }}
                      >
                        {bf.success.viewCalendar()}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        type="button"
                        onClick={() => {
                          clearConvertFirmSuccessSession();
                          setSubmitSuccess(null);
                          setConflicts(null);
                          setSubmitError(null);
                          setPendingConfirmation(null);
                          setPendingContentionConfirmation(null);
                          setDocFile(null);
                          setExistingDocUrl('');
                          setDocError(null);
                          form.reset({
                            resourceType: '',
                            resourceId: '',
                            bookingType: 'pencil',
                            startTime: '',
                            endTime: '',
                            purpose: '',
                          });
                          navigate('/bookings/new', { replace: true });
                        }}
                      >
                        {bf.success.createAnother()}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pencil overlap confirmation dialog */}
      {pendingConfirmation && (
        <Card className="mb-6 border-primary/25 bg-primary/10">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
              <div className="space-y-3">
                <p className="font-medium text-primary">{bf.confirmOwnPencilOverlap.title()}</p>
                <p className="text-sm text-primary/90">{bf.confirmOwnPencilOverlap.subtitle()}</p>
                <div className="space-y-1">
                  {pendingConfirmation.ownPencilConflicts.map((c) => (
                    <div key={c.id} className="text-sm bg-card/70 border border-primary/20 rounded px-3 py-2">
                      <p className="font-medium">
                        {bf.confirmOwnPencilOverlap.pencilCardTitle({ id: getBookingReference(c) })}
                      </p>
                      <p className="text-xs text-primary/90">
                        Status: {formatStatusLabel(c.status)}
                        {c.status === 'on_hold' ? ' (currently on hold)' : ''}
                      </p>
                      <p className="text-xs text-primary/80">
                        {formatBookingDateRange(c.startTime, c.endTime)}
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
                    {isSubmitting ? bf.confirmOwnPencilOverlap.confirmLoading : bf.confirmOwnPencilOverlap.confirm}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleCancelOverlap}
                    disabled={isSubmitting}
                  >
                    {bf.confirmOwnPencilOverlap.goBack}
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {pendingForeignOverlapConfirmation && (
        <Card className="mb-6 border-up-gold/30 bg-accent">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
              <div className="space-y-3">
                <p className="font-medium text-accent-foreground">{bf.confirmForeignPencilOverlap.title()}</p>
                <p className="text-sm text-accent-foreground/90">{bf.confirmForeignPencilOverlap.subtitle()}</p>
                <div className="space-y-1">
                  {pendingForeignOverlapConfirmation.foreignPencilConflicts.map((c) => (
                    <div
                      key={c.id}
                      className="text-sm bg-card/70 border border-up-gold/30 rounded px-3 py-2"
                    >
                      <p className="font-medium">
                        {bf.confirmForeignPencilOverlap.pencilCardTitle({ id: getBookingReference(c) })}
                      </p>
                      <p className="text-xs text-accent-foreground/80">Status: {formatStatusLabel(c.status)}</p>
                      <p className="text-xs text-accent-foreground/80">{c.user?.email || 'Unknown user'}</p>
                      <p className="text-xs text-accent-foreground/70">
                        {formatBookingDateRange(c.startTime, c.endTime)}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="flex gap-3 pt-1">
                  <Button size="sm" onClick={handleConfirmForeignOverlap} disabled={isSubmitting}>
                    {isSubmitting
                      ? bf.confirmForeignPencilOverlap.confirmLoading
                      : bf.confirmForeignPencilOverlap.confirm}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleCancelForeignOverlap}
                    disabled={isSubmitting}
                  >
                    {bf.confirmForeignPencilOverlap.goBack}
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {pendingContentionConfirmation && (
        <Card className="mb-6 border-up-gold/30 bg-accent">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
              <div className="space-y-3">
                {submitError && (
                  <div className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {submitError}
                  </div>
                )}
                <p className="font-medium text-accent-foreground">{bf.confirmContention.title()}</p>
                <p className="text-sm text-accent-foreground/90">{bf.confirmContention.subtitle()}</p>
                {pendingContentionConfirmation.deadlineAt && (
                  <p className="text-sm text-accent-foreground">
                    {bf.confirmContention.deadlineLine({
                      formattedDeadline: formatDeadlineForNotice(pendingContentionConfirmation.deadlineAt),
                    })}
                  </p>
                )}
                <div className="space-y-1">
                  {pendingContentionConfirmation.conflicts.map((c) => (
                    <div
                      key={c.id}
                      className="text-sm bg-card/70 rounded px-3 py-2 border border-up-gold/30"
                    >
                    <p className="font-medium">
                      {bf.confirmContention.conflictCardTitle({ id: getBookingReference(c) })}
                    </p>
                      <p className="text-xs text-accent-foreground/90">
                        {formatBookingDateRange(c.startTime, c.endTime)}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="flex gap-3 pt-1">
                  <Button size="sm" onClick={handleConfirmContention} disabled={isSubmitting}>
                    {isSubmitting ? bf.confirmContention.confirmLoading : bf.confirmContention.confirm}
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleCancelContention} disabled={isSubmitting}>
                    {bf.confirmContention.goBack}
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {!submitSuccess &&
        !pendingConfirmation &&
        !pendingForeignOverlapConfirmation &&
        !pendingContentionConfirmation && (
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="text-2xl">{bf.formCard.title()}</CardTitle>
                <p className="text-muted-foreground">{bf.formCard.subtitle()}</p>
              </div>
              <Link
                to="/guidelines"
                className="text-sm font-medium text-primary underline underline-offset-4 hover:text-primary/80"
              >
                Review guidelines
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                {/* Error display */}
                {activeContentionNotice && (
                  <div className="bg-accent border border-up-gold/30 text-accent-foreground px-4 py-3 rounded-md text-sm">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0 text-primary" />
                      <div className="space-y-1.5">
                        <p className="font-semibold">{bf.activeContentionUnavailable.title()}</p>
                        <p>{bf.activeContentionUnavailable.body()}</p>
                        <p>
                          {bf.activeContentionUnavailable.recommendation({
                            formattedDeadline: formatDeadlineForNotice(activeContentionNotice.deadlineAt),
                          })}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {submitError && (
                  <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-md text-sm">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                      <div>
                        <p>{submitError}</p>
                        {conflicts && conflicts.length > 0 && (
                          <div className="mt-2 space-y-1">
                            <p className="font-medium">{bf.formCard.conflictingBookingsHeading()}</p>
                            {conflicts.map((c) => (
                              <p key={c.id} className="text-xs">
                                {bf.formCard.conflictLine({
                                  id: getBookingReference(c),
                                  resourceName: selectedResourceName,
                                  typeLabel: formatBookingTypeLabel(c.bookingType),
                                  statusLabel: formatStatusLabel(c.status),
                                  range: formatBookingDateRange(c.startTime, c.endTime),
                                })}
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
                      <FormLabel>{bf.fields.resourceType()}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value} disabled={isRebookMode}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={bf.fields.resourceTypePlaceholder} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="equipment">{bf.fields.equipment()}</SelectItem>
                          <SelectItem value="room">{bf.fields.room()}</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                      {isRebookMode && (
                        <p className="text-xs text-muted-foreground">{bf.fields.rebookLockResourceType()}</p>
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
                        {watchedResourceType === 'room' ? bf.fields.room() : bf.fields.equipment()}
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
                                  ? watchedResourceType === 'room'
                                    ? bf.fields.selectRoom
                                    : bf.fields.selectEquipment
                                  : bf.fields.selectRoomFirst
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
                        <p className="text-xs text-muted-foreground">{bf.fields.rebookLockResource()}</p>
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
                      <FormLabel>{bf.fields.bookingType()}</FormLabel>
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
                          <p className="font-medium">{bf.fields.pencilTitle()}</p>
                          <p className="text-xs text-muted-foreground mt-1">{bf.fields.pencilBlurb()}</p>
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
                          <p className="font-medium">{bf.fields.firmTitle()}</p>
                          <p className="text-xs text-muted-foreground mt-1">{bf.fields.firmBlurb()}</p>
                        </button>
                      </div>
                      {field.value === 'firm' && (
                        <div className="mt-2 rounded-md border border-up-forest-green/20 bg-secondary p-3">
                          <div className="flex items-start gap-2.5">
                            <Info className="mt-0.5 h-4 w-4 shrink-0 text-up-forest-green" aria-hidden />
                            <div className="min-w-0 flex-1 space-y-2 text-sm text-up-forest-green">
                              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                                <p className="min-w-0 flex-1 text-up-forest-green">{bf.fields.firmOverlapCallout()}</p>
                                <button
                                  type="button"
                                  id="firm-pencil-overlap-details-trigger"
                                  className="shrink-0 text-xs font-medium text-up-forest-green/90 underline decoration-up-forest-green/40 underline-offset-2 transition-colors hover:text-up-forest-green hover:decoration-up-forest-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm"
                                  aria-expanded={firmPencilOverlapDetailsOpen}
                                  aria-controls="firm-pencil-overlap-details"
                                  onClick={() =>
                                    setFirmPencilOverlapDetailsOpen((open) => !open)
                                  }
                                >
                                  {firmPencilOverlapDetailsOpen
                                    ? bf.fields.firmOverlapHideDetails()
                                    : bf.fields.firmOverlapShowDetails()}
                                </button>
                              </div>
                              {firmPencilOverlapDetailsOpen && (
                                <div
                                  id="firm-pencil-overlap-details"
                                  className="rounded-md border border-up-forest-green/15 bg-card/70 px-3 py-2.5"
                                  role="region"
                                  aria-labelledby="firm-pencil-overlap-details-trigger"
                                >
                                  <p className="text-xs font-semibold uppercase tracking-wide text-up-forest-green">
                                    {bf.fields.firmOverlapSectionTitle()}
                                  </p>
                                  <dl className="mt-2 space-y-2.5">
                                    <div>
                                      <dt className="font-medium text-up-forest-green">
                                        {bf.fields.firmOverlapOwnPencilsDt()}
                                      </dt>
                                      <dd className="mt-0.5 text-up-forest-green/90">
                                        {bf.fields.firmOverlapOwnPencilsDd()}
                                      </dd>
                                    </div>
                                    <div>
                                      <dt className="font-medium text-up-forest-green">
                                        {bf.fields.firmOverlapOtherPencilsDt()}
                                      </dt>
                                      <dd className="mt-0.5 text-up-forest-green/90">
                                        {bf.fields.firmOverlapOtherPencilsDd()}
                                      </dd>
                                    </div>
                                  </dl>
                                </div>
                              )}
                            </div>
                          </div>
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
                        <FormLabel>{bf.fields.startTime()}</FormLabel>
                        <FormControl>
                          <Input type="datetime-local" max={maxStartTimeLocal} {...field} />
                        </FormControl>
                        <p className="text-xs text-muted-foreground">
                          {bf.fields.startTimeWindowHelp()}
                        </p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="endTime"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{bf.fields.endTime()}</FormLabel>
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
                      <FormLabel>{bf.fields.purposeOptional()}</FormLabel>
                      <FormControl>
                        <textarea
                          placeholder={bf.fields.purposePlaceholder}
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
                    {watchedBookingType === 'firm' ? bf.fields.authLabelFirm() : bf.fields.authLabelOptional()}
                  </label>
                  <p className="text-xs text-muted-foreground">
                    {watchedBookingType === 'firm' ? bf.fields.authHelpFirm() : bf.fields.authHelpPencil()}
                  </p>

                  {!docFile ? (
                    existingDocUrl ? (
                      <div className="space-y-2 p-3 border rounded-lg bg-muted/30">
                        <p className="text-sm text-muted-foreground">{bf.fields.authRebookNote()}</p>
                        <div className="flex items-center justify-between gap-2">
                          <AuthorizationDocButton url={existingDocUrl} />
                          <label className="cursor-pointer">
                            <Button type="button" variant="outline" size="sm" asChild>
                              <span>{bf.fields.replaceFile()}</span>
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
                        <p className="text-sm text-muted-foreground mb-2">{bf.fields.dropzoneTypes()}</p>
                        <label className="cursor-pointer">
                          <Button type="button" variant="outline" size="sm" asChild>
                            <span>{bf.fields.chooseFile()}</span>
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
                    <p className="text-sm text-destructive">{docError}</p>
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
                    {bf.submit.cancel()}
                  </Button>
                  <Button type="submit" disabled={isSubmitting} className="flex-1">
                    {isSubmitting ? bf.submit.creating() : bf.submit.create()}
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
