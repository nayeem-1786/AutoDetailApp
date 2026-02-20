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
import { MessageSquare } from 'lucide-react';

interface CalloutDialogProps {
  open: boolean;
  onClose: () => void;
  onInsert: (html: string) => void;
}

type CalloutType = 'info' | 'tip' | 'warning' | 'note';

const CALLOUT_CONFIG: Record<
  CalloutType,
  { label: string; emoji: string; borderColor: string; bg: string }
> = {
  info: {
    label: 'Info',
    emoji: '\u2139\uFE0F',
    borderColor: 'var(--lime)',
    bg: 'var(--brand-surface)',
  },
  tip: {
    label: 'Tip',
    emoji: '\uD83D\uDCA1',
    borderColor: '#10b981',
    bg: 'rgba(16,185,129,0.08)',
  },
  warning: {
    label: 'Warning',
    emoji: '\u26A0\uFE0F',
    borderColor: '#f59e0b',
    bg: 'rgba(245,158,11,0.08)',
  },
  note: {
    label: 'Note',
    emoji: '\uD83D\uDCDD',
    borderColor: 'var(--site-border-medium)',
    bg: 'var(--brand-surface)',
  },
};

export function CalloutDialog({ open, onClose, onInsert }: CalloutDialogProps) {
  const [type, setType] = useState<CalloutType>('info');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

  function handleInsert() {
    if (!content.trim()) return;

    const config = CALLOUT_CONFIG[type];

    const titleHtml = title.trim()
      ? `\n  <p style="font-weight:600;color:var(--site-text);margin:0 0 4px 0;">${config.emoji} ${title.trim()}</p>`
      : '';

    const contentPrefix = !title.trim() ? `${config.emoji} ` : '';

    const html = `<div style="padding:16px 20px;border-radius:8px;border-left:4px solid ${config.borderColor};background:${config.bg};margin:16px 0;">${titleHtml}
  <p style="color:var(--site-text-secondary);margin:0;">${contentPrefix}${content.trim()}</p>
</div>`;

    onInsert(html);
    resetAndClose();
  }

  function resetAndClose() {
    setType('info');
    setTitle('');
    setContent('');
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && resetAndClose()}>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          Insert Callout
        </DialogTitle>
      </DialogHeader>
      <DialogContent>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-ui-text">
              Type
            </label>
            <div className="flex gap-2">
              {(Object.keys(CALLOUT_CONFIG) as CalloutType[]).map((key) => {
                const cfg = CALLOUT_CONFIG[key];
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setType(key)}
                    className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                      type === key
                        ? 'border-blue-500 bg-blue-500/10 text-blue-500'
                        : 'border-ui-border text-ui-text-secondary hover:bg-ui-bg-hover'
                    }`}
                  >
                    {cfg.emoji} {cfg.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ui-text">
              Title{' '}
              <span className="font-normal text-ui-text-muted">(optional)</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Important Note"
              className="w-full rounded-md border border-ui-border bg-ui-bg px-3 py-2 text-sm text-ui-text placeholder:text-ui-text-muted focus:outline-none focus:ring-2 focus:ring-ui-ring"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ui-text">
              Content
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write your callout content here..."
              rows={3}
              className="w-full rounded-md border border-ui-border bg-ui-bg px-3 py-2 text-sm text-ui-text placeholder:text-ui-text-muted focus:outline-none focus:ring-2 focus:ring-ui-ring"
            />
          </div>
        </div>
      </DialogContent>
      <DialogFooter>
        <Button variant="outline" onClick={resetAndClose}>
          Cancel
        </Button>
        <Button onClick={handleInsert} disabled={!content.trim()}>
          Insert Callout
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
