'use client';

import { useState, useRef, useCallback, type DragEvent } from 'react';
import { ImagePlus, Trash2, Loader2, Star, Replace, GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { toast } from 'sonner';
import type { ProductImage } from '@/lib/supabase/types';

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];
const MAX_SIZE = 5 * 1024 * 1024;
const MAX_IMAGES = 6;

interface MultiImageUploadProps {
  images: ProductImage[];
  onUpload: (file: File) => Promise<void>;
  onRemove: (image: ProductImage) => Promise<void>;
  onReplace: (image: ProductImage, file: File) => Promise<void>;
  onSetPrimary: (image: ProductImage) => Promise<void>;
  onReorder: (reorderedImages: ProductImage[]) => Promise<void>;
  disabled?: boolean;
}

export function MultiImageUpload({
  images,
  onUpload,
  onRemove,
  onReplace,
  onSetPrimary,
  onReorder,
  disabled = false,
}: MultiImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const [isAddDragging, setIsAddDragging] = useState(false);
  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null); // image id or 'new'
  const [replacingImage, setReplacingImage] = useState<ProductImage | null>(null);

  // Drag-to-reorder state
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const sorted = [...images].sort((a, b) => a.sort_order - b.sort_order);
  const canAddMore = sorted.length < MAX_IMAGES;

  function validateFile(file: File): boolean {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast.error('Please select an image file (PNG, JPG, WebP, GIF, or AVIF)');
      return false;
    }
    if (file.size > MAX_SIZE) {
      toast.error('Image must be under 5MB');
      return false;
    }
    return true;
  }

  // --- Add new image ---
  const handleAddFile = useCallback(async (file: File) => {
    if (!validateFile(file)) return;
    setUploadingSlot('new');
    try {
      await onUpload(file);
    } finally {
      setUploadingSlot(null);
    }
  }, [onUpload]);

  function handleAddInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleAddFile(file);
    if (inputRef.current) inputRef.current.value = '';
  }

  function handleAddDrop(e: DragEvent) {
    e.preventDefault();
    setIsAddDragging(false);
    if (disabled || !canAddMore) return;
    const file = e.dataTransfer.files?.[0];
    if (file) handleAddFile(file);
  }

  // --- Replace image ---
  function triggerReplace(image: ProductImage) {
    setReplacingImage(image);
    setTimeout(() => replaceInputRef.current?.click(), 0);
  }

  async function handleReplaceInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file && replacingImage && validateFile(file)) {
      setUploadingSlot(replacingImage.id);
      try {
        await onReplace(replacingImage, file);
      } finally {
        setUploadingSlot(null);
      }
    }
    if (replaceInputRef.current) replaceInputRef.current.value = '';
    setReplacingImage(null);
  }

  // --- Remove image ---
  async function handleRemove(image: ProductImage) {
    setUploadingSlot(image.id);
    try {
      await onRemove(image);
    } finally {
      setUploadingSlot(null);
    }
  }

  // --- Set primary ---
  async function handleSetPrimary(image: ProductImage) {
    if (image.is_primary) return;
    await onSetPrimary(image);
  }

  // --- Drag-to-reorder ---
  function handleReorderDragStart(e: DragEvent, index: number) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
    setDraggedIndex(index);
  }

  function handleReorderDragOver(e: DragEvent, index: number) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  }

  function handleReorderDragLeave() {
    setDragOverIndex(null);
  }

  function handleReorderDrop(e: DragEvent, dropIndex: number) {
    e.preventDefault();
    setDragOverIndex(null);
    setDraggedIndex(null);

    const fromIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
    if (isNaN(fromIndex) || fromIndex === dropIndex) return;

    const reordered = [...sorted];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(dropIndex, 0, moved);

    // Reassign sort_order
    const updated = reordered.map((img, i) => ({ ...img, sort_order: i }));
    onReorder(updated);
  }

  function handleReorderDragEnd() {
    setDraggedIndex(null);
    setDragOverIndex(null);
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
        onChange={handleAddInputChange}
        className="hidden"
      />
      <input
        ref={replaceInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
        onChange={handleReplaceInputChange}
        className="hidden"
      />

      <div className="flex flex-wrap gap-3">
        {/* Existing images */}
        {sorted.map((image, index) => {
          const isLoading = uploadingSlot === image.id;
          return (
            <div
              key={image.id}
              draggable={!disabled && !isLoading && sorted.length > 1}
              onDragStart={(e) => handleReorderDragStart(e, index)}
              onDragOver={(e) => handleReorderDragOver(e, index)}
              onDragLeave={handleReorderDragLeave}
              onDrop={(e) => handleReorderDrop(e, index)}
              onDragEnd={handleReorderDragEnd}
              className={cn(
                'relative h-44 w-44 flex-shrink-0 group overflow-hidden rounded-lg border border-gray-200 transition-all',
                draggedIndex === index && 'opacity-40',
                dragOverIndex === index && draggedIndex !== index && 'ring-2 ring-blue-500 ring-offset-1',
                !disabled && sorted.length > 1 && 'cursor-grab active:cursor-grabbing'
              )}
            >
              <img
                src={image.image_url}
                alt={`Product image ${index + 1}`}
                className="h-full w-full object-cover"
                draggable={false}
              />

              {/* Primary badge */}
              {image.is_primary && (
                <div className="absolute left-1.5 top-1.5 flex items-center gap-0.5 rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-semibold text-white shadow-sm">
                  <Star className="h-2.5 w-2.5 fill-current" />
                  Primary
                </div>
              )}

              {/* Drag handle indicator */}
              {sorted.length > 1 && !isLoading && (
                <div className="absolute right-1.5 top-1.5 flex items-center rounded bg-black/40 px-0.5 py-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100">
                  <GripVertical className="h-3.5 w-3.5" />
                </div>
              )}

              {/* Hover overlay with actions */}
              {!isLoading && (
                <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/0 transition-colors group-hover:bg-black/50">
                  {/* Set Primary */}
                  {!image.is_primary && (
                    <button
                      type="button"
                      onClick={() => handleSetPrimary(image)}
                      disabled={disabled}
                      title="Set as primary"
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-amber-600 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 hover:bg-amber-50"
                    >
                      <Star className="h-4 w-4" />
                    </button>
                  )}
                  {/* Replace */}
                  <button
                    type="button"
                    onClick={() => triggerReplace(image)}
                    disabled={disabled}
                    title="Replace image"
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-gray-700 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 hover:bg-gray-100"
                  >
                    <Replace className="h-4 w-4" />
                  </button>
                  {/* Remove */}
                  <button
                    type="button"
                    onClick={() => handleRemove(image)}
                    disabled={disabled}
                    title="Remove image"
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-red-600 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              )}

              {/* Loading overlay */}
              {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                  <Loader2 className="h-6 w-6 animate-spin text-white" />
                </div>
              )}
            </div>
          );
        })}

        {/* Add slot */}
        {canAddMore && (
          <button
            type="button"
            onClick={() => !disabled && inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              if (!disabled) setIsAddDragging(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setIsAddDragging(false);
            }}
            onDrop={handleAddDrop}
            disabled={disabled || uploadingSlot === 'new'}
            className={cn(
              'flex h-44 w-44 flex-shrink-0 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed transition-colors focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2',
              isAddDragging
                ? 'border-gray-900 bg-gray-100'
                : 'border-gray-300 bg-gray-50/50 hover:border-gray-400 hover:bg-gray-100/50',
              (disabled || uploadingSlot === 'new') && 'pointer-events-none opacity-60'
            )}
          >
            {uploadingSlot === 'new' ? (
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            ) : (
              <ImagePlus className="h-8 w-8 text-gray-300" />
            )}
            <p className="text-xs text-gray-400">
              {isAddDragging ? 'Drop here' : 'Add image'}
            </p>
          </button>
        )}
      </div>

      {/* Helper text */}
      <p className="mt-2 text-xs text-gray-400">
        {sorted.length}/{MAX_IMAGES} images. PNG, JPG, WebP, GIF or AVIF up to 5MB.
        {sorted.length > 1 && ' Drag to reorder.'}
      </p>
    </div>
  );
}
