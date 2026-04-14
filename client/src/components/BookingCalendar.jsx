import { useState, useEffect, useCallback, useRef } from 'react';
import { Calendar, dateFnsLocalizer } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay, startOfMonth, endOfMonth, addMonths, isToday } from 'date-fns';
import { enUS } from 'date-fns/locale';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import '@/components/BookingCalendar.rbc.css';
import { suppressNativeEventTooltip } from '@/components/bookingCalendarUtils';
import { useBookingCalendarSideEffects } from '@/components/useBookingCalendarSideEffects';

const locales = { 'en-US': enUS };

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
});

const STATUS_STYLES = {
  approved: {
    backgroundColor: '#22c55e',
    borderColor: '#16a34a',
    color: '#fff',
  },
  pending_approval: {
    backgroundColor: '#eab308',
    borderColor: '#ca8a04',
    color: '#000',
    borderStyle: 'dashed',
  },
  penciled: {
    backgroundColor: '#d1d5db',
    borderColor: '#9ca3af',
    color: '#374151',
  },
  contested: {
    backgroundColor: '#fb923c',
    borderColor: '#ea580c',
    color: '#fff',
  },
};

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

function recordsById(list) {
  return list.reduce((acc, item) => {
    acc[item.id] = item;
    return acc;
  }, {});
}

/** Wraps events so we can resolve booking id via elementsFromPoint (month uses pointer-events: none on pills). */
function BookingEventShellWrapper({ children, event }) {
  if (event == null) {
    return children;
  }
  const id = event.id;
  return (
    <div
      className="rbc-ptcf-event-shell"
      {...(id != null ? { 'data-booking-id': String(id) } : {})}
    >
      {children}
    </div>
  );
}

function MonthDateHeader({ date, label }) {
  if (!isToday(date)) {
    return <span>{label}</span>;
  }
  return (
    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-primary text-primary-foreground font-semibold">
      {label}
    </span>
  );
}

