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
        pricing_model,
        base_duration_minutes,
        pricing:service_pricing(tier_name, price, display_order)
      `)
      .eq('is_active', true)
      .order('display_order')
      .order('name');

    if (error) {
      console.error('Services fetch error:', error);
      return NextResponse.json({ error: 'Failed to fetch services' }, { status: 500 });
    }

    return NextResponse.json({ data: services ?? [] });
  } catch (err) {
    console.error('Services route error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
