import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  try {
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
      .select('id')
      .eq('auth_user_id', user.id)
      .single();

    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    const now = new Date().toISOString();

    const { data: coupons, error } = await admin
      .from('coupons')
      .select('id, code, type, value, min_purchase, max_discount, expires_at, is_single_use')
      .eq('customer_id', customer.id)
      .eq('status', 'active')
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Fetch coupons error:', error.message);
      return NextResponse.json({ error: 'Failed to fetch coupons' }, { status: 500 });
    }

    return NextResponse.json({ data: coupons ?? [] });
  } catch (err) {
    console.error('Coupons GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
