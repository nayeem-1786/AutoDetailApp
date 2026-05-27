import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticatePosRequest } from '@/lib/pos/api-auth';
import { checkPosPermission } from '@/lib/pos/check-permission';
import { getTodayPst } from '@/lib/utils/pst-date';
import type { PosScheduleEntry } from '@/app/pos/jobs/components/schedule-types';

const MAX_RANGE_DAYS = 31;
const DEFAULT_WINDOW_DAYS = 30;

// Statuses excluded from the Schedule scope — only actionable upcoming rows.
const EXCLUDED_STATUSES = ['cancelled', 'no_show', 'completed'];

/**
 * GET /api/pos/jobs/schedule?from=YYYY-MM-DD&to=YYYY-MM-DD&channel=walk_in
 *
 * Item 15e Phase 1A — the POS Jobs "Schedule" scope data source.
 *
 * Returns FUTURE appointments (default: tomorrow → tomorrow+30d) that have NOT
 * been materialized into a job yet. Today's work belongs to the Today scope
 * (GET /api/pos/jobs); appointments dated today are intentionally excluded.
 *
 * CRITICAL — load-bearing invariant of the Item 15e retire arc: this endpoint
 * is a PURE READ. It NEVER calls populate, NEVER writes the `jobs` table, and
 * has ZERO side effects. Surfacing a future appointment must not create a job
 * row. See docs/dev/ITEM_15E_POS_JOBS_UNIFIED_OPERATIONS_AUDIT.md (Risk matrix:
 * premature job materialization — HIGH severity).
 *
 * Permission: appointments.view_today — the same gate the POS Appointments list
 * and admin read path use (Decision #13: mirror existing keys, no new keys).
 *
 * `channel` is accepted for forward-compatibility with the Phase 3 origin
 * filter; Phase 1 does not yet expose it to the UI (Decision #8).
 */
