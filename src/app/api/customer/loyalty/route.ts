import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { FEATURE_FLAGS } from '@/lib/utils/constants';
import { isFeatureEnabled } from '@/lib/utils/feature-flags';

export async function GET(request: NextRequest) {
  try {
    if (!await isFeatureEnabled(FEATURE_FLAGS.LOYALTY_REWARDS)) {
      return NextResponse.json({ balance: 0, entries: [], total: 0 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createAdminClient();

    const { data: customer } = await admin
      .from('customers')
      .select('id, loyalty_points_balance')
      .eq('auth_user_id', user.id)
      .single();

    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    const url = new URL(request.url);
    const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') || '20', 10)));
    const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10));

    // Get total count
    const { count } = await admin
      .from('loyalty_ledger')
      .select('id', { count: 'exact', head: true })
      .eq('customer_id', customer.id);

    // Get paginated ledger entries
    const { data: entries, error } = await admin
      .from('loyalty_ledger')
      .select('id, action, points_change, points_balance, description, created_at')
      .eq('customer_id', customer.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('Fetch loyalty ledger error:', error.message);
      return NextResponse.json({ error: 'Failed to fetch loyalty data' }, { status: 500 });
    }

    return NextResponse.json({
      balance: customer.loyalty_points_balance,
      entries: entries ?? [],
      total: count ?? 0,
    });
  } catch (err) {
    console.error('Loyalty GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
