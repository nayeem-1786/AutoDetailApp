import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { code, subtotal, customer_id } = body;

    if (!code) {
      return NextResponse.json(
        { error: 'Coupon code is required' },
        { status: 400 }
      );
    }

    // Look up coupon
    const { data: coupon, error } = await supabase
      .from('coupons')
      .select('*')
      .eq('code', code.toUpperCase().trim())
      .single();

    if (error || !coupon) {
      return NextResponse.json(
        { error: 'Invalid coupon code' },
        { status: 404 }
      );
    }

    // Check status
    if (coupon.status !== 'active') {
      return NextResponse.json(
        { error: `Coupon is ${coupon.status}` },
        { status: 400 }
      );
    }

    // Check expiry
    if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
      return NextResponse.json(
        { error: 'Coupon has expired' },
        { status: 400 }
      );
    }

    // Check usage limits
    if (coupon.max_uses && coupon.use_count >= coupon.max_uses) {
      return NextResponse.json(
        { error: 'Coupon usage limit reached' },
        { status: 400 }
      );
    }

    // Check single-use per customer
    if (coupon.is_single_use && coupon.customer_id && coupon.customer_id !== customer_id) {
      return NextResponse.json(
        { error: 'This coupon is assigned to a different customer' },
        { status: 400 }
      );
    }

    // Check minimum purchase
    if (coupon.min_purchase && subtotal < coupon.min_purchase) {
      return NextResponse.json(
        { error: `Minimum purchase of $${coupon.min_purchase.toFixed(2)} required` },
        { status: 400 }
      );
    }

    // Calculate discount
    let discount = 0;

    switch (coupon.type) {
      case 'flat':
        discount = coupon.value;
        break;
      case 'percentage':
        discount = Math.round(subtotal * (coupon.value / 100) * 100) / 100;
        break;
      case 'free_addon':
      case 'free_product':
        // These require item-level handling; for now treat as flat value
        discount = coupon.value;
        break;
    }

    // Apply max discount cap
    if (coupon.max_discount && discount > coupon.max_discount) {
      discount = coupon.max_discount;
    }

    // Don't exceed subtotal
    discount = Math.min(discount, subtotal);
    discount = Math.round(discount * 100) / 100;

    return NextResponse.json({
      data: {
        id: coupon.id,
        code: coupon.code,
        type: coupon.type,
        discount,
        description:
          coupon.type === 'percentage'
            ? `${coupon.value}% off`
            : `$${coupon.value.toFixed(2)} off`,
      },
    });
  } catch (err) {
    console.error('Coupon validate error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
