import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';

const ACTIVE_STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'contested', label: 'Contested' },
  { value: 'queued', label: 'Queued' },
  { value: 'pending_approval', label: 'Pending Approval' },
  { value: 'penciled', label: 'Penciled' },
  { value: 'approved', label: 'Approved' },
];

const PAST_STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'denied', label: 'Denied' },
  { value: 'displaced', label: 'Displaced' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'expired', label: 'Expired' },
];

const RESOURCE_TYPE_OPTIONS = [
  { value: '', label: 'All Types' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'room', label: 'Room' },
];

const SORT_OPTIONS = [
  { value: 'soonest', label: 'Soonest First' },
  { value: 'latest', label: 'Latest First' },
  { value: 'newest', label: 'Recently Created' },
];

const selectClass =
  'px-2.5 py-1.5 text-sm border rounded-md bg-background min-w-[130px] focus:outline-none focus:ring-2 focus:ring-ring';

export function BookingToolbar({ tab, filters, onFiltersChange }) {
  const statusOptions = tab === 'active' ? ACTIVE_STATUS_OPTIONS : PAST_STATUS_OPTIONS;

  const set = (key, value) => onFiltersChange({ ...filters, [key]: value });

  const hasAnyFilter = filters.query || filters.statusFilter || filters.resourceTypeFilter;

  return (
    <div className="flex flex-col sm:flex-row gap-2 flex-wrap">
      {/* Search */}
      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <Input
          type="search"
          placeholder="Search by ID or resource…"
          value={filters.query}
          onChange={(e) => set('query', e.target.value)}
          className="pl-8 h-9 text-sm"
        />
      </div>

      {/* Status filter */}
      <select
        value={filters.statusFilter}
        onChange={(e) => set('statusFilter', e.target.value)}
        className={selectClass}
        aria-label="Filter by status"
      >
        {statusOptions.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      {/* Resource type filter */}
      <select
        value={filters.resourceTypeFilter}
        onChange={(e) => set('resourceTypeFilter', e.target.value)}
        className={selectClass}
        aria-label="Filter by resource type"
      >
        {RESOURCE_TYPE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      {/* Sort */}
      <select
        value={filters.sort}
        onChange={(e) => set('sort', e.target.value)}
        className={selectClass}
        aria-label="Sort order"
      >
        {SORT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      {/* Clear all */}
      {hasAnyFilter && (
        <button
          type="button"
          onClick={() =>
            onFiltersChange({ query: '', statusFilter: '', resourceTypeFilter: '', sort: filters.sort })
          }
          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs text-muted-foreground border rounded-md hover:bg-accent transition-colors"
        >
          <X className="h-3 w-3" />
          Clear
        </button>
      )}
    </div>
  );
}
