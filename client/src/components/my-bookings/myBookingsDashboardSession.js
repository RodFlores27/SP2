/**
 * sessionStorage for My Bookings dashboard (per browser tab; cleared on logout / 401).
 * Persists: accordion open state, filter toolbar, selected Active/Past tab.
 */

export const MY_BOOKINGS_DEFAULT_ACTIVE_FILTERS = {
  query: '',
  statusFilter: '',
  resourceTypeFilter: '',
  sort: 'event_date_closest',
};

export const MY_BOOKINGS_DEFAULT_PAST_FILTERS = {
  ...MY_BOOKINGS_DEFAULT_ACTIVE_FILTERS,
  sort: 'event_date_furthest',
};

const STORAGE_KEYS = {
  accordionActive: 'ptcf.myBookings.accordion.v1.active',
  accordionPast: 'ptcf.myBookings.accordion.v1.past',
  filtersActive: 'ptcf.myBookings.filters.v1.active',
  filtersPast: 'ptcf.myBookings.filters.v1.past',
  tab: 'ptcf.myBookings.tab.v1',
};

const VALID_TABS = new Set(['active', 'past']);
const VALID_SORTS_ACTIVE = new Set([
  'event_date_closest',
  'event_date_furthest',
  'recently_created',
  'recently_updated',
  'duration_longest',
  'duration_shortest',
  'expiring_soon',
  'active_conflicts',
]);
const VALID_SORTS_PAST = new Set([
  'event_date_closest',
  'event_date_furthest',
  'recently_created',
  'recently_updated',
  'duration_longest',
  'duration_shortest',
]);
const VALID_STATUS_FILTER_ACTIVE = new Set([
  '',
  'under_contention',
  'contested',
  'pending_approval',
  'on_hold',
  'penciled',
  'approved',
]);
const VALID_STATUS_FILTER_PAST = new Set([
  '',
  'denied',
  'displaced',
  'cancelled',
  'expired',
  'completed',
]);

function safeParseObject(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch {
    /* ignore */
  }
  return null;
}

/** --- Accordion --- */

export function getDefaultAccordionOpenActive(status) {
  return status === 'contested' || status === 'on_hold';
}

export function getDefaultAccordionOpenPast(status) {
  return status === 'denied';
}

export function getDefaultAccordionOpen(tab, status) {
  if (tab === 'active') return getDefaultAccordionOpenActive(status);
  if (tab === 'past') return getDefaultAccordionOpenPast(status);
  return false;
}

export function loadAccordionMap(tab) {
  const key = tab === 'active' ? STORAGE_KEYS.accordionActive : STORAGE_KEYS.accordionPast;
  if (!key || typeof sessionStorage === 'undefined') return {};
  const parsed = safeParseObject(sessionStorage.getItem(key));
  return parsed ?? {};
}

export function saveAccordionMap(tab, map) {
  const key = tab === 'active' ? STORAGE_KEYS.accordionActive : STORAGE_KEYS.accordionPast;
  if (!key || typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(key, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export function isAccordionGroupOpen(tab, status, map) {
  if (Object.prototype.hasOwnProperty.call(map, status)) {
    return Boolean(map[status]);
  }
  return getDefaultAccordionOpen(tab, status);
}

/** --- Filters --- */

function normalizeFilters(tab, raw) {
  const defaults =
    tab === 'past' ? MY_BOOKINGS_DEFAULT_PAST_FILTERS : MY_BOOKINGS_DEFAULT_ACTIVE_FILTERS;
  if (!raw || typeof raw !== 'object') return { ...defaults };

  const validSorts = tab === 'past' ? VALID_SORTS_PAST : VALID_SORTS_ACTIVE;
  const sort = typeof raw.sort === 'string' && validSorts.has(raw.sort) ? raw.sort : defaults.sort;

  const validStatuses =
    tab === 'past' ? VALID_STATUS_FILTER_PAST : VALID_STATUS_FILTER_ACTIVE;
  let rawStatus =
    typeof raw.statusFilter === 'string' ? raw.statusFilter : defaults.statusFilter;
  if (tab === 'active' && rawStatus === 'contested') {
    rawStatus = 'under_contention';
  }
  const statusFilter = validStatuses.has(rawStatus) ? rawStatus : defaults.statusFilter;

  return {
    query: typeof raw.query === 'string' ? raw.query : defaults.query,
    statusFilter,
    resourceTypeFilter:
      typeof raw.resourceTypeFilter === 'string'
        ? raw.resourceTypeFilter
        : defaults.resourceTypeFilter,
    sort,
  };
}

export function loadFilters(tab) {
  const key = tab === 'active' ? STORAGE_KEYS.filtersActive : STORAGE_KEYS.filtersPast;
  if (!key || typeof sessionStorage === 'undefined') {
    return tab === 'past'
      ? { ...MY_BOOKINGS_DEFAULT_PAST_FILTERS }
      : { ...MY_BOOKINGS_DEFAULT_ACTIVE_FILTERS };
  }
  const parsed = safeParseObject(sessionStorage.getItem(key));
  return normalizeFilters(tab, parsed);
}

export function saveFilters(tab, filters) {
  const key = tab === 'active' ? STORAGE_KEYS.filtersActive : STORAGE_KEYS.filtersPast;
  if (!key || typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(key, JSON.stringify(normalizeFilters(tab, filters)));
  } catch {
    /* ignore */
  }
}

/** --- Tab --- */

export function loadDashboardTab() {
  if (typeof sessionStorage === 'undefined') return 'active';
  const raw = sessionStorage.getItem(STORAGE_KEYS.tab);
  if (raw === 'past' || raw === 'active') return raw;
  return 'active';
}

export function saveDashboardTab(tab) {
  if (typeof sessionStorage === 'undefined') return;
  if (!VALID_TABS.has(tab)) return;
  try {
    sessionStorage.setItem(STORAGE_KEYS.tab, tab);
  } catch {
    /* ignore */
  }
}

/** Clear all My Bookings dashboard session keys (logout / 401). */
export function clearMyBookingsDashboardSession() {
  if (typeof sessionStorage === 'undefined') return;
  try {
    Object.values(STORAGE_KEYS).forEach((k) => sessionStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}
