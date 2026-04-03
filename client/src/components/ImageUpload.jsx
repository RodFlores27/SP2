import { useState, useRef } from 'react';
import { Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ImageUpload({ value, onChange, existingImageUrl, onRemoveExisting }) {
  const [preview, setPreview] = useState(existingImageUrl || null);
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      onChange(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemove = () => {
    onChange(null);
    setPreview(existingImageUrl || null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemoveExisting = () => {
    setPreview(null);
    onChange(null);
    if (onRemoveExisting) {
      onRemoveExisting();
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <label
          htmlFor="image-upload"
          className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
        >
          <Upload className="h-4 w-4" />
          Choose Image
        </label>
        <input
          ref={fileInputRef}
          id="image-upload"
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
        />
        {value && (
          <Button type="button" variant="outline" size="sm" onClick={handleRemove}>
            <X className="h-4 w-4 mr-1" />
            Remove New
          </Button>
        )}
        {!value && preview && existingImageUrl && (
          <Button type="button" variant="destructive" size="sm" onClick={handleRemoveExisting}>
            <X className="h-4 w-4 mr-1" />
            Remove Image
          </Button>
        )}
      </div>
      {preview && (
        <div className="relative w-full max-w-xs">
          <img
            src={preview}
            alt="Preview"
            className="w-full h-48 object-cover rounded-md border border-border"
          />
        </div>
      )}
    </div>
  );
}
