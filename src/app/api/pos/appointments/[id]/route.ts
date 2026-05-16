import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticatePosRequest } from '@/lib/pos/api-auth';
import { checkPosPermission } from '@/lib/pos/check-permission';

/**
 * GET /api/pos/appointments/[id]
 *
 * Single appointment lookup with the same joined shape (`PosAppointment`) the
 * list endpoint at `/api/pos/appointments` returns. Added in Roadmap Item 15c
 * so the Jobs card "Change Time" affordance can fetch the appointment by id
 * without depending on the list endpoint's date-range filter.
 *
 * Permission: `appointments.view_today` (mirrors the list endpoint — minimum
 * gate for read access to appointment data on the POS surface).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;

    const { data, error } = await supabase
      .from('appointments')
      .select(`
        *,
        customer:customers!customer_id(id, first_name, last_name, phone, email),
        vehicle:vehicles!vehicle_id(id, year, make, model, color, size_class),
        employee:employees!employee_id(id, first_name, last_name, role),
        appointment_services(id, service_id, price_at_booking, tier_name, service:services!service_id(id, name))
      `)
      .eq('id', id)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: 'Appointment not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ data });
  } catch (err) {
    console.error('POS appointment GET error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
