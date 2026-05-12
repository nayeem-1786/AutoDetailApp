import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';

/**
 * GET /api/admin/mobile-zones — list available mobile zones for the admin
 * picker. Phase Mobile-1.9.
 *
 * Counterpart to /api/pos/mobile-zones (Phase Mobile-1). Same payload
 * shape — kept symmetrical so the shared `edit-mobile-modal` component
 * can swap the fetch endpoint per surface without diverging on the
 * response contract. `mobile_zones` has authenticated SELECT via RLS,
 * but routing through this endpoint keeps the admin shell's session +
 * 401 redirect behavior consistent with every other admin fetch.
 */
export async function GET(request: NextRequest) {
  const employee = await getEmployeeFromSession(request);
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('mobile_zones')
    .select(
      'id, name, min_distance_miles, max_distance_miles, surcharge, is_available, display_order'
    )
    .order('display_order', { ascending: true });

  if (error) {
    console.error('[/api/admin/mobile-zones] fetch error', error);
    return NextResponse.json(
      { error: 'Failed to load mobile zones' },
      { status: 500 }
    );
  }

  return NextResponse.json({ zones: data ?? [] });
}
