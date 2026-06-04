'use client';

import { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils/cn';
import { Input } from '@/components/ui/input';
import {
  SCHEDULE_PILL_IDS,
  computeRangeForPill,
  type SchedulePillId,
  type ScheduleDateRange,
} from '@/lib/utils/schedule-date-range';

/**
 * POS Schedule date-pill row — N+1 (Session #148).
 *
 * Six pill toggles + an inline From/To drawer for the "Other" pill.
 * Design + constraint rationale in `docs/dev/POS_SCHEDULE_FILTER_UX_DESIGN.md`
 * (audit d6984cb2, sections D.2 + X1 + X3).
 *
 * Memory #2 NOTE on `<TogglePill>`: the audit suggested wrapping the
 * existing primitive with size overrides. On implementation the
 * `rounded-full px-4 py-1.5` chip shape with no children slot proved
 * a poor fit for the card-style touch-box this surface needs. A small
 * local `DatePillButton` is scoped to this file; if a second consumer
 * of the card-pill shape appears we extract then.
 */

export interface ScheduleFilterState {
  selectedPills: SchedulePillId[];
  otherRange: ScheduleDateRange | null;
}

interface SchedulePillRowProps {
  selectedPills: SchedulePillId[];
  otherRange: ScheduleDateRange | null;
  /** Today (YYYY-MM-DD PST). Caller passes `getTodayPst()`. */
  todayYmd: string;
  onChange: (next: ScheduleFilterState) => void;
}

const PILL_LABELS: Record<SchedulePillId, string> = {
  tomorrow: 'Tomorrow',
  this_week: 'This Week',
  next_week: 'Next Week',
  this_month: 'This Month',
  next_30_days: 'Next 30 Days',
  other: 'Other',
};

/** Short YYYY-MM-DD → "Jun 4" / "Jun 8 – 14" hint. */
function formatHint(range: ScheduleDateRange | null): string {
  if (!range) return '';
  const fmt = (ymd: string) => {
    const [, m, d] = ymd.split('-').map(Number);
    const month = new Date(2000, m - 1, 1).toLocaleString('en-US', { month: 'short' });
    return `${month} ${d}`;
  };
  return range.from === range.to ? fmt(range.from) : `${fmt(range.from)} – ${fmt(range.to)}`;
}

function DatePillButton({
  label,
  hint,
  active,
  onClick,
}: {
  label: string;
  hint: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex shrink-0 cursor-pointer flex-col items-center justify-center rounded-lg border-2 transition-colors',
        // Audit D.2 — min 56px tall, min 100px wide (iPad touch target).
        'min-h-[56px] min-w-[100px] px-3 py-2',
        active
          ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-900/30 dark:text-blue-300'
          : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:border-gray-600'
      )}
    >
      <span className="text-sm font-medium leading-tight">{label}</span>
      {hint && (
        <span className={cn('mt-0.5 text-[10px] leading-tight', active ? 'opacity-90' : 'opacity-60')}>
          {hint}
        </span>
      )}
    </button>
  );
}

// ─── "Other" From/To drawer ─────────────────────────────────────────────────
// Drawer holds LOCAL input state so the operator can type one field at a time
// without losing the typed-but-partial value. Validation runs on every edit;
// invalid → propagate `null` upward (no contribution to the envelope) while
// the local typed value persists.

function OtherRangeDrawer({
  todayYmd,
  otherRange,
  onChangeRange,
}: {
  todayYmd: string;
  otherRange: ScheduleDateRange | null;
  onChangeRange: (next: ScheduleDateRange | null) => void;
}) {
  const [localFrom, setLocalFrom] = useState(otherRange?.from ?? '');
  const [localTo, setLocalTo] = useState(otherRange?.to ?? '');

  // Re-sync from props when a valid range arrives (URL restore, sibling
  // change). Skip on null — that's typically our own partial-input
  // propagation and re-syncing would clobber the operator's typing.
  useEffect(() => {
    if (otherRange) {
      setLocalFrom(otherRange.from);
      setLocalTo(otherRange.to);
    }
  }, [otherRange]);

  const tomorrow = useMemo(() => {
    const d = new Date(todayYmd + 'T12:00:00');
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  }, [todayYmd]);

  function validateAndPropagate(nextFrom: string, nextTo: string) {
    if (!nextFrom || !nextTo) return onChangeRange(null);
    if (nextFrom < tomorrow) return onChangeRange(null);
    if (nextTo < nextFrom) return onChangeRange(null);
    onChangeRange({ from: nextFrom, to: nextTo });
  }

  function handleFromChange(v: string) {
    setLocalFrom(v);
    validateAndPropagate(v, localTo);
  }
  function handleToChange(v: string) {
    setLocalTo(v);
    validateAndPropagate(localFrom, v);
  }

  const errors: string[] = [];
  if (localFrom && localFrom < tomorrow) errors.push('From must be tomorrow or later.');
  if (localFrom && localTo && localTo < localFrom) errors.push('To must be on or after From.');

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">From</span>
          <Input
            type="date"
            value={localFrom}
            min={tomorrow}
            onChange={(e) => handleFromChange(e.target.value)}
            className="h-11 text-base sm:text-sm"
            aria-label="Custom range — from date"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">To</span>
          <Input
            type="date"
            value={localTo}
            min={localFrom || tomorrow}
            onChange={(e) => handleToChange(e.target.value)}
            className="h-11 text-base sm:text-sm"
            aria-label="Custom range — to date"
          />
        </label>
      </div>
      {errors.length > 0 && (
        <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">
          {errors.join(' ')}
        </p>
      )}
    </div>
  );
}

export function SchedulePillRow({
  selectedPills,
  otherRange,
  todayYmd,
  onChange,
}: SchedulePillRowProps) {
  const showOtherDrawer = selectedPills.includes('other');

  function togglePill(pill: SchedulePillId) {
    const next = selectedPills.includes(pill)
      ? selectedPills.filter((p) => p !== pill)
      : [...selectedPills, pill];
    // Deselecting "Other" clears its range too — a stale custom range
    // should not silently re-apply if the operator re-enables the pill.
    const nextOther = pill === 'other' && !next.includes('other') ? null : otherRange;
    onChange({ selectedPills: next, otherRange: nextOther });
  }

  return (
    <div className="space-y-2">
      <div
        className="flex gap-2 overflow-x-auto pb-1"
        // iOS momentum scrolling for the pill row on iPad portrait.
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {SCHEDULE_PILL_IDS.map((pill) => {
          const isActive = selectedPills.includes(pill);
          const hint =
            pill === 'other'
              ? otherRange
                ? formatHint(otherRange)
                : 'Pick dates'
              : formatHint(computeRangeForPill(pill, todayYmd, null));
          return (
            <DatePillButton
              key={pill}
              label={PILL_LABELS[pill]}
              hint={hint}
              active={isActive}
              onClick={() => togglePill(pill)}
            />
          );
        })}
      </div>
      {showOtherDrawer && (
        <OtherRangeDrawer
          todayYmd={todayYmd}
          otherRange={otherRange}
          onChangeRange={(next) => onChange({ selectedPills, otherRange: next })}
        />
      )}
    </div>
  );
}
