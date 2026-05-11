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
    const { phone, email, service_id, addon_ids } = body;

    if (!phone && !email) {
      return NextResponse.json(
        { error: 'Phone or email is required' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Collect all service IDs for eligibility checking
    const allServiceIds: string[] = [];
    if (service_id) allServiceIds.push(service_id);
    if (addon_ids && Array.isArray(addon_ids)) {
      allServiceIds.push(...addon_ids);
    }

    // Get service categories for eligibility checking
    let serviceCategoryIds: string[] = [];
    if (allServiceIds.length > 0) {
      const { data: servicesWithCategories } = await supabase
        .from('services')
        .select('id, category_id')
        .in('id', allServiceIds);
      serviceCategoryIds =
        servicesWithCategories
          ?.map((s: { category_id: string | null }) => s.category_id)
          .filter(Boolean) as string[] || [];
    }

    // Try to find customer by phone first (primary identifier)
    // Phase Mobile-1.1: include structured address columns so the booking
    // wizard can backfill the mobile address pre-fill when a guest's phone
    // resolves to an existing customer mid-flow.
    let customer = null;

    const CUSTOMER_LOOKUP_SELECT =
      'id, visit_count, address_line_1, address_line_2, city, state, zip';

    if (phone) {
      const e164Phone = normalizePhone(phone);
      if (e164Phone) {
        const { data: byPhone } = await supabase
          .from('customers')
          .select(CUSTOMER_LOOKUP_SELECT)
          .eq('phone', e164Phone)
          .is('deleted_at', null)
          .single();
        customer = byPhone;
      }
    }

    // Fallback to email if no phone match
    if (!customer && email) {
      const { data: byEmail } = await supabase
        .from('customers')
        .select(CUSTOMER_LOOKUP_SELECT)
        .eq('email', email.toLowerCase().trim())
        .is('deleted_at', null)
        .single();
      customer = byEmail;
    }

    if (!customer) {
      // New customer - no visit history, no coupons
      return NextResponse.json({
        isExisting: false,
        visitCount: 0,
        availableCoupons: [],
        customer: null,
      });
    }

    // Existing customer - fetch their assigned coupons
    const now = new Date().toISOString();

    const { data: coupons } = await supabase
      .from('coupons')
      .select(
        'id, code, name, min_purchase, expires_at, is_single_use, requires_service_ids, requires_service_category_ids, coupon_rewards(*)'
      )
      .eq('customer_id', customer.id)
      .eq('status', 'active')
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .order('created_at', { ascending: false });

    // Filter out coupons the customer has already used (if single-use)
    // and check eligibility for selected services
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

        // Service eligibility — skip ALL ineligible coupons (no dimmed state)
        if (allServiceIds.length > 0) {
          const reqServiceIds = coupon.requires_service_ids as string[] | null;
          if (reqServiceIds && reqServiceIds.length > 0) {
            if (!reqServiceIds.some((reqId: string) => allServiceIds.includes(reqId))) {
              continue;
            }
          }

          const reqCatIds = coupon.requires_service_category_ids as string[] | null;
          if (reqCatIds && reqCatIds.length > 0) {
            if (!reqCatIds.some((catId: string) => serviceCategoryIds.includes(catId))) {
              continue;
            }
          }

          const rewards = coupon.coupon_rewards as CouponReward[] | null;
          if (rewards) {
            const serviceRewards = rewards.filter(
              (r: CouponReward) => r.applies_to === 'service' && r.target_service_id
            );
            if (serviceRewards.length > 0) {
              if (!serviceRewards.some((r: CouponReward) => allServiceIds.includes(r.target_service_id!))) {
                continue;
              }
            }
          }
        }

        // Skip coupons with 0-value rewards (bad data — e.g. "0% off")
        const rewards = coupon.coupon_rewards as CouponReward[] | null;
        if (rewards && rewards.length > 0) {
          const hasUsefulReward = rewards.some(
            (r: CouponReward) => r.discount_type === 'free' || r.discount_value > 0
          );
          if (!hasUsefulReward) continue;
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
      // Phase Mobile-1.1: surface address columns so the booking wizard
      // can pre-fill the mobile address field (LOCKED-8B) when a guest's
      // phone resolves to an existing customer with a profile address.
      customer: {
        id: customer.id,
        address_line_1: customer.address_line_1 ?? null,
        address_line_2: customer.address_line_2 ?? null,
        city: customer.city ?? null,
        state: customer.state ?? null,
        zip: customer.zip ?? null,
      },
    });
  } catch (err) {
    console.error('Check customer error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
