import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { formatBookingHoverDetail } from '@/components/bookingCalendarUtils';

/** After closing RBC popups / overlay, swallow the follow-up slot click. */
const POPUP_SUPPRESS_MS = 400;

const MONTH_BOOKING_TOOLTIP_DELAY_MS = 350;

/**
 * Document/capture listeners, month tooltip, month event hit-testing, and week/day header sync
 * for react-big-calendar workarounds. Keeps BookingCalendar.jsx focused on data + render.
 */
export function useBookingCalendarSideEffects({
  calendarHostRef,
  currentView,
  events,
  height,
  onSelectSlot,
  onSelectEvent,
}) {
  const suppressNextSlotSelectRef = useRef(false);
  const suppressSlotSelectResetTimeoutRef = useRef(null);
  const pendingShowMoreAnchorRef = useRef(null);
  const openShowMoreAnchorRef = useRef(null);
  const suppressShowMoreReopenRef = useRef(false);
  const suppressShowMoreReopenResetTimeoutRef = useRef(null);

  const [monthBookingTooltip, setMonthBookingTooltip] = useState(null);
  const monthTooltipRafRef = useRef(null);
  const monthTooltipDelayTimerRef = useRef(null);
  const monthTooltipHoverIdRef = useRef(null);
  const monthTooltipPendingPosRef = useRef({ x: 0, y: 0, text: '' });

  const resolveBookingIdFromNode = (node) => {
    if (!(node instanceof Element)) return null;
    const withData = node.closest?.('[data-booking-id]');
    const raw = withData?.getAttribute('data-booking-id');
    return raw != null && raw !== '' ? raw : null;
  };

  const armSlotSuppressAfterPointer = () => {
    suppressNextSlotSelectRef.current = true;
    if (suppressSlotSelectResetTimeoutRef.current != null) {
      clearTimeout(suppressSlotSelectResetTimeoutRef.current);
    }
    suppressSlotSelectResetTimeoutRef.current = window.setTimeout(() => {
      suppressNextSlotSelectRef.current = false;
      suppressSlotSelectResetTimeoutRef.current = null;
    }, POPUP_SUPPRESS_MS);
  };

  // Popup / "+N more" UX: swallow stray onSelectSlot; prevent same "+N more" reopen bounce.
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
      }, POPUP_SUPPRESS_MS);
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
        }, POPUP_SUPPRESS_MS);
      }

      armSuppressIfClosingPopup(target);
    };

    const onClickCapture = (e) => {
      if (!suppressShowMoreReopenRef.current) return;
      const target = e.target;
      if (!(target instanceof Element)) return;
      const showMoreBtn = target.closest?.('.rbc-show-more');
      if (!showMoreBtn || showMoreBtn !== openShowMoreAnchorRef.current) return;

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
  }, [calendarHostRef, onSelectSlot]);

  // Month: route booking taps through elementsFromPoint (events use pointer-events: none).
  useEffect(() => {
    const host = calendarHostRef.current;
    if (!host || !onSelectSlot) return;

    const onPointerDownCapture = (e) => {
      if (currentView !== 'month') return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const t = e.target;
      if (t instanceof Element && t.closest?.('.ptcf-agg-expand-btn')) return;

      const { clientX, clientY } = e;
      if (typeof clientX !== 'number' || typeof clientY !== 'number') return;

      const stack = document.elementsFromPoint(clientX, clientY);
      let shell = null;
      for (const node of stack) {
        if (!(node instanceof Element) || !host.contains(node)) continue;
        if (node.classList.contains('rbc-ptcf-event-shell')) {
          shell = node;
          break;
        }
        const found = node.closest('.rbc-ptcf-event-shell');
        if (found && host.contains(found)) {
          shell = found;
          break;
        }
      }

      if (!shell) return;
      const rawId = shell.getAttribute('data-booking-id');
      if (rawId == null || rawId === '') return;

      const calEvent = events.find((ev) => String(ev.id) === rawId);
      if (!calEvent) return;

      e.preventDefault();
      e.stopPropagation();

      armSlotSuppressAfterPointer();

      if (onSelectEvent) {
        queueMicrotask(() => onSelectEvent(calEvent.resource));
      }
    };

    host.addEventListener('pointerdown', onPointerDownCapture, true);
    return () => host.removeEventListener('pointerdown', onPointerDownCapture, true);
  }, [calendarHostRef, currentView, events, onSelectEvent, onSelectSlot]);

  // Month: custom tooltip (native title unreliable with pointer-events: none on events).
  useEffect(() => {
    const host = calendarHostRef.current;
    if (!host) return;

    const clearDelayTimer = () => {
      if (monthTooltipDelayTimerRef.current != null) {
        clearTimeout(monthTooltipDelayTimerRef.current);
        monthTooltipDelayTimerRef.current = null;
      }
    };

    const clearTooltip = () => {
      clearDelayTimer();
      monthTooltipHoverIdRef.current = null;
      setMonthBookingTooltip(null);
    };

    const isRbcOverlayEvent = (el) =>
      el instanceof Element && Boolean(el.closest('.rbc-overlay'));

    const isCalendarEventNode = (el) =>
      el instanceof Element && (host.contains(el) || isRbcOverlayEvent(el));

    const findEventUnderPoint = (clientX, clientY) => {
      const stack = document.elementsFromPoint(clientX, clientY);
      for (const node of stack) {
        if (!(node instanceof Element)) continue;
        const ev = node.classList.contains('rbc-event')
          ? node
          : node.closest?.('.rbc-event');
        if (ev && isCalendarEventNode(ev)) return ev;
      }

      const candidates = document.querySelectorAll('.rbc-event');
      for (const ev of candidates) {
        if (!(ev instanceof Element) || !isCalendarEventNode(ev)) continue;
        const r = ev.getBoundingClientRect();
        if (
          clientX >= r.left &&
          clientX <= r.right &&
          clientY >= r.top &&
          clientY <= r.bottom
        ) {
          return ev;
        }
      }
      return null;
    };

    const updateFromPoint = (clientX, clientY) => {
      const hit = findEventUnderPoint(clientX, clientY);

      if (!hit) {
        clearTooltip();
        return;
      }

      const shell = hit.closest?.('.rbc-ptcf-event-shell');
      const rawId =
        shell?.getAttribute('data-booking-id') ??
        resolveBookingIdFromNode(hit);
      const calEvent = rawId != null ? events.find((ev) => String(ev.id) === rawId) : null;
      const text = formatBookingHoverDetail(calEvent);
      if (!text || rawId == null || rawId === '') {
        clearTooltip();
        return;
      }

      monthTooltipPendingPosRef.current = { x: clientX, y: clientY, text };

      if (monthTooltipHoverIdRef.current === rawId) {
        setMonthBookingTooltip((prev) =>
          prev ? { ...prev, x: clientX, y: clientY, text } : prev
        );
        return;
      }

      monthTooltipHoverIdRef.current = rawId;
      clearDelayTimer();
      setMonthBookingTooltip(null);

      const scheduledForId = rawId;
      monthTooltipDelayTimerRef.current = window.setTimeout(() => {
        monthTooltipDelayTimerRef.current = null;
        if (monthTooltipHoverIdRef.current !== scheduledForId) return;
        const p = monthTooltipPendingPosRef.current;
        setMonthBookingTooltip({ x: p.x, y: p.y, text: p.text });
      }, MONTH_BOOKING_TOOLTIP_DELAY_MS);
    };

    const scheduleUpdate = (e) => {
      if (currentView === 'agenda') {
        clearTooltip();
        return;
      }
      if (monthTooltipRafRef.current != null) cancelAnimationFrame(monthTooltipRafRef.current);
      monthTooltipRafRef.current = requestAnimationFrame(() => {
        monthTooltipRafRef.current = null;
        updateFromPoint(e.clientX, e.clientY);
      });
    };

    const onDocPointerMove = (e) => {
      scheduleUpdate(e);
    };

    host.addEventListener('scroll', clearTooltip, true);
    document.addEventListener('pointermove', onDocPointerMove);

    return () => {
      if (monthTooltipRafRef.current != null) cancelAnimationFrame(monthTooltipRafRef.current);
      host.removeEventListener('scroll', clearTooltip, true);
      document.removeEventListener('pointermove', onDocPointerMove);
      clearTooltip();
    };
  }, [calendarHostRef, currentView, events]);

  // Week/day: lock header gutters to .rbc-time-content and match scrollbar margin.
  useLayoutEffect(() => {
    const host = calendarHostRef.current;
    if (!host || (currentView !== 'week' && currentView !== 'day')) {
      return;
    }

    let ro = null;
    let mo = null;
    let raf = 0;

    const clearInjectedLayout = () => {
      const header = host.querySelector('.rbc-time-header');
      if (!header) return;
      header.style.removeProperty('margin-right');
      header.querySelectorAll('.rbc-time-header-content').forEach((el) => {
        el.style.removeProperty('width');
        el.style.removeProperty('flex');
        el.style.removeProperty('max-width');
        el.style.removeProperty('min-width');
      });
      const hg = header.querySelector('.rbc-time-header-gutter');
      if (hg) {
        hg.style.removeProperty('width');
        hg.style.removeProperty('min-width');
        hg.style.removeProperty('max-width');
      }
    };

    const syncWeekTimeGridLayout = () => {
      const content = host.querySelector('.rbc-time-content');
      const header = host.querySelector('.rbc-time-header');
      if (!content || !header) return;

      const timeGutter = content.querySelector(':scope > .rbc-time-gutter');
      const headerGutter = header.querySelector(':scope > .rbc-time-header-gutter');
      const headerContents = header.querySelectorAll(':scope > .rbc-time-header-content');

      if (timeGutter && headerGutter) {
        const gw = Math.round(timeGutter.getBoundingClientRect().width);
        headerGutter.style.setProperty('width', `${gw}px`, 'important');
        headerGutter.style.setProperty('min-width', `${gw}px`, 'important');
        headerGutter.style.setProperty('max-width', `${gw}px`, 'important');
      }

      const gutterW = timeGutter ? timeGutter.offsetWidth : 0;
      const dayBlockPx = Math.max(0, Math.round(content.clientWidth - gutterW));

      if (headerContents.length === 1) {
        const hc = headerContents[0];
        const cs = getComputedStyle(hc);
        const borderX =
          (parseFloat(cs.borderLeftWidth) || 0) + (parseFloat(cs.borderRightWidth) || 0);
        const headerContentOuterPx = Math.round(dayBlockPx + borderX);
        hc.style.setProperty('width', `${headerContentOuterPx}px`, 'important');
        hc.style.setProperty('flex', '0 0 auto', 'important');
        hc.style.setProperty('max-width', `${headerContentOuterPx}px`, 'important');
        hc.style.setProperty('min-width', '0', 'important');
      } else {
        headerContents.forEach((hc) => {
          hc.style.removeProperty('width');
          hc.style.removeProperty('flex');
          hc.style.removeProperty('max-width');
          hc.style.removeProperty('min-width');
        });
      }

      if (header.classList.contains('rbc-overflowing')) {
        const sw = content.offsetWidth - content.clientWidth;
        header.style.setProperty('margin-right', `${sw}px`, 'important');
      } else {
        header.style.removeProperty('margin-right');
      }
    };

    const scheduleSync = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        raf = 0;
        syncWeekTimeGridLayout();
      });
    };

    const ensureResizeObserver = () => {
      const el = host.querySelector('.rbc-time-content');
      if (!el || ro) return;
      ro = new ResizeObserver(scheduleSync);
      ro.observe(el);
    };

    const attachHeaderObserver = () => {
      const header = host.querySelector('.rbc-time-header');
      if (!header || mo) return;
      mo = new MutationObserver(scheduleSync);
      mo.observe(header, { attributes: true, attributeFilter: ['class', 'style'] });
    };

    scheduleSync();
    ensureResizeObserver();
    attachHeaderObserver();

    const timeouts = [0, 16, 50, 150, 300, 500].map((ms) =>
      window.setTimeout(() => {
        scheduleSync();
        ensureResizeObserver();
        attachHeaderObserver();
      }, ms)
    );

    window.addEventListener('resize', scheduleSync);

    return () => {
      window.removeEventListener('resize', scheduleSync);
      timeouts.forEach((id) => clearTimeout(id));
      if (raf) cancelAnimationFrame(raf);
      ro?.disconnect();
      mo?.disconnect();
      clearInjectedLayout();
    };
  }, [calendarHostRef, currentView, events, height]);

  const handleShowMore = useCallback(() => {
    if (pendingShowMoreAnchorRef.current) {
      openShowMoreAnchorRef.current = pendingShowMoreAnchorRef.current;
      pendingShowMoreAnchorRef.current = null;
    }
  }, []);

  return {
    monthBookingTooltip,
    suppressNextSlotSelectRef,
    suppressSlotSelectResetTimeoutRef,
    handleShowMore,
  };
}
