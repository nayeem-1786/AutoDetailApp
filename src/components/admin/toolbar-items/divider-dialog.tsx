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
import { Minus } from 'lucide-react';

interface DividerDialogProps {
  open: boolean;
  onClose: () => void;
  onInsert: (html: string) => void;
}

type DividerStyle = 'line' | 'dashed' | 'dotted' | 'fade';
type DividerWidth = 'full' | 'half' | 'third';
type DividerSpacing = 'tight' | 'normal' | 'wide';

const SPACING_PX: Record<DividerSpacing, string> = {
  tight: '16px',
  normal: '24px',
  wide: '40px',
};

export function DividerDialog({ open, onClose, onInsert }: DividerDialogProps) {
  const [style, setStyle] = useState<DividerStyle>('line');
  const [width, setWidth] = useState<DividerWidth>('full');
  const [spacing, setSpacing] = useState<DividerSpacing>('normal');

  function handleInsert() {
    const margin = `margin:${SPACING_PX[spacing]} 0;`;

    const widthStyle =
      width === 'half'
        ? 'width:50%;margin-left:auto;margin-right:auto;'
        : width === 'third'
          ? 'width:33%;margin-left:auto;margin-right:auto;'
          : '';

    let html = '';

    if (style === 'fade') {
      html = `<hr style="border:0;height:1px;${margin}${widthStyle}background:linear-gradient(to right,transparent,var(--site-border-medium),transparent);" />`;
    } else {
      const borderStyle =
        style === 'dashed'
          ? 'dashed'
          : style === 'dotted'
            ? 'dotted'
            : 'solid';

      html = `<hr style="border:0;border-top:1px ${borderStyle} var(--site-border-medium);${margin}${widthStyle}" />`;
    }

    onInsert(html);
    resetAndClose();
  }

  function resetAndClose() {
    setStyle('line');
    setWidth('full');
    setSpacing('normal');
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
          <Minus className="h-5 w-5" />
          Insert Divider
        </DialogTitle>
      </DialogHeader>
      <DialogContent>
        <div className="space-y-4">
          {radioGroup(
            'Style',
            [
              { value: 'line', label: 'Line' },
              { value: 'dashed', label: 'Dashed' },
              { value: 'dotted', label: 'Dotted' },
              { value: 'fade', label: 'Fade' },
            ],
            style,
            (v) => setStyle(v as DividerStyle)
          )}
          {radioGroup(
            'Width',
            [
              { value: 'full', label: 'Full' },
              { value: 'half', label: 'Half' },
              { value: 'third', label: 'Third' },
            ],
            width,
            (v) => setWidth(v as DividerWidth)
          )}
          {radioGroup(
            'Spacing',
            [
              { value: 'tight', label: 'Tight (16px)' },
              { value: 'normal', label: 'Normal (24px)' },
              { value: 'wide', label: 'Wide (40px)' },
            ],
            spacing,
            (v) => setSpacing(v as DividerSpacing)
          )}
        </div>
      </DialogContent>
      <DialogFooter>
        <Button variant="outline" onClick={resetAndClose}>
          Cancel
        </Button>
        <Button onClick={handleInsert}>Insert Divider</Button>
      </DialogFooter>
    </Dialog>
  );
}
