import { describe, it, expect } from 'vitest';
import {
  computeScheduleDateRange,
  computeRangeForPill,
  SCHEDULE_PILL_IDS,
} from '../schedule-date-range';

// ─────────────────────────────────────────────────────────────────────────────
// Contract tests for the POS Schedule date-range helper (N+1).
//
// Anchors (PST):
//   - 2026-06-03 is a Wednesday (dow=3). Week ends 2026-06-07 (Sun).
//   - 2026-06-07 is a Sunday (dow=0). "This week" collapses to null.
//   - 2026-06-30 is a Tuesday (dow=2) — last day of June. "This month"
//     collapses to null.
//   - 2026-06-01 is a Monday (dow=1) — week is fresh.
// Each tested today value is chosen to lock a specific edge.
// ─────────────────────────────────────────────────────────────────────────────

describe('computeRangeForPill — per-pill ranges', () => {
  const today = '2026-06-03'; // Wednesday
  const tomorrow = '2026-06-04';

  it('tomorrow → [tomorrow, tomorrow] single-day range', () => {
    expect(computeRangeForPill('tomorrow', today, null)).toEqual({
      from: tomorrow,
      to: tomorrow,
    });
  });

  it('this_week (Wed) → [tomorrow, Sun]', () => {
    expect(computeRangeForPill('this_week', today, null)).toEqual({
      from: tomorrow,
      to: '2026-06-07', // Sunday
    });
  });

  it('this_week on Sunday → null (week collapses; no future days remain)', () => {
    // 2026-06-07 is Sunday.
    expect(computeRangeForPill('this_week', '2026-06-07', null)).toBeNull();
  });

  it('this_week on Saturday → narrow [Sun, Sun] range', () => {
    // 2026-06-06 is Saturday. Only Sunday remains.
    expect(computeRangeForPill('this_week', '2026-06-06', null)).toEqual({
      from: '2026-06-07',
      to: '2026-06-07',
    });
  });

  it('next_week (Wed) → [next Mon, next Sun]', () => {
    expect(computeRangeForPill('next_week', today, null)).toEqual({
      from: '2026-06-08', // next Mon
      to: '2026-06-14', // next Sun
    });
  });

  it('next_week on Sunday → [tomorrow=Mon, Mon+6=Sun]', () => {
    // Sunday's "next week" starts tomorrow.
    expect(computeRangeForPill('next_week', '2026-06-07', null)).toEqual({
      from: '2026-06-08',
      to: '2026-06-14',
    });
  });

  it('next_week on Monday → [+7 days, +13 days]', () => {
    // Monday's "next week" is the FOLLOWING Mon..Sun (not this week).
    expect(computeRangeForPill('next_week', '2026-06-01', null)).toEqual({
      from: '2026-06-08',
      to: '2026-06-14',
    });
  });

  it('this_month (mid-June) → [tomorrow, June 30]', () => {
    expect(computeRangeForPill('this_month', today, null)).toEqual({
      from: tomorrow,
      to: '2026-06-30',
    });
  });

  it('this_month on last day of month → null (no future days remain in month)', () => {
    expect(computeRangeForPill('this_month', '2026-06-30', null)).toBeNull();
  });

  it('this_month on day before last → narrow [last, last] range', () => {
    expect(computeRangeForPill('this_month', '2026-06-29', null)).toEqual({
      from: '2026-06-30',
      to: '2026-06-30',
    });
  });

  it('next_30_days → [tomorrow, today+30]', () => {
    expect(computeRangeForPill('next_30_days', today, null)).toEqual({
      from: tomorrow,
      to: '2026-07-03',
    });
  });

  it('other with null otherRange → null', () => {
    expect(computeRangeForPill('other', today, null)).toBeNull();
  });

  it('other with empty strings → null', () => {
    expect(computeRangeForPill('other', today, { from: '', to: '' })).toBeNull();
  });

  it('other with past `from` → null (X1 future-only floor)', () => {
    expect(computeRangeForPill('other', today, { from: today, to: '2026-06-10' })).toBeNull();
  });

  it('other with valid future range → passes through', () => {
    expect(computeRangeForPill('other', today, { from: '2026-06-10', to: '2026-06-15' })).toEqual({
      from: '2026-06-10',
      to: '2026-06-15',
    });
  });

  it('other with inverted range (to < from) → null', () => {
    expect(computeRangeForPill('other', today, { from: '2026-06-15', to: '2026-06-10' })).toBeNull();
  });
});

