import { format } from 'date-fns';
import { CalendarDays } from 'lucide-react';
import { BookingStatusBadge } from '@/components/BookingStatusBadge';
import { AuthorizationDocButton } from './AuthorizationDocButton';

/**
 * Compact read-only row for past (cancelled / denied / expired) bookings.
 * Intentionally much lighter than ActiveBookingCard — no action buttons or convert panel.
 */
export function PastBookingRow({ booking, resourceName }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-2 py-3 px-4 rounded-lg border border-border bg-card opacity-70 hover:opacity-90 transition-opacity">
      <div className="space-y-1 min-w-0 flex-1">
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

        <AuthorizationDocButton url={booking.authorizationDocUrl} />
      </div>
    </div>
  );
}
