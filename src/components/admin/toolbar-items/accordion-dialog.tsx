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
import { ListCollapse } from 'lucide-react';

interface AccordionDialogProps {
  open: boolean;
  onClose: () => void;
  onInsert: (html: string) => void;
}

export function AccordionDialog({ open, onClose, onInsert }: AccordionDialogProps) {
  const [count, setCount] = useState(3);
  const [questions, setQuestions] = useState<string[]>(['', '', '']);

  function handleCountChange(newCount: number) {
    const clamped = Math.max(1, Math.min(10, newCount));
    setCount(clamped);
    setQuestions((prev) => {
      if (clamped > prev.length) {
        return [...prev, ...Array(clamped - prev.length).fill('')];
      }
      return prev.slice(0, clamped);
    });
  }

  function handleQuestionChange(index: number, value: string) {
    setQuestions((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }

  function handleInsert() {
    const items = questions.slice(0, count).map((q, i) => {
      const question = q.trim() || `Question ${i + 1}?`;
      return `<details style="border:1px solid var(--site-border);border-radius:8px;overflow:hidden;">
    <summary style="padding:12px 16px;cursor:pointer;font-weight:600;color:var(--site-text);background:var(--brand-surface);list-style:none;">${question}</summary>
    <div style="padding:12px 16px;color:var(--site-text-secondary);">Answer content goes here.</div>
  </details>`;
    });

    const html = `<div style="display:flex;flex-direction:column;gap:8px;margin:16px 0;">
  ${items.join('\n  ')}
</div>`;

    onInsert(html);
    resetAndClose();
  }

  function resetAndClose() {
    setCount(3);
    setQuestions(['', '', '']);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && resetAndClose()}>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <ListCollapse className="h-5 w-5" />
          Insert Accordion / FAQ
        </DialogTitle>
      </DialogHeader>
      <DialogContent>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-ui-text">
              Number of Items
            </label>
            <input
              type="number"
              min={1}
              max={10}
              value={count}
              onChange={(e) => handleCountChange(parseInt(e.target.value) || 1)}
              className="w-24 rounded-md border border-ui-border bg-ui-bg px-3 py-2 text-sm text-ui-text focus:outline-none focus:ring-2 focus:ring-ui-ring"
            />
          </div>

          <div className="space-y-3">
            <label className="block text-sm font-medium text-ui-text">
              Questions
            </label>
            {Array.from({ length: count }, (_, i) => (
              <div key={i}>
                <div className="mb-1 text-xs text-ui-text-muted">Item {i + 1}</div>
                <input
                  type="text"
                  value={questions[i] || ''}
                  onChange={(e) => handleQuestionChange(i, e.target.value)}
                  placeholder={`Question ${i + 1}?`}
                  className="w-full rounded-md border border-ui-border bg-ui-bg px-3 py-2 text-sm text-ui-text placeholder:text-ui-text-muted focus:outline-none focus:ring-2 focus:ring-ui-ring"
                />
              </div>
            ))}
          </div>

          <p className="text-xs text-ui-text-muted">
            Uses native &lt;details&gt;/&lt;summary&gt; elements. Visitors can click to expand each item.
          </p>
        </div>
      </DialogContent>
      <DialogFooter>
        <Button variant="outline" onClick={resetAndClose}>
          Cancel
        </Button>
        <Button onClick={handleInsert}>
          Insert Accordion
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
