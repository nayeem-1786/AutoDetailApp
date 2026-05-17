import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';

/**
 * GET /api/admin/services/active — Item 15a
 *
 * Session-authed list of currently active services with pricing, for
 * admin-side pickers (notably the Edit Services modal on the Appointment
 * dialog). Mirrors the row shape returned by `/api/pos/services` so the
 * shared UI can consume either source — the only difference is auth:
 * admin cookie session vs POS HMAC.
 *
 * No permission gate beyond "logged-in admin" — the picker is also the
 * primary way an operator inspects what's catalog-available before
 * editing. The mutating endpoint (`PUT
 * /api/admin/appointments/[id]/services`) enforces
 * `appointments.reschedule`.
 */
export async function GET(request: NextRequest) {
  try {
    const employee = await getEmployeeFromSession(request);
    if (!employee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('services')
      .select(
        `
        id,
        name,
        description,
        flat_price,
        per_unit_price,
        per_unit_label,
        per_unit_max,
        custom_starting_price,
        pricing_model,
        classification,
        base_duration_minutes,
        vehicle_compatibility,
        sale_price,
        sale_starts_at,
        sale_ends_at,
        pricing:service_pricing(*)
      `
      )
      .eq('is_active', true)
      .order('display_order')
      .order('name');

    if (error) {
      console.error('Active services fetch error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch services' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { data: data ?? [] },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      }
    );
  } catch (err) {
    console.error('Active services route error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
