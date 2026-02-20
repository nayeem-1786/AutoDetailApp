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
import { List } from 'lucide-react';

interface ListDialogProps {
  open: boolean;
  onClose: () => void;
  onInsert: (html: string) => void;
}

type ListType = 'bulleted' | 'numbered' | 'checkmarks';

const LIST_TYPES: { value: ListType; label: string }[] = [
  { value: 'bulleted', label: 'Bulleted' },
  { value: 'numbered', label: 'Numbered' },
  { value: 'checkmarks', label: 'Check marks' },
];

const CHECK_SVG = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--lime)" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>';

export function ListDialog({ open, onClose, onInsert }: ListDialogProps) {
  const [listType, setListType] = useState<ListType>('bulleted');
  const [count, setCount] = useState(3);
  const [items, setItems] = useState<string[]>(['', '', '']);

  function handleCountChange(newCount: number) {
    const clamped = Math.max(1, Math.min(15, newCount));
    setCount(clamped);
    setItems((prev) => {
      if (clamped > prev.length) {
        return [...prev, ...Array(clamped - prev.length).fill('')];
      }
      return prev.slice(0, clamped);
    });
  }

  function handleItemChange(index: number, value: string) {
    setItems((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }

  function handleInsert() {
    const listItems = items.slice(0, count).map((text, i) => {
      const content = text.trim() || `Item ${i + 1}`;
      return content;
    });

    let html: string;

    switch (listType) {
      case 'bulleted': {
        const lis = listItems
          .map((text) => `<li style="margin-bottom:6px;">${text}</li>`)
          .join('');
        html = `<ul style="list-style:disc;padding-left:24px;color:var(--site-text-secondary);margin:12px 0;">${lis}</ul>`;
        break;
      }
      case 'numbered': {
        const lis = listItems
          .map((text) => `<li style="margin-bottom:6px;">${text}</li>`)
          .join('');
        html = `<ol style="list-style:decimal;padding-left:24px;color:var(--site-text-secondary);margin:12px 0;">${lis}</ol>`;
        break;
      }
      case 'checkmarks': {
        const lis = listItems
          .map(
            (text) =>
              `<li style="margin-bottom:8px;display:flex;align-items:start;gap:8px;">${CHECK_SVG}<span>${text}</span></li>`
          )
          .join('');
        html = `<ul style="list-style:none;padding:0;color:var(--site-text-secondary);margin:12px 0;">${lis}</ul>`;
        break;
      }
    }

    onInsert(html);
    resetAndClose();
  }

  function resetAndClose() {
    setListType('bulleted');
    setCount(3);
    setItems(['', '', '']);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && resetAndClose()}>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <List className="h-5 w-5" />
          Insert List
        </DialogTitle>
      </DialogHeader>
      <DialogContent>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-ui-text">
              List Type
            </label>
            <div className="flex gap-2">
              {LIST_TYPES.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setListType(opt.value)}
                  className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                    listType === opt.value
                      ? 'border-blue-500 bg-blue-500/10 text-blue-500'
                      : 'border-ui-border text-ui-text-secondary hover:bg-ui-bg-hover'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-ui-text">
              Number of Items
            </label>
            <input
              type="number"
              min={1}
              max={15}
              value={count}
              onChange={(e) => handleCountChange(parseInt(e.target.value) || 1)}
              className="w-24 rounded-md border border-ui-border bg-ui-bg px-3 py-2 text-sm text-ui-text focus:outline-none focus:ring-2 focus:ring-ui-ring"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-ui-text">
              Items
            </label>
            {Array.from({ length: count }, (_, i) => (
              <input
                key={i}
                type="text"
                value={items[i] || ''}
                onChange={(e) => handleItemChange(i, e.target.value)}
                placeholder={`Item ${i + 1}`}
                className="w-full rounded-md border border-ui-border bg-ui-bg px-3 py-2 text-sm text-ui-text placeholder:text-ui-text-muted focus:outline-none focus:ring-2 focus:ring-ui-ring"
              />
            ))}
          </div>
        </div>
      </DialogContent>
      <DialogFooter>
        <Button variant="outline" onClick={resetAndClose}>
          Cancel
        </Button>
        <Button onClick={handleInsert}>
          Insert List
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
