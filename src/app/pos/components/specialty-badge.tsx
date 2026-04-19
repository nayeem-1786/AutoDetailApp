'use client';

import { cn } from '@/lib/utils/cn';

interface SpecialtyBadgeProps {
  isExotic: boolean;
  isClassic: boolean;
  className?: string;
}

/**
 * Visual badge for exotic/classic vehicles in POS and admin surfaces.
 * Soft orange for exotic, soft blue-gray for classic, stacked if both.
 * Matches the Enthusiast/Professional chip pattern (shape, padding, font).
 * Internal only — never rendered on customer-facing surfaces.
 */
export function SpecialtyBadge({ isExotic, isClassic, className }: SpecialtyBadgeProps) {
  if (!isExotic && !isClassic) return null;

  return (
    <div className={cn('flex flex-col gap-0.5', className)}>
      {isExotic && (
        <span
          className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800"
          aria-label="Exotic vehicle — custom quote required"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-orange-500 dark:bg-orange-600" />
          Exotic
        </span>
      )}
      {isClassic && (
        <span
          className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900/30 dark:text-slate-400 dark:border-slate-800"
          aria-label="Classic vehicle — custom quote required"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-slate-500 dark:bg-slate-600" />
          Classic
        </span>
      )}
    </div>
  );
}
