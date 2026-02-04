import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticatePosRequest } from '@/lib/pos/api-auth';
import {
  evaluateCouponTargeting,
  evaluateCouponConditions,
  calculateCouponDiscount,
  type CouponRow,
  type CartItem,
  type CustomerData,
} from '@/lib/utils/coupon-helpers';

interface PromotionItem {
  id: string;
  code: string;
  name: string | null;
  discount_amount: number;
  description: string;
  expires_at: string | null;
  target_customer_type: string | null;
  auto_apply: boolean;
  missing_items?: string[];
  warning?: string;
}

export async function POST(request: NextRequest) {
  try {
    const posEmployee = authenticatePosRequest(request);
    if (!posEmployee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const supabase = createAdminClient();

    const body = await request.json();
    const {
      customer_id,
      items = [],
      subtotal = 0,
    }: {
      customer_id?: string;
      items?: CartItem[];
      subtotal?: number;
    } = body;

    // Fetch all active, non-expired coupons with rewards
    const now = new Date().toISOString();
    const { data: coupons, error: couponError } = await supabase
      .from('coupons')
      .select('*, coupon_rewards(*)')
      .eq('status', 'active')
      .or(`expires_at.is.null,expires_at.gt.${now}`);

    if (couponError) {
      console.error('Fetch coupons error:', couponError);
      return NextResponse.json({ error: 'Failed to fetch promotions' }, { status: 500 });
    }

    // Fetch customer data if customer_id provided
    let customer: CustomerData | null = null;
    if (customer_id) {
      const { data: customerRow } = await supabase
        .from('customers')
        .select('id, tags, customer_type, visit_count')
        .eq('id', customer_id)
        .single();

      if (customerRow) {
        customer = {
          id: customerRow.id,
          tags: Array.isArray(customerRow.tags) ? customerRow.tags : [],
          customer_type: customerRow.customer_type,
          visit_count: customerRow.visit_count ?? 0,
        };
      }
    }

    // Fetch enforcement mode
    const { data: enforcementSetting } = await supabase
      .from('business_settings')
      .select('value')
      .eq('key', 'coupon_type_enforcement')
      .single();

    const enforcementMode = (
      typeof enforcementSetting?.value === 'string'
        ? enforcementSetting.value
        : 'soft'
    ) as 'soft' | 'hard';

    const forYou: PromotionItem[] = [];
    const eligible: PromotionItem[] = [];
    const upsell: PromotionItem[] = [];

    for (const rawCoupon of (coupons || [])) {
      const coupon = rawCoupon as unknown as CouponRow;
      const rewards = coupon.coupon_rewards || [];

      // Skip coupons with no rewards
      if (rewards.length === 0) continue;

      // Check usage limits
      if (coupon.max_uses && coupon.use_count >= coupon.max_uses) continue;

      // Evaluate targeting
      const targeting = evaluateCouponTargeting(coupon, customer, enforcementMode);
      if (!targeting.passed) continue;

      // Evaluate conditions
      const conditions = evaluateCouponConditions(coupon, items, subtotal, customer);

      // Calculate potential discount
      const discountAmount = calculateCouponDiscount(rewards, items, subtotal);

      // Build description
      const description = rewards.map((r) => {
        if (r.discount_type === 'free') return 'Free item';
        if (r.discount_type === 'percentage') return `${r.discount_value}% off`;
        return `$${r.discount_value} off`;
      }).join(' + ');

      const promotionItem: PromotionItem = {
        id: coupon.id,
        code: coupon.code,
        name: coupon.name,
        discount_amount: discountAmount,
        description,
        expires_at: coupon.expires_at,
        target_customer_type: coupon.target_customer_type,
        auto_apply: coupon.auto_apply,
        ...(targeting.warning ? { warning: targeting.warning } : {}),
      };

      // Categorize
      const isForYou = customer && (
        coupon.customer_id === customer.id ||
        (coupon.campaign_id && coupon.customer_id === customer.id)
      );

      if (isForYou) {
        if (conditions.passed) {
          forYou.push(promotionItem);
        } else {
          forYou.push({ ...promotionItem, missing_items: conditions.missingItems });
        }
      } else if (conditions.passed) {
        eligible.push(promotionItem);
      } else {
        // Only show in upsell if at least some conditions are partially met
        // (i.e., not all conditions failed)
        const totalConditions = conditions.failedConditions.length + (conditions.passed ? 0 : 0);
        if (totalConditions < 4) { // Don't upsell coupons that are way off
          upsell.push({
            ...promotionItem,
            missing_items: conditions.missingItems,
          });
        }
      }
    }

    // Sort: highest discount first
    forYou.sort((a, b) => b.discount_amount - a.discount_amount);
    eligible.sort((a, b) => b.discount_amount - a.discount_amount);
    upsell.sort((a, b) => b.discount_amount - a.discount_amount);

    return NextResponse.json({
      data: {
        for_you: forYou,
        eligible,
        upsell,
      },
    });
  } catch (err) {
    console.error('Promotions available error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
