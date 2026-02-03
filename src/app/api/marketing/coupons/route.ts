import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { couponSchema } from '@/lib/utils/validation';

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: employee } = await supabase
      .from('employees')
      .select('role')
      .eq('auth_user_id', user.id)
      .single();
    if (!employee || !['super_admin', 'admin'].includes(employee.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status') || '';
    const offset = (page - 1) * limit;

    let query = supabase
      .from('coupons')
      .select('*, coupon_rewards(*)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (search) {
      query = query.or(`name.ilike.%${search}%,code.ilike.%${search}%`);
    }
    if (status) {
      query = query.eq('status', status);
    }

    const { data, count, error } = await query;
    if (error) throw error;

    return NextResponse.json({ data, total: count ?? 0, page, limit });
  } catch (err) {
    console.error('List coupons error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: employee } = await supabase
      .from('employees')
      .select('role')
      .eq('auth_user_id', user.id)
      .single();
    if (!employee || !['super_admin', 'admin'].includes(employee.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();

    // Auto-generate code if not provided
    if (!body.code) {
      body.code = generateCode();
    }
    body.code = body.code.toUpperCase().trim();

    // Extract rewards before validation
    const { rewards, ...couponFields } = body;

    const parsed = couponSchema.safeParse(couponFields);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const insertStatus = body.status === 'draft' ? 'draft' : 'active';

    // Check for duplicate code (skip for drafts)
    if (insertStatus !== 'draft') {
      const { data: existing } = await supabase
        .from('coupons')
        .select('id')
        .eq('code', parsed.data.code)
        .maybeSingle();

      if (existing) {
        return NextResponse.json({ error: 'Coupon code already exists' }, { status: 409 });
      }
    }

    // Insert the coupon
    const { data: coupon, error: couponError } = await supabase
      .from('coupons')
      .insert({
        ...parsed.data,
        status: insertStatus,
      })
      .select()
      .single();

    if (couponError) throw couponError;

    // Insert coupon rewards if provided
    let couponRewards = [];
    if (rewards && Array.isArray(rewards) && rewards.length > 0) {
      const rewardRows = rewards.map((reward: Record<string, unknown>) => ({
        coupon_id: coupon.id,
        applies_to: reward.applies_to,
        discount_type: reward.discount_type,
        discount_value: reward.discount_value,
        max_discount: reward.max_discount ?? null,
        target_product_id: reward.target_product_id ?? null,
        target_service_id: reward.target_service_id ?? null,
        target_product_category_id: reward.target_product_category_id ?? null,
        target_service_category_id: reward.target_service_category_id ?? null,
      }));

      const { data: rewardsData, error: rewardsError } = await supabase
        .from('coupon_rewards')
        .insert(rewardRows)
        .select();

      if (rewardsError) throw rewardsError;
      couponRewards = rewardsData;
    }

    return NextResponse.json(
      { data: { ...coupon, coupon_rewards: couponRewards } },
      { status: 201 }
    );
  } catch (err) {
    console.error('Create coupon error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
