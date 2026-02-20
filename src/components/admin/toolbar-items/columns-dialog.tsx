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
import { Columns2 } from 'lucide-react';

interface ColumnsDialogProps {
  open: boolean;
  onClose: () => void;
  onInsert: (html: string) => void;
}

type ColumnLayout = '2-equal' | '3-equal' | '1-3-2-3';
type ColumnGap = 'tight' | 'normal' | 'wide';

const GAP_PX: Record<ColumnGap, string> = {
  tight: '12px',
  normal: '24px',
  wide: '40px',
};

const LAYOUT_OPTIONS: { value: ColumnLayout; label: string }[] = [
  { value: '2-equal', label: '2 Equal' },
  { value: '3-equal', label: '3 Equal' },
  { value: '1-3-2-3', label: '1/3 + 2/3' },
];

function buildColumnHtml(layout: ColumnLayout, gap: ColumnGap): string {
  const gapValue = GAP_PX[gap];

  if (layout === '2-equal') {
    return `<div style="display:flex;flex-wrap:wrap;gap:${gapValue};">
  <div style="flex:1 1 250px;">
    <p style="color:var(--site-text-secondary);">Column 1 content</p>
  </div>
  <div style="flex:1 1 250px;">
    <p style="color:var(--site-text-secondary);">Column 2 content</p>
  </div>
</div>`;
  }

  if (layout === '3-equal') {
    return `<div style="display:flex;flex-wrap:wrap;gap:${gapValue};">
  <div style="flex:1 1 200px;">
    <p style="color:var(--site-text-secondary);">Column 1 content</p>
  </div>
  <div style="flex:1 1 200px;">
    <p style="color:var(--site-text-secondary);">Column 2 content</p>
  </div>
  <div style="flex:1 1 200px;">
    <p style="color:var(--site-text-secondary);">Column 3 content</p>
  </div>
</div>`;
  }

  // 1/3 + 2/3
  return `<div style="display:flex;flex-wrap:wrap;gap:${gapValue};">
  <div style="flex:1 1 200px;">
    <p style="color:var(--site-text-secondary);">Narrow column content</p>
  </div>
  <div style="flex:2 1 300px;">
    <p style="color:var(--site-text-secondary);">Wide column content</p>
  </div>
</div>`;
}

export function ColumnsDialog({ open, onClose, onInsert }: ColumnsDialogProps) {
  const [layout, setLayout] = useState<ColumnLayout>('2-equal');
  const [gap, setGap] = useState<ColumnGap>('normal');

  function handleInsert() {
    const html = buildColumnHtml(layout, gap);
    onInsert(html);
    resetAndClose();
  }

  function resetAndClose() {
    setLayout('2-equal');
    setGap('normal');
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
          <Columns2 className="h-5 w-5" />
          Insert Columns
        </DialogTitle>
      </DialogHeader>
      <DialogContent>
        <div className="space-y-4">
          {radioGroup(
            'Layout',
            LAYOUT_OPTIONS,
            layout,
            (v) => setLayout(v as ColumnLayout)
          )}
          {radioGroup(
            'Gap',
            [
              { value: 'tight', label: 'Tight (12px)' },
              { value: 'normal', label: 'Normal (24px)' },
              { value: 'wide', label: 'Wide (40px)' },
            ],
            gap,
            (v) => setGap(v as ColumnGap)
          )}
          <div>
            <p className="text-xs text-ui-text-muted">
              Columns will wrap on smaller screens for mobile-friendly layout.
            </p>
          </div>
        </div>
      </DialogContent>
      <DialogFooter>
        <Button variant="outline" onClick={resetAndClose}>
          Cancel
        </Button>
        <Button onClick={handleInsert}>Insert Columns</Button>
      </DialogFooter>
    </Dialog>
  );
}
