import { useState } from 'react';
import { format } from 'date-fns';
import { AlertTriangle, CalendarDays, FileText, X, ChevronDown, ChevronUp, Upload } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BookingStatusBadge } from '@/components/BookingStatusBadge';
import { AuthorizationDocButton } from './AuthorizationDocButton';
import { formatBookingTypeLabel, formatStatusLabel, isCancellable, isConvertible } from './bookingDashboardUtils';

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

export function ActiveBookingCard({
  booking,
  resourceName,
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
}) {
  const isConvertOpen = convertOpenId === booking.id;
  const canCancel = onCancel && isCancellable(booking);
  const canConvert = onOpenConvert && isConvertible(booking);
  const previousAttempts = getPreviousAttempts(booking);
  const [showPreviousAttempts, setShowPreviousAttempts] = useState(false);

  return (
    <Card>
      <CardContent className="pt-4 pb-4">
        {booking.status === 'contested' && (
          <div className="mb-3 flex items-start gap-2 bg-orange-50 border border-orange-200 text-orange-800 px-3 py-2 rounded-md text-sm">
            <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0 text-orange-600" />
            <span>
              This pencil booking is <strong>contested</strong>. Another user is challenging your slot.
              Convert to a firm booking before the deadline to keep it.
            </span>
          </div>
        )}
        {booking.status === 'queued' && (
          <div className="mb-3 flex items-start gap-2 bg-violet-50 border border-violet-200 text-violet-900 px-3 py-2 rounded-md text-sm">
            <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0 text-violet-600" />
            <span>
              Your booking is <strong>queued</strong> behind an earlier contention. You will be notified
              when your turn starts.
            </span>
          </div>
        )}

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

            {previousAttempts.length > 0 && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
                <button
                  type="button"
                  onClick={() => setShowPreviousAttempts((prev) => !prev)}
                  className="flex w-full items-center justify-between gap-2 text-left"
                >
                  <span className="font-medium text-amber-900">
                    Previous attempts ({previousAttempts.length})
                  </span>
                  <span className="text-xs text-amber-700">
                    {showPreviousAttempts ? 'Hide' : 'Show'}
                  </span>
                </button>
                {showPreviousAttempts && (
                  <div className="mt-2 space-y-2">
                    {previousAttempts.map((attempt) => (
                      <div key={attempt.id}>
                        <p className="font-medium text-amber-900">
                          Booking #{attempt.id} ({formatStatusLabel(attempt.status)})
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

            {booking.expiryAt && ['penciled', 'contested', 'queued'].includes(booking.status) && (
              <p className="text-xs text-muted-foreground">
                Expires: {format(new Date(booking.expiryAt), 'MMM d, yyyy h:mm a')}
              </p>
            )}

            <AuthorizationDocButton url={booking.authorizationDocUrl} />
          </div>

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
              <Button size="sm" variant="destructive" onClick={() => onCancel(booking.id)}>
                Cancel
              </Button>
            )}
          </div>
        </div>

        {isConvertOpen && (
          <div className="mt-4 border-t pt-4 space-y-3">
            <p className="text-sm font-medium">Convert to Firm Booking</p>
            <p className="text-xs text-muted-foreground">
              An authorization document is required. Once converted, the booking will be submitted
              for staff approval.
            </p>

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
                            #{c.id} {resourceName} &mdash; {formatBookingTypeLabel(c.bookingType)} (
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
