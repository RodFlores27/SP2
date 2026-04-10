import { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import { Calendar, dateFnsLocalizer } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay, startOfMonth, endOfMonth, addMonths, isToday } from 'date-fns';
import { enUS } from 'date-fns/locale';
import 'react-big-calendar/lib/css/react-big-calendar.css';

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

export function BookingCalendar({ 
  resourceType = null, 
  resourceId = null, 
  height = 500,
  onSelectEvent = null,
  onSelectSlot = null 
}) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [currentView, setCurrentView] = useState('month');
  const suppressNextSlotSelectRef = useRef(false);
  const suppressSlotSelectResetTimeoutRef = useRef(null);
  const pendingShowMoreAnchorRef = useRef(null);
  const openShowMoreAnchorRef = useRef(null);
  const suppressShowMoreReopenRef = useRef(false);
  const suppressShowMoreReopenResetTimeoutRef = useRef(null);
  const calendarHostRef = useRef(null);

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

      // Build resource-name maps from public list endpoints.
      // Detail endpoints (/equipment/:id, /rooms/:id) require auth and fail on public calendar pages.
      const shouldLoadEquipment = !resourceType || resourceType === 'equipment';
      const shouldLoadRooms = !resourceType || resourceType === 'room';

      let equipmentMap = {};
      let roomMap = {};

      if (shouldLoadEquipment) {
        const equipmentResponse = await fetch(`${BASE_URL}/equipment`);
        if (equipmentResponse.ok) {
          const equipmentList = await equipmentResponse.json();
          equipmentMap = equipmentList.reduce((acc, item) => {
            acc[item.id] = item;
            return acc;
          }, {});
        }
      }

      if (shouldLoadRooms) {
        const roomsResponse = await fetch(`${BASE_URL}/rooms`);
        if (roomsResponse.ok) {
          const roomsList = await roomsResponse.json();
          roomMap = roomsList.reduce((acc, item) => {
            acc[item.id] = item;
            return acc;
          }, {});
        }
      }

      const calendarEvents = bookings.map((booking) => {
        const resourceData = booking.resourceType === 'equipment'
          ? equipmentMap[booking.resourceId]
          : roomMap[booking.resourceId];
        const resourceName = resourceData?.name || `${booking.resourceType} #${booking.resourceId}`;
        const resourceStatus = resourceData?.status || 'unknown';
        
        // Format: "HH:MM AM/PM - HH:MM AM/PM [ResourceName] Booked"
        const startTime = format(new Date(booking.startTime), 'hh:mm a');
        const endTime = format(new Date(booking.endTime), 'hh:mm a');
        const title = `${startTime} - ${endTime} [${resourceName}] Booked`;

        return {
          id: booking.id,
          title,
          start: new Date(booking.startTime),
          end: new Date(booking.endTime),
          resource: {
            ...booking,
            resourceName,
            resourceStatus
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

  // Popup / "+N more" UX fixes:
  // 1) Slot selection: when dismissing the event popup, swallow the stray onSelectSlot (see prior fix).
  // 2) Same "+N more" toggle: Popup closes on mousedown (outside the popper), then the click reopens.
  //    Track the opening button and swallow that reopen click when it's the same node.
  useLayoutEffect(() => {
    const clearSlotSuppressReset = () => {
      if (suppressSlotSelectResetTimeoutRef.current != null) {
        clearTimeout(suppressSlotSelectResetTimeoutRef.current);
        suppressSlotSelectResetTimeoutRef.current = null;
      }
    };

    const clearShowMoreSuppressReset = () => {
      if (suppressShowMoreReopenResetTimeoutRef.current != null) {
        clearTimeout(suppressShowMoreReopenResetTimeoutRef.current);
        suppressShowMoreReopenResetTimeoutRef.current = null;
      }
    };

    const armSuppressIfClosingPopup = (target) => {
      if (!onSelectSlot) return;
      if (!(target instanceof Element)) return;
      const overlay = document.querySelector('.rbc-overlay');
      if (!overlay) return;
      if (overlay.contains(target)) return;
      suppressNextSlotSelectRef.current = true;
      clearSlotSuppressReset();
      suppressSlotSelectResetTimeoutRef.current = window.setTimeout(() => {
        suppressNextSlotSelectRef.current = false;
        suppressSlotSelectResetTimeoutRef.current = null;
      }, 400);
    };

    const onPointerDownCapture = (e) => {
      const target = e.target;
      if (!(target instanceof Element)) return;

      const showMoreBtn = target.closest?.('.rbc-show-more');
      const overlay = document.querySelector('.rbc-overlay');

      if (showMoreBtn && !overlay) {
        pendingShowMoreAnchorRef.current = showMoreBtn;
      }

      if (showMoreBtn && overlay && openShowMoreAnchorRef.current === showMoreBtn) {
        suppressShowMoreReopenRef.current = true;
        clearShowMoreSuppressReset();
        suppressShowMoreReopenResetTimeoutRef.current = window.setTimeout(() => {
          suppressShowMoreReopenRef.current = false;
          suppressShowMoreReopenResetTimeoutRef.current = null;
        }, 400);
      }

      armSuppressIfClosingPopup(target);
    };

    const onClickCapture = (e) => {
      if (!suppressShowMoreReopenRef.current) return;
      const target = e.target;
      if (!(target instanceof Element)) return;
      const showMoreBtn = target.closest?.('.rbc-show-more');
      if (!showMoreBtn || showMoreBtn !== openShowMoreAnchorRef.current) return;

      // stopPropagation on an ancestor capture listener prevents the event from reaching the
      // "+N more" button (document-level stopImmediatePropagation does not).
      e.preventDefault();
      e.stopPropagation();

      suppressShowMoreReopenRef.current = false;
      clearShowMoreSuppressReset();
      openShowMoreAnchorRef.current = null;
    };

    document.addEventListener('mousedown', onPointerDownCapture, true);
    document.addEventListener('touchstart', onPointerDownCapture, { capture: true, passive: true });

    const host = calendarHostRef.current;
    if (host) {
      host.addEventListener('click', onClickCapture, true);
    }

    return () => {
      clearSlotSuppressReset();
      clearShowMoreSuppressReset();
      document.removeEventListener('mousedown', onPointerDownCapture, true);
      document.removeEventListener('touchstart', onPointerDownCapture, { capture: true });
      if (host) {
        host.removeEventListener('click', onClickCapture, true);
      }
    };
  }, [onSelectSlot]);

  const handleShowMore = useCallback(() => {
    if (pendingShowMoreAnchorRef.current) {
      openShowMoreAnchorRef.current = pendingShowMoreAnchorRef.current;
      pendingShowMoreAnchorRef.current = null;
    }
  }, []);

  const handleNavigate = (date) => {
    setCurrentDate(date);
  };

  const handleViewChange = (view) => {
    setCurrentView(view);
  };

  const MonthDateHeader = ({ date, label }) => {
    const today = isToday(date);

    if (!today) {
      return <span>{label}</span>;
    }

    return (
      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-primary text-primary-foreground font-semibold">
        {label}
      </span>
    );
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
      <style>{`
        .rbc-event {
          font-size: 10px !important;
          padding: 2px 4px !important;
          line-height: 1.2 !important;
        }
        .rbc-event-label {
          font-size: 9px !important;
        }
        .rbc-event-content {
          font-size: 10px !important;
          white-space: nowrap !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
        }

        /* "+N more" show-more link */
        .rbc-show-more {
          font-size: 10px !important;
          font-weight: 600;
          color: hsl(var(--primary)) !important;
          background: transparent !important;
          padding: 0 4px;
          cursor: pointer;
        }
        .rbc-show-more:hover {
          text-decoration: underline;
        }

        /* Popup overlay */
        .rbc-overlay {
          border-radius: 8px !important;
          border: 1px solid hsl(var(--border)) !important;
          box-shadow: 0 4px 16px rgba(0,0,0,0.12) !important;
          background: hsl(var(--background)) !important;
          padding: 8px !important;
          z-index: 50 !important;
          min-width: 200px !important;
        }
        .rbc-overlay-header {
          font-size: 11px !important;
          font-weight: 600;
          color: hsl(var(--foreground)) !important;
          border-bottom: 1px solid hsl(var(--border)) !important;
          padding-bottom: 4px !important;
          margin-bottom: 6px !important;
        }
        .rbc-overlay .rbc-event {
          margin-bottom: 3px !important;
        }
        
        /* Enhanced current time indicator */
        .rbc-current-time-indicator {
          background-color: #ef4444 !important;
          height: 2px !important;
          z-index: 10;
        }
        
        .rbc-current-time-indicator::before {
          content: 'NOW';
          position: absolute;
          left: -45px;
          top: -8px;
          background-color: #ef4444;
          color: white;
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.5px;
        }
        
        .rbc-current-time-indicator::after {
          content: '';
          position: absolute;
          left: 0;
          top: -4px;
          width: 10px;
          height: 10px;
          background-color: #ef4444;
          border-radius: 50%;
          border: 2px solid white;
        }
      `}</style>
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
          <span className="w-4 h-4 rounded border-2 border-dashed" style={{ backgroundColor: '#eab308', borderColor: '#ca8a04' }}></span>
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

      <div ref={calendarHostRef}>
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
            month: {
              dateHeader: MonthDateHeader,
            },
          }}
          defaultView="month"
          popup
          tooltipAccessor={(event) => {
            const r = event.resource;
            return `${r.resourceName} - ${r.status} (${r.bookingType})`;
          }}
        />
      </div>
    </div>
  );
}

export default BookingCalendar;
