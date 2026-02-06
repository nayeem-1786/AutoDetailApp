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
  is_eligible: boolean;
  ineligibility_reason: string | null;
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

        // Check eligibility based on service requirements
        let isEligible = true;
        let ineligibilityReason: string | null = null;

        // Check requires_service_ids
        if (
          coupon.requires_service_ids &&
          coupon.requires_service_ids.length > 0
        ) {
          const hasRequiredService = coupon.requires_service_ids.some(
            (reqId: string) => allServiceIds.includes(reqId)
          );
          if (!hasRequiredService) {
            isEligible = false;
            // Get names of required services
            const { data: reqServices } = await supabase
              .from('services')
              .select('name')
              .in('id', coupon.requires_service_ids);
            const names =
              reqServices?.map((s: { name: string }) => s.name) || [];
            ineligibilityReason =
              names.length === 1
                ? `Requires "${names[0]}" service`
                : `Requires one of: ${names.join(', ')}`;
          }
        }

        // Check requires_service_category_ids
        if (
          isEligible &&
          coupon.requires_service_category_ids &&
          coupon.requires_service_category_ids.length > 0
        ) {
          const hasRequiredCategory = coupon.requires_service_category_ids.some(
            (catId: string) => serviceCategoryIds.includes(catId)
          );
          if (!hasRequiredCategory) {
            isEligible = false;
            // Get names of required categories
            const { data: reqCats } = await supabase
              .from('service_categories')
              .select('name')
              .in('id', coupon.requires_service_category_ids);
            const catNames =
              reqCats?.map((c: { name: string }) => c.name) || [];
            ineligibilityReason =
              catNames.length === 1
                ? `Requires a "${catNames[0]}" service`
                : `Requires a service from: ${catNames.join(', ')}`;
          }
        }

        // Check if rewards target specific services not in cart
        if (isEligible && coupon.coupon_rewards) {
          const serviceRewards = coupon.coupon_rewards.filter(
            (r: CouponReward) =>
              r.applies_to === 'service' && r.target_service_id
          );
          if (serviceRewards.length > 0) {
            const hasMatchingService = serviceRewards.some((r: CouponReward) =>
              allServiceIds.includes(r.target_service_id!)
            );
            if (!hasMatchingService) {
              isEligible = false;
              const targetIds = serviceRewards
                .map((r: CouponReward) => r.target_service_id)
                .filter(Boolean);
              const { data: targetServices } = await supabase
                .from('services')
                .select('name')
                .in('id', targetIds as string[]);
              const names =
                targetServices?.map((s: { name: string }) => s.name) || [];
              ineligibilityReason =
                names.length === 1
                  ? `Only applies to "${names[0]}" service`
                  : `Only applies to: ${names.join(', ')}`;
            }
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
          is_eligible: isEligible,
          ineligibility_reason: ineligibilityReason,
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
