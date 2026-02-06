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
      .select('id, tags')
      .eq('auth_user_id', user.id)
      .single();

    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    const now = new Date().toISOString();
    const customerTags: string[] = (customer.tags as string[]) ?? [];

    // Fetch coupons that are:
    // 1. Specifically assigned to this customer (customer_id = customer.id)
    // 2. OR available to everyone (customer_id IS NULL) with optional tag matching
    const { data: coupons, error } = await admin
      .from('coupons')
      .select('id, code, name, min_purchase, expires_at, is_single_use, customer_tags, tag_match_mode, coupon_rewards(*)')
      .or(`customer_id.eq.${customer.id},customer_id.is.null`)
      .eq('status', 'active')
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .order('created_at', { ascending: false });

    // Filter by customer tags if the coupon has tag requirements
    const filteredCoupons = (coupons ?? []).filter((coupon) => {
      const couponTags = coupon.customer_tags as string[] | null;
      if (!couponTags || couponTags.length === 0) {
        // No tag requirement - coupon is available
        return true;
      }
      // Check tag matching
      const matchMode = coupon.tag_match_mode || 'any';
      if (matchMode === 'all') {
        // Customer must have ALL coupon tags
        return couponTags.every((tag) => customerTags.includes(tag));
      } else {
        // Customer must have ANY coupon tag
        return couponTags.some((tag) => customerTags.includes(tag));
      }
    });

    // Remove internal fields before returning
    const cleanCoupons = filteredCoupons.map(({ customer_tags, tag_match_mode, ...rest }) => rest);

    if (error) {
      console.error('Fetch coupons error:', error.message);
      return NextResponse.json({ error: 'Failed to fetch coupons' }, { status: 500 });
    }

    return NextResponse.json({ data: cleanCoupons });
  } catch (err) {
    console.error('Coupons GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
