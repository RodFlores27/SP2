import { useMemo, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/useAuth';
import axiosInstance from '@/lib/axios';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { StatusBadge } from '@/components/StatusBadge';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EquipmentFormModal } from '@/components/EquipmentFormModal';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ChevronDown,
  ChevronUp,
  Plus,
  Edit,
  Trash2,
  Image as ImageIcon,
  Search,
  SlidersHorizontal,
} from 'lucide-react';

const DEFAULT_FILTERS = {
  query: '',
  status: '',
  category: '',
  sort: 'newest',
};

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'available', label: 'Available' },
  { value: 'in-use', label: 'In Use' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'unavailable', label: 'Unavailable' },
];

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest First' },
  { value: 'name-asc', label: 'Name A-Z' },
  { value: 'name-desc', label: 'Name Z-A' },
];

const selectClass =
  'h-9 rounded-md border border-input bg-background px-3 text-sm min-w-[180px] focus:outline-none focus:ring-2 focus:ring-ring';

function normalizeText(value) {
  return String(value || '').toLowerCase();
}

export default function EquipmentList() {
  const { user } = useAuth();
  const [equipment, setEquipment] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [editingEquipment, setEditingEquipment] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [showFilters, setShowFilters] = useState(false);

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

  const categoryOptions = useMemo(() => {
    const categories = equipment
      .map((item) => item.category)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
    return [...new Set(categories)];
  }, [equipment]);

  const codeGroupOptions = useMemo(() => {
    const codes = equipment
      .map((item) => item.codeGroup)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
    return [...new Set(codes)];
  }, [equipment]);

  const filteredEquipment = useMemo(() => {
    const query = normalizeText(filters.query);
    const rows = equipment.filter((item) => {
      if (filters.status && item.status !== filters.status) return false;
      if (filters.category && item.category !== filters.category) return false;
      if (query) {
        const searchable = [item.name, item.category, item.description].map(normalizeText).join(' ');
        if (!searchable.includes(query)) return false;
      }
      return true;
    });

    return [...rows].sort((a, b) => {
      if (filters.sort === 'name-asc') return a.name.localeCompare(b.name);
      if (filters.sort === 'name-desc') return b.name.localeCompare(a.name);
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });
  }, [equipment, filters]);

  const hasActiveFilters = Object.keys(DEFAULT_FILTERS).some(
    (key) => filters[key] !== DEFAULT_FILTERS[key]
  );

  const setFilter = (key, value) => setFilters((prev) => ({ ...prev, [key]: value }));

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-8">
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

      {equipment.length > 0 && (
        <Card className="border-muted mb-6">
          <CardContent className="py-4 space-y-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <input
                  type="search"
                  placeholder="Search by name, category, description..."
                  value={filters.query}
                  onChange={(e) => setFilter('query', e.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <button
                type="button"
                onClick={() => setShowFilters((prev) => !prev)}
                className={`inline-flex h-9 items-center justify-center gap-1 rounded-md border px-3 text-sm transition-colors ${
                  hasActiveFilters
                    ? 'border-blue-300 bg-blue-50/40 text-blue-700 hover:bg-blue-50'
                    : 'hover:bg-accent'
                }`}
                aria-expanded={showFilters}
                aria-label="Toggle filters"
              >
                <SlidersHorizontal className="h-4 w-4" />
                Filters
                {!showFilters && hasActiveFilters && (
                  <span className="inline-block h-2 w-2 rounded-full bg-blue-600" aria-hidden="true" />
                )}
                {showFilters ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
            </div>

            {showFilters && (
              <div className="rounded-md border border-border bg-muted/20 p-3">
                <div className="flex flex-col sm:flex-row gap-2 flex-wrap">
                  <select
                    value={filters.status}
                    onChange={(e) => setFilter('status', e.target.value)}
                    className={selectClass}
                    aria-label="Filter by status"
                  >
                    {STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <select
                    value={filters.category}
                    onChange={(e) => setFilter('category', e.target.value)}
                    className={selectClass}
                    aria-label="Filter by category"
                  >
                    <option value="">All Categories</option>
                    {categoryOptions.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                  <select
                    value={filters.sort}
                    onChange={(e) => setFilter('sort', e.target.value)}
                    className={selectClass}
                    aria-label="Sort equipment"
                  >
                    {SORT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {hasActiveFilters && (
                    <button
                      type="button"
                      onClick={() => setFilters(DEFAULT_FILTERS)}
                      className="inline-flex items-center rounded-md border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent"
                    >
                      Clear filters
                    </button>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
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
      ) : filteredEquipment.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <ImageIcon className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No equipment matches the current filters.</p>
            <Button variant="outline" onClick={() => setFilters(DEFAULT_FILTERS)} className="mt-4">
              Clear filters
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredEquipment.map((item) => (
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
                    <CardDescription className="mt-1">
                      {item.category}
                      {(item.codeGroup || item.resourceCode) && (
                        <span className="block text-xs font-medium text-muted-foreground">
                          {[item.codeGroup, item.resourceCode].filter(Boolean).join('-')}
                        </span>
                      )}
                    </CardDescription>
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
        codeGroupOptions={codeGroupOptions}
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
