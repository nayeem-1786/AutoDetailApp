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
import { Video } from 'lucide-react';

interface VideoEmbedDialogProps {
  open: boolean;
  onClose: () => void;
  onInsert: (html: string) => void;
}

type VideoSize = 'small' | 'medium' | 'full';

function parseVideoUrl(url: string): { provider: 'youtube' | 'vimeo'; id: string } | null {
  const trimmed = url.trim();

  // YouTube: youtube.com/watch?v=ID or youtu.be/ID
  const ytLong = trimmed.match(/(?:youtube\.com\/watch\?.*v=)([\w-]+)/);
  if (ytLong) return { provider: 'youtube', id: ytLong[1] };

  const ytShort = trimmed.match(/youtu\.be\/([\w-]+)/);
  if (ytShort) return { provider: 'youtube', id: ytShort[1] };

  // Vimeo: vimeo.com/ID
  const vimeo = trimmed.match(/vimeo\.com\/(\d+)/);
  if (vimeo) return { provider: 'vimeo', id: vimeo[1] };

  return null;
}

const SIZE_OPTIONS: { value: VideoSize; label: string; maxWidth: string }[] = [
  { value: 'small', label: 'Small', maxWidth: '400px' },
  { value: 'medium', label: 'Medium', maxWidth: '560px' },
  { value: 'full', label: 'Full Width', maxWidth: '' },
];

export function VideoEmbedDialog({ open, onClose, onInsert }: VideoEmbedDialogProps) {
  const [url, setUrl] = useState('');
  const [size, setSize] = useState<VideoSize>('medium');
  const [error, setError] = useState('');

  function handleInsert() {
    const parsed = parseVideoUrl(url);
    if (!parsed) {
      setError('Unrecognized video URL. Supported: YouTube and Vimeo links.');
      return;
    }

    const embedSrc =
      parsed.provider === 'youtube'
        ? `https://www.youtube.com/embed/${parsed.id}`
        : `https://player.vimeo.com/video/${parsed.id}`;

    const sizeOption = SIZE_OPTIONS.find((s) => s.value === size)!;
    const maxWidthStyle = sizeOption.maxWidth
      ? `max-width:${sizeOption.maxWidth};`
      : '';

    const html = `<div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;${maxWidthStyle}margin:0 auto;">
  <iframe src="${embedSrc}" style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy" title="Embedded video"></iframe>
</div>`;

    onInsert(html);
    resetAndClose();
  }

  function resetAndClose() {
    setUrl('');
    setSize('medium');
    setError('');
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && resetAndClose()}>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Video className="h-5 w-5" />
          Embed Video
        </DialogTitle>
      </DialogHeader>
      <DialogContent>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-ui-text">
              Video URL
            </label>
            <input
              type="url"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setError('');
              }}
              placeholder="https://www.youtube.com/watch?v=... or https://vimeo.com/..."
              className="w-full rounded-md border border-ui-border bg-ui-bg px-3 py-2 text-sm text-ui-text placeholder:text-ui-text-muted focus:outline-none focus:ring-2 focus:ring-ui-ring"
            />
            {error && (
              <p className="mt-1 text-xs text-red-500">{error}</p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ui-text">
              Size
            </label>
            <div className="flex gap-2">
              {SIZE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setSize(opt.value)}
                  className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                    size === opt.value
                      ? 'border-blue-500 bg-blue-500/10 text-blue-500'
                      : 'border-ui-border text-ui-text-secondary hover:bg-ui-bg-hover'
                  }`}
                >
                  {opt.label}
                  {opt.maxWidth && (
                    <span className="ml-1 text-xs opacity-60">
                      ({opt.maxWidth})
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
      <DialogFooter>
        <Button variant="outline" onClick={resetAndClose}>
          Cancel
        </Button>
        <Button onClick={handleInsert} disabled={!url.trim()}>
          Embed Video
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
