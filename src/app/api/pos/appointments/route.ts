import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticatePosRequest } from '@/lib/pos/api-auth';
import { checkPosPermission } from '@/lib/pos/check-permission';
import { getTodayPst } from '@/lib/utils/pst-date';

const MAX_RANGE_DAYS = 31;

/**
 * GET /api/pos/appointments?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
 *
 * List appointments in a PST date range for the POS Appointments view
 * (Item 12 — POS footer Appointments). Defaults to today + tomorrow when no
 * range is supplied. Range capped at 31 days to keep the iPad response light.
 *
 * Returns appointments with customer, vehicle, employee, and services joined —
 * the same shape the admin appointments page uses (AppointmentWithRelations).
 *
 * Permission: appointments.view_today (the minimum gate the admin page uses
 * for read access; mirroring it here keeps role config consistent).
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
        { error: "You don't have permission to view appointments" },
        { status: 403 }
      );
    }

    const url = new URL(request.url);
    const today = getTodayPst();
    const tomorrow = addDaysPst(today, 1);

    const startDate = url.searchParams.get('start_date') || today;
    const endDate = url.searchParams.get('end_date') || tomorrow;

    if (!isValidDate(startDate) || !isValidDate(endDate)) {
      return NextResponse.json(
        { error: 'Invalid date format — expected YYYY-MM-DD' },
        { status: 400 }
      );
    }

    if (startDate > endDate) {
      return NextResponse.json(
        { error: 'start_date must be ≤ end_date' },
        { status: 400 }
      );
    }

    if (daysBetween(startDate, endDate) > MAX_RANGE_DAYS) {
      return NextResponse.json(
        { error: `Date range cannot exceed ${MAX_RANGE_DAYS} days` },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('appointments')
      .select(`
        *,
        customer:customers!customer_id(id, first_name, last_name, phone, email),
        vehicle:vehicles!vehicle_id(id, year, make, model, color, size_class),
        employee:employees!employee_id(id, first_name, last_name, role),
        appointment_services(id, service_id, price_at_booking, tier_name, service:services!service_id(id, name))
      `)
      .gte('scheduled_date', startDate)
      .lte('scheduled_date', endDate)
      .neq('status', 'cancelled')
      .order('scheduled_date')
      .order('scheduled_start_time');

    if (error) {
      console.error('POS appointments list error:', error.message);
      return NextResponse.json(
        { error: 'Failed to load appointments' },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: data ?? [] });
  } catch (err) {
    console.error('POS appointments GET error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

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
