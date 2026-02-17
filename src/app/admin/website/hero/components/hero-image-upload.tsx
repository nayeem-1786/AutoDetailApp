'use client';

import { useState, useRef, useCallback, type DragEvent } from 'react';
import { ImagePlus, Trash2, Loader2, Upload } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_WIDTH = 2560;
const RESIZE_QUALITY = 0.85;
const BUCKET = 'cms-assets';

interface HeroImageUploadProps {
  /** Current image URL (if any) */
  imageUrl: string | null;
  /** Slide ID — used for storage path */
  slideId: string;
  /** Storage path prefix, e.g. "hero-slides" */
  pathPrefix?: string;
  /** Called with the new public URL after upload or null after removal */
  onChange: (url: string | null) => void;
  /** Label shown above the upload area */
  label: string;
  /** Whether to show landscape (16:9) or square aspect ratio */
  aspect?: 'landscape' | 'square';
  disabled?: boolean;
}

/**
 * Resizes an image client-side if it exceeds MAX_WIDTH.
 * Returns the original file if already within bounds.
 */
async function resizeImage(file: File): Promise<File> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      if (img.width <= MAX_WIDTH) {
        URL.revokeObjectURL(img.src);
        resolve(file);
        return;
      }

      const scale = MAX_WIDTH / img.width;
      const canvas = document.createElement('canvas');
      canvas.width = MAX_WIDTH;
      canvas.height = Math.round(img.height * scale);

      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      const mimeType = file.type === 'image/png' ? 'image/png' : 'image/webp';
      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(img.src);
          if (!blob) {
            resolve(file);
            return;
          }
          const ext = mimeType === 'image/png' ? '.png' : '.webp';
          resolve(new File([blob], file.name.replace(/\.[^.]+$/, ext), { type: mimeType }));
        },
        mimeType,
        RESIZE_QUALITY
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      resolve(file);
    };
    img.src = URL.createObjectURL(file);
  });
}

/**
 * Extracts the storage path from a Supabase public URL.
 * e.g., "https://xxx.supabase.co/storage/v1/object/public/cms-assets/hero-slides/abc/123.jpg"
 * → "hero-slides/abc/123.jpg"
 */
function extractStoragePath(url: string): string | null {
  const match = url.match(/cms-assets\/(.+)/);
  return match ? match[1] : null;
}

export function HeroImageUpload({
  imageUrl,
  slideId,
  pathPrefix = 'hero-slides',
  onChange,
  label,
  aspect = 'landscape',
  disabled = false,
}: HeroImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);

  const validateFile = useCallback((file: File): boolean => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast.error('Please select a JPEG, PNG, or WebP image');
      return false;
    }
    if (file.size > MAX_SIZE) {
      toast.error('Image must be under 10MB');
      return false;
    }
    return true;
  }, []);

  const uploadFile = useCallback(async (file: File) => {
    if (!validateFile(file)) return;

    setUploading(true);
    try {
      // Resize if needed
      const resized = await resizeImage(file);

      const ext = resized.name.split('.').pop() || 'jpg';
      const path = `${pathPrefix}/${slideId}/${Date.now()}.${ext}`;

      const supabase = createClient();

      // Delete old image if replacing
      if (imageUrl) {
        const oldPath = extractStoragePath(imageUrl);
        if (oldPath) {
          await supabase.storage.from(BUCKET).remove([oldPath]);
        }
      }

      // Upload new image
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, resized, { upsert: true });

      if (error) {
        console.error('Upload error:', error);
        toast.error('Failed to upload image');
        return;
      }

      const { data: urlData } = supabase.storage
        .from(BUCKET)
        .getPublicUrl(path);

      onChange(urlData.publicUrl);
    } catch (err) {
      console.error('Upload error:', err);
      toast.error('Failed to upload image');
    } finally {
      setUploading(false);
    }
  }, [validateFile, pathPrefix, slideId, imageUrl, onChange]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
    if (inputRef.current) inputRef.current.value = '';
  }, [uploadFile]);

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled || uploading) return;
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  }, [disabled, uploading, uploadFile]);

  const handleRemove = useCallback(async () => {
    if (!imageUrl) return;

    setUploading(true);
    try {
      const path = extractStoragePath(imageUrl);
      if (path) {
        const supabase = createClient();
        await supabase.storage.from(BUCKET).remove([path]);
      }
      onChange(null);
    } catch (err) {
      console.error('Remove error:', err);
      toast.error('Failed to remove image');
    } finally {
      setUploading(false);
    }
  }, [imageUrl, onChange]);

  const aspectClass = aspect === 'landscape'
    ? 'aspect-[16/9] max-h-64'
    : 'aspect-square max-h-48';

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        {label}
      </label>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleInputChange}
        className="hidden"
      />

      {imageUrl ? (
        /* Preview with replace/remove actions */
        <div className={cn('relative w-full rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden bg-gray-100 dark:bg-gray-700 group', aspectClass)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt={label}
            className="h-full w-full object-cover"
          />

          {/* Hover overlay */}
          {!uploading && (
            <div className="absolute inset-0 flex items-center justify-center gap-3 bg-black/0 transition-colors group-hover:bg-black/50">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={disabled}
                className="flex items-center gap-2 rounded-lg bg-white/90 px-3 py-2 text-sm font-medium text-gray-700 opacity-0 shadow transition-opacity group-hover:opacity-100 hover:bg-white"
              >
                <Upload className="h-4 w-4" />
                Replace
              </button>
              <button
                type="button"
                onClick={handleRemove}
                disabled={disabled}
                className="flex items-center gap-2 rounded-lg bg-white/90 px-3 py-2 text-sm font-medium text-red-600 opacity-0 shadow transition-opacity group-hover:opacity-100 hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4" />
                Remove
              </button>
            </div>
          )}

          {/* Loading overlay */}
          {uploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
              <Loader2 className="h-8 w-8 animate-spin text-white" />
            </div>
          )}
        </div>
      ) : (
        /* Drop zone */
        <button
          type="button"
          onClick={() => !disabled && !uploading && inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            if (!disabled && !uploading) setIsDragging(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setIsDragging(false);
          }}
          onDrop={handleDrop}
          disabled={disabled || uploading}
          className={cn(
            'flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed transition-colors focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2',
            aspectClass,
            isDragging
              ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20'
              : 'border-gray-300 dark:border-gray-600 bg-gray-50/50 dark:bg-gray-800 hover:border-gray-400 hover:bg-gray-100/50 dark:hover:border-gray-500 dark:hover:bg-gray-700/50',
            (disabled || uploading) && 'pointer-events-none opacity-60'
          )}
        >
          {uploading ? (
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          ) : (
            <ImagePlus className="h-8 w-8 text-gray-300 dark:text-gray-500" />
          )}
          <p className="text-xs text-gray-400 dark:text-gray-500">
            {isDragging ? 'Drop image here' : uploading ? 'Uploading...' : 'Click or drag to upload'}
          </p>
          <p className="text-[10px] text-gray-300 dark:text-gray-600">
            JPEG, PNG, or WebP. Max 10MB.
          </p>
        </button>
      )}
    </div>
  );
}
