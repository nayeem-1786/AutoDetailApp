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
import { MousePointerClick } from 'lucide-react';

interface ButtonDialogProps {
  open: boolean;
  onClose: () => void;
  onInsert: (html: string) => void;
}

type ButtonStyle = 'primary' | 'outline' | 'ghost';
type ButtonSize = 'small' | 'medium' | 'large';
type ButtonWidth = 'auto' | 'full';
type ButtonAlign = 'left' | 'center' | 'right';

const PADDING: Record<ButtonSize, string> = {
  small: '8px 20px',
  medium: '12px 32px',
  large: '16px 40px',
};

const OUTLINE_PADDING: Record<ButtonSize, string> = {
  small: '6px 18px',
  medium: '10px 28px',
  large: '14px 36px',
};

export function ButtonDialog({ open, onClose, onInsert }: ButtonDialogProps) {
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [newTab, setNewTab] = useState(true);
  const [style, setStyle] = useState<ButtonStyle>('primary');
  const [size, setSize] = useState<ButtonSize>('medium');
  const [width, setWidth] = useState<ButtonWidth>('auto');
  const [align, setAlign] = useState<ButtonAlign>('center');

  function handleInsert() {
    if (!text.trim() || !url.trim()) return;

    const targetAttrs = newTab
      ? ' target="_blank" rel="noopener noreferrer"'
      : '';

    const displayBlock = width === 'full'
      ? 'display:block;text-align:center;'
      : 'display:inline-block;';

    let buttonHtml = '';

    if (style === 'primary') {
      buttonHtml = `<a href="${url.trim()}" class="site-btn-primary" style="${displayBlock}padding:${PADDING[size]};text-decoration:none;font-weight:600;border-radius:var(--site-btn-primary-radius, 9999px);"${targetAttrs}>${text.trim()}</a>`;
    } else if (style === 'outline') {
      buttonHtml = `<a href="${url.trim()}" style="${displayBlock}padding:${OUTLINE_PADDING[size]};border:2px solid var(--lime);color:var(--lime);border-radius:9999px;text-decoration:none;font-weight:600;"${targetAttrs}>${text.trim()}</a>`;
    } else {
      buttonHtml = `<a href="${url.trim()}" style="${displayBlock}padding:${OUTLINE_PADDING[size]};color:var(--site-link);text-decoration:underline;font-weight:500;"${targetAttrs}>${text.trim()} &rarr;</a>`;
    }

    const html =
      align === 'left'
        ? `<div style="text-align:left;">${buttonHtml}</div>`
        : align === 'right'
          ? `<div style="text-align:right;">${buttonHtml}</div>`
          : `<div style="text-align:center;">${buttonHtml}</div>`;

    onInsert(html);
    resetAndClose();
  }

  function resetAndClose() {
    setText('');
    setUrl('');
    setNewTab(true);
    setStyle('primary');
    setSize('medium');
    setWidth('auto');
    setAlign('center');
    onClose();
  }

  const radioGroup = (
    label: string,
    options: { value: string; label: string }[],
    current: string,
    onChange: (v: string) => void
  ) => (
    <div>
      <label className="mb-1 block text-sm font-medium text-ui-text">
        {label}
      </label>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
              current === opt.value
                ? 'border-blue-500 bg-blue-500/10 text-blue-500'
                : 'border-ui-border text-ui-text-secondary hover:bg-ui-bg-hover'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && resetAndClose()}>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <MousePointerClick className="h-5 w-5" />
          Insert Button
        </DialogTitle>
      </DialogHeader>
      <DialogContent>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-ui-text">
              Button Text
            </label>
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Get Started"
              className="w-full rounded-md border border-ui-border bg-ui-bg px-3 py-2 text-sm text-ui-text placeholder:text-ui-text-muted focus:outline-none focus:ring-2 focus:ring-ui-ring"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ui-text">
              URL
            </label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              className="w-full rounded-md border border-ui-border bg-ui-bg px-3 py-2 text-sm text-ui-text placeholder:text-ui-text-muted focus:outline-none focus:ring-2 focus:ring-ui-ring"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-ui-text">
            <input
              type="checkbox"
              checked={newTab}
              onChange={(e) => setNewTab(e.target.checked)}
              className="rounded border-ui-border"
            />
            Open in new tab
          </label>
          {radioGroup(
            'Style',
            [
              { value: 'primary', label: 'Primary' },
              { value: 'outline', label: 'Outline' },
              { value: 'ghost', label: 'Ghost' },
            ],
            style,
            (v) => setStyle(v as ButtonStyle)
          )}
          {radioGroup(
            'Size',
            [
              { value: 'small', label: 'Small' },
              { value: 'medium', label: 'Medium' },
              { value: 'large', label: 'Large' },
            ],
            size,
            (v) => setSize(v as ButtonSize)
          )}
          <div className="flex gap-6">
            {radioGroup(
              'Width',
              [
                { value: 'auto', label: 'Auto' },
                { value: 'full', label: 'Full' },
              ],
              width,
              (v) => setWidth(v as ButtonWidth)
            )}
            {radioGroup(
              'Alignment',
              [
                { value: 'left', label: 'Left' },
                { value: 'center', label: 'Center' },
                { value: 'right', label: 'Right' },
              ],
              align,
              (v) => setAlign(v as ButtonAlign)
            )}
          </div>
        </div>
      </DialogContent>
      <DialogFooter>
        <Button variant="outline" onClick={resetAndClose}>
          Cancel
        </Button>
        <Button
          onClick={handleInsert}
          disabled={!text.trim() || !url.trim()}
        >
          Insert Button
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
