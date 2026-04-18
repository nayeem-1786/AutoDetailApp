'use client';

import { cn } from '@/lib/utils/cn';

interface SpecialtyBadgeProps {
  isExotic: boolean;
  isClassic: boolean;
  className?: string;
}

/**
 * Visual badge for exotic/classic vehicles in POS and admin surfaces.
 * Amber for exotic, blue-gray for classic, stacked if both.
 * Internal only — never rendered on customer-facing surfaces.
 */
export function SpecialtyBadge({ isExotic, isClassic, className }: SpecialtyBadgeProps) {
  if (!isExotic && !isClassic) return null;

  return (
    <div className={cn('flex flex-col gap-0.5', className)}>
      {isExotic && (
        <span
          className="inline-flex items-center rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-950 dark:bg-amber-600 dark:text-amber-50"
          aria-label="Exotic vehicle — custom quote required"
        >
          Exotic
        </span>
      )}
      {isClassic && (
        <span
          className="inline-flex items-center rounded-full bg-slate-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white dark:bg-slate-600 dark:text-slate-50"
          aria-label="Classic vehicle — custom quote required"
        >
          Classic
        </span>
      )}
    </div>
  );
}
