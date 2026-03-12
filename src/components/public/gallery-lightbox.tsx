'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

// ---------------------------------------------------------------------------
// GalleryLightbox — responsive photo grid with fullscreen lightbox
// ---------------------------------------------------------------------------

interface GalleryImage {
  id: string;
  image_url: string;
  caption: string;
  alt_text: string;
  sort_order: number;
}

interface GalleryLightboxProps {
  images: GalleryImage[];
}

export function GalleryLightbox({ images }: GalleryLightboxProps) {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  const handleClose = useCallback(() => {
    setSelectedIdx(null);
  }, []);

  const handlePrev = useCallback(() => {
    setSelectedIdx((prev) =>
      prev === null ? null : prev === 0 ? images.length - 1 : prev - 1
    );
  }, [images.length]);

  const handleNext = useCallback(() => {
    setSelectedIdx((prev) =>
      prev === null ? null : prev === images.length - 1 ? 0 : prev + 1
    );
  }, [images.length]);

  // Keyboard navigation
  useEffect(() => {
    if (selectedIdx === null) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          handleClose();
          break;
        case 'ArrowLeft':
          handlePrev();
          break;
        case 'ArrowRight':
          handleNext();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    // Prevent body scroll while lightbox is open
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [selectedIdx, handleClose, handlePrev, handleNext]);

  const selectedImage = selectedIdx !== null ? images[selectedIdx] : null;

  return (
    <>
      {/* Photo Grid */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {images.map((image, idx) => (
          <button
            key={image.id}
            type="button"
            onClick={() => setSelectedIdx(idx)}
            className="group relative aspect-[4/3] overflow-hidden rounded-xl border border-site-border bg-brand-surface cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent-ui focus:ring-offset-2 focus:ring-offset-brand-dark"
          >
            <img
              src={image.image_url}
              alt={image.alt_text || image.caption || 'Gallery image'}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              loading="lazy"
            />
            {image.caption && (
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-4 py-3">
                <p className="text-sm text-white/90">{image.caption}</p>
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Lightbox Overlay */}
      {selectedImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
          onClick={handleClose}
        >
          {/* Close button */}
          <button
            type="button"
            onClick={handleClose}
            className="absolute top-4 right-4 z-10 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 transition-colors"
            aria-label="Close"
          >
            <X className="h-6 w-6" />
          </button>

          {/* Navigation arrows */}
          {images.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handlePrev();
                }}
                className="absolute left-4 z-10 rounded-full bg-white/10 p-3 text-white hover:bg-white/20 transition-colors"
                aria-label="Previous image"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleNext();
                }}
                className="absolute right-4 z-10 rounded-full bg-white/10 p-3 text-white hover:bg-white/20 transition-colors"
                aria-label="Next image"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            </>
          )}

          {/* Image */}
          <div
            className="max-h-[85vh] max-w-[90vw] flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={selectedImage.image_url}
              alt={selectedImage.alt_text || selectedImage.caption || 'Gallery image'}
              className="max-h-[80vh] max-w-full object-contain rounded-lg"
            />
            {selectedImage.caption && (
              <p className="mt-3 text-sm text-white/80 text-center max-w-lg">
                {selectedImage.caption}
              </p>
            )}
            {/* Image counter */}
            <p className="mt-2 text-xs text-white/50">
              {selectedIdx! + 1} / {images.length}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