describe('computeScheduleDateRange — envelope reduction', () => {
  const today = '2026-06-03';
  const tomorrow = '2026-06-04';

  it('empty selectedPills → Next-30-Days default (F.1 default)', () => {
    expect(computeScheduleDateRange([], null, today)).toEqual({
      from: tomorrow,
      to: '2026-07-03',
    });
  });

  it('single pill (tomorrow) → that pill\'s range', () => {
    expect(computeScheduleDateRange(['tomorrow'], null, today)).toEqual({
      from: tomorrow,
      to: tomorrow,
    });
  });

  it('two pills (tomorrow + next_week) → envelope spans both', () => {
    expect(computeScheduleDateRange(['tomorrow', 'next_week'], null, today)).toEqual({
      from: tomorrow, // earliest "from"
      to: '2026-06-14', // latest "to" (next Sunday)
    });
  });

  it('tomorrow + next_week ENVELOPE includes the gap (Fri-Sat-Sun before next Mon)', () => {
    // Audit decision LOCKED: gap-filling envelope, not disjoint intervals.
    const result = computeScheduleDateRange(['tomorrow', 'next_week'], null, today);
    expect(result.from).toBe(tomorrow); // 6/4 (Thu)
    expect(result.to).toBe('2026-06-14'); // 6/14 (next Sun)
    // The endpoint will return everything in this envelope including the
    // gap days 6/5-6/7 (Fri-Sat-Sun) — operator's "Other" pill is the
    // escape hatch for precise non-contiguous windows.
  });

  it('this_week on Sunday + tomorrow → falls through to tomorrow only', () => {
    // Sunday's this_week is null; pill is silently skipped; envelope from
    // the surviving "tomorrow" pill only.
    expect(computeScheduleDateRange(['this_week', 'tomorrow'], null, '2026-06-07')).toEqual({
      from: '2026-06-08',
      to: '2026-06-08',
    });
  });

  it('ALL pills null → Next-30-Days fallback (defense against stale URL)', () => {
    // 2026-06-30 is end-of-month (this_month null) and the operator selected
    // only "other" with no otherRange. Both contributors are null; fall back
    // to the default rather than emit an invalid query.
    expect(computeScheduleDateRange(['this_month', 'other'], null, '2026-06-30')).toEqual({
      from: '2026-07-01',
      to: '2026-07-30',
    });
  });

  it('this_month (mid-June, 28 days span) is under the 31-day ceiling — NOT clipped', () => {
    // 2026-06-03 → 2026-06-30 = 27 days difference; under the cap.
    const result = computeScheduleDateRange(['this_month'], null, today);
    expect(result).toEqual({ from: tomorrow, to: '2026-06-30' });
  });

  it('next_30_days alone — exactly at the 30-day-difference cap', () => {
    // tomorrow → today+30 = 30 days difference; equal to the cap (`> 30` clips).
    expect(computeScheduleDateRange(['next_30_days'], null, today)).toEqual({
      from: tomorrow,
      to: '2026-07-03', // tomorrow + 29 days = today + 30
    });
  });

  it('other range exceeding 31-day inclusive cap → CLIPPED to from + 30', () => {
    const result = computeScheduleDateRange(
      ['other'],
      { from: '2026-07-01', to: '2026-08-15' }, // 45-day span
      today
    );
    // X3 cap kicks in: to = from + 30.
    expect(result).toEqual({ from: '2026-07-01', to: '2026-07-31' });
  });

  it('next_week + other (custom range that extends past 31-day envelope) → clipped from envelope.from', () => {
    const result = computeScheduleDateRange(
      ['next_week', 'other'],
      { from: '2026-06-20', to: '2026-07-25' },
      today
    );
    // envelope.from = next Monday = 2026-06-08
    // envelope.to = 2026-07-25 (later than next Sunday 6/14)
    // span = 47 days → clip to 6/8 + 30 = 2026-07-08
    expect(result).toEqual({ from: '2026-06-08', to: '2026-07-08' });
  });

  it('other alone with narrow valid range — passes through', () => {
    expect(
      computeScheduleDateRange(['other'], { from: '2026-06-10', to: '2026-06-12' }, today)
    ).toEqual({ from: '2026-06-10', to: '2026-06-12' });
  });

  it('output never breaks the X1 floor (from < tomorrow)', () => {
    // Stress: all pills, plus a backdated "other". The backdated other gets
    // dropped by per-pill validation; the envelope from the survivors must
    // still be >= tomorrow.
    const result = computeScheduleDateRange(
      ['tomorrow', 'this_week', 'next_week', 'this_month', 'next_30_days', 'other'],
      { from: '2025-12-01', to: '2025-12-15' }, // past — dropped
      today
    );
    expect(result.from >= tomorrow).toBe(true);
  });
});

describe('SCHEDULE_PILL_IDS — public constant', () => {
  it('exports all 6 pill IDs in stable display order', () => {
    // Order matches the audit's locked design (D.2):
    // Tomorrow / This Week / Next Week / This Month / Next 30 Days / Other.
    expect(SCHEDULE_PILL_IDS).toEqual([
      'tomorrow',
      'this_week',
      'next_week',
      'this_month',
      'next_30_days',
      'other',
    ]);
  });

  it('does NOT include "today" (X1 — Schedule is structurally future-only)', () => {
    // Locked invariant: "Today" is owned by the Today scope toggle, not a
    // Schedule filter. Adding "today" here would either be a no-op (server
    // clamps it away at `schedule/route.ts:82-90`) or violate the Phase 1B
    // architectural invariant.
    expect((SCHEDULE_PILL_IDS as string[]).includes('today')).toBe(false);
  });
});
