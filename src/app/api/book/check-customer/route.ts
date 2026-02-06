import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizePhone } from '@/lib/utils/format';

interface CouponReward {
  id: string;
  applies_to: 'order' | 'product' | 'service';
  discount_type: 'percentage' | 'flat' | 'free';
  discount_value: number;
  max_discount: number | null;
  target_product_id: string | null;
  target_service_id: string | null;
  target_product_category_id: string | null;
  target_service_category_id: string | null;
}

interface AvailableCoupon {
  id: string;
  code: string;
  name: string | null;
  min_purchase: number | null;
  expires_at: string | null;
  is_single_use: boolean;
  coupon_rewards: CouponReward[];
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { phone, email } = body;

    if (!phone && !email) {
      return NextResponse.json(
        { error: 'Phone or email is required' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Try to find customer by phone first (primary identifier)
    let customer = null;

    if (phone) {
      const e164Phone = normalizePhone(phone);
      if (e164Phone) {
        const { data: byPhone } = await supabase
          .from('customers')
          .select('id, visit_count')
          .eq('phone', e164Phone)
          .single();
        customer = byPhone;
      }
    }

    // Fallback to email if no phone match
    if (!customer && email) {
      const { data: byEmail } = await supabase
        .from('customers')
        .select('id, visit_count')
        .eq('email', email.toLowerCase().trim())
        .single();
      customer = byEmail;
    }

    if (!customer) {
      // New customer - no visit history, no coupons
      return NextResponse.json({
        isExisting: false,
        visitCount: 0,
        availableCoupons: [],
      });
    }

    // Existing customer - fetch their assigned coupons
    const now = new Date().toISOString();

    const { data: coupons } = await supabase
      .from('coupons')
      .select('id, code, name, min_purchase, expires_at, is_single_use, coupon_rewards(*)')
      .eq('customer_id', customer.id)
      .eq('status', 'active')
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .order('created_at', { ascending: false });

    // Filter out coupons the customer has already used (if single-use)
    const availableCoupons: AvailableCoupon[] = [];

    if (coupons) {
      for (const coupon of coupons) {
        if (coupon.is_single_use) {
          // Check if already used
          const { data: usedTransaction } = await supabase
            .from('transactions')
            .select('id')
            .eq('coupon_id', coupon.id)
            .eq('customer_id', customer.id)
            .limit(1);

          if (usedTransaction && usedTransaction.length > 0) {
            continue; // Skip already used coupon
          }
        }

        availableCoupons.push({
          id: coupon.id,
          code: coupon.code,
          name: coupon.name,
          min_purchase: coupon.min_purchase,
          expires_at: coupon.expires_at,
          is_single_use: coupon.is_single_use,
          coupon_rewards: coupon.coupon_rewards || [],
        });
      }
    }

    return NextResponse.json({
      isExisting: (customer.visit_count ?? 0) > 0,
      visitCount: customer.visit_count ?? 0,
      availableCoupons,
    });
  } catch (err) {
    console.error('Check customer error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
