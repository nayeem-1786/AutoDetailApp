import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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

    const { data, error } = await supabase
      .from('coupons')
      .select('*, coupon_rewards(*)')
      .eq('id', id)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Coupon not found' }, { status: 404 });
    }

    return NextResponse.json({ data });
  } catch (err) {
    console.error('Get coupon error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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

    // Extract rewards from the body
    const { rewards, ...fields } = body;

    // Only allow updating specific coupon fields
    const allowedFields = [
      'name',
      'code',
      'status',
      'auto_apply',
      'customer_id',
      'customer_tags',
      'tag_match_mode',
      'condition_logic',
      'requires_product_ids',
      'requires_service_ids',
      'requires_product_category_ids',
      'requires_service_category_ids',
      'min_purchase',
      'max_customer_visits',
      'is_single_use',
      'max_uses',
      'expires_at',
    ];
    const updates: Record<string, unknown> = {};
    for (const key of allowedFields) {
      if (key in fields) updates[key] = fields[key];
    }
    // Normalize code: uppercase, strip spaces
    if (typeof updates.code === 'string') {
      updates.code = (updates.code as string).toUpperCase().replace(/\s/g, '').trim();
    }

    // Update coupon fields if any were provided
    if (Object.keys(updates).length > 0) {
      const { error: updateError } = await supabase
        .from('coupons')
        .update(updates)
        .eq('id', id);

      if (updateError) throw updateError;
    }

    // If rewards array is provided, replace all existing rewards
    if (rewards && Array.isArray(rewards)) {
      // Delete existing rewards for this coupon
      const { error: deleteError } = await supabase
        .from('coupon_rewards')
        .delete()
        .eq('coupon_id', id);

      if (deleteError) throw deleteError;

      // Insert new rewards
      if (rewards.length > 0) {
        const rewardRows = rewards.map((reward: Record<string, unknown>) => ({
          coupon_id: id,
          applies_to: reward.applies_to,
          discount_type: reward.discount_type,
          discount_value: reward.discount_value,
          max_discount: reward.max_discount ?? null,
          target_product_id: reward.target_product_id ?? null,
          target_service_id: reward.target_service_id ?? null,
          target_product_category_id: reward.target_product_category_id ?? null,
          target_service_category_id: reward.target_service_category_id ?? null,
        }));

        const { error: insertError } = await supabase
          .from('coupon_rewards')
          .insert(rewardRows);

        if (insertError) throw insertError;
      }
    }

    // Fetch the updated coupon with rewards
    const { data, error } = await supabase
      .from('coupons')
      .select('*, coupon_rewards(*)')
      .eq('id', id)
      .single();

    if (error) throw error;

    return NextResponse.json({ data });
  } catch (err) {
    console.error('Update coupon error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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

    // Soft-delete: set status to disabled
    const { data, error } = await supabase
      .from('coupons')
      .update({ status: 'disabled' })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ data });
  } catch (err) {
    console.error('Delete coupon error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
