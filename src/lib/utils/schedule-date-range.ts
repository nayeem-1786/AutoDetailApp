/**
 * POS Schedule date-range helper — N+1 (Session #148).
 *
 * Pure logic that reduces a set of selected date-pill IDs + an optional
 * "Other" custom range into the YYYY-MM-DD envelope passed to
 * `/api/pos/jobs/schedule?from=...&to=...`. Strings throughout (not
 * `Date` objects) — mirrors `getTodayPst()` and the endpoint's own
 * YYYY-MM-DD I/O.
 *
 * Constraints LOCKED in the audit (d6984cb2,
 * `docs/dev/POS_SCHEDULE_FILTER_UX_DESIGN.md`):
 *   X1 — FUTURE-ONLY. Server clamps `from` to tomorrow
 *        (`schedule/route.ts:82-90`). Helper mirrors the floor.
 *   X3 — 31-day MAX inclusive window
 *        (`schedule/route.ts:8,:75-79`). Helper clips at from+30.
 *
 * Week boundaries are Mon..Sun (matches `admin/appointments/page.tsx:352`,
 * `weekStartsOn: 1`).
 */

export type SchedulePillId =
  | 'tomorrow'
  | 'this_week'
  | 'next_week'
  | 'this_month'
  | 'next_30_days'
  | 'other';

export const SCHEDULE_PILL_IDS: SchedulePillId[] = [
  'tomorrow',
  'this_week',
  'next_week',
  'this_month',
  'next_30_days',
  'other',
];

export interface ScheduleDateRange {
  /** YYYY-MM-DD (PST), inclusive. */
  from: string;
  /** YYYY-MM-DD (PST), inclusive. */
  to: string;
}

const MAX_RANGE_INCLUSIVE_DAYS = 31;

// Noon-PST anchor on every conversion dodges DST + midnight edges.
function addDaysYmd(ymd: string, days: number): string {
  const d = new Date(ymd + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetweenYmd(fromYmd: string, toYmd: string): number {
  const from = new Date(fromYmd + 'T12:00:00').getTime();
  const to = new Date(toYmd + 'T12:00:00').getTime();
  return Math.round((to - from) / 86_400_000);
}

function dayOfWeekYmd(ymd: string): number {
  return new Date(ymd + 'T12:00:00').getDay();
}

function endOfMonthYmd(ymd: string): string {
  const [y, m] = ymd.split('-').map(Number);
  // `new Date(y, m, 0)` rolls back from the 1st of month+1, returning the
  // last day of THIS month (m is human-1-indexed here).
  const lastDay = new Date(y, m, 0).getDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
}

/**
 * Inclusive [from, to] for one pill against today. Returns `null` when
 * the range collapses: `this_week` on Sunday, `this_month` on the last
 * day of the month, or `other` with missing/past/inverted otherRange.
 * Caller surfaces the validation error in the UI; this helper just
 * skips the contribution.
 */
export function computeRangeForPill(
  pill: SchedulePillId,
  todayYmd: string,
  otherRange: ScheduleDateRange | null
): ScheduleDateRange | null {
  const tomorrow = addDaysYmd(todayYmd, 1);

  switch (pill) {
    case 'tomorrow':
      return { from: tomorrow, to: tomorrow };

    case 'this_week': {
      // dow 0=Sun..6=Sat. Days remaining in this week = `7 - dow` (Mon..Sat),
      // or 0 when today is Sun (week is over).
      const dow = dayOfWeekYmd(todayYmd);
      const daysToSunday = dow === 0 ? 0 : 7 - dow;
      if (daysToSunday === 0) return null;
      return { from: tomorrow, to: addDaysYmd(todayYmd, daysToSunday) };
    }

    case 'next_week': {
      // Next Mon..next Sun. From Sun (0), next Mon is +1; from any other
      // dow, next Mon is `8 - dow` days away.
      const dow = dayOfWeekYmd(todayYmd);
      const nextMonday = addDaysYmd(todayYmd, dow === 0 ? 1 : 8 - dow);
      return { from: nextMonday, to: addDaysYmd(nextMonday, 6) };
    }

    case 'this_month': {
      const endOfMonth = endOfMonthYmd(todayYmd);
      if (tomorrow > endOfMonth) return null; // today IS last day of month
      return { from: tomorrow, to: endOfMonth };
    }

    case 'next_30_days':
      return { from: tomorrow, to: addDaysYmd(todayYmd, 30) };

    case 'other': {
      if (!otherRange) return null;
      const { from, to } = otherRange;
      if (!from || !to) return null;
      if (from < tomorrow) return null; // X1 floor
      if (to < from) return null;
      return { from, to };
    }
  }
}

/**
 * Reduce selected pills + otherRange to a single envelope.
 *
 *   - Empty pills → Next-30-Days default (F.1 LOCKED).
 *   - Per-pill nulls (e.g., `this_week` on Sun) are skipped silently.
 *   - All-null → falls through to Next-30-Days default rather than emit
 *     an invalid query.
 *   - Multiple pills → gap-filling envelope `{ min(from), max(to) }`,
 *     NOT disjoint intervals (the endpoint accepts a single range; use
 *     "Other" alone for precise non-contiguous windows).
 *   - X3 ceiling applied last: `to` capped at `from + 30` for a 31-day
 *     inclusive window (`MAX_RANGE_DAYS=31` server-side with 1 day of
 *     margin under the hard limit).
 */
export function computeScheduleDateRange(
  selectedPills: SchedulePillId[],
  otherRange: ScheduleDateRange | null,
  todayYmd: string
): ScheduleDateRange {
  const defaultRange: ScheduleDateRange = {
    from: addDaysYmd(todayYmd, 1),
    to: addDaysYmd(todayYmd, 30),
  };

  if (selectedPills.length === 0) return defaultRange;

  // Collect → reduce. Two-phase keeps TypeScript narrowing simple
  // (self-assigning a union-typed accumulator in a loop confuses CFA).
  const ranges: ScheduleDateRange[] = [];
  for (const pill of selectedPills) {
    const r = computeRangeForPill(pill, todayYmd, otherRange);
    if (r) ranges.push(r);
  }

  if (ranges.length === 0) return defaultRange;

  const envelope: ScheduleDateRange = ranges.reduce<ScheduleDateRange>(
    (acc, r) => ({
      from: r.from < acc.from ? r.from : acc.from,
      to: r.to > acc.to ? r.to : acc.to,
    }),
    ranges[0]
  );

  const span = daysBetweenYmd(envelope.from, envelope.to);
  if (span > MAX_RANGE_INCLUSIVE_DAYS - 1) {
    return { from: envelope.from, to: addDaysYmd(envelope.from, MAX_RANGE_INCLUSIVE_DAYS - 1) };
  }
  return envelope;
}
