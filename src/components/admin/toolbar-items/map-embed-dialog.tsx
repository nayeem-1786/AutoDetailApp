'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogContent,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { MapPin } from 'lucide-react';

interface MapEmbedDialogProps {
  open: boolean;
  onClose: () => void;
  onInsert: (html: string) => void;
}

type WidthMode = 'full' | 'fixed';

function extractMapSrc(input: string): string | null {
  const trimmed = input.trim();

  // If it's an iframe tag, extract the src attribute
  if (trimmed.startsWith('<iframe')) {
    const srcMatch = trimmed.match(/src=["']([^"']+)["']/);
    if (srcMatch) return srcMatch[1];
    return null;
  }

  // If it contains a Google Maps embed URL directly
  if (trimmed.includes('google.com/maps/embed')) {
    // It might be a bare URL
    if (trimmed.startsWith('http')) return trimmed;
    return null;
  }

  // Otherwise, treat as a plain text address
  const encoded = encodeURIComponent(trimmed);
  return `https://www.google.com/maps?q=${encoded}&output=embed`;
}

export function MapEmbedDialog({ open, onClose, onInsert }: MapEmbedDialogProps) {
  const [input, setInput] = useState('');
  const [height, setHeight] = useState(300);
  const [widthMode, setWidthMode] = useState<WidthMode>('full');
  const [fixedWidth, setFixedWidth] = useState(600);

  function handleInsert() {
    const src = extractMapSrc(input);
    if (!src) return;

    const maxWidthStyle =
      widthMode === 'fixed' ? `max-width:${fixedWidth}px;` : '';

    const html = `<div style="border-radius:8px;overflow:hidden;margin:16px 0;${maxWidthStyle}"><iframe src="${src}" width="100%" height="${height}" style="border:0;display:block;" allowfullscreen loading="lazy" referrerpolicy="no-referrer-when-downgrade" title="Business location map"></iframe></div>`;

    onInsert(html);
    resetAndClose();
  }

  function resetAndClose() {
    setInput('');
    setHeight(300);
    setWidthMode('full');
    setFixedWidth(600);
    onClose();
  }

  const isValid = input.trim().length > 0 && extractMapSrc(input) !== null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && resetAndClose()}>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <MapPin className="h-5 w-5" />
          Embed Map
        </DialogTitle>
      </DialogHeader>
      <DialogContent>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-ui-text">
              Address or Google Maps Embed URL
            </label>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="123 Main St, Torrance, CA 90501 or paste an iframe embed code"
              className="w-full rounded-md border border-ui-border bg-ui-bg px-3 py-2 text-sm text-ui-text placeholder:text-ui-text-muted focus:outline-none focus:ring-2 focus:ring-ui-ring"
            />
            <p className="mt-1 text-xs text-ui-text-muted">
              Enter a street address, a Google Maps embed URL, or paste an iframe tag.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-ui-text">
                Height (px)
              </label>
              <input
                type="number"
                min={150}
                max={800}
                value={height}
                onChange={(e) =>
                  setHeight(Math.max(150, Math.min(800, parseInt(e.target.value) || 300)))
                }
                className="w-full rounded-md border border-ui-border bg-ui-bg px-3 py-2 text-sm text-ui-text focus:outline-none focus:ring-2 focus:ring-ui-ring"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-ui-text">
                Width
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setWidthMode('full')}
                  className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                    widthMode === 'full'
                      ? 'border-blue-500 bg-blue-500/10 text-blue-500'
                      : 'border-ui-border text-ui-text-secondary hover:bg-ui-bg-hover'
                  }`}
                >
                  Full
                </button>
                <button
                  type="button"
                  onClick={() => setWidthMode('fixed')}
                  className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                    widthMode === 'fixed'
                      ? 'border-blue-500 bg-blue-500/10 text-blue-500'
                      : 'border-ui-border text-ui-text-secondary hover:bg-ui-bg-hover'
                  }`}
                >
                  Fixed
                </button>
              </div>
            </div>
          </div>

          {widthMode === 'fixed' && (
            <div>
              <label className="mb-1 block text-sm font-medium text-ui-text">
                Max Width (px)
              </label>
              <input
                type="number"
                min={200}
                max={1200}
                value={fixedWidth}
                onChange={(e) =>
                  setFixedWidth(
                    Math.max(200, Math.min(1200, parseInt(e.target.value) || 600))
                  )
                }
                className="w-full rounded-md border border-ui-border bg-ui-bg px-3 py-2 text-sm text-ui-text focus:outline-none focus:ring-2 focus:ring-ui-ring"
              />
            </div>
          )}
        </div>
      </DialogContent>
      <DialogFooter>
        <Button variant="outline" onClick={resetAndClose}>
          Cancel
        </Button>
        <Button onClick={handleInsert} disabled={!isValid}>
          Embed Map
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
