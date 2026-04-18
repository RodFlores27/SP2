import { useState } from 'react';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';
import { AlertTriangle, CalendarDays } from 'lucide-react';
import { BookingStatusBadge } from '@/components/BookingStatusBadge';
import { AuthorizationDocButton } from './AuthorizationDocButton';
import { Button } from '@/components/ui/button';

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

/**
 * Compact read-only row for past (cancelled / denied / expired / displaced) bookings.
 * Intentionally much lighter than ActiveBookingCard — no action buttons or convert panel.
 */
export function PastBookingRow({ booking, resourceName, rebookTo }) {
  const isPastTerminal = ['cancelled', 'denied', 'expired', 'displaced'].includes(booking.status);
  const canRebook = booking.canRebook === true;
  const rebookBlockedByActiveFirm =
    booking.status === 'displaced' && !canRebook;
  const previousAttempts = getPreviousAttempts(booking);
  const hasActionRow =
    Boolean(booking.authorizationDocUrl) ||
    (isPastTerminal && (canRebook || rebookBlockedByActiveFirm));
  const [showPreviousAttempts, setShowPreviousAttempts] = useState(false);

  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-2 py-3 px-4 rounded-lg border border-border bg-card opacity-70 hover:opacity-90 transition-opacity">
      <div className="space-y-1 min-w-0 flex-1">
        {rebookBlockedByActiveFirm && (
          <div className="mb-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-700" />
              <p>
                You can’t rebook this displaced slot yet — the firm booking that replaced it is still pending
                or approved. Try again after that booking is cancelled or denied.
              </p>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-xs text-muted-foreground">#{booking.id}</span>
          <span className="font-medium text-sm truncate">{resourceName}</span>
          <span className="text-xs text-muted-foreground capitalize">{booking.resourceType}</span>
        </div>

        <BookingStatusBadge status={booking.status} bookingType={booking.bookingType} />

        <div className="text-xs text-muted-foreground flex items-center gap-1">
          <CalendarDays className="h-3 w-3 flex-shrink-0" />
          <span>
            {format(new Date(booking.startTime), 'MMM d, yyyy h:mm a')} &mdash;{' '}
            {format(new Date(booking.endTime), 'h:mm a')}
          </span>
        </div>

        {booking.purpose && (
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Purpose:</span> {booking.purpose}
          </p>
        )}

        {booking.staffRemark && (
          <p className="text-xs">
            <span className="font-medium">Staff remark:</span>{' '}
            <span className="text-muted-foreground">{booking.staffRemark}</span>
          </p>
        )}

        {previousAttempts.length > 0 && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs">
            <button
              type="button"
              onClick={() => setShowPreviousAttempts((prev) => !prev)}
              className="flex w-full items-center justify-between gap-2 text-left"
            >
              <span className="font-medium text-amber-900">
                Previous attempts ({previousAttempts.length})
              </span>
              <span className="text-[11px] text-amber-700">
                {showPreviousAttempts ? 'Hide' : 'Show'}
              </span>
            </button>
            {showPreviousAttempts && (
              <div className="mt-1.5 space-y-1.5">
                {previousAttempts.map((attempt) => (
                  <div key={attempt.id}>
                    <p className="font-medium text-amber-900">
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

        {hasActionRow && (
          <div className="mt-2 pt-2 border-t border-border flex items-center justify-between gap-2">
            <div className="min-w-0">
              <AuthorizationDocButton url={booking.authorizationDocUrl} />
            </div>
            {canRebook && rebookTo && (
              <Link to={rebookTo} aria-label="Rebook from this booking">
                <Button size="sm" variant="outline" className="gap-1">
                  <span className="text-base leading-none" aria-hidden>
                    ↺
                  </span>
                  Rebook
                </Button>
              </Link>
            )}
            {rebookBlockedByActiveFirm && (
              <Button size="sm" variant="outline" className="gap-1" disabled>
                <span className="text-base leading-none" aria-hidden>
                  ↺
                </span>
                Rebook
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
