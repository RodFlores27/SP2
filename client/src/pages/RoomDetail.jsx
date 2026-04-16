import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/useAuth';
import axiosInstance from '@/lib/axios';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { StatusBadge } from '@/components/StatusBadge';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { RoomFormModal } from '@/components/RoomFormModal';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Edit, Trash2, Image as ImageIcon, MapPin, Users, Calendar as CalendarIcon, BookOpen } from 'lucide-react';
import { BookingCalendar } from '@/components/BookingCalendar';

export default function RoomDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [room, setRoom] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const isStaff = user?.accountType === 'ptcf_staff' || user?.accountType === 'system_admin';

  useEffect(() => {
    fetchRoom();
  }, [id]);

  const fetchRoom = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await axiosInstance.get(`/rooms/${id}`);
      setRoom(response.data);
    } catch (err) {
      console.error('Error fetching room:', err);
      if (err.response?.status === 404) {
        setError('Room not found.');
      } else {
        setError('Failed to load room details. Please try again later.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = () => {
    setFormModalOpen(true);
  };

  const handleDeleteClick = () => {
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    try {
      await axiosInstance.delete(`/rooms/${id}`);
      navigate('/rooms');
    } catch (err) {
      console.error('Error deleting room:', err);
      alert('Failed to delete room. Please try again.');
    }
  };

  const handleFormSuccess = () => {
    setFormModalOpen(false);
    fetchRoom();
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-red-600 mb-4">{error}</p>
            <Link to="/rooms">
              <Button variant="outline">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Room List
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <Link to="/rooms">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Room List
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <CardTitle className="text-3xl mb-2">{room.name}</CardTitle>
              <div className="flex items-center gap-2 text-lg text-muted-foreground">
                <MapPin className="h-5 w-5" />
                <span>{room.location}</span>
              </div>
            </div>
            <StatusBadge status={room.status} />
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {room.imageUrl ? (
            <div className="w-full aspect-video rounded-lg overflow-hidden bg-muted">
              <img
                src={room.imageUrl}
                alt={room.name}
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <div className="w-full aspect-video rounded-lg bg-muted flex items-center justify-center">
              <ImageIcon className="h-24 w-24 text-muted-foreground" />
            </div>
          )}

          <div>
            <h3 className="text-lg font-semibold mb-2">Description</h3>
            <p className="text-muted-foreground whitespace-pre-wrap">{room.description}</p>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-4 border-t">
            <div>
              <p className="text-sm text-muted-foreground">Location</p>
              <p className="font-medium">{room.location}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Capacity</p>
              <div className="flex items-center gap-2 font-medium">
                <Users className="h-4 w-4" />
                <span>{room.capacity} people</span>
              </div>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Status</p>
              <div className="mt-1">
                <StatusBadge status={room.status} />
              </div>
            </div>
          </div>

          {user && ['available', 'in-use'].includes(room.status) && (
            <div className="pt-4 border-t">
              <Link to={`/bookings/new?resourceType=room&resourceId=${id}`}>
                <Button className="w-full">
                  <BookOpen className="h-4 w-4 mr-2" />
                  Book this Room
                </Button>
              </Link>
            </div>
          )}

          {isStaff && (
            <div className="flex gap-3 pt-6 border-t">
              <Button onClick={handleEdit} className="flex-1">
                <Edit className="h-4 w-4 mr-2" />
                Edit Room
              </Button>
              <Button onClick={handleDeleteClick} variant="destructive" className="flex-1">
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Room
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="flex items-center gap-2">
              <CalendarIcon className="h-5 w-5" />
              Availability Calendar
            </CardTitle>
            <Link to="/calendar">
              <Button variant="outline" size="sm">
                View Full Calendar
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          <BookingCalendar
            resourceType="room"
            resourceId={parseInt(id, 10)}
            height={400}
          />
        </CardContent>
      </Card>

      <RoomFormModal
        open={formModalOpen}
        onOpenChange={setFormModalOpen}
        room={room}
        onSuccess={handleFormSuccess}
      />

      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleDeleteConfirm}
        title="Delete Room"
        description="Are you sure you want to delete this room? This action cannot be undone and you will be redirected to the room list."
      />
    </div>
  );
}
