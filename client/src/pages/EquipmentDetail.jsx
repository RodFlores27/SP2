import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import axiosInstance from '@/lib/axios';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { StatusBadge } from '@/components/StatusBadge';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EquipmentFormModal } from '@/components/EquipmentFormModal';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Edit, Trash2, Image as ImageIcon, Calendar as CalendarIcon, BookOpen } from 'lucide-react';
import { BookingCalendar } from '@/components/BookingCalendar';

export default function EquipmentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [equipment, setEquipment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const isStaff = user?.accountType === 'ptcf_staff' || user?.accountType === 'system_admin';

  useEffect(() => {
    fetchEquipment();
  }, [id]);

  const fetchEquipment = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await axiosInstance.get(`/equipment/${id}`);
      setEquipment(response.data);
    } catch (err) {
      console.error('Error fetching equipment:', err);
      if (err.response?.status === 404) {
        setError('Equipment not found.');
      } else {
        setError('Failed to load equipment details. Please try again later.');
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
      await axiosInstance.delete(`/equipment/${id}`);
      navigate('/equipment');
    } catch (err) {
      console.error('Error deleting equipment:', err);
      alert('Failed to delete equipment. Please try again.');
    }
  };

  const handleFormSuccess = () => {
    setFormModalOpen(false);
    fetchEquipment();
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
            <Link to="/equipment">
              <Button variant="outline">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Equipment List
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
        <Link to="/equipment">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Equipment List
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <CardTitle className="text-3xl mb-2">{equipment.name}</CardTitle>
              <p className="text-lg text-muted-foreground">{equipment.category}</p>
            </div>
            <StatusBadge status={equipment.status} />
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {equipment.imageUrl ? (
            <div className="w-full aspect-video rounded-lg overflow-hidden bg-muted">
              <img
                src={equipment.imageUrl}
                alt={equipment.name}
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
            <p className="text-muted-foreground whitespace-pre-wrap">{equipment.description}</p>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-4 border-t">
            <div>
              <p className="text-sm text-muted-foreground">Category</p>
              <p className="font-medium">{equipment.category}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Status</p>
              <div className="mt-1">
                <StatusBadge status={equipment.status} />
              </div>
            </div>
          </div>

          {user && ['available', 'in-use'].includes(equipment.status) && (
            <div className="pt-4 border-t">
              <Link to={`/bookings/new?resourceType=equipment&resourceId=${id}`}>
                <Button className="w-full">
                  <BookOpen className="h-4 w-4 mr-2" />
                  Book this Equipment
                </Button>
              </Link>
            </div>
          )}

          {isStaff && (
            <div className="flex gap-3 pt-6 border-t">
              <Button onClick={handleEdit} className="flex-1">
                <Edit className="h-4 w-4 mr-2" />
                Edit Equipment
              </Button>
              <Button onClick={handleDeleteClick} variant="destructive" className="flex-1">
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Equipment
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
            resourceType="equipment"
            resourceId={parseInt(id, 10)}
            height={400}
          />
        </CardContent>
      </Card>

      <EquipmentFormModal
        open={formModalOpen}
        onOpenChange={setFormModalOpen}
        equipment={equipment}
        onSuccess={handleFormSuccess}
      />

      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleDeleteConfirm}
        title="Delete Equipment"
        description="Are you sure you want to delete this equipment? This action cannot be undone and you will be redirected to the equipment list."
      />
    </div>
  );
}
