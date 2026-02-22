import { createAdminClient } from '@/lib/supabase/admin';
import type { Coupon, CouponReward } from '@/lib/supabase/types';

// ---------------------------------------------------------------------------
// Deterministic Coupon Summary — builds plain-English summary from resolved data
// No AI dependency — pure string templates
// ---------------------------------------------------------------------------

export interface CouponSummaryInput {
  name: string | null;
  code: string;
  // Targeting
  customer_name?: string | null;
  customer_tags?: string[] | null;
  tag_match_mode?: string | null;
  customer_type?: string | null;
  // Conditions
  min_purchase?: number | null;
  max_customer_visits?: number | null;
  requires_product_names?: string[];
  requires_service_names?: string[];
  requires_product_category_names?: string[];
  requires_service_category_names?: string[];
  condition_logic?: string | null;
  // Rewards
  rewards: {
    applies_to: string;
    discount_type: string;
    discount_value: number;
    max_discount: number | null;
    target_name?: string | null;
  }[];
  // Constraints
  is_single_use?: boolean;
  max_uses?: number | null;
  expires_at?: string | null;
}

// ---------------------------------------------------------------------------
// Build summary input by resolving all UUID references to human-readable names
// ---------------------------------------------------------------------------

export async function buildSummaryInput(
  coupon: Coupon,
  rewards: CouponReward[],
): Promise<CouponSummaryInput> {
  const adminDb = createAdminClient();

  // Resolve customer name
  let customerName: string | null = null;
  if (coupon.customer_id) {
    const { data: customer } = await adminDb
      .from('customers')
      .select('first_name, last_name')
      .eq('id', coupon.customer_id)
      .single();
    if (customer) {
      customerName = `${customer.first_name} ${customer.last_name}`.trim();
    }
  }

  // Resolve product names
  let productNames: string[] = [];
  if (coupon.requires_product_ids?.length) {
    const { data } = await adminDb
      .from('products')
      .select('id, name')
      .in('id', coupon.requires_product_ids);
    productNames = data?.map((p) => p.name) || [];
  }

  // Resolve service names
  let serviceNames: string[] = [];
  if (coupon.requires_service_ids?.length) {
    const { data } = await adminDb
      .from('services')
      .select('id, name')
      .in('id', coupon.requires_service_ids);
    serviceNames = data?.map((s) => s.name) || [];
  }

  // Resolve product category names
  let productCategoryNames: string[] = [];
  if (coupon.requires_product_category_ids?.length) {
    const { data } = await adminDb
      .from('product_categories')
      .select('id, name')
      .in('id', coupon.requires_product_category_ids);
    productCategoryNames = data?.map((c) => c.name) || [];
  }

  // Resolve service category names
  let serviceCategoryNames: string[] = [];
  if (coupon.requires_service_category_ids?.length) {
    const { data } = await adminDb
      .from('service_categories')
      .select('id, name')
      .in('id', coupon.requires_service_category_ids);
    serviceCategoryNames = data?.map((c) => c.name) || [];
  }

  // Resolve reward target names
  const resolvedRewards = await Promise.all(
    rewards.map(async (r) => {
      let targetName: string | null = null;

      if (r.target_product_id) {
        const { data } = await adminDb
          .from('products')
          .select('name')
          .eq('id', r.target_product_id)
          .single();
        targetName = data?.name || null;
      } else if (r.target_service_id) {
        const { data } = await adminDb
          .from('services')
          .select('name')
          .eq('id', r.target_service_id)
          .single();
        targetName = data?.name || null;
      } else if (r.target_product_category_id) {
        const { data } = await adminDb
          .from('product_categories')
          .select('name')
          .eq('id', r.target_product_category_id)
          .single();
        targetName = data ? `${data.name} products` : null;
      } else if (r.target_service_category_id) {
        const { data } = await adminDb
          .from('service_categories')
          .select('name')
          .eq('id', r.target_service_category_id)
          .single();
        targetName = data ? `${data.name} services` : null;
      } else if (r.applies_to === 'order') {
        targetName = 'entire order';
      } else if (r.applies_to === 'product') {
        targetName = 'any product';
      } else if (r.applies_to === 'service') {
        targetName = 'any service';
      }

      return {
        applies_to: r.applies_to,
        discount_type: r.discount_type,
        discount_value: r.discount_value,
        max_discount: r.max_discount,
        target_name: targetName,
      };
    }),
  );

  return {
    name: coupon.name,
    code: coupon.code,
    customer_name: customerName,
    customer_tags: coupon.customer_tags,
    tag_match_mode: coupon.tag_match_mode,
    customer_type: coupon.target_customer_type,
    min_purchase: coupon.min_purchase,
    max_customer_visits: coupon.max_customer_visits,
    requires_product_names: productNames,
    requires_service_names: serviceNames,
    requires_product_category_names: productCategoryNames,
    requires_service_category_names: serviceCategoryNames,
    condition_logic: coupon.condition_logic,
    rewards: resolvedRewards,
    is_single_use: coupon.is_single_use,
    max_uses: coupon.max_uses,
    expires_at: coupon.expires_at,
  };
}

