import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';
import { PAGE_ZONES } from '@/lib/utils/cms-zones';

// ---------------------------------------------------------------------------
// GET /api/admin/cms/ads/zones — List all zone definitions with placement data
// ---------------------------------------------------------------------------

export async function GET() {
  const employee = await getEmployeeFromSession();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: placements, error } = await admin
    .from('ad_placements')
    .select('*, ad_creative:ad_creatives(*)')
    .eq('is_active', true);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ zones: PAGE_ZONES, placements: placements ?? [] });
}