export async function GET(request: NextRequest) {
  try {
    const posEmployee = await authenticatePosRequest(request);
    if (!posEmployee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createAdminClient();

    const canView = await checkPosPermission(
      supabase,
      posEmployee.role,
      posEmployee.employee_id,
      'appointments.view_today'
    );
    if (!canView) {
      return NextResponse.json(
        { error: "You don't have permission to view the schedule" },
        { status: 403 }
      );
    }

    const url = new URL(request.url);
    const today = getTodayPst();
    const defaultFrom = addDaysPst(today, 1); // tomorrow — today is the Today scope
    const defaultTo = addDaysPst(defaultFrom, DEFAULT_WINDOW_DAYS);

    const from = url.searchParams.get('from') || defaultFrom;
    const to = url.searchParams.get('to') || defaultTo;
    const channel = url.searchParams.get('channel');

    if (!isValidDate(from) || !isValidDate(to)) {
      return NextResponse.json(
        { error: 'Invalid date format — expected YYYY-MM-DD' },
        { status: 400 }
      );
    }
    if (from > to) {
      return NextResponse.json({ error: 'from must be ≤ to' }, { status: 400 });
    }
    if (daysBetween(from, to) > MAX_RANGE_DAYS) {
      return NextResponse.json(
        { error: `Date range cannot exceed ${MAX_RANGE_DAYS} days` },
        { status: 400 }
      );
    }

    // Hard floor: the Schedule scope is FUTURE-only. Even if a caller passes a
    // `from` at/below today, clamp to tomorrow so this endpoint can never
    // surface a today/past appointment (and so Phase 2's lazy-materialize can
    // never be offered against one).
    const effectiveFrom = from <= today ? addDaysPst(today, 1) : from;
    if (effectiveFrom > to) {
      // Requested window is entirely today/past → nothing in the Schedule scope.
      return NextResponse.json({ data: [] });
    }

    // Step 1: future appointments in range, actionable statuses only.
    // (Supabase join-filters on related tables are unreliable — query
    // appointments first, then drop materialized ones, mirroring the populate
    // route's existing-jobs dedup at `populate/route.ts:66-80`.)
    let query = supabase
      .from('appointments')
      .select(`
        id,
        scheduled_date,
        scheduled_start_time,
        scheduled_end_time,
        status,
        channel,
        total_amount,
        deposit_amount,
        customer:customers!customer_id(id, first_name, last_name, phone, email),
        vehicle:vehicles!vehicle_id(id, year, make, model, color),
        detailer:employees!employee_id(id, first_name, last_name),
        appointment_services(id, service_id, price_at_booking, tier_name, quantity, service:services!service_id(id, name))
      `)
      .gte('scheduled_date', effectiveFrom)
      .lte('scheduled_date', to)
      .not('status', 'in', `(${EXCLUDED_STATUSES.join(',')})`)
      .order('scheduled_date')
      .order('scheduled_start_time');

    if (channel) query = query.eq('channel', channel);

    const { data: appts, error } = await query;
    if (error) {
      console.error('POS jobs schedule list error:', error.message);
      return NextResponse.json({ error: 'Failed to load schedule' }, { status: 500 });
    }

    const rawRows = (appts ?? []) as unknown as RawScheduleRow[];
    if (rawRows.length === 0) {
      return NextResponse.json({ data: [] });
    }

    // Step 2: drop appointments that already have a materialized job — those
    // belong to the Today scope (or were lazily materialized in Phase 2). This
    // is a READ against `jobs` (no write) — the endpoint's only `jobs` touch.
    const apptIds = rawRows.map((a) => a.id);
    const { data: existingJobs } = await supabase
      .from('jobs')
      .select('appointment_id')
      .in('appointment_id', apptIds);
    const materialized = new Set(
      (existingJobs ?? []).map((j) => (j as { appointment_id: string }).appointment_id)
    );

    const entries: PosScheduleEntry[] = rawRows
      .filter((a) => !materialized.has(a.id))
      .map((a) => ({
        id: a.id,
        scheduled_date: a.scheduled_date,
        scheduled_start_time: a.scheduled_start_time,
        scheduled_end_time: a.scheduled_end_time ?? null,
        status: a.status,
        channel: a.channel,
        customer: a.customer ?? null,
        vehicle: a.vehicle ?? null,
        detailer: a.detailer ?? null,
        appointment_services: (a.appointment_services ?? []).map((s) => ({
          id: s.id,
          service_id: s.service_id,
          price_at_booking: Number(s.price_at_booking ?? 0),
          tier_name: s.tier_name ?? null,
          quantity: Number(s.quantity ?? 1),
          service: s.service ?? null,
        })),
        total_amount: Number(a.total_amount ?? 0),
        deposit_amount: a.deposit_amount == null ? null : Number(a.deposit_amount),
        scope: 'schedule' as const,
      }));

    return NextResponse.json({ data: entries });
  } catch (err) {
    console.error('POS jobs schedule route error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── Local raw-row shape (Supabase embed returns to-one relations as objects
//     at runtime; cast keeps the mapping tsc-clean, mirroring populate/route.ts) ──

interface RawScheduleRow {
  id: string;
  scheduled_date: string;
  scheduled_start_time: string;
  scheduled_end_time: string | null;
  status: PosScheduleEntry['status'];
  channel: PosScheduleEntry['channel'];
  total_amount: number | string | null;
  deposit_amount: number | string | null;
  customer: PosScheduleEntry['customer'];
  vehicle: PosScheduleEntry['vehicle'];
  detailer: PosScheduleEntry['detailer'];
  appointment_services: Array<{
    id: string;
    service_id: string;
    price_at_booking: number | string | null;
    tier_name: string | null;
    quantity: number | string | null;
    service: { id: string; name: string } | null;
  }> | null;
}

// ─── Local date helpers (mirror src/app/api/pos/appointments/route.ts) ───────

function isValidDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}

function addDaysPst(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function daysBetween(start: string, end: string): number {
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  return Math.round((endMs - startMs) / 86_400_000);
}