// ---------------------------------------------------------------------------
// Build deterministic summary from structured data
// NEVER mentions rewards/discounts (shown separately on POS card).
// Only covers: targeting, cart conditions, and constraints.
// ---------------------------------------------------------------------------

export function buildCouponSummary(input: CouponSummaryInput): string {
  const phrases: string[] = [];

  // 1. WHO qualifies (targeting) — only if restricted
  if (input.customer_name) {
    phrases.push(`For ${input.customer_name} only`);
  } else if (input.customer_type) {
    const label = input.customer_type.charAt(0).toUpperCase() + input.customer_type.slice(1);
    phrases.push(`${label} customers`);
  } else if (input.customer_tags?.length) {
    if (input.tag_match_mode === 'all') {
      phrases.push(`Must have all tags: ${input.customer_tags.join(', ')}`);
    } else {
      phrases.push(`Tagged: ${input.customer_tags.join(', ')}`);
    }
  }

  // 2. WHAT's needed in cart (conditions) — the actionable upsell info
  const conditionPhrases: string[] = [];

  if (input.max_customer_visits != null) {
    if (input.max_customer_visits === 0) {
      conditionPhrases.push('First-time customers only');
    } else {
      conditionPhrases.push(`${input.max_customer_visits} or fewer visits`);
    }
  }
  if (input.min_purchase) {
    conditionPhrases.push(`Min $${input.min_purchase.toFixed(0)} purchase`);
  }
  if (input.requires_service_names?.length) {
    conditionPhrases.push(`Requires: ${input.requires_service_names.join(', ')}`);
  }
  if (input.requires_product_names?.length) {
    conditionPhrases.push(`Requires: ${input.requires_product_names.join(', ')}`);
  }
  if (input.requires_service_category_names?.length) {
    conditionPhrases.push(
      input.requires_service_category_names.map(c => `Add any ${c} service`).join(', ')
    );
  }
  if (input.requires_product_category_names?.length) {
    conditionPhrases.push(
      input.requires_product_category_names.map(c => `Add any ${c} product`).join(', ')
    );
  }

  // If condition_logic is 'or' and multiple conditions, join with " or "
  if (input.condition_logic === 'or' && conditionPhrases.length > 1) {
    phrases.push(conditionPhrases.join(' or '));
  } else {
    phrases.push(...conditionPhrases);
  }

  // 3. Constraints (skip expires_at — already shown as ExpiryBadge)
  if (input.is_single_use) phrases.push('One-time use');
  if (input.max_uses && !input.is_single_use) {
    phrases.push(`Limited: ${input.max_uses} total uses`);
  }

  // If nothing to say, it's unrestricted
  if (phrases.length === 0) {
    return 'No restrictions \u2014 available for any order.';
  }

  return phrases.join(' \u00b7 ');
}
