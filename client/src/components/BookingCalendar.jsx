import {
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  useRef,
  createContext,
  useContext,
} from 'react';
import { useSearchParams } from 'react-router-dom';
import { Calendar, dateFnsLocalizer } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay, startOfMonth, endOfMonth, addMonths, isToday } from 'date-fns';
import { enUS } from 'date-fns/locale';
import { Layers2 } from 'lucide-react';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import '@/components/BookingCalendar.rbc.css';
import {
  suppressNativeEventTooltip,
  CALENDAR_STATUS_STYLES,
  CALENDAR_STATUS_PRIORITY,
  toCalendarStatus,
  buildAggregateMemberRows,
} from '@/components/bookingCalendarUtils';
import { formatCalendarEventTimeRange } from '@/lib/formatBookingDateRange';
import { useBookingCalendarSideEffects } from '@/components/useBookingCalendarSideEffects';
import { bookingMessages } from '@/messages/bookingMessages';

const cal = bookingMessages.calendar;

const locales = { 'en-US': enUS };

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
});

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
function parseAgendaFiltersFromParams(params) {
  return {
    includeFirms: params.get('includeFirms')
      ? params.get('includeFirms') === 'true'
      : true,
    includeActivePencils: params.get('includeActivePencils')
      ? params.get('includeActivePencils') === 'true'
      : true,
    includeSecondary: params.get('includeSecondary') === 'true',
  };
}

const BookingCalendarUiContext = createContext(null);

