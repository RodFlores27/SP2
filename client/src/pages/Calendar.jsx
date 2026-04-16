import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/useAuth';
import { BookingCalendar } from '@/components/BookingCalendar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingSpinner } from '@/components/LoadingSpinner';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

export default function Calendar() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [resourceType, setResourceType] = useState(searchParams.get('resourceType') || '');
  const [resourceId, setResourceId] = useState(searchParams.get('resourceId') || '');
  const [equipment, setEquipment] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  const handleSelectSlot = (slotInfo) => {
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
    
    const params = new URLSearchParams();
    if (value) params.set('resourceType', value);
    setSearchParams(params);
  };

  const handleResourceIdChange = (e) => {
    const value = e.target.value;
    setResourceId(value);
    
    const params = new URLSearchParams();
    if (resourceType) params.set('resourceType', resourceType);
    if (value) params.set('resourceId', value);
    setSearchParams(params);
  };

  const getResourceOptions = () => {
    if (resourceType === 'equipment') {
      return equipment.map((e) => ({ id: e.id, name: e.name }));
    }
    if (resourceType === 'room') {
      return rooms.map((r) => ({ id: r.id, name: r.name }));
    }
    return [];
  };

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
              <div className="flex flex-col gap-2">
                <label htmlFor="resourceId" className="text-sm font-medium">
                  Specific {resourceType === 'equipment' ? 'Equipment' : 'Room'}
                </label>
                <select
                  id="resourceId"
                  value={resourceId}
                  onChange={handleResourceIdChange}
                  className="px-3 py-2 border rounded-md bg-background min-w-[200px]"
                >
                  <option value="">All {resourceType === 'equipment' ? 'Equipment' : 'Rooms'}</option>
                  {getResourceOptions().map((resource) => (
                    <option key={resource.id} value={resource.id}>
                      {resource.name}
                    </option>
                  ))}
                </select>
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
