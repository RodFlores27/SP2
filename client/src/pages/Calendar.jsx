import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/useAuth';
import { BookingCalendar } from '@/components/BookingCalendar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { Check } from 'lucide-react';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

export default function Calendar() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialResourceType = searchParams.get('resourceType') || '';
  const initialResourceId = searchParams.get('resourceId') || '';
  const [resourceType, setResourceType] = useState(initialResourceType);
  const [resourceId, setResourceId] = useState(initialResourceId);
  const [equipment, setEquipment] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [slotError, setSlotError] = useState(null);
  const [resourceQuery, setResourceQuery] = useState('');
  const [resourceListOpen, setResourceListOpen] = useState(
    !(initialResourceType && !initialResourceId)
  );
  const [resourceSelectionMode, setResourceSelectionMode] = useState(
    initialResourceId ? 'specific' : initialResourceType ? 'all' : null
  ); // null | 'all' | 'specific'
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  const handleSelectSlot = (slotInfo) => {
    setSlotError(null);

    if (!isAuthenticated) {
      navigate(`/login?redirect=${encodeURIComponent('/bookings/new')}`);
      return;
    }
    const params = new URLSearchParams();
    params.set('startTime', slotInfo.start.toISOString());
    params.set('endTime', slotInfo.end.toISOString());
    if (resourceType) params.set('resourceType', resourceType);
    if (resourceId) params.set('resourceId', resourceId);
    navigate(`/bookings/new?${params.toString()}`);
  };

  useEffect(() => {
    const fetchResources = async () => {
      try {
        const [equipmentRes, roomsRes] = await Promise.all([
          fetch(`${BASE_URL}/equipment`),
          fetch(`${BASE_URL}/rooms`)
        ]);

        if (equipmentRes.ok) {
          const data = await equipmentRes.json();
          setEquipment(data);
        }
        if (roomsRes.ok) {
          const data = await roomsRes.json();
          setRooms(data);
        }
      } catch (err) {
        console.error('Error fetching resources:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchResources();
  }, []);

  const handleResourceTypeChange = (e) => {
    const value = e.target.value;
    setResourceType(value);
    setResourceId('');
    setResourceQuery('');
    setResourceListOpen(false);
    setResourceSelectionMode(value ? 'all' : null);
    
    const params = new URLSearchParams(searchParams);
    params.delete('resourceType');
    params.delete('resourceId');
    if (value) params.set('resourceType', value);
    setSearchParams(params);
  };

  const handleResourceIdChange = (value, mode = null) => {
    setResourceId(value);
    if (mode) setResourceSelectionMode(mode);
    
    const params = new URLSearchParams(searchParams);
    params.delete('resourceId');
    if (resourceType) params.set('resourceType', resourceType);
    if (value) params.set('resourceId', value);
    setSearchParams(params);
  };

  useEffect(() => {
    if (!resourceId) return;
    setResourceListOpen(false);
  }, [resourceId]);

  useEffect(() => {
    if (!resourceType) {
      setResourceSelectionMode(null);
      return;
    }
    if (resourceId) {
      setResourceSelectionMode('specific');
    } else {
      setResourceSelectionMode('all');
      setResourceListOpen(false);
    }
  }, [resourceType, resourceId]);

  const selectedResourceSummary = useMemo(() => {
    if (!resourceId || !resourceType) return null;
    if (resourceType === 'equipment') {
      const resource = equipment.find((e) => String(e.id) === String(resourceId));
      if (!resource) return null;
      return {
        name: resource.name,
        secondary: `${[resource.codeGroup, resource.resourceCode].filter(Boolean).join('-')} • ${resource.category || '-'} • ${resource.status || '-'}`,
      };
    }
    if (resourceType === 'room') {
      const resource = rooms.find((r) => String(r.id) === String(resourceId));
      if (!resource) return null;
      return {
        name: resource.name,
        secondary: `${resource.resourceCode || '-'} • Zone: ${resource.zone || '-'} • ${resource.status || '-'}`,
      };
    }
    return null;
  }, [resourceId, resourceType, equipment, rooms]);

  const groupedResourceOptions = useMemo(() => {
    const normalize = (value) => String(value || '').trim().toLowerCase();
    const query = normalize(resourceQuery);
    const groupsMap = new Map();

    if (resourceType === 'equipment') {
      equipment
        .filter((e) => {
          if (!query) return true;
          const searchable = [e.name, e.codeGroup, e.resourceCode, e.category]
            .map(normalize)
            .join(' ');
          return searchable.includes(query);
        })
        .forEach((e) => {
          const groupLabel = e.category || 'Unspecified Category';
          const row = {
            id: String(e.id),
            name: e.name,
            secondary: `${[e.codeGroup, e.resourceCode].filter(Boolean).join('-')} • ${e.category || '-'} • ${e.status || '-'}`,
          };
          if (!groupsMap.has(groupLabel)) groupsMap.set(groupLabel, []);
          groupsMap.get(groupLabel).push(row);
        });
    } else if (resourceType === 'room') {
      rooms
        .filter((r) => {
          if (!query) return true;
          const searchable = [r.name, r.resourceCode, r.zone, r.location]
            .map(normalize)
            .join(' ');
          return searchable.includes(query);
        })
        .forEach((r) => {
          const groupLabel = r.zone || 'Unspecified Zone';
          const row = {
            id: String(r.id),
            name: r.name,
            secondary: `${r.resourceCode || '-'} • Zone: ${r.zone || '-'} • ${r.status || '-'}`,
          };
          if (!groupsMap.has(groupLabel)) groupsMap.set(groupLabel, []);
          groupsMap.get(groupLabel).push(row);
        });
    }

    return [...groupsMap.entries()]
      .map(([label, items]) => ({
        label,
        items: [...items].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [resourceType, equipment, rooms, resourceQuery]);

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Facility Calendar</CardTitle>
          <p className="text-muted-foreground">
            View booking availability for equipment and rooms
          </p>
          <p id="calendar-book-hint" className="text-sm text-muted-foreground mt-2 max-w-4xl">
            Click any day (month view) or drag a time range (week/day) to open the booking form. Resource
            filters below apply when set.
            {!isAuthenticated && <> You will be asked to sign in first.</>}
          </p>
          {slotError && (
            <p className="mt-2 rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
              {slotError}
            </p>
          )}
        </CardHeader>
        <CardContent>
          <div className="mb-6 flex flex-wrap gap-4">
            <div className="flex flex-col gap-2">
              <label htmlFor="resourceType" className="text-sm font-medium">
                Resource Type
              </label>
              <select
                id="resourceType"
                value={resourceType}
                onChange={handleResourceTypeChange}
                className="px-3 py-2 border rounded-md bg-background min-w-[150px]"
              >
                <option value="">All Resources</option>
                <option value="equipment">Equipment</option>
                <option value="room">Rooms</option>
              </select>
            </div>

            {resourceType && (
              <div className="flex w-full min-w-[260px] max-w-md flex-col gap-2">
                <label htmlFor="resourceId" className="text-sm font-medium">
                  Specific {resourceType === 'equipment' ? 'Equipment' : 'Room'}
                </label>
                {(resourceSelectionMode == null || resourceListOpen) && (
                  <Input
                    id="resourceId"
                    type="search"
                    placeholder={
                      resourceType === 'equipment'
                        ? 'Search equipment by name, code, or category...'
                        : 'Search room by name, code, zone, or location...'
                    }
                    value={resourceQuery}
                    onChange={(e) => setResourceQuery(e.target.value)}
                    onFocus={() => setResourceListOpen(true)}
                  />
                )}
                {resourceSelectionMode && !resourceListOpen && (
                  <div className="flex items-center justify-between rounded-md border border-input bg-muted/30 px-3 py-2">
                    <div className="min-w-0">
                      {resourceSelectionMode === 'all' ? (
                        <>
                          <p className="break-words text-sm font-medium">
                            All {resourceType === 'equipment' ? 'Equipment' : 'Rooms'}
                          </p>
                          <p className="break-words text-xs text-muted-foreground">
                            Showing every {resourceType === 'equipment' ? 'equipment resource' : 'room resource'}
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="break-words text-sm font-medium">{selectedResourceSummary?.name || '-'}</p>
                          <p className="break-words text-xs text-muted-foreground">{selectedResourceSummary?.secondary || ''}</p>
                        </>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-9 px-3 text-sm"
                      onClick={() => setResourceListOpen(true)}
                    >
                      Change
                    </Button>
                  </div>
                )}
                {resourceListOpen && (
                  <div className="max-h-[40vh] overflow-y-auto rounded-md border border-input bg-background sm:max-h-72">
                    <button
                      type="button"
                      onClick={() => {
                        handleResourceIdChange('', 'all');
                        setResourceListOpen(false);
                      }}
                      className={`flex w-full items-start justify-between border-b border-border px-3 py-2 text-left text-sm transition-colors hover:bg-muted/70 ${
                        !resourceId ? 'bg-primary/10 text-primary' : ''
                      }`}
                    >
                      <span>All {resourceType === 'equipment' ? 'Equipment' : 'Rooms'}</span>
                      {!resourceId && <Check className="ml-2 h-4 w-4 shrink-0" />}
                    </button>
                    {groupedResourceOptions.length === 0 ? (
                      <p className="px-3 py-2 text-sm text-muted-foreground">No resources match your search.</p>
                    ) : (
                      <div className="divide-y divide-border">
                        {groupedResourceOptions.map((group) => (
                          <div key={group.label} className="py-1">
                            <p className="px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              {group.label}
                            </p>
                            <div className="space-y-1 px-1 pb-1">
                              {group.items.map((resource) => {
                                const isSelected = resourceId === resource.id;
                                return (
                                  <button
                                    key={resource.id}
                                    type="button"
                                    onClick={() => {
                                      handleResourceIdChange(resource.id, 'specific');
                                      setResourceListOpen(false);
                                    }}
                                    className={`flex w-full items-start justify-between rounded-md px-2 py-2 text-left text-sm transition-colors ${
                                      isSelected ? 'bg-primary/10 text-primary' : 'hover:bg-muted/70'
                                    }`}
                                  >
                                    <span className="min-w-0">
                                      <span className="block truncate font-medium">{resource.name}</span>
                                      <span className="block truncate text-xs text-muted-foreground">
                                        {resource.secondary}
                                      </span>
                                    </span>
                                    {isSelected && <Check className="ml-2 h-4 w-4 shrink-0" />}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <BookingCalendar
            resourceType={resourceType || null}
            resourceId={resourceId ? parseInt(resourceId, 10) : null}
            height={600}
            onSelectSlot={handleSelectSlot}
            ariaDescribedBy="calendar-book-hint"
          />
        </CardContent>
      </Card>
    </div>
  );
}
