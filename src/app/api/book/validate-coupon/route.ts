import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizePhone } from '@/lib/utils/format';

interface ServiceItem {
  service_id: string;
  name: string;
  price: number;
}

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

interface RewardResult {
  applies_to: string;
  discount_type: string;
  target_name: string;
  discount_amount: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function calculateRewardDiscount(
  reward: CouponReward,
  applicablePrice: number
): number {
  switch (reward.discount_type) {
    case 'percentage': {
      let disc = round2(applicablePrice * (reward.discount_value / 100));
      if (reward.max_discount != null) {
        disc = Math.min(disc, reward.max_discount);
      }
      return disc;
    }
    case 'flat':
      return Math.min(reward.discount_value, applicablePrice);
    case 'free':
      return applicablePrice;
    default:
      return 0;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      code,
      subtotal,
      phone,
      email,
      services,
    }: {
      code: string;
      subtotal: number;
      phone?: string;
      email?: string;
      services?: ServiceItem[];
    } = body;

    if (!code) {
      return NextResponse.json(
        { error: 'Coupon code is required' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // 1. Look up coupon by code (case-insensitive) with rewards
    const { data: coupon, error } = await supabase
      .from('coupons')
      .select('*, coupon_rewards(*)')
      .ilike('code', code.replace(/\s/g, '').trim())
      .single();

    if (error || !coupon) {
      return NextResponse.json(
        { error: 'Invalid coupon code' },
        { status: 404 }
      );
    }

    // 2. Check status
    if (coupon.status !== 'active') {
      return NextResponse.json(
        { error: `Coupon is ${coupon.status}` },
        { status: 400 }
      );
    }

    // 3. Check expiry
    if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
      return NextResponse.json(
        { error: 'Coupon has expired' },
        { status: 400 }
      );
    }

    // 4. Check use_count < max_uses
    if (coupon.max_uses && coupon.use_count >= coupon.max_uses) {
      return NextResponse.json(
        { error: 'Coupon usage limit reached' },
        { status: 400 }
      );
    }

    // 5. Try to find customer by phone/email for customer-specific checks
    let customerId: string | null = null;
    let visitCount = 0;

    if (phone) {
      const e164Phone = normalizePhone(phone);
      if (e164Phone) {
        const { data: byPhone } = await supabase
          .from('customers')
          .select('id, visit_count')
          .eq('phone', e164Phone)
          .single();
        if (byPhone) {
          customerId = byPhone.id;
          visitCount = byPhone.visit_count ?? 0;
        }
      }
    }

    if (!customerId && email) {
      const { data: byEmail } = await supabase
        .from('customers')
        .select('id, visit_count')
        .eq('email', email.toLowerCase().trim())
        .single();
      if (byEmail) {
        customerId = byEmail.id;
        visitCount = byEmail.visit_count ?? 0;
      }
    }

    // 6. Check single-use per customer
    if (coupon.is_single_use && customerId) {
      const { data: existingUse } = await supabase
        .from('transactions')
        .select('id')
        .eq('coupon_id', coupon.id)
        .eq('customer_id', customerId)
        .limit(1);

      if (existingUse && existingUse.length > 0) {
        return NextResponse.json(
          { error: 'You have already used this coupon' },
          { status: 400 }
        );
      }
    }

    // 7. Check customer targeting
    // 7a. Coupon assigned to a specific customer
    if (coupon.customer_id) {
      if (!customerId || coupon.customer_id !== customerId) {
        return NextResponse.json(
          { error: 'This coupon is assigned to a different customer' },
          { status: 400 }
        );
      }
    }

    // 7b. Coupon requires customer tags
    if (
      coupon.customer_tags &&
      Array.isArray(coupon.customer_tags) &&
      coupon.customer_tags.length > 0
    ) {
      if (!customerId) {
        return NextResponse.json(
          { error: 'A customer account is required to use this coupon' },
          { status: 400 }
        );
      }

      const { data: customer } = await supabase
        .from('customers')
        .select('tags')
        .eq('id', customerId)
        .single();

      const customerTags: string[] =
        customer?.tags && Array.isArray(customer.tags) ? customer.tags : [];
      const requiredTags: string[] = coupon.customer_tags;
      const tagMode: string = coupon.tag_match_mode || 'any';

      if (tagMode === 'all') {
        const hasAll = requiredTags.every((tag: string) =>
          customerTags.includes(tag)
        );
        if (!hasAll) {
          return NextResponse.json(
            { error: 'You are not eligible for this coupon' },
            { status: 400 }
          );
        }
      } else {
        const hasAny = requiredTags.some((tag: string) =>
          customerTags.includes(tag)
        );
        if (!hasAny) {
          return NextResponse.json(
            { error: 'You are not eligible for this coupon' },
            { status: 400 }
          );
        }
      }
    }

    // 8. Check conditions
    const conditions: boolean[] = [];

    // Check min_purchase
    if (coupon.min_purchase != null) {
      conditions.push(subtotal >= coupon.min_purchase);
    }

    // Check max_customer_visits (for new customer discounts)
    if (coupon.max_customer_visits != null) {
      conditions.push(visitCount <= coupon.max_customer_visits);
    }

    // Check service requirements
    const serviceItems = services || [];
    if (coupon.requires_service_ids && coupon.requires_service_ids.length > 0) {
      conditions.push(
        serviceItems.some(
          (item) => coupon.requires_service_ids.includes(item.service_id)
        )
      );
    }

    if (conditions.length > 0) {
      const conditionLogic = coupon.condition_logic || 'and';
      const conditionsMet =
        conditionLogic === 'and'
          ? conditions.every(Boolean)
          : conditions.some(Boolean);

      if (!conditionsMet) {
        // Build helpful error message
        const failedParts: string[] = [];

        if (coupon.min_purchase != null && subtotal < coupon.min_purchase) {
          failedParts.push(
            `minimum purchase of $${coupon.min_purchase.toFixed(2)}`
          );
        }

        if (coupon.max_customer_visits != null) {
          if (coupon.max_customer_visits === 0 && visitCount > 0) {
            failedParts.push('new customers only (no previous visits)');
          } else if (visitCount > coupon.max_customer_visits) {
            failedParts.push(
              `customers with ${coupon.max_customer_visits} or fewer visits`
            );
          }
        }

        if (
          coupon.requires_service_ids &&
          coupon.requires_service_ids.length > 0 &&
          !serviceItems.some((i) =>
            coupon.requires_service_ids.includes(i.service_id)
          )
        ) {
          const { data: svcs } = await supabase
            .from('services')
            .select('name')
            .in('id', coupon.requires_service_ids);
          const names = svcs?.map((s: { name: string }) => s.name) || [];
          if (names.length > 1) {
            failedParts.push(`purchase of one of: ${names.join(', ')}`);
          } else {
            failedParts.push(`purchase of ${names[0] || 'a specific service'}`);
          }
        }

        const joiner = (coupon.condition_logic || 'and') === 'and' ? ' and ' : ' or ';
        return NextResponse.json(
          {
            error: `Coupon requires ${failedParts.join(joiner)}`,
          },
          { status: 400 }
        );
      }
    }

    // 9. Calculate discounts from coupon_rewards
    const rewards: CouponReward[] = coupon.coupon_rewards || [];
    const rewardResults: RewardResult[] = [];

    for (const reward of rewards) {
      let discountAmount = 0;
      let targetName = 'Order';

      if (reward.applies_to === 'order') {
        targetName = 'Order';
        discountAmount = calculateRewardDiscount(reward, subtotal);
      } else if (reward.applies_to === 'service') {
        // For booking, we match services from the booking
        if (reward.target_service_id) {
          const matchingService = serviceItems.find(
            (s) => s.service_id === reward.target_service_id
          );
          if (matchingService) {
            targetName = matchingService.name;
            discountAmount = calculateRewardDiscount(reward, matchingService.price);
          }
        } else {
          // Applies to all services
          targetName = 'Services';
          const totalServicePrice = serviceItems.reduce((sum, s) => sum + s.price, 0);
          discountAmount = calculateRewardDiscount(reward, totalServicePrice);
        }
      }

      discountAmount = round2(discountAmount);

      if (discountAmount > 0) {
        rewardResults.push({
          applies_to: reward.applies_to,
          discount_type: reward.discount_type,
          target_name: targetName,
          discount_amount: discountAmount,
        });
      }
    }

    // Sum up total discount, never exceed subtotal
    let totalDiscount = round2(
      rewardResults.reduce((sum, r) => sum + r.discount_amount, 0)
    );
    totalDiscount = Math.min(totalDiscount, subtotal);
    totalDiscount = round2(totalDiscount);

    // Build description string
    const description = rewardResults
      .map((r) => {
        if (r.discount_type === 'free') {
          return `Free ${r.target_name}`;
        }
        return `${r.target_name} $${r.discount_amount.toFixed(2)} off`;
      })
      .join(' + ') || 'Coupon applied';

    return NextResponse.json({
      data: {
        id: coupon.id,
        code: coupon.code,
        name: coupon.name || null,
        rewards: rewardResults,
        total_discount: totalDiscount,
        description,
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
