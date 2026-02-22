import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { buildSummaryInput, buildCouponSummary } from '@/lib/services/coupon-summary';
import type { Coupon, CouponReward } from '@/lib/supabase/types';

// POST — regenerate summary
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = createAdminClient();
    const { data: employee } = await admin
      .from('employees')
      .select('role')
      .eq('auth_user_id', user.id)
      .single();
    if (!employee || !['super_admin', 'admin'].includes(employee.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Fetch coupon with rewards
    const { data: coupon, error } = await admin
      .from('coupons')
      .select('*, coupon_rewards(*)')
      .eq('id', id)
      .single();

    if (error || !coupon) {
      return NextResponse.json({ error: 'Coupon not found' }, { status: 404 });
    }

    const rewards: CouponReward[] = (coupon as Record<string, unknown>).coupon_rewards as CouponReward[] || [];
    const summaryInput = await buildSummaryInput(coupon as unknown as Coupon, rewards);
    const summary = buildCouponSummary(summaryInput);

    await admin.from('coupons').update({ summary }).eq('id', id);

    return NextResponse.json({ data: { summary } });
  } catch (err) {
    console.error('Regenerate coupon summary error:', err);
    return NextResponse.json({ error: 'Failed to generate summary' }, { status: 500 });
  }
}

// PATCH — manual edit
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = createAdminClient();
    const { data: employee } = await admin
      .from('employees')
      .select('role')
      .eq('auth_user_id', user.id)
      .single();
    if (!employee || !['super_admin', 'admin'].includes(employee.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { summary } = body;

    if (typeof summary !== 'string') {
      return NextResponse.json({ error: 'Summary must be a string' }, { status: 400 });
    }

    const { error } = await admin
      .from('coupons')
      .update({ summary })
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ data: { summary } });
  } catch (err) {
    console.error('Update coupon summary error:', err);
    return NextResponse.json({ error: 'Failed to update summary' }, { status: 500 });
  }
}
