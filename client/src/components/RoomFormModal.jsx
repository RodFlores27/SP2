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

const roomSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().min(1, 'Description is required'),
  location: z.string().min(1, 'Location is required'),
  zone: z.string().max(64, 'Zone is too long').optional(),
  ppe: z.string().max(500, 'PPE notes are too long').optional(),
  resourceCode: z.string().min(2, 'Room code is required').max(64, 'Room code is too long').regex(/^[A-Za-z0-9-]+$/, 'Use letters, numbers, and hyphen only'),
  capacity: z.string().min(1, 'Capacity is required').refine((val) => !isNaN(Number(val)) && Number(val) > 0, {
    message: 'Capacity must be a positive number',
  }),
  status: z.enum(['available', 'in-use', 'maintenance', 'unavailable']),
});

const normalizeRoomCodeInput = (value) => value.toUpperCase().replace(/[^A-Z0-9-]/g, '');

export function RoomFormModal({ open, onOpenChange, room, onSuccess }) {
  const [imageFile, setImageFile] = useState(null);
  const [removeExistingImage, setRemoveExistingImage] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const form = useForm({
    resolver: zodResolver(roomSchema),
    defaultValues: {
      name: '',
      description: '',
      location: '',
      zone: '',
      ppe: '',
      resourceCode: '',
      capacity: '',
      status: 'available',
    },
  });

  useEffect(() => {
    if (room) {
      form.reset({
        name: room.name || '',
        description: room.description || '',
        location: room.location || '',
        zone: room.zone || '',
        ppe: room.ppe || '',
        resourceCode: room.resourceCode || '',
        capacity: room.capacity?.toString() || '',
        status: room.status || 'available',
      });
      setImageFile(null);
      setRemoveExistingImage(false);
    } else {
      form.reset({
        name: '',
        description: '',
        location: '',
        zone: '',
        ppe: '',
        resourceCode: '',
        capacity: '',
        status: 'available',
      });
      setImageFile(null);
      setRemoveExistingImage(false);
    }
    setError(null);
  }, [room, form, open]);

  const onSubmit = async (data) => {
    try {
      setIsSubmitting(true);
      setError(null);

      const formData = { ...data };
      if (removeExistingImage) {
        formData.removeImage = 'true';
      }

      if (room) {
        await uploadWithImage(`/rooms/${room.id}`, formData, imageFile, 'PUT');
      } else {
        await uploadWithImage('/rooms', formData, imageFile, 'POST');
      }

      onSuccess();
      form.reset();
      setImageFile(null);
      setRemoveExistingImage(false);
    } catch (err) {
      console.error('Error saving room:', err);
      setError(err.response?.data?.error || 'Failed to save room. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{room ? 'Edit Room' : 'Add New Room'}</DialogTitle>
          <DialogDescription>
            {room
              ? 'Update the room information below.'
              : 'Fill in the details to add a new room.'}
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
                    <Input placeholder="e.g., Culture Room A" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="location"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Location</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Building 2, 2nd Floor" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="resourceCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Room Code</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., PTCF-2-CR-M2-RA"
                        {...field}
                        onChange={(e) => field.onChange(normalizeRoomCodeInput(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="zone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Zone</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Red" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="ppe"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Required PPE</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Lab coat, gloves, mask" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="capacity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Capacity</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="e.g., 8" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <textarea
                      placeholder="Detailed description of the room..."
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
                  existingImageUrl={removeExistingImage ? null : room?.imageUrl}
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
                {isSubmitting ? 'Saving...' : room ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
