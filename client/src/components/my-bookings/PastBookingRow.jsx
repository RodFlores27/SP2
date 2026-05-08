import { useState } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { formatBookingDateRange } from '@/lib/formatBookingDateRange';
import { getBookingReference } from '@/lib/bookingReference';
import { AlertTriangle, CalendarDays, ChevronDown, ChevronUp } from 'lucide-react';
import { BookingStatusBadge } from '@/components/BookingStatusBadge';
import { AuthorizationDocButton } from './AuthorizationDocButton';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

function getPreviousAttempts(booking) {
  if (!booking?.threadBookings?.length) return [];
  return booking.threadBookings
    .filter((attempt) => attempt.id !== booking.id)
    .filter((attempt) => {
      if (!attempt.createdAt || !booking.createdAt) return true;
      return new Date(attempt.createdAt) < new Date(booking.createdAt);
    })
    .sort((a, b) => {
      const aTime = new Date(a.historyEvent?.occurredAt || a.updatedAt || a.createdAt).getTime();
      const bTime = new Date(b.historyEvent?.occurredAt || b.updatedAt || b.createdAt).getTime();
      return bTime - aTime;
    });
}

function formatHistoryStatus(status) {
  return String(status || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function getHistoryRemark(attempt) {
  const status = String(attempt?.status || '').toLowerCase();
  if (status === 'cancelled') return attempt?.cancellationReason || '';
  if (status === 'denied') return attempt?.staffRemark || '';
  if (status === 'expired') return 'Expired';
  if (status === 'displaced') return 'Displaced';
  return attempt?.staffRemark || attempt?.cancellationReason || '';
}

export function PastBookingRow({ booking, resourceName, rebookTo }) {
  const equipmentRequestTypeLabel =
    booking.resourceType === 'equipment'
      ? booking.equipmentRequestType === 'loan'
        ? 'Loan'
        : 'In-house'
      : null;
  const canRebook = booking.canRebook === true;
  const rebookBlockedByActiveFirm = booking.status === 'displaced' && !canRebook;
  const previousAttempts = getPreviousAttempts(booking);
  const [showDetails, setShowDetails] = useState(false);

  return (
    <Card className="opacity-80 hover:opacity-100 transition-opacity">
      <CardContent className="pt-4 pb-4">
        <div className="space-y-3">
          {rebookBlockedByActiveFirm && (
            <div className="rounded-md border border-up-gold/30 bg-accent px-3 py-2 text-xs text-accent-foreground">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-primary" />
                <p>
                  You can’t rebook this displaced slot yet. Try again after the replacing firm booking is cancelled or denied.
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 md:grid-cols-[1.2fr_1fr_auto] md:items-start">
            <div className="space-y-1 min-w-0">
              <p className="font-medium truncate">{resourceName}</p>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-sm">{getBookingReference(booking)}</span>
                <span className="text-xs text-muted-foreground capitalize">{booking.resourceType}</span>
                {equipmentRequestTypeLabel && (
                  <span className="inline-flex items-center rounded-full border border-primary/20 bg-primary/5 px-2 py-0.5 text-[11px] font-medium text-primary">
                    {equipmentRequestTypeLabel}
                  </span>
                )}
              </div>
            </div>

            <div className="space-y-1 min-w-0">
              <div className="text-sm text-muted-foreground flex items-center gap-1">
                <CalendarDays className="h-3.5 w-3.5 flex-shrink-0" />
                <span>{formatBookingDateRange(booking.startTime, booking.endTime)}</span>
              </div>
              <BookingStatusBadge status={booking.status} bookingType={booking.bookingType} />
            </div>

            <div className="flex flex-row md:flex-col gap-2 md:items-end">
              {canRebook && rebookTo && (
                <Link to={rebookTo} aria-label="Rebook from this booking">
                  <Button size="sm" variant="outline">Rebook</Button>
                </Link>
              )}
              {rebookBlockedByActiveFirm && (
                <Button size="sm" variant="outline" disabled>
                  Rebook
                </Button>
              )}
            </div>
          </div>

          <div className="rounded-md border border-border bg-muted/20">
            <button
              type="button"
              onClick={() => setShowDetails((prev) => !prev)}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-medium"
              aria-expanded={showDetails}
            >
              <span>{showDetails ? 'Hide Details' : 'View Details'}</span>
              {showDetails ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </button>

            {showDetails && (
              <div className="border-t border-border px-3 py-3 space-y-3 text-sm">
                {booking.purpose && (
                  <div>
                    <p className="font-medium text-foreground">Purpose</p>
                    <p className="text-muted-foreground whitespace-pre-wrap break-words">{booking.purpose}</p>
                    {booking.staffRemark && (
                      <p className="mt-1.5">
                        <span className="font-medium">Staff remark:</span>{' '}
                        <span className="text-muted-foreground">{booking.staffRemark}</span>
                      </p>
                    )}
                  </div>
                )}

                {(booking.resourceType === 'room' ||
                  (booking.resourceType === 'equipment' && booking.equipmentRequestType === 'loan')) && (
                  <div className="space-y-2">
                    <p className="font-medium text-foreground">
                      {booking.resourceType === 'room' ? 'Room request details:' : 'Loan request details:'}
                    </p>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {booking.resourceType === 'equipment' && booking.equipmentRequestType === 'loan' && (
                        <>
                          <div className="space-y-1 min-w-0">
                            <p className="text-[11px] font-semibold tracking-wide uppercase text-muted-foreground">Reason</p>
                            <p className="break-words text-foreground">{booking.loanReason || '—'}</p>
                          </div>
                          <div className="space-y-1 min-w-0">
                            <p className="text-[11px] font-semibold tracking-wide uppercase text-muted-foreground">Workflow Note</p>
                            <p className="break-words text-foreground">{booking.loanWorkflowNote || '—'}</p>
                          </div>
                          <div className="space-y-1 min-w-0">
                            <p className="text-[11px] font-semibold tracking-wide uppercase text-muted-foreground">Transport Plan</p>
                            <p className="break-words text-foreground">{booking.loanTransportPlan || '—'}</p>
                          </div>
                        </>
                      )}
                      {booking.resourceType === 'room' && (
                        <>
                          <div className="space-y-1 min-w-0">
                            <p className="text-[11px] font-semibold tracking-wide uppercase text-muted-foreground">Expected Participants</p>
                            <p className="break-words text-foreground">{booking.roomParticipantCount ?? '—'}</p>
                          </div>
                          <div className="space-y-1 min-w-0">
                            <p className="text-[11px] font-semibold tracking-wide uppercase text-muted-foreground">Event Equipment Needs</p>
                            <p className="break-words text-foreground">{booking.roomEquipmentNeeds || '—'}</p>
                          </div>
                          <div className="space-y-1 min-w-0">
                            <p className="text-[11px] font-semibold tracking-wide uppercase text-muted-foreground">Setup & Catering</p>
                            <p className="break-words text-foreground">{booking.roomSetupRequirements || '—'}</p>
                          </div>
                          <div className="space-y-1 min-w-0 sm:col-span-2 lg:col-span-3">
                            <p className="text-[11px] font-semibold tracking-wide uppercase text-muted-foreground">Program / Event Details</p>
                            <p className="break-words text-foreground">{booking.roomProgramDetails || '—'}</p>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {previousAttempts.length > 0 && (
                  <div className="space-y-2 rounded-md border border-border bg-muted/40 px-3 py-3">
                    <p className="font-medium text-foreground">History ({previousAttempts.length})</p>
                    <div className={previousAttempts.length > 2 ? 'max-h-[9rem] overflow-y-auto pr-1' : ''}>
                      <div className="relative space-y-4">
                        {previousAttempts.map((attempt, index) => (
                          <div
                            key={attempt.id}
                            className={`relative ${index === 0 ? 'opacity-100' : index === 1 ? 'opacity-[0.85]' : 'opacity-[0.7]'}`}
                          >
                            <div className={`absolute left-3 top-0 bottom-0 w-px ${index === 0 ? 'bg-border/70' : index === 1 ? 'bg-border/55' : 'bg-border/40'}`} />
                            <div className="grid grid-cols-[9.5rem_1fr] gap-3 pl-0">
                              <div className="pt-0.5 text-xs text-muted-foreground whitespace-nowrap">
                                {format(new Date(attempt.historyEvent?.occurredAt || attempt.updatedAt || attempt.createdAt), 'MMM d, yyyy h:mm a')}
                              </div>
                              <div className="relative min-w-0 pb-0.5">
                                <span className={`absolute -left-[1.95rem] top-[0.35rem] h-2.5 w-2.5 rounded-full border ${index === 0 ? 'border-primary/70 bg-primary ring-2 ring-primary/25' : 'border-border bg-muted-foreground/70'}`} />
                                <p className="text-sm break-words">
                                  <span className="font-semibold">{formatHistoryStatus(attempt.status)}</span>
                                  {' — '}
                                  <span className="font-medium text-foreground">{getBookingReference(attempt)}</span>
                                </p>
                                {!!getHistoryRemark(attempt) && (
                                  <p className="mt-1 text-sm italic text-muted-foreground break-words">
                                    Remark: {getHistoryRemark(attempt)}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {(booking.cancellationReason || booking.probableRebookDate) && (
                  <div className="space-y-1.5">
                    {booking.cancellationReason && (
                      <p>
                        <span className="font-medium">Cancellation reason:</span>{' '}
                        <span className="text-muted-foreground">{booking.cancellationReason}</span>
                      </p>
                    )}
                    {booking.probableRebookDate && (
                      <p>
                        <span className="font-medium">Probable rebook date:</span>{' '}
                        <span className="text-muted-foreground">
                          {format(new Date(booking.probableRebookDate), 'MMM d, yyyy h:mm a')}
                        </span>
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <AuthorizationDocButton url={booking.authorizationDocUrl} />
        </div>
      </CardContent>
    </Card>
  );
}

