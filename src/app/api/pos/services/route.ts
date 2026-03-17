import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticatePosRequest } from '@/lib/pos/api-auth';

/**
 * GET /api/pos/services — List active services with pricing for job creation
 */
export async function GET(request: NextRequest) {
  try {
    const posEmployee = authenticatePosRequest(request);
    if (!posEmployee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createAdminClient();

    const { data: services, error } = await supabase
      .from('services')
      .select(`
        id,
        name,
        flat_price,
        per_unit_price,
        per_unit_label,
        per_unit_max,
        pricing_model,
        classification,
        base_duration_minutes,
        vehicle_compatibility,
        sale_price,
        sale_starts_at,
        sale_ends_at,
        pricing:service_pricing(tier_name, price, sale_price, display_order)
      `)
      .eq('is_active', true)
      .order('display_order')
      .order('name');

    if (error) {
      console.error('Services fetch error:', error);
      return NextResponse.json({ error: 'Failed to fetch services' }, { status: 500 });
    }

    return NextResponse.json(
      { data: services ?? [] },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
    );
  } catch (err) {
    console.error('Services route error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
