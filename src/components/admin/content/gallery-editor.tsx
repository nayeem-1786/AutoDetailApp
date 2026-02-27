'use client';

import { useState } from 'react';
import { Plus, Trash2, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ImageUploadField } from '@/components/admin/image-upload-field';

// ---------------------------------------------------------------------------
// Gallery Editor — manages image gallery content blocks
// ---------------------------------------------------------------------------

export interface GalleryImage {
  id: string;
  image_url: string;
  caption: string;
  alt_text: string;
  sort_order: number;
}

export interface GalleryContent {
  images: GalleryImage[];
}

interface GalleryEditorProps {
  content: string;
  onChange: (value: string) => void;
}

function parseGalleryContent(raw: string): GalleryContent {
  try {
    const parsed = JSON.parse(raw);
    // Handle legacy format: plain array of images
    if (Array.isArray(parsed)) {
      return { images: parsed };
    }
    // New format: { images: [...] }
    if (typeof parsed === 'object' && parsed !== null && Array.isArray(parsed.images)) {
      return parsed;
    }
  } catch {
    // empty
  }
  return { images: [] };
}

function serializeGalleryContent(data: GalleryContent): string {
  return JSON.stringify(data);
}

export function GalleryEditor({ content, onChange }: GalleryEditorProps) {
  const data = parseGalleryContent(content);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const updateData = (updater: (prev: GalleryContent) => GalleryContent) => {
    const current = parseGalleryContent(content);
    const next = updater(current);
    onChange(serializeGalleryContent(next));
  };

  // -------------------------------------------------------------------------
  // CRUD
  // -------------------------------------------------------------------------

  const handleAddImage = () => {
    const newImage: GalleryImage = {
      id: crypto.randomUUID(),
      image_url: '',
      caption: '',
      alt_text: '',
      sort_order: data.images.length,
    };
    updateData((prev) => ({
      images: [...prev.images, newImage],
    }));
  };

  const handleDeleteImage = (id: string) => {
    if (!confirm('Remove this image?')) return;
    updateData((prev) => ({
      images: prev.images
        .filter((img) => img.id !== id)
        .map((img, i) => ({ ...img, sort_order: i })),
    }));
  };

  const handleUpdateImage = (id: string, updates: Partial<GalleryImage>) => {
    updateData((prev) => ({
      images: prev.images.map((img) =>
        img.id === id ? { ...img, ...updates } : img
      ),
    }));
  };

  // -------------------------------------------------------------------------
  // Drag & Drop
  // -------------------------------------------------------------------------

  const handleDragStart = (idx: number) => {
    setDragIdx(idx);
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) return;

    updateData((prev) => {
      const reordered = [...prev.images];
      const [moved] = reordered.splice(dragIdx, 1);
      reordered.splice(idx, 0, moved);
      return {
        images: reordered.map((img, i) => ({ ...img, sort_order: i })),
      };
    });
    setDragIdx(idx);
  };

  const handleDragEnd = () => {
    setDragIdx(null);
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          {data.images.length} Image{data.images.length !== 1 ? 's' : ''}
        </label>
      </div>

      {data.images.length === 0 && (
        <div className="rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 p-6 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
            No images yet. Add images to create a photo gallery.
          </p>
          <Button type="button" variant="outline" size="sm" onClick={handleAddImage}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add Image
          </Button>
        </div>
      )}

      {data.images.length > 0 && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            {data.images.map((image, idx) => (
              <div
                key={image.id}
                draggable
                onDragStart={() => handleDragStart(idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDragEnd={handleDragEnd}
                className={`rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 space-y-3 ${
                  dragIdx === idx ? 'opacity-50' : ''
                }`}
              >
                {/* Header: drag handle + delete */}
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    className="cursor-grab text-gray-300 hover:text-gray-500 dark:text-gray-600 dark:hover:text-gray-400"
                  >
                    <GripVertical className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteImage(image.id)}
                    className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                    title="Remove image"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Image Upload */}
                <ImageUploadField
                  value={image.image_url}
                  onChange={(url) => handleUpdateImage(image.id, { image_url: url })}
                  folder="gallery"
                  placeholder="Drop image or click to upload"
                />

                {/* Caption */}
                <input
                  type="text"
                  value={image.caption}
                  onChange={(e) =>
                    handleUpdateImage(image.id, { caption: e.target.value })
                  }
                  placeholder="Add a caption..."
                  className="block w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
                />

                {/* Alt Text */}
                <input
                  type="text"
                  value={image.alt_text}
                  onChange={(e) =>
                    handleUpdateImage(image.id, { alt_text: e.target.value })
                  }
                  placeholder="Describe this image for accessibility..."
                  className="block w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
                />
              </div>
            ))}
          </div>

          <Button type="button" variant="outline" size="sm" onClick={handleAddImage}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add Image
          </Button>
        </>
      )}
    </div>
  );
}
