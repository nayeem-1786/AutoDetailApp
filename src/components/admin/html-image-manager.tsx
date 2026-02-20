'use client';

import { useState, useRef, useCallback, useEffect, type DragEvent } from 'react';
import { ImagePlus, Loader2, Trash2, Link2, Search } from 'lucide-react';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogContent,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { adminFetch } from '@/lib/utils/admin-fetch';
import { toast } from 'sonner';

// ---------------------------------------------------------------------------
// HtmlImageManager — Upload, browse, resize, and insert images into HTML
// ---------------------------------------------------------------------------

interface HtmlImageManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInsert: (html: string) => void;
  folder?: string;
}

interface UploadedImage {
  url: string;
  filename: string;
  size: number;
  created_at?: string;
}

const SIZE_PRESETS = [
  { label: 'Thumb', value: 80 },
  { label: 'Small', value: 150 },
  { label: 'Medium', value: 250 },
  { label: 'Large', value: 400 },
  { label: 'Full', value: 0 },
] as const;

export function HtmlImageManager({
  open,
  onOpenChange,
  onInsert,
  folder = 'general',
}: HtmlImageManagerProps) {
  const [tab, setTab] = useState<'upload' | 'browse'>('upload');
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [loadingImages, setLoadingImages] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Selected image state
  const [selectedImage, setSelectedImage] = useState<UploadedImage | null>(null);
  const [width, setWidth] = useState(250);
  const [isFullWidth, setIsFullWidth] = useState(false);
  const [alignment, setAlignment] = useState<'left' | 'center' | 'right'>('center');
  const [rounded, setRounded] = useState(false);
  const [bordered, setBordered] = useState(false);
  const [altText, setAltText] = useState('');

  const inputRef = useRef<HTMLInputElement>(null);

  const loadImages = useCallback(async () => {
    setLoadingImages(true);
    try {
      const res = await adminFetch(
        `/api/admin/upload/content-image?folder=${folder}`
      );
      if (res.ok) {
        const data = await res.json();
        setImages(data.images || []);
      }
    } catch {
      // Ignore
    } finally {
      setLoadingImages(false);
    }
  }, [folder]);

  useEffect(() => {
    if (open && tab === 'browse') {
      loadImages();
    }
  }, [open, tab, loadImages]);

  const uploadFile = useCallback(
    async (file: File) => {
      const allowedTypes = [
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/svg+xml',
        'image/gif',
      ];
      if (!allowedTypes.includes(file.type)) {
        toast.error('Only JPEG, PNG, WebP, SVG, and GIF files are supported');
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        toast.error('File must be under 5MB');
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
        const img: UploadedImage = {
          url: data.url,
          filename: data.filename,
          size: data.size,
        };
        setSelectedImage(img);
        setAltText('');
        setWidth(250);
        setIsFullWidth(false);
        setImages((prev) => [img, ...prev]);
        toast.success('Image uploaded');
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : 'Upload failed'
        );
      } finally {
        setUploading(false);
      }
    },
    [folder]
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

  const handleDeleteImage = async () => {
    if (!selectedImage) return;
    try {
      const res = await adminFetch('/api/admin/upload/content-image', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: selectedImage.url }),
      });
      if (res.ok) {
        setImages((prev) =>
          prev.filter((i) => i.url !== selectedImage.url)
        );
        setSelectedImage(null);
        toast.success('Image deleted');
      }
    } catch {
      toast.error('Failed to delete image');
    }
  };

  const handleInsert = () => {
    if (!selectedImage) return;

    const styles: string[] = ['max-width:100%', 'height:auto'];
    if (rounded) styles.push('border-radius:8px');
    if (bordered) styles.push('border:1px solid var(--site-border-medium)');

    let imgTag: string;

    if (isFullWidth) {
      styles.unshift('width:100%');
      imgTag = `<img src="${selectedImage.url}" alt="${altText}" style="${styles.join(';')};" />`;
    } else {
      imgTag = `<img src="${selectedImage.url}" alt="${altText}" width="${width}" style="${styles.join(';')};" />`;
    }

    let html: string;
    if (alignment === 'center') {
      html = `<div style="text-align:center;">\n  ${imgTag}\n</div>`;
    } else if (alignment === 'right') {
      html = `<div style="text-align:right;">\n  ${imgTag}\n</div>`;
    } else {
      html = imgTag;
    }

    onInsert('\n' + html + '\n');
    onOpenChange(false);
    setSelectedImage(null);
  };

  const filteredImages = searchQuery
    ? images.filter((i) =>
        i.filename.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : images;

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogClose onClose={() => onOpenChange(false)} />
      <DialogHeader>
        <DialogTitle>Image</DialogTitle>
      </DialogHeader>
      <DialogContent className="space-y-4">
        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-700">
          <button
            type="button"
            onClick={() => setTab('upload')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === 'upload'
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Upload
          </button>
          <button
            type="button"
            onClick={() => setTab('browse')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === 'browse'
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Browse Library
          </button>
        </div>

        {/* Upload tab */}
        {tab === 'upload' && !selectedImage && (
          <div>
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/svg+xml,image/gif"
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
              className={`flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 transition-colors ${
                isDragging
                  ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20'
                  : 'border-gray-300 dark:border-gray-600 hover:border-gray-400'
              }`}
            >
              {uploading ? (
                <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
              ) : (
                <ImagePlus className="h-8 w-8 text-gray-400" />
              )}
              <p className="text-sm text-gray-500">
                {uploading
                  ? 'Uploading...'
                  : 'Drop image here or click to browse'}
              </p>
              <p className="text-xs text-gray-400">
                JPEG, PNG, WebP, SVG, GIF &middot; Max 5MB
              </p>
            </button>
          </div>
        )}

        {/* Browse tab */}
        {tab === 'browse' && !selectedImage && (
          <div>
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by filename..."
                className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            {loadingImages ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              </div>
            ) : filteredImages.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">
                {images.length === 0
                  ? 'No images uploaded yet'
                  : 'No matching images'}
              </p>
            ) : (
              <div className="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto">
                {filteredImages.map((img) => (
                  <button
                    key={img.url}
                    type="button"
                    onClick={() => {
                      setSelectedImage(img);
                      setAltText('');
                      setWidth(250);
                      setIsFullWidth(false);
                    }}
                    className="group relative aspect-square rounded-md border border-gray-200 dark:border-gray-700 overflow-hidden hover:ring-2 hover:ring-brand-500"
                    title={`${img.filename}\n${formatSize(img.size)}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img.url}
                      alt={img.filename}
                      className="h-full w-full object-cover"
                    />
                    <div className="absolute inset-x-0 bottom-0 bg-black/60 px-1 py-0.5 text-[10px] text-white truncate opacity-0 group-hover:opacity-100 transition-opacity">
                      {formatSize(img.size)}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Resize controls — shown after upload or selection */}
        {selectedImage && (
          <div className="space-y-4">
            {/* Preview */}
            <div className="flex justify-center rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={selectedImage.url}
                alt="Preview"
                className="max-h-32 object-contain rounded"
              />
            </div>

            {/* Size */}
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Size
              </label>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">Width:</span>
                  <input
                    type="number"
                    value={isFullWidth ? '' : width}
                    onChange={(e) => {
                      setIsFullWidth(false);
                      setWidth(parseInt(e.target.value) || 100);
                    }}
                    disabled={isFullWidth}
                    className="w-20 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-sm"
                    placeholder="auto"
                  />
                  <span className="text-xs text-gray-500">px</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {SIZE_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      if (preset.value === 0) {
                        setIsFullWidth(true);
                      } else {
                        setIsFullWidth(false);
                        setWidth(preset.value);
                      }
                    }}
                    className={`px-2 py-1 text-xs rounded border transition-colors ${
                      (preset.value === 0 && isFullWidth) ||
                      (preset.value !== 0 &&
                        !isFullWidth &&
                        width === preset.value)
                        ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400'
                        : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                  >
                    {preset.label}
                    {preset.value > 0 && ` ${preset.value}`}
                  </button>
                ))}
              </div>
            </div>

            {/* Alignment */}
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Alignment
              </label>
              <div className="flex gap-2">
                {(['left', 'center', 'right'] as const).map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setAlignment(a)}
                    className={`px-3 py-1 text-xs rounded border capitalize transition-colors ${
                      alignment === a
                        ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400'
                        : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>

            {/* Options */}
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                <input
                  type="checkbox"
                  checked={rounded}
                  onChange={(e) => setRounded(e.target.checked)}
                  className="rounded border-gray-300"
                />
                Rounded corners
              </label>
              <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                <input
                  type="checkbox"
                  checked={bordered}
                  onChange={(e) => setBordered(e.target.checked)}
                  className="rounded border-gray-300"
                />
                Border
              </label>
            </div>

            {/* Alt text */}
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Alt text
              </label>
              <input
                type="text"
                value={altText}
                onChange={(e) => setAltText(e.target.value)}
                placeholder="Describe the image..."
                className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1">
                Recommended for accessibility and SEO
              </p>
            </div>
          </div>
        )}
      </DialogContent>
      <DialogFooter>
        {selectedImage ? (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDeleteImage}
              className="mr-auto text-red-600 hover:text-red-700"
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" />
              Delete from library
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSelectedImage(null)}
            >
              Back
            </Button>
            <Button type="button" size="sm" onClick={handleInsert}>
              Insert Image
            </Button>
          </>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
        )}
      </DialogFooter>
    </Dialog>
  );
}
