'use client';

import { Minus, Plus } from 'lucide-react';

interface QuantitySelectorProps {
  value: number;
  min?: number;
  max: number;
  onChange: (value: number) => void;
  size?: 'sm' | 'md';
}

export function QuantitySelector({
  value,
  min = 1,
  max,
  onChange,
  size = 'md',
}: QuantitySelectorProps) {
  const isSmall = size === 'sm';
  const btnSize = isSmall ? 'h-7 w-7' : 'h-10 w-10';
  const iconSize = isSmall ? 'h-3 w-3' : 'h-4 w-4';
  const textSize = isSmall ? 'text-sm w-8' : 'text-base w-10';

  return (
    <div className="inline-flex items-center rounded-xl border border-site-border bg-brand-surface">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        className={`${btnSize} flex items-center justify-center rounded-l-xl text-site-text-muted transition-colors hover:bg-site-border-light hover:text-site-text disabled:opacity-30 disabled:cursor-not-allowed`}
        aria-label="Decrease quantity"
      >
        <Minus className={iconSize} />
      </button>
      <span className={`${textSize} text-center font-medium text-site-text tabular-nums select-none`}>
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        className={`${btnSize} flex items-center justify-center rounded-r-xl text-site-text-muted transition-colors hover:bg-site-border-light hover:text-site-text disabled:opacity-30 disabled:cursor-not-allowed`}
        aria-label="Increase quantity"
      >
        <Plus className={iconSize} />
      </button>
    </div>
  );
}
