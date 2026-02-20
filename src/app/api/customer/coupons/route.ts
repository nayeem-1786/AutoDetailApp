import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

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

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createAdminClient();

    const { data: customer } = await admin
      .from('customers')
      .select('id, tags')
      .eq('auth_user_id', user.id)
      .single();

    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    // Parse service context from query params
    const { searchParams } = new URL(request.url);
    const serviceId = searchParams.get('service_id');
    const addonIdsStr = searchParams.get('addon_ids');
    const addonIds = addonIdsStr ? addonIdsStr.split(',').filter(Boolean) : [];
    const allServiceIds = [serviceId, ...addonIds].filter(Boolean) as string[];

    // Get service categories for eligibility checking
    let serviceCategoryIds: string[] = [];
    if (allServiceIds.length > 0) {
      const { data: servicesWithCategories } = await admin
        .from('services')
        .select('id, category_id')
        .in('id', allServiceIds);
      serviceCategoryIds =
        servicesWithCategories
          ?.map((s: { category_id: string | null }) => s.category_id)
          .filter(Boolean) as string[] || [];
    }

    const now = new Date().toISOString();
    const customerTags: string[] = (customer.tags as string[]) ?? [];

    // Fetch coupons that are:
    // 1. Specifically assigned to this customer (customer_id = customer.id)
    // 2. OR available to everyone (customer_id IS NULL) with optional tag matching
    const { data: coupons, error } = await admin
      .from('coupons')
      .select(
        'id, code, name, min_purchase, expires_at, is_single_use, customer_id, customer_tags, tag_match_mode, requires_service_ids, requires_service_category_ids, coupon_rewards(*)'
      )
      .or(`customer_id.eq.${customer.id},customer_id.is.null`)
      .eq('status', 'active')
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Fetch coupons error:', error.message);
      return NextResponse.json({ error: 'Failed to fetch coupons' }, { status: 500 });
    }

    // Filter by customer tags and service eligibility
    const filteredCoupons = [];

    for (const coupon of coupons ?? []) {
      // Tag filtering
      const couponTags = coupon.customer_tags as string[] | null;
      if (couponTags && couponTags.length > 0) {
        const matchMode = coupon.tag_match_mode || 'any';
        if (matchMode === 'all') {
          if (!couponTags.every((tag) => customerTags.includes(tag))) continue;
        } else {
          if (!couponTags.some((tag) => customerTags.includes(tag))) continue;
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

          const serviceCategoryRewards = rewards.filter(
            (r: CouponReward) =>
              r.applies_to === 'service' &&
              r.target_service_category_id &&
              !r.target_service_id
          );
          if (serviceCategoryRewards.length > 0) {
            if (!serviceCategoryRewards.some((r: CouponReward) => serviceCategoryIds.includes(r.target_service_category_id!))) {
              const allRewardsTargetSpecific = rewards.every(
                (r: CouponReward) =>
                  r.target_service_id ||
                  r.target_service_category_id ||
                  r.target_product_id ||
                  r.target_product_category_id
              );
              if (allRewardsTargetSpecific) continue;
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

      // Remove internal fields before returning
      const {
        customer_id: _customerId,
        customer_tags: _tags,
        tag_match_mode: _matchMode,
        requires_service_ids: _reqSvcIds,
        requires_service_category_ids: _reqCatIds,
        ...rest
      } = coupon;

      filteredCoupons.push(rest);
    }

    return NextResponse.json({ data: filteredCoupons });
  } catch (err) {
    console.error('Coupons GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
