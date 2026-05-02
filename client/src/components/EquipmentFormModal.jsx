import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { uploadWithImage } from '@/lib/imageUpload';
import { ImageUpload } from '@/components/ImageUpload';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const equipmentSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  category: z.string().min(1, 'Category is required'),
  codeGroup: z.string().min(2, 'Code group is required').max(16, 'Code group is too long').regex(/^[A-Za-z0-9]+$/, 'Use letters and numbers only'),
  resourceCode: z.string().min(2, 'Resource code is required').max(16, 'Resource code is too long').regex(/^[A-Za-z0-9]+$/, 'Use letters and numbers only'),
  description: z.string().min(1, 'Description is required'),
  status: z.enum(['available', 'in-use', 'maintenance', 'unavailable']),
});

const normalizeCodeInput = (value) => value.toUpperCase().replace(/[^A-Z0-9]/g, '');

export function EquipmentFormModal({ open, onOpenChange, equipment, onSuccess, codeGroupOptions = [] }) {
  const [imageFile, setImageFile] = useState(null);
  const [removeExistingImage, setRemoveExistingImage] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const form = useForm({
    resolver: zodResolver(equipmentSchema),
    defaultValues: {
      name: '',
      category: '',
      codeGroup: '',
      resourceCode: '',
      description: '',
      status: 'available',
    },
  });

  useEffect(() => {
    if (equipment) {
      form.reset({
        name: equipment.name || '',
        category: equipment.category || '',
        codeGroup: equipment.codeGroup || '',
        resourceCode: equipment.resourceCode || '',
        description: equipment.description || '',
        status: equipment.status || 'available',
      });
      setImageFile(null);
      setRemoveExistingImage(false);
    } else {
      form.reset({
        name: '',
        category: '',
        codeGroup: '',
        resourceCode: '',
        description: '',
        status: 'available',
      });
      setImageFile(null);
      setRemoveExistingImage(false);
    }
    setError(null);
  }, [equipment, form, open]);

  const onSubmit = async (data) => {
    try {
      setIsSubmitting(true);
      setError(null);

      const formData = { ...data };
      if (removeExistingImage) {
        formData.removeImage = 'true';
      }

      if (equipment) {
        await uploadWithImage(`/equipment/${equipment.id}`, formData, imageFile, 'PUT');
      } else {
        await uploadWithImage('/equipment', formData, imageFile, 'POST');
      }

      onSuccess();
      form.reset();
      setImageFile(null);
      setRemoveExistingImage(false);
    } catch (err) {
      console.error('Error saving equipment:', err);
      setError(err.response?.data?.error || 'Failed to save equipment. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{equipment ? 'Edit Equipment' : 'Add New Equipment'}</DialogTitle>
          <DialogDescription>
            {equipment
              ? 'Update the equipment information below.'
              : 'Fill in the details to add new equipment.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {error && (
              <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-md text-sm">
                {error}
              </div>
            )}

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Laminar Flow Hood" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Sterilization Equipment" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="codeGroup"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category Code</FormLabel>
                    <FormControl>
                      <>
                        <Input
                          placeholder="e.g., STE"
                          list="equipment-code-groups"
                          {...field}
                          onChange={(e) => field.onChange(normalizeCodeInput(e.target.value))}
                        />
                        <datalist id="equipment-code-groups">
                          {codeGroupOptions.map((code) => (
                            <option key={code} value={code} />
                          ))}
                        </datalist>
                      </>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="resourceCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Equipment Code</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., AUT"
                        {...field}
                        onChange={(e) => field.onChange(normalizeCodeInput(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <textarea
                      placeholder="Detailed description of the equipment..."
                      className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Status</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="available">Available</SelectItem>
                      <SelectItem value="in-use">In Use</SelectItem>
                      <SelectItem value="maintenance">Maintenance</SelectItem>
                      <SelectItem value="unavailable">Unavailable</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div>
              <FormLabel>Image</FormLabel>
              <div className="mt-2">
                <ImageUpload
                  value={imageFile}
                  onChange={setImageFile}
                  existingImageUrl={removeExistingImage ? null : equipment?.imageUrl}
                  onRemoveExisting={() => setRemoveExistingImage(true)}
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Saving...' : equipment ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
