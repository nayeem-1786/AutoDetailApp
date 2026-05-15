import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizePhone } from '@/lib/utils/format';
import { getSaleStatus } from '@/lib/utils/sale-pricing';
import {
  calculateCouponDiscount,
  type CartItem,
  type CouponRewardRow,
} from '@/lib/utils/coupon-helpers';

interface ServiceItem {
  service_id: string;
  name: string;
  price: number;
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
    const serviceItems = services || [];
    const serviceIds = serviceItems.map((s) => s.service_id);

    // Fetch service details for category matching + sale detection
    const { data: serviceDetails } = serviceIds.length > 0
      ? await supabase
          .from('services')
          .select('id, category_id, pricing_model, flat_price, per_unit_price, sale_price, sale_starts_at, sale_ends_at, service_pricing(tier_name, price, sale_price)')
          .in('id', serviceIds)
      : { data: [] as { id: string; category_id: string | null; pricing_model: string; flat_price: number | null; per_unit_price: number | null; sale_price: number | null; sale_starts_at: string | null; sale_ends_at: string | null; service_pricing: { tier_name: string; price: number; sale_price: number | null }[] }[] };

    const conditions: boolean[] = [];

    // Check min_purchase
    if (coupon.min_purchase != null) {
      conditions.push(subtotal >= coupon.min_purchase);
    }

    // Check max_customer_visits (for new customer discounts)
    if (coupon.max_customer_visits != null) {
      conditions.push(visitCount <= coupon.max_customer_visits);
    }

    // Check service requirements (requires_service_ids)
    if (coupon.requires_service_ids && coupon.requires_service_ids.length > 0) {
      conditions.push(
        serviceItems.some((item) =>
          coupon.requires_service_ids.includes(item.service_id)
        )
      );
    }

    // Check service category requirements (requires_service_category_ids)
    let serviceCategoryMatch = true;
    if (
      coupon.requires_service_category_ids &&
      coupon.requires_service_category_ids.length > 0
    ) {
      const customerServiceCategoryIds =
        serviceDetails
          ?.map((s: { category_id: string | null }) => s.category_id)
          .filter(Boolean) || [];

      serviceCategoryMatch = coupon.requires_service_category_ids.some(
        (catId: string) => customerServiceCategoryIds.includes(catId)
      );
      conditions.push(serviceCategoryMatch);
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
            failedParts.push(`one of these services: ${names.join(', ')}`);
          } else {
            failedParts.push(`the "${names[0] || 'required'}" service`);
          }
        }

        if (
          coupon.requires_service_category_ids &&
          coupon.requires_service_category_ids.length > 0 &&
          !serviceCategoryMatch
        ) {
          const { data: cats } = await supabase
            .from('service_categories')
            .select('name')
            .in('id', coupon.requires_service_category_ids);
          const catNames =
            cats?.map((c: { name: string }) => c.name) || [];
          if (catNames.length > 1) {
            failedParts.push(
              `a service from one of these categories: ${catNames.join(', ')}`
            );
          } else {
            failedParts.push(
              `a service from the "${catNames[0] || 'required'}" category`
            );
          }
        }

        const joiner =
          (coupon.condition_logic || 'and') === 'and' ? ' and ' : ' or ';
        return NextResponse.json(
          {
            error: `This coupon does not apply to your selected services. It requires ${failedParts.join(joiner)}.`,
          },
          { status: 400 }
        );
      }
    }

    // 9. Map booking services into CartItem[] with sale detection
    const cartItems: CartItem[] = serviceItems.map((item) => {
      const svc = serviceDetails?.find((s: { id: string }) => s.id === item.service_id);
      let pricingType: string = 'standard';

      if (svc) {
        const { isOnSale } = getSaleStatus({
          sale_starts_at: svc.sale_starts_at,
          sale_ends_at: svc.sale_ends_at,
        });

        if (isOnSale) {
          switch (svc.pricing_model) {
            case 'flat':
              if (svc.sale_price != null && svc.flat_price != null && svc.sale_price < svc.flat_price) {
                pricingType = 'sale';
              }
              break;
            case 'per_unit':
              if (svc.sale_price != null && svc.per_unit_price != null && svc.sale_price < svc.per_unit_price) {
                pricingType = 'sale';
              }
              break;
            default: {
              // Tiered (vehicle_size, scope, specialty): check if submitted price matches a tier's sale_price
              const tiers: { tier_name: string; price: number; sale_price: number | null }[] = svc.service_pricing || [];
              const matchesTierSale = tiers.some(
                (t) => t.sale_price != null && t.sale_price < t.price && item.price === t.sale_price
              );
              if (matchesTierSale) {
                pricingType = 'sale';
              }
              break;
            }
          }
        }
      }

      return {
        item_type: 'service' as const,
        service_id: item.service_id,
        category_id: svc?.category_id ?? undefined,
        unit_price: item.price,
        quantity: 1,
        item_name: item.name,
        pricing_type: pricingType,
      };
    });

    // 10. No-stacking: reject if ALL items are on sale
    const allOnSale = cartItems.length > 0 && cartItems.every((i) => i.pricing_type === 'sale');
    if (allOnSale) {
      return NextResponse.json(
        { error: 'Coupon cannot be applied — all items already have sale pricing' },
        { status: 400 }
      );
    }

    // 11. Calculate discounts using shared utility
    const rewards: CouponRewardRow[] = coupon.coupon_rewards || [];
    const result = calculateCouponDiscount(rewards, cartItems, subtotal);

    // If ALL rewards targeted specific services and NONE matched eligible items,
    // the coupon doesn't apply to the selected services
    if (rewards.length > 0 && result.rewards.length === 0 && result.excluded_count === 0) {
      const targetServiceIds = rewards
        .filter((r) => r.target_service_id)
        .map((r) => r.target_service_id);
      const targetCategoryIds = rewards
        .filter((r) => r.target_service_category_id)
        .map((r) => r.target_service_category_id);

      const errorParts: string[] = [];

      if (targetServiceIds.length > 0) {
        const { data: targetServices } = await supabase
          .from('services')
          .select('name')
          .in('id', targetServiceIds.filter(Boolean) as string[]);
        const serviceNames =
          targetServices?.map((s: { name: string }) => s.name) || [];
        if (serviceNames.length > 0) {
          errorParts.push(
            serviceNames.length === 1
              ? `the "${serviceNames[0]}" service`
              : `one of these services: ${serviceNames.join(', ')}`
          );
        }
      }

      if (targetCategoryIds.length > 0) {
        const { data: targetCategories } = await supabase
          .from('service_categories')
          .select('name')
          .in('id', targetCategoryIds.filter(Boolean) as string[]);
        const catNames =
          targetCategories?.map((c: { name: string }) => c.name) || [];
        if (catNames.length > 0) {
          errorParts.push(
            catNames.length === 1
              ? `a service from the "${catNames[0]}" category`
              : `a service from one of these categories: ${catNames.join(', ')}`
          );
        }
      }

      if (errorParts.length > 0) {
        return NextResponse.json(
          {
            error: `This coupon only applies to ${errorParts.join(' or ')}. Please select an eligible service to use this coupon.`,
          },
          { status: 400 }
        );
      }
    }

    return NextResponse.json({
      data: {
        id: coupon.id,
        code: coupon.code,
        name: coupon.name || null,
        rewards: result.rewards,
        total_discount: result.total_discount,
        description: result.description,
        excluded_count: result.excluded_count,
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
