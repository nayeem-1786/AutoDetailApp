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
import { Link2 } from 'lucide-react';

interface LinkDialogProps {
  open: boolean;
  onClose: () => void;
  onInsert: (html: string) => void;
}

export function LinkDialog({ open, onClose, onInsert }: LinkDialogProps) {
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [newTab, setNewTab] = useState(true);

  function handleInsert() {
    if (!url.trim()) return;

    const displayText = text.trim() || url.trim();
    const targetAttrs = newTab
      ? ' target="_blank" rel="noopener noreferrer"'
      : '';

    const html = `<a href="${url.trim()}" class="text-site-link hover:text-site-link-hover underline"${targetAttrs}>${displayText}</a>`;

    onInsert(html);
    resetAndClose();
  }

  function resetAndClose() {
    setUrl('');
    setText('');
    setNewTab(true);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && resetAndClose()}>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Link2 className="h-5 w-5" />
          Insert Link
        </DialogTitle>
      </DialogHeader>
      <DialogContent>
        <div className="space-y-4">
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
          <div>
            <label className="mb-1 block text-sm font-medium text-ui-text">
              Display Text
            </label>
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Click here"
              className="w-full rounded-md border border-ui-border bg-ui-bg px-3 py-2 text-sm text-ui-text placeholder:text-ui-text-muted focus:outline-none focus:ring-2 focus:ring-ui-ring"
            />
            <p className="mt-1 text-xs text-ui-text-muted">
              If empty, the URL will be used as the display text.
            </p>
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
        </div>
      </DialogContent>
      <DialogFooter>
        <Button variant="outline" onClick={resetAndClose}>
          Cancel
        </Button>
        <Button onClick={handleInsert} disabled={!url.trim()}>
          Insert Link
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
