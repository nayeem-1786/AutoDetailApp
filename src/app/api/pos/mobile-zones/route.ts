import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticatePosRequest } from '@/lib/pos/api-auth';

/**
 * GET /api/pos/mobile-zones — list available mobile zones for the POS picker.
 *
 * Why a separate POS endpoint: the public anon SELECT policy on mobile_zones
 * is permissive (`is_available=true`), but cashier-side fetches go through
 * the HMAC-authenticated POS API. Keeping the read path on the POS surface
 * means the picker also has uniform auth handling (POS shell catches 401 →
 * login redirect).
 */
export async function GET(request: NextRequest) {
  const posEmployee = await authenticatePosRequest(request);
  if (!posEmployee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('mobile_zones')
    .select('id, name, min_distance_miles, max_distance_miles, surcharge, is_available, display_order')
    .order('display_order', { ascending: true });

  if (error) {
    console.error('[/api/pos/mobile-zones] fetch error', error);
    return NextResponse.json({ error: 'Failed to load mobile zones' }, { status: 500 });
  }

  return NextResponse.json({ zones: data ?? [] });
}