function ContentionOverlapFlyout({ panel, onClose }) {
  const fly = cal.flyout;
  const panelRef = useRef(null);
  const [placement, setPlacement] = useState(null);

  useLayoutEffect(() => {
    if (panel == null) return undefined;

    const margin = 6;
    const pad = 8;

    const place = () => {
      const el = panelRef.current;
      if (!el) return;

      const { left: triggerLeft, triggerTop, triggerBottom } = panel;
      const rect = el.getBoundingClientRect();
      const h = rect.height;
      const w = rect.width;
      const vh = window.innerHeight;
      const vw = window.innerWidth;

      let top = triggerBottom + margin;
      if (top + h > vh - pad) {
        const aboveTop = triggerTop - h - margin;
        if (aboveTop >= pad) {
          top = aboveTop;
        } else {
          top = Math.max(pad, vh - pad - h);
        }
      }

      const leftPos = Math.min(Math.max(pad, triggerLeft), vw - w - pad);

      setPlacement({ left: leftPos, top });
    };

    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [panel]);

  if (panel == null) return null;

  const { resourceName, members, left: triggerLeft, triggerBottom } = panel;
  const styleLeft = placement?.left ?? triggerLeft;
  const styleTop = placement?.top ?? triggerBottom + 6;

  return (
    <div
      ref={panelRef}
      className="ptcf-contention-overlap-panel fixed z-[110] w-[min(22rem,calc(100vw-1rem))] max-h-[min(24rem,calc(100vh-1rem))] flex flex-col rounded-md border border-border bg-popover p-3 text-popover-foreground shadow-lg"
      style={{
        left: styleLeft,
        top: styleTop,
      }}
      role="dialog"
      aria-label={fly.ariaDialog}
    >
      <div className="flex shrink-0 items-start justify-between gap-2 border-b border-border pb-2 mb-2">
        <div>
          <p className="text-xs font-semibold text-foreground">{fly.activeOverlaps()}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {resourceName
              ? fly.overlapDetailsWithResource({ name: resourceName })
              : fly.overlapDetailsFallback()}
          </p>
        </div>
        <button
          type="button"
          className="text-[11px] text-muted-foreground hover:text-foreground shrink-0"
          onClick={onClose}
        >
          {fly.close()}
        </button>
      </div>
      <ul className="min-h-0 max-h-64 flex-1 space-y-1.5 overflow-y-auto overflow-x-hidden pr-0.5">
        {members.map((row, idx) => {
          const st = CALENDAR_STATUS_STYLES[row.calendarStatus] || CALENDAR_STATUS_STYLES.penciled;
          return (
            <li
              key={`${row.bookingId}-${idx}`}
              className="flex gap-2 rounded border border-border/80 bg-muted/30 px-2 py-1.5 text-[11px] leading-snug"
            >
              <span
                className="mt-0.5 h-3 w-3 shrink-0 rounded-sm border-2"
                style={{
                  backgroundColor: st.backgroundColor,
                  borderColor: st.borderColor,
                }}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <div className="font-medium text-foreground">
                  #{row.bookingId}{' '}
                  <span className="font-normal text-muted-foreground">· {row.roleLabel}</span>
                </div>
                <div className="text-muted-foreground">{row.timeRange}</div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function BookingEventLabel({ event, title }) {
  const ui = useContext(BookingCalendarUiContext);
  const evCopy = cal.event;
  const id = event?.id;
  const members = event?.resource?.aggregateMembers;
  const isAgg = Array.isArray(members) && members.length > 0;
  const showExpand = isAgg && ui?.currentView === 'month';

  return (
    <span
      className="inline-flex max-w-full min-w-0 items-center gap-0.5"
      {...(id != null ? { 'data-booking-id': String(id) } : {})}
    >
      <span className="min-w-0 truncate">{title}</span>
      {showExpand && (
        <button
          type="button"
          className="ptcf-agg-expand-btn inline-flex shrink-0 items-center justify-center rounded p-0.5 text-current hover:bg-black/10 focus:outline-none focus-visible:ring-1 focus-visible:ring-primary"
          aria-label={evCopy.expandOverlapAria}
          aria-expanded={ui.overlapAggregateKey === String(id)}
          title={evCopy.expandOverlapTitle}
          onMouseDown={(e) => {
            e.stopPropagation();
          }}
          onClick={(e) => {
            e.stopPropagation();
            const rect = e.currentTarget.getBoundingClientRect();
            ui.toggleOverlapPanel({
              aggregateKey: String(id),
              left: rect.left,
              triggerTop: rect.top,
              triggerBottom: rect.bottom,
              resourceName: event.resource?.resourceName ?? '',
              members,
            });
          }}
        >
          <Layers2 className="h-3 w-3" aria-hidden />
        </button>
      )}
    </span>
  );
}

function toBaseCalendarEvent(booking, resourceName, resourceStatus) {
  const timeRange = formatCalendarEventTimeRange(booking.startTime, booking.endTime);
  const title = `#${booking.id} ${timeRange} [${resourceName}]`;
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
}

function groupContendedMonthEvents(events) {
  const getContentionPairKey = (resource) => {
    if (!resource) return null;
    if (resource.contentionRole === 'defender') return `def:${resource.id}`;
    if (resource.contentionRole === 'challenger' && resource.challengingBookingId != null) {
      return `def:${resource.challengingBookingId}`;
    }
    return null;
  };

  const byResource = new Map();
  for (const ev of events) {
    const key = `${ev.resource.resourceType}:${ev.resource.resourceId}`;
    if (!byResource.has(key)) byResource.set(key, []);
    byResource.get(key).push(ev);
  }

  const output = [];
  for (const resourceEvents of byResource.values()) {
    const sorted = [...resourceEvents].sort(
      (a, b) => a.start - b.start || a.end - b.end || Number(a.id) - Number(b.id)
    );

    /** @type {Array<Array<any>>} */
    const clusters = [];
    let currentCluster = [];
    let currentClusterEnd = null;
    for (const ev of sorted) {
      if (!currentCluster.length) {
        currentCluster = [ev];
        currentClusterEnd = ev.end;
        continue;
      }
      if (ev.start < currentClusterEnd) {
        currentCluster.push(ev);
        if (ev.end > currentClusterEnd) currentClusterEnd = ev.end;
      } else {
        clusters.push(currentCluster);
        currentCluster = [ev];
        currentClusterEnd = ev.end;
      }
    }
    if (currentCluster.length) clusters.push(currentCluster);

    for (const cluster of clusters) {
      if (cluster.length < 2) {
        output.push(cluster[0]);
        continue;
      }

      // Build separate aggregate blocks per independent 1v1 pair (defender + challenger).
      const pairBuckets = new Map();
      const nonParticipants = [];

      for (const ev of cluster) {
        const key = getContentionPairKey(ev.resource);
        if (!key) {
          nonParticipants.push(ev);
          continue;
        }
        if (!pairBuckets.has(key)) pairBuckets.set(key, []);
        pairBuckets.get(key).push(ev);
      }

      // Non-members always render as their own separate events.
      output.push(...nonParticipants);

      for (const [pairKey, participants] of pairBuckets.entries()) {
        // If pair is incomplete in this visible cluster, keep entries as individual events.
        if (participants.length < 2) {
          output.push(...participants);
          continue;
        }

        const challengerCount = participants.filter((ev) => toCalendarStatus(ev.resource) === 'contesting').length;
        const contestedCount = participants.filter((ev) => toCalendarStatus(ev.resource) === 'contested').length;
        const plainPencilCount = participants.filter((ev) => {
          const r = ev.resource;
          return r.status === 'penciled' && !r.contentionRole && !r.contentionChallenger;
        }).length;

        const representative = [...participants].sort((a, b) => {
          const pa = CALENDAR_STATUS_PRIORITY[toCalendarStatus(a.resource)] ?? 99;
          const pb = CALENDAR_STATUS_PRIORITY[toCalendarStatus(b.resource)] ?? 99;
          return pa - pb || a.start - b.start || Number(a.id) - Number(b.id);
        })[0];

        const participantStart = new Date(Math.min(...participants.map((ev) => ev.start.getTime())));
        const participantEnd = new Date(Math.max(...participants.map((ev) => ev.end.getTime())));
        const title = cal.aggregateMonthTitle({
          timeRange: formatCalendarEventTimeRange(participantStart, participantEnd),
          resourceName: representative.resource.resourceName,
          contestedCount,
          challengerCount,
        });

        const aggregateMembers = buildAggregateMemberRows(participants);

        output.push({
          id: `agg-${pairKey}-${participantStart.getTime()}-${participantEnd.getTime()}`,
          title,
          start: participantStart,
          end: participantEnd,
          resource: {
            ...representative.resource,
            aggregateSummary: {
              total: participants.length,
              contestedCount,
              challengerCount,
              plainPencilCount,
            },
            aggregateMembers,
          },
        });
      }
    }
  }

  return output.sort((a, b) => a.start - b.start || a.end - b.end || String(a.id).localeCompare(String(b.id)));
}

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

function AgendaDateCell({ day, event }) {
  const showDate = event?.resource?.showAgendaDate !== false;
  if (!showDate) {
    return <span className="ptcf-agenda-date-duplicate" aria-hidden />;
  }
  return (
    <span className="ptcf-agenda-date-text">
      {format(day, 'EEE MMM d')}
    </span>
  );
}

function AgendaTimeCell({ event }) {
  return (
    <span className="ptcf-agenda-time-text">
      {formatCalendarEventTimeRange(event.start, event.end)}
    </span>
  );
}

function AgendaEventCell({ event }) {
  const booking = event?.resource;

  return (
    <div className="ptcf-agenda-event-row">
      <span className="ptcf-agenda-event-title">
        #{booking?.id} {booking?.resourceName ? `[${booking.resourceName}]` : ''}
      </span>
    </div>
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
  const [searchParams, setSearchParams] = useSearchParams();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [currentView, setCurrentView] = useState('month');
  const [agendaFilters, setAgendaFilters] = useState(parseAgendaFiltersFromParams(searchParams));
  const [overlapPanel, setOverlapPanel] = useState(null);
  const calendarHostRef = useRef(null);

  const closeOverlapPanel = useCallback(() => setOverlapPanel(null), []);
  const toggleOverlapPanel = useCallback((payload) => {
    setOverlapPanel((prev) => {
      if (prev && prev.aggregateKey === payload.aggregateKey) {
        return null;
      }
      return payload;
    });
  }, []);

  useEffect(() => {
    if (overlapPanel == null) return undefined;
    const onDocMouseDown = (e) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      if (t.closest?.('.ptcf-contention-overlap-panel')) return;
      if (t.closest?.('.ptcf-agg-expand-btn')) return;
      closeOverlapPanel();
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [overlapPanel, closeOverlapPanel]);

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

  useEffect(() => {
    setAgendaFilters(parseAgendaFiltersFromParams(searchParams));
  }, [searchParams]);

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
      if (currentView === 'agenda') {
        params.append('includeFirms', String(agendaFilters.includeFirms));
        params.append('includeActivePencils', String(agendaFilters.includeActivePencils));
        params.append('includeSecondary', String(agendaFilters.includeSecondary));
      }

      const response = await fetch(`${BASE_URL}/bookings/availability?${params}`);

      if (!response.ok) {
        throw new Error(cal.fetchAvailabilityFailed);
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

      const filteredBookings =
        currentView === 'agenda'
          ? bookings.filter((booking) => {
              const isFirm =
                booking.bookingType === 'firm' &&
                ['approved', 'pending_approval'].includes(booking.status);
              const isActivePencil =
                booking.bookingType === 'pencil' &&
                booking.status === 'penciled' &&
                (booking.contentionRole == null || booking.contentionRole === 'defender');
              const isSecondary =
                booking.bookingType === 'pencil' &&
                (booking.status === 'on_hold' ||
                  (booking.status === 'penciled' && booking.contentionRole === 'challenger'));

              return (
                (agendaFilters.includeFirms && isFirm) ||
                (agendaFilters.includeActivePencils && isActivePencil) ||
                (agendaFilters.includeSecondary && isSecondary)
              );
            })
          : bookings;

      const baseEvents = filteredBookings.map((booking) => {
        const resourceData =
          booking.resourceType === 'equipment'
            ? equipmentMap[booking.resourceId]
            : roomMap[booking.resourceId];
        const resourceName =
          resourceData?.name || `${booking.resourceType} #${booking.resourceId}`;
        const resourceStatus = resourceData?.status || 'unknown';
        return toBaseCalendarEvent(booking, resourceName, resourceStatus);
      });

      if (currentView === 'agenda') {
        let previousDayKey = null;
        for (const event of baseEvents) {
          const dayKey = format(event.start, 'yyyy-MM-dd');
          event.resource.showAgendaDate = dayKey !== previousDayKey;
          previousDayKey = dayKey;
        }
      }

      const calendarEvents =
        currentView === 'month' ? groupContendedMonthEvents(baseEvents) : baseEvents;
      setEvents(calendarEvents);
    } catch (err) {
      console.error('Error fetching bookings:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [resourceType, resourceId, currentView, agendaFilters]);

  useEffect(() => {
    fetchBookings(currentDate);
  }, [fetchBookings, currentDate]);

  const handleNavigate = (date) => {
    setCurrentDate(date);
  };

  const handleViewChange = (view) => {
    setCurrentView(view);
    closeOverlapPanel();
  };

  const handleAgendaFilterToggle = (key) => (e) => {
    const checked = e.target.checked;
    setAgendaFilters((prev) => {
      const next = { ...prev, [key]: checked };
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set('includeFirms', String(next.includeFirms));
      nextParams.set('includeActivePencils', String(next.includeActivePencils));
      nextParams.set('includeSecondary', String(next.includeSecondary));
      setSearchParams(nextParams);
      return next;
    });
  };

  const eventStyleGetter = (event) => {
    const b = event.resource;
    const calendarStatus = toCalendarStatus(b);
    const styles = CALENDAR_STATUS_STYLES[calendarStatus] || CALENDAR_STATUS_STYLES.penciled;

    if (currentView === 'agenda') {
      return {
        className: `ptcf-agenda-status-${calendarStatus}`,
        style: {
          backgroundColor: styles.backgroundColor,
          color: styles.color,
          border: 'none',
          borderColor: 'transparent',
        },
      };
    }

    return {
      style: {
        backgroundColor: styles.backgroundColor,
        borderColor: styles.borderColor,
        borderWidth: '2px',
        borderStyle: styles.borderStyle || 'solid',
        color: styles.color,
        borderRadius: '4px',
        opacity:
          calendarStatus === 'penciled' ||
          calendarStatus === 'contesting' ||
          calendarStatus === 'contested'
            ? 0.7
            : 1,
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
        <p>{cal.errorLoading({ message: error })}</p>
      </div>
    );
  }

  const uiContextValue = {
    currentView,
    toggleOverlapPanel,
    closeOverlapPanel,
    overlapAggregateKey: overlapPanel?.aggregateKey ?? null,
  };

  return (
    <BookingCalendarUiContext.Provider value={uiContextValue}>
      <div className="relative">
        {loading && (
          <div className="absolute inset-0 bg-white/50 flex items-center justify-center z-10">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        )}

        <div className="mb-4 flex flex-wrap gap-4 text-sm">
          <div className="flex items-center gap-2">
            <span className="w-4 h-4 rounded" style={{ backgroundColor: '#22c55e' }}></span>
            <span>{cal.legend.approved()}</span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="w-4 h-4 rounded border-2 border-dashed"
              style={{ backgroundColor: '#eab308', borderColor: '#ca8a04' }}
            ></span>
            <span>{cal.legend.pendingApproval()}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-4 h-4 rounded opacity-70" style={{ backgroundColor: '#d1d5db' }}></span>
            <span>{cal.legend.penciled()}</span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="w-4 h-4 rounded border-2 border-dashed"
              style={{ backgroundColor: '#fef3c7', borderColor: '#f59e0b' }}
            />
            <span>{cal.legend.onHold()}</span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="w-4 h-4 rounded border-2 opacity-80"
              style={{ backgroundColor: '#fb923c', borderColor: '#ea580c' }}
            />
            <span>{cal.legend.contentionGroup()}</span>
          </div>
        </div>
        {currentView === 'agenda' && (
          <div className="mb-4 flex flex-wrap items-center gap-5 text-sm">
            <span className="font-medium">{cal.agendaScope.label()}</span>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={agendaFilters.includeFirms}
                onChange={handleAgendaFilterToggle('includeFirms')}
              />
              <span>{cal.agendaScope.options.firms()}</span>
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={agendaFilters.includeActivePencils}
                onChange={handleAgendaFilterToggle('includeActivePencils')}
              />
              <span>{cal.agendaScope.options.activePencils()}</span>
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={agendaFilters.includeSecondary}
                onChange={handleAgendaFilterToggle('includeSecondary')}
              />
              <span>{cal.agendaScope.options.secondaryBackup()}</span>
            </label>
          </div>
        )}

        <div
          ref={calendarHostRef}
          data-selectable={onSelectSlot ? 'true' : undefined}
          aria-describedby={ariaDescribedBy || undefined}
        >
          {monthBookingTooltip && (
            <div
              role="tooltip"
              className="pointer-events-none fixed z-[100] max-w-md rounded-md border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md whitespace-pre-line"
              style={{
                left: Math.min(
                  monthBookingTooltip.x + 14,
                  typeof window !== 'undefined' ? window.innerWidth - 340 : monthBookingTooltip.x
                ),
                top: monthBookingTooltip.y + 14,
              }}
            >
              {monthBookingTooltip.text}
            </div>
          )}
          <ContentionOverlapFlyout
            key={overlapPanel ? overlapPanel.aggregateKey : 'closed'}
            panel={overlapPanel}
            onClose={closeOverlapPanel}
          />
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
              event: BookingEventLabel,
              eventWrapper: BookingEventShellWrapper,
              month: {
                dateHeader: MonthDateHeader,
              },
              agenda: {
                date: AgendaDateCell,
                time: AgendaTimeCell,
                event: AgendaEventCell,
              },
            }}
            defaultView="month"
            popup
            tooltipAccessor={suppressNativeEventTooltip}
          />
        </div>
      </div>
    </BookingCalendarUiContext.Provider>
  );
}

export default BookingCalendar;
