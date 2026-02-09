'use client';

import { useState, useRef, type DragEvent } from 'react';
import { ImagePlus, Trash2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { toast } from 'sonner';

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];
const MAX_SIZE = 5 * 1024 * 1024;

interface ImageUploadProps {
  imageUrl: string | null;
  onUpload: (file: File) => Promise<void>;
  onRemove: () => Promise<void>;
  uploading: boolean;
  className?: string;
}

export function ImageUpload({
  imageUrl,
  onUpload,
  onRemove,
  uploading,
  className,
}: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  function validateAndUpload(file: File) {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast.error('Please select an image file (PNG, JPG, WebP, GIF, or AVIF)');
      return;
    }
    if (file.size > MAX_SIZE) {
      toast.error('Image must be under 5MB');
      return;
    }
    onUpload(file);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) validateAndUpload(file);
    if (inputRef.current) inputRef.current.value = '';
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    if (!uploading) setIsDragging(true);
  }

  function handleDragLeave(e: DragEvent) {
    e.preventDefault();
    setIsDragging(false);
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    if (uploading) return;
    const file = e.dataTransfer.files?.[0];
    if (file) validateAndUpload(file);
  }

  function triggerInput() {
    if (!uploading) inputRef.current?.click();
  }

  return (
    <div className={cn('relative', className)}>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
        onChange={handleFileChange}
        className="hidden"
      />

      <div className="flex flex-row gap-4 items-start">
        {/* Thumbnail — fixed 56px square (~1/3 of original drop zone height) */}
        {imageUrl && (
          <div className="relative flex-shrink-0 h-44 w-44 group overflow-hidden rounded-lg border border-gray-200">
            <img
              src={imageUrl}
              alt="Upload preview"
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/0 transition-colors group-hover:bg-black/50">
              <button
                type="button"
                onClick={triggerInput}
                disabled={uploading}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-gray-700 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 hover:bg-gray-100"
              >
                <ImagePlus className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (!uploading) onRemove();
                }}
                disabled={uploading}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-red-600 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            {uploading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                <Loader2 className="h-6 w-6 animate-spin text-white" />
              </div>
            )}
          </div>
        )}

        {/* Drop zone */}
        <button
          type="button"
          onClick={triggerInput}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          disabled={uploading}
          className={cn(
            'flex min-w-0 flex-1 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-10 text-center transition-colors focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2',
            isDragging
              ? 'border-gray-900 bg-gray-100'
              : 'border-gray-300 bg-gray-50/50 hover:border-gray-400 hover:bg-gray-100/50',
            uploading && 'pointer-events-none opacity-60'
          )}
        >
          {uploading ? (
            <Loader2 className="h-12 w-12 animate-spin text-gray-400" />
          ) : (
            <ImagePlus className="h-12 w-12 text-gray-300" />
          )}
          <div>
            <p className="text-sm font-medium text-gray-600">
              {isDragging ? 'Drop image here' : imageUrl ? 'Replace image' : 'Click to upload or drag & drop'}
            </p>
            <p className="text-xs text-gray-400">PNG, JPG, WebP, GIF or AVIF up to 5MB</p>
          </div>
        </button>
      </div>
    </div>
  );
}
