import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/useAuth';
import axiosInstance from '@/lib/axios';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { StatusBadge } from '@/components/StatusBadge';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EquipmentFormModal } from '@/components/EquipmentFormModal';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Edit, Trash2, Image as ImageIcon } from 'lucide-react';

export default function EquipmentList() {
  const { user } = useAuth();
  const [equipment, setEquipment] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [editingEquipment, setEditingEquipment] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const isStaff = user?.accountType === 'ptcf_staff' || user?.accountType === 'system_admin';

  useEffect(() => {
    fetchEquipment();
  }, []);

  const fetchEquipment = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await axiosInstance.get('/equipment');
      setEquipment(response.data);
    } catch (err) {
      console.error('Error fetching equipment:', err);
      setError('Failed to load equipment. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingEquipment(null);
    setFormModalOpen(true);
  };

  const handleEdit = (item) => {
    setEditingEquipment(item);
    setFormModalOpen(true);
  };

  const handleDeleteClick = (id) => {
    setDeletingId(id);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    try {
      await axiosInstance.delete(`/equipment/${deletingId}`);
      setDeleteDialogOpen(false);
      setDeletingId(null);
      fetchEquipment();
    } catch (err) {
      console.error('Error deleting equipment:', err);
      alert('Failed to delete equipment. Please try again.');
    }
  };

  const handleFormSuccess = () => {
    setFormModalOpen(false);
    setEditingEquipment(null);
    fetchEquipment();
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Equipment</h1>
          <p className="text-muted-foreground mt-2">
            Browse available equipment for the PTCF facility
          </p>
        </div>
        {isStaff && (
          <Button onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Add Equipment
          </Button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-md mb-6">
          {error}
        </div>
      )}

      {equipment.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <ImageIcon className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No equipment found.</p>
            {isStaff && (
              <Button onClick={handleCreate} className="mt-4">
                <Plus className="h-4 w-4 mr-2" />
                Add First Equipment
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {equipment.map((item) => (
            <Card key={item.id} className="overflow-hidden hover:shadow-lg transition-shadow">
              <div className="aspect-video bg-muted relative">
                {item.imageUrl ? (
                  <img
                    src={item.imageUrl}
                    alt={item.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <ImageIcon className="h-16 w-16 text-muted-foreground" />
                  </div>
                )}
              </div>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <CardTitle className="text-xl">{item.name}</CardTitle>
                    <CardDescription className="mt-1">{item.category}</CardDescription>
                  </div>
                  <StatusBadge status={item.status} />
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground line-clamp-2 mb-4">
                  {item.description}
                </p>
                <div className="flex gap-2">
                  <Link to={`/equipment/${item.id}`} className="flex-1">
                    <Button variant="outline" className="w-full">
                      View Details
                    </Button>
                  </Link>
                  {isStaff && (
                    <>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => handleEdit(item)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => handleDeleteClick(item.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <EquipmentFormModal
        open={formModalOpen}
        onOpenChange={setFormModalOpen}
        equipment={editingEquipment}
        onSuccess={handleFormSuccess}
      />

      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleDeleteConfirm}
        title="Delete Equipment"
        description="Are you sure you want to delete this equipment? This action cannot be undone."
      />
    </div>
  );
}
