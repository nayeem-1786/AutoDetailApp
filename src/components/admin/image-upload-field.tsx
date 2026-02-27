'use client';

import { useState, useRef, useCallback, type DragEvent } from 'react';
import { ImagePlus, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { adminFetch } from '@/lib/utils/admin-fetch';

// ---------------------------------------------------------------------------
// ImageUploadField — single-image upload component for form fields
// ---------------------------------------------------------------------------

interface ImageUploadFieldProps {
  value: string;
  onChange: (url: string) => void;
  label?: string;
  placeholder?: string;
  error?: string;
  folder?: string;
  className?: string;
}

const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/svg+xml',
  'image/gif',
  'image/avif',
];

const MAX_SIZE = 5 * 1024 * 1024; // 5MB

function getFilename(url: string): string {
  try {
    const parts = url.split('/');
    const filename = parts[parts.length - 1];
    // Strip timestamp-random prefix: "1234567890-abc123.jpg" → "abc123.jpg"
    return filename.replace(/^\d+-/, '');
  } catch {
    return 'image';
  }
}

export function ImageUploadField({
  value,
  onChange,
  label,
  placeholder,
  error,
  folder = 'general',
  className,
}: ImageUploadFieldProps) {
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const displayError = error || uploadError;

  const uploadFile = useCallback(
    async (file: File) => {
      setUploadError(null);

      if (!ALLOWED_TYPES.includes(file.type)) {
        setUploadError('Only JPEG, PNG, WebP, SVG, GIF, and AVIF files are supported');
        return;
      }
      if (file.size > MAX_SIZE) {
        setUploadError('File must be under 5MB');
        return;
      }

      setUploading(true);
      try {
        const formData = new FormData();
        formData.append('file', file);

        const res = await adminFetch(
          `/api/admin/upload/content-image?folder=${folder}`,
          { method: 'POST', body: formData }
        );

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Upload failed');
        }

        const data = await res.json();
        onChange(data.url);
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : 'Upload failed');
      } finally {
        setUploading(false);
      }
    },
    [folder, onChange]
  );

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) uploadFile(file);
    },
    [uploadFile]
  );

  const handleRemove = () => {
    onChange('');
    setUploadError(null);
  };

  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {label}
        </label>
      )}

      {value ? (
        /* Preview state */
        <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value}
            alt="Preview"
            className="h-16 w-auto max-w-[200px] rounded object-contain"
          />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-600 truncate" title={value}>
              {getFilename(value)}
            </p>
          </div>
          <button
            type="button"
            onClick={handleRemove}
            className="flex-shrink-0 rounded-md p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
            title="Remove image"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        /* Upload zone */
        <div>
          <input
            ref={inputRef}
            type="file"
            accept={ALLOWED_TYPES.join(',')}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) uploadFile(file);
              if (inputRef.current) inputRef.current.value = '';
            }}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setIsDragging(false);
            }}
            onDrop={handleDrop}
            disabled={uploading}
            className={cn(
              'flex w-full cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed p-6 transition-colors',
              isDragging
                ? 'border-brand-500 bg-brand-50'
                : 'border-gray-300 hover:border-gray-400',
              displayError && 'border-red-400'
            )}
          >
            {uploading ? (
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            ) : (
              <ImagePlus className="h-6 w-6 text-gray-400" />
            )}
            <p className="text-xs text-gray-500">
              {uploading
                ? 'Uploading...'
                : placeholder || 'Drop image here or click to browse'}
            </p>
            <p className="text-[10px] text-gray-400">
              JPEG, PNG, WebP, SVG, GIF, AVIF &middot; Max 5MB
            </p>
          </button>
        </div>
      )}

      {displayError && (
        <p className="text-xs text-red-500">{displayError}</p>
      )}
    </div>
  );
}
