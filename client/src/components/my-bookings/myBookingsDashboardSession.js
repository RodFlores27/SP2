/**
 * sessionStorage for My Bookings dashboard (per browser tab; cleared on logout / 401).
 * Persists: accordion open state, filter toolbar, selected Active/Past tab.
 */

export const MY_BOOKINGS_DEFAULT_ACTIVE_FILTERS = {
  query: '',
  statusFilter: '',
  resourceTypeFilter: '',
  sort: 'soonest',
};

export const MY_BOOKINGS_DEFAULT_PAST_FILTERS = {
  ...MY_BOOKINGS_DEFAULT_ACTIVE_FILTERS,
  sort: 'latest',
};

const STORAGE_KEYS = {
  accordionActive: 'ptcf.myBookings.accordion.v1.active',
  accordionPast: 'ptcf.myBookings.accordion.v1.past',
  filtersActive: 'ptcf.myBookings.filters.v1.active',
  filtersPast: 'ptcf.myBookings.filters.v1.past',
  tab: 'ptcf.myBookings.tab.v1',
};

const VALID_SORTS = new Set(['soonest', 'latest', 'newest']);
const VALID_TABS = new Set(['active', 'past']);

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
  return status === 'contested';
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

  const sort = typeof raw.sort === 'string' && VALID_SORTS.has(raw.sort) ? raw.sort : defaults.sort;

  return {
    query: typeof raw.query === 'string' ? raw.query : defaults.query,
    statusFilter:
      typeof raw.statusFilter === 'string' ? raw.statusFilter : defaults.statusFilter,
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