export function BookingCalendar({
  resourceType = null,
  resourceId = null,
  height = 500,
  onSelectEvent = null,
  onSelectSlot = null,
  ariaDescribedBy = null,
}) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [currentView, setCurrentView] = useState('month');
  const calendarHostRef = useRef(null);

  const {
    monthBookingTooltip,
    suppressNextSlotSelectRef,
    suppressSlotSelectResetTimeoutRef,
    handleShowMore,
  } = useBookingCalendarSideEffects({
    calendarHostRef,
    currentView,
    events,
    height,
    onSelectSlot,
    onSelectEvent,
  });

  const fetchBookings = useCallback(async (date) => {
    setLoading(true);
    setError(null);

    try {
      const start = startOfMonth(addMonths(date, -1));
      const end = endOfMonth(addMonths(date, 1));

      const params = new URLSearchParams();
      params.append('startDate', start.toISOString());
      params.append('endDate', end.toISOString());

      if (resourceType) {
        params.append('resourceType', resourceType);
      }
      if (resourceId) {
        params.append('resourceId', resourceId.toString());
      }

      const response = await fetch(`${BASE_URL}/bookings/availability?${params}`);

      if (!response.ok) {
        throw new Error('Failed to fetch availability');
      }

      const bookings = await response.json();

      const shouldLoadEquipment = !resourceType || resourceType === 'equipment';
      const shouldLoadRooms = !resourceType || resourceType === 'room';

      let equipmentMap = {};
      let roomMap = {};

      if (shouldLoadEquipment) {
        const equipmentResponse = await fetch(`${BASE_URL}/equipment`);
        if (equipmentResponse.ok) {
          equipmentMap = recordsById(await equipmentResponse.json());
        }
      }

      if (shouldLoadRooms) {
        const roomsResponse = await fetch(`${BASE_URL}/rooms`);
        if (roomsResponse.ok) {
          roomMap = recordsById(await roomsResponse.json());
        }
      }

      const calendarEvents = bookings.map((booking) => {
        const resourceData =
          booking.resourceType === 'equipment'
            ? equipmentMap[booking.resourceId]
            : roomMap[booking.resourceId];
        const resourceName =
          resourceData?.name || `${booking.resourceType} #${booking.resourceId}`;
        const resourceStatus = resourceData?.status || 'unknown';

        const startTime = format(new Date(booking.startTime), 'hh:mm a');
        const endTime = format(new Date(booking.endTime), 'hh:mm a');
        const title = `${startTime} - ${endTime} [${resourceName}]`;

        return {
          id: booking.id,
          title,
          start: new Date(booking.startTime),
          end: new Date(booking.endTime),
          resource: {
            ...booking,
            resourceName,
            resourceStatus,
          },
        };
      });

      setEvents(calendarEvents);
    } catch (err) {
      console.error('Error fetching bookings:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [resourceType, resourceId]);

  useEffect(() => {
    fetchBookings(currentDate);
  }, [fetchBookings, currentDate]);

  const handleNavigate = (date) => {
    setCurrentDate(date);
  };

  const handleViewChange = (view) => {
    setCurrentView(view);
  };

  const eventStyleGetter = (event) => {
    const status = event.resource?.status || 'penciled';
    const styles = STATUS_STYLES[status] || STATUS_STYLES.penciled;

    return {
      style: {
        backgroundColor: styles.backgroundColor,
        borderColor: styles.borderColor,
        borderWidth: '2px',
        borderStyle: styles.borderStyle || 'solid',
        color: styles.color,
        borderRadius: '4px',
        opacity: status === 'penciled' || status === 'contested' ? 0.7 : 1,
      },
    };
  };

  const handleSelectEvent = (event) => {
    if (onSelectEvent) {
      onSelectEvent(event.resource);
    }
  };

  const handleSelectSlot = (slotInfo) => {
    if (!onSelectSlot) return;
    if (suppressNextSlotSelectRef.current) {
      suppressNextSlotSelectRef.current = false;
      if (suppressSlotSelectResetTimeoutRef.current != null) {
        clearTimeout(suppressSlotSelectResetTimeoutRef.current);
        suppressSlotSelectResetTimeoutRef.current = null;
      }
      return;
    }
    onSelectSlot(slotInfo);
  };

  if (error) {
    return (
      <div className="flex items-center justify-center p-8 text-red-500">
        <p>Error loading calendar: {error}</p>
      </div>
    );
  }

  return (
    <div className="relative">
      {loading && (
        <div className="absolute inset-0 bg-white/50 flex items-center justify-center z-10">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-4 text-sm">
        <div className="flex items-center gap-2">
          <span className="w-4 h-4 rounded" style={{ backgroundColor: '#22c55e' }}></span>
          <span>Approved</span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="w-4 h-4 rounded border-2 border-dashed"
            style={{ backgroundColor: '#eab308', borderColor: '#ca8a04' }}
          ></span>
          <span>Pending Approval</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-4 h-4 rounded opacity-70" style={{ backgroundColor: '#d1d5db' }}></span>
          <span>Penciled</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-4 h-4 rounded opacity-70" style={{ backgroundColor: '#fb923c' }}></span>
          <span>Contested</span>
        </div>
      </div>

      <div
        ref={calendarHostRef}
        data-selectable={onSelectSlot ? 'true' : undefined}
        aria-describedby={ariaDescribedBy || undefined}
      >
        {monthBookingTooltip && (
          <div
            role="tooltip"
            className="pointer-events-none fixed z-[100] max-w-sm rounded-md border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md whitespace-pre-line"
            style={{
              left: Math.min(
                monthBookingTooltip.x + 14,
                typeof window !== 'undefined' ? window.innerWidth - 280 : monthBookingTooltip.x
              ),
              top: monthBookingTooltip.y + 14,
            }}
          >
            {monthBookingTooltip.text}
          </div>
        )}
        <Calendar
          localizer={localizer}
          events={events}
          date={currentDate}
          view={currentView}
          startAccessor="start"
          endAccessor="end"
          style={{ height }}
          eventPropGetter={eventStyleGetter}
          onNavigate={handleNavigate}
          onView={handleViewChange}
          onSelectEvent={handleSelectEvent}
          onSelectSlot={handleSelectSlot}
          onShowMore={handleShowMore}
          selectable={!!onSelectSlot}
          views={['month', 'week', 'day', 'agenda']}
          components={{
            eventWrapper: BookingEventShellWrapper,
            month: {
              dateHeader: MonthDateHeader,
            },
          }}
          defaultView="month"
          popup
          tooltipAccessor={suppressNativeEventTooltip}
        />
      </div>
    </div>
  );
}

export default BookingCalendar;
