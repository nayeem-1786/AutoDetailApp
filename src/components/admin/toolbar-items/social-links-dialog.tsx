'use client';

import { useState, createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogContent,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Share2,
  Facebook,
  Instagram,
  Twitter,
  Youtube,
  Music2,
  Linkedin,
  Star,
  MapPin,
} from 'lucide-react';

interface SocialLinksDialogProps {
  open: boolean;
  onClose: () => void;
  onInsert: (html: string) => void;
}

type DisplayStyle = 'icons_only' | 'icons_text';
type IconSize = 'small' | 'medium' | 'large';
type ColorMode = 'theme' | 'white' | 'original';

interface PlatformConfig {
  key: string;
  label: string;
  placeholder: string;
  icon: typeof Facebook;
  brandColor: string;
}

const PLATFORMS: PlatformConfig[] = [
  { key: 'facebook', label: 'Facebook', placeholder: 'https://facebook.com/...', icon: Facebook, brandColor: '#1877F2' },
  { key: 'instagram', label: 'Instagram', placeholder: 'https://instagram.com/...', icon: Instagram, brandColor: '#E4405F' },
  { key: 'twitter', label: 'Twitter / X', placeholder: 'https://x.com/...', icon: Twitter, brandColor: '#000000' },
  { key: 'youtube', label: 'YouTube', placeholder: 'https://youtube.com/...', icon: Youtube, brandColor: '#FF0000' },
  { key: 'tiktok', label: 'TikTok', placeholder: 'https://tiktok.com/...', icon: Music2, brandColor: '#000000' },
  { key: 'linkedin', label: 'LinkedIn', placeholder: 'https://linkedin.com/...', icon: Linkedin, brandColor: '#0A66C2' },
  { key: 'yelp', label: 'Yelp', placeholder: 'https://yelp.com/...', icon: Star, brandColor: '#D32323' },
  { key: 'google', label: 'Google', placeholder: 'https://g.page/...', icon: MapPin, brandColor: '#4285F4' },
];

const SIZE_MAP: Record<IconSize, { px: number; label: string }> = {
  small: { px: 20, label: 'Small (20px)' },
  medium: { px: 24, label: 'Medium (24px)' },
  large: { px: 32, label: 'Large (32px)' },
};

const STYLE_OPTIONS: { value: DisplayStyle; label: string }[] = [
  { value: 'icons_only', label: 'Icons only' },
  { value: 'icons_text', label: 'Icons + text' },
];

const COLOR_OPTIONS: { value: ColorMode; label: string }[] = [
  { value: 'theme', label: 'Theme accent' },
  { value: 'white', label: 'White' },
  { value: 'original', label: 'Original' },
];

export function SocialLinksDialog({ open, onClose, onInsert }: SocialLinksDialogProps) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [displayStyle, setDisplayStyle] = useState<DisplayStyle>('icons_only');
  const [iconSize, setIconSize] = useState<IconSize>('medium');
  const [colorMode, setColorMode] = useState<ColorMode>('theme');

  function getColor(platform: PlatformConfig): string {
    switch (colorMode) {
      case 'theme':
        return 'var(--lime)';
      case 'white':
        return '#ffffff';
      case 'original':
        return platform.brandColor;
    }
  }

  function handleInsert() {
    const filledPlatforms = PLATFORMS.filter((p) => urls[p.key]?.trim());
    if (filledPlatforms.length === 0) return;

    const sizePx = SIZE_MAP[iconSize].px;

    const links = filledPlatforms.map((platform) => {
      const color = getColor(platform);
      const svgMarkup = renderToStaticMarkup(
        createElement(platform.icon, {
          width: sizePx,
          height: sizePx,
          color,
          strokeWidth: 2,
        })
      );

      const textSpan =
        displayStyle === 'icons_text'
          ? `<span style="color:${color};font-size:14px;">${platform.label}</span>`
          : '';

      return `<a href="${urls[platform.key]!.trim()}" target="_blank" rel="noopener noreferrer" aria-label="${platform.label}" style="display:inline-flex;align-items:center;gap:6px;text-decoration:none;transition:opacity 0.2s;" onmouseover="this.style.opacity='0.7'" onmouseout="this.style.opacity='1'">${svgMarkup}${textSpan}</a>`;
    });

    const html = `<div style="display:flex;flex-wrap:wrap;align-items:center;gap:16px;margin:16px 0;">${links.join('')}</div>`;

    onInsert(html);
    resetAndClose();
  }

  function resetAndClose() {
    setUrls({});
    setDisplayStyle('icons_only');
    setIconSize('medium');
    setColorMode('theme');
    onClose();
  }

  const filledCount = PLATFORMS.filter((p) => urls[p.key]?.trim()).length;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && resetAndClose()}>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Share2 className="h-5 w-5" />
          Insert Social Links
        </DialogTitle>
      </DialogHeader>
      <DialogContent>
        <div className="max-h-[60vh] space-y-4 overflow-y-auto">
          <div className="space-y-3">
            {PLATFORMS.map((platform) => (
              <div key={platform.key} className="flex items-center gap-3">
                <platform.icon className="h-4 w-4 shrink-0 text-ui-text-muted" />
                <input
                  type="url"
                  value={urls[platform.key] || ''}
                  onChange={(e) =>
                    setUrls((prev) => ({ ...prev, [platform.key]: e.target.value }))
                  }
                  placeholder={platform.placeholder}
                  className="w-full rounded-md border border-ui-border bg-ui-bg px-3 py-1.5 text-sm text-ui-text placeholder:text-ui-text-muted focus:outline-none focus:ring-2 focus:ring-ui-ring"
                />
              </div>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-4 border-t border-ui-border pt-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-ui-text">
                Style
              </label>
              <div className="space-y-1">
                {STYLE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setDisplayStyle(opt.value)}
                    className={`block w-full rounded px-2 py-1 text-left text-xs transition-colors ${
                      displayStyle === opt.value
                        ? 'bg-blue-500/10 text-blue-500'
                        : 'text-ui-text-secondary hover:bg-ui-bg-hover'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-ui-text">
                Size
              </label>
              <div className="space-y-1">
                {(Object.keys(SIZE_MAP) as IconSize[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setIconSize(key)}
                    className={`block w-full rounded px-2 py-1 text-left text-xs transition-colors ${
                      iconSize === key
                        ? 'bg-blue-500/10 text-blue-500'
                        : 'text-ui-text-secondary hover:bg-ui-bg-hover'
                    }`}
                  >
                    {SIZE_MAP[key].label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-ui-text">
                Color
              </label>
              <div className="space-y-1">
                {COLOR_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setColorMode(opt.value)}
                    className={`block w-full rounded px-2 py-1 text-left text-xs transition-colors ${
                      colorMode === opt.value
                        ? 'bg-blue-500/10 text-blue-500'
                        : 'text-ui-text-secondary hover:bg-ui-bg-hover'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
      <DialogFooter>
        <Button variant="outline" onClick={resetAndClose}>
          Cancel
        </Button>
        <Button onClick={handleInsert} disabled={filledCount === 0}>
          Insert {filledCount > 0 ? `${filledCount} Link${filledCount > 1 ? 's' : ''}` : 'Links'}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
