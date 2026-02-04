import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface CartItem {
  item_type: 'product' | 'service';
  product_id?: string;
  service_id?: string;
  category_id?: string;
  unit_price: number;
  quantity: number;
  item_name: string;
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

function buildRewardDescription(result: RewardResult): string {
  const { applies_to, discount_type, target_name, discount_amount } = result;
  if (discount_type === 'free') {
    return `Free ${target_name}`;
  }
  if (discount_type === 'percentage') {
    // We don't store the raw percentage on the result, so describe by amount
    return `${target_name} $${discount_amount.toFixed(2)} off`;
  }
  return `${target_name} $${discount_amount.toFixed(2)} off`;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      code,
      subtotal,
      customer_id,
      items,
    }: {
      code: string;
      subtotal: number;
      customer_id?: string;
      items?: CartItem[];
    } = body;

    if (!code) {
      return NextResponse.json(
        { error: 'Coupon code is required' },
        { status: 400 }
      );
    }

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

    // 5. Check single-use per customer
    if (coupon.is_single_use && customer_id) {
      const { data: existingUse } = await supabase
        .from('transactions')
        .select('id')
        .eq('coupon_id', coupon.id)
        .eq('customer_id', customer_id)
        .limit(1);

      if (existingUse && existingUse.length > 0) {
        return NextResponse.json(
          { error: 'You have already used this coupon' },
          { status: 400 }
        );
      }
    }

    // 6. Check customer targeting
    // 6a. Coupon assigned to a specific customer
    if (coupon.customer_id) {
      if (!customer_id || coupon.customer_id !== customer_id) {
        return NextResponse.json(
          { error: 'This coupon is assigned to a different customer' },
          { status: 400 }
        );
      }
    }

    // 6b. Coupon requires customer tags
    if (
      coupon.customer_tags &&
      Array.isArray(coupon.customer_tags) &&
      coupon.customer_tags.length > 0
    ) {
      if (!customer_id) {
        return NextResponse.json(
          { error: 'A customer account is required to use this coupon' },
          { status: 400 }
        );
      }

      const { data: customer } = await supabase
        .from('customers')
        .select('tags')
        .eq('id', customer_id)
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
        // 'any'
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

    // 6c. Check customer_type targeting
    let customerTypeWarning: string | null = null;
    if (coupon.target_customer_type) {
      if (!customer_id) {
        return NextResponse.json(
          { error: 'A customer account is required to use this coupon' },
          { status: 400 }
        );
      }

      // Fetch customer's type (reuse existing customer data if already fetched above, otherwise fetch)
      const { data: typeCustomer } = await supabase
        .from('customers')
        .select('customer_type')
        .eq('id', customer_id)
        .single();

      const customerType = typeCustomer?.customer_type || null;

      if (customerType !== coupon.target_customer_type) {
        const typeLabel = coupon.target_customer_type === 'enthusiast' ? 'Enthusiast' : 'Detailer';

        // Check enforcement mode
        const { data: enforcementSetting } = await supabase
          .from('business_settings')
          .select('value')
          .eq('key', 'coupon_type_enforcement')
          .single();

        const enforcementMode = typeof enforcementSetting?.value === 'string'
          ? enforcementSetting.value
          : 'soft';

        if (enforcementMode === 'hard') {
          return NextResponse.json(
            { error: `This coupon is for ${typeLabel} customers` },
            { status: 400 }
          );
        }

        // Soft mode: allow but set warning
        customerTypeWarning = `This coupon is intended for ${typeLabel} customers`;
      }
    }

    // 7. Check conditions using condition_logic
    const conditionLogic: 'and' | 'or' = coupon.condition_logic || 'and';
    const cartItems: CartItem[] = items || [];

    const conditions: boolean[] = [];

    if (coupon.requires_product_ids && coupon.requires_product_ids.length > 0) {
      conditions.push(
        cartItems.some(
          (item) =>
            item.item_type === 'product' &&
            item.product_id &&
            coupon.requires_product_ids.includes(item.product_id)
        )
      );
    }

    if (coupon.requires_service_ids && coupon.requires_service_ids.length > 0) {
      conditions.push(
        cartItems.some(
          (item) =>
            item.item_type === 'service' &&
            item.service_id &&
            coupon.requires_service_ids.includes(item.service_id)
        )
      );
    }

    if (coupon.requires_product_category_ids && coupon.requires_product_category_ids.length > 0) {
      conditions.push(
        cartItems.some(
          (item) =>
            item.item_type === 'product' &&
            item.category_id &&
            coupon.requires_product_category_ids.includes(item.category_id)
        )
      );
    }

    if (coupon.requires_service_category_ids && coupon.requires_service_category_ids.length > 0) {
      conditions.push(
        cartItems.some(
          (item) =>
            item.item_type === 'service' &&
            item.category_id &&
            coupon.requires_service_category_ids.includes(item.category_id)
        )
      );
    }

    if (coupon.min_purchase != null) {
      conditions.push(subtotal >= coupon.min_purchase);
    }

    if (coupon.max_customer_visits != null) {
      if (!customer_id) {
        conditions.push(false);
      } else {
        const { data: visitCustomer } = await supabase
          .from('customers')
          .select('visit_count')
          .eq('id', customer_id)
          .single();
        conditions.push((visitCustomer?.visit_count ?? 0) <= coupon.max_customer_visits);
      }
    }

    if (conditions.length > 0) {
      const conditionsMet =
        conditionLogic === 'and'
          ? conditions.every(Boolean)
          : conditions.some(Boolean);

      if (!conditionsMet) {
        // Build a helpful error message
        const failedParts: string[] = [];

        if (
          coupon.requires_product_ids &&
          coupon.requires_product_ids.length > 0 &&
          !cartItems.some(
            (i) =>
              i.item_type === 'product' &&
              i.product_id &&
              coupon.requires_product_ids.includes(i.product_id)
          )
        ) {
          const { data: prods } = await supabase
            .from('products')
            .select('name')
            .in('id', coupon.requires_product_ids);
          const names = prods?.map((p: { name: string }) => p.name) || [];
          if (names.length > 1) {
            failedParts.push(`purchase of one of: ${names.join(', ')}`);
          } else {
            failedParts.push(`purchase of ${names[0] || 'a specific product'}`);
          }
        }

        if (
          coupon.requires_service_ids &&
          coupon.requires_service_ids.length > 0 &&
          !cartItems.some(
            (i) =>
              i.item_type === 'service' &&
              i.service_id &&
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

        if (
          coupon.requires_product_category_ids &&
          coupon.requires_product_category_ids.length > 0 &&
          !cartItems.some(
            (i) =>
              i.item_type === 'product' &&
              i.category_id &&
              coupon.requires_product_category_ids.includes(i.category_id)
          )
        ) {
          const { data: cats } = await supabase
            .from('product_categories')
            .select('name')
            .in('id', coupon.requires_product_category_ids);
          const names = cats?.map((c: { name: string }) => c.name) || [];
          if (names.length > 1) {
            failedParts.push(`a product from one of: ${names.join(', ')}`);
          } else {
            failedParts.push(`a product from the ${names[0] || 'required'} category`);
          }
        }

        if (
          coupon.requires_service_category_ids &&
          coupon.requires_service_category_ids.length > 0 &&
          !cartItems.some(
            (i) =>
              i.item_type === 'service' &&
              i.category_id &&
              coupon.requires_service_category_ids.includes(i.category_id)
          )
        ) {
          const { data: cats } = await supabase
            .from('service_categories')
            .select('name')
            .in('id', coupon.requires_service_category_ids);
          const names = cats?.map((c: { name: string }) => c.name) || [];
          if (names.length > 1) {
            failedParts.push(`a service from one of: ${names.join(', ')}`);
          } else {
            failedParts.push(`a service from the ${names[0] || 'required'} category`);
          }
        }

        if (coupon.min_purchase != null && subtotal < coupon.min_purchase) {
          failedParts.push(
            `minimum purchase of $${coupon.min_purchase.toFixed(2)}`
          );
        }

        if (coupon.max_customer_visits != null) {
          if (!customer_id) {
            failedParts.push('a customer account (new customer discount)');
          } else {
            failedParts.push(
              coupon.max_customer_visits === 0
                ? 'new customers only (no previous visits)'
                : `customers with ${coupon.max_customer_visits} or fewer visits`
            );
          }
        }

        const joiner = conditionLogic === 'and' ? ' and ' : ' or ';
        return NextResponse.json(
          {
            error: `Coupon requires ${failedParts.join(joiner)}`,
          },
          { status: 400 }
        );
      }
    }

    // 8. Calculate discounts from coupon_rewards
    const rewards: CouponReward[] = coupon.coupon_rewards || [];
    const rewardResults: RewardResult[] = [];

    for (const reward of rewards) {
      let discountAmount = 0;
      let targetName = 'Order';

      if (reward.applies_to === 'order') {
        targetName = 'Order';
        discountAmount = calculateRewardDiscount(reward, subtotal);
      } else if (reward.applies_to === 'product') {
        const matchingItems = getMatchingItems(
          cartItems,
          'product',
          reward.target_product_id,
          reward.target_product_category_id
        );

        if (matchingItems.length > 0) {
          targetName = reward.target_product_id
            ? matchingItems[0].item_name
            : reward.target_product_category_id
              ? 'Products'
              : 'All Products';

          const totalItemPrice = matchingItems.reduce(
            (sum, item) => sum + item.unit_price * item.quantity,
            0
          );
          discountAmount = calculateRewardDiscount(reward, totalItemPrice);
        }
      } else if (reward.applies_to === 'service') {
        const matchingItems = getMatchingItems(
          cartItems,
          'service',
          reward.target_service_id,
          reward.target_service_category_id
        );

        if (matchingItems.length > 0) {
          targetName = reward.target_service_id
            ? matchingItems[0].item_name
            : reward.target_service_category_id
              ? 'Services'
              : 'All Services';

          const totalItemPrice = matchingItems.reduce(
            (sum, item) => sum + item.unit_price * item.quantity,
            0
          );
          discountAmount = calculateRewardDiscount(reward, totalItemPrice);
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
      .map((r) => buildRewardDescription(r))
      .join(' + ') || 'Coupon applied';

    return NextResponse.json({
      data: {
        id: coupon.id,
        code: coupon.code,
        name: coupon.name || null,
        rewards: rewardResults,
        total_discount: totalDiscount,
        description,
        ...(customerTypeWarning ? { warning: customerTypeWarning } : {}),
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

function getMatchingItems(
  items: CartItem[],
  itemType: 'product' | 'service',
  targetId: string | null,
  targetCategoryId: string | null
): CartItem[] {
  return items.filter((item) => {
    if (item.item_type !== itemType) return false;

    if (targetId) {
      return itemType === 'product'
        ? item.product_id === targetId
        : item.service_id === targetId;
    }

    if (targetCategoryId) {
      return item.category_id === targetCategoryId;
    }

    // No specific target — match all items of this type
    return true;
  });
}
