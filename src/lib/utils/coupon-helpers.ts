// Shared coupon evaluation helpers used by validate route and promotions API

import type { CustomerType } from '@/lib/supabase/types';

export interface CartItem {
  item_type: 'product' | 'service';
  product_id?: string;
  service_id?: string;
  category_id?: string;
  unit_price: number;
  quantity: number;
  item_name: string;
}

export interface CouponRewardRow {
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

export interface CouponRow {
  id: string;
  code: string;
  name: string | null;
  status: string;
  auto_apply: boolean;
  customer_id: string | null;
  customer_tags: string[] | null;
  tag_match_mode: string;
  target_customer_type: string | null;
  condition_logic: string;
  requires_product_ids: string[] | null;
  requires_service_ids: string[] | null;
  requires_product_category_ids: string[] | null;
  requires_service_category_ids: string[] | null;
  min_purchase: number | null;
  max_customer_visits: number | null;
  is_single_use: boolean;
  use_count: number;
  max_uses: number | null;
  expires_at: string | null;
  campaign_id: string | null;
  coupon_rewards: CouponRewardRow[];
}

export interface CustomerData {
  id: string;
  tags: string[];
  customer_type: CustomerType | null;
  visit_count: number;
}

// ─── Targeting ──────────────────────────────────────────────

export interface TargetingResult {
  passed: boolean;
  warning?: string;
}

export function evaluateCouponTargeting(
  coupon: CouponRow,
  customer: CustomerData | null,
  enforcementMode: 'soft' | 'hard'
): TargetingResult {
  // Check customer_id targeting
  if (coupon.customer_id) {
    if (!customer || coupon.customer_id !== customer.id) {
      return { passed: false };
    }
  }

  // Check customer tags
  if (coupon.customer_tags && coupon.customer_tags.length > 0) {
    if (!customer) return { passed: false };

    const customerTags = customer.tags || [];
    const tagMode = coupon.tag_match_mode || 'any';

    if (tagMode === 'all') {
      if (!coupon.customer_tags.every((tag) => customerTags.includes(tag))) {
        return { passed: false };
      }
    } else {
      if (!coupon.customer_tags.some((tag) => customerTags.includes(tag))) {
        return { passed: false };
      }
    }
  }

  // Check customer type
  if (coupon.target_customer_type) {
    if (!customer) return { passed: false };

    if (customer.customer_type !== coupon.target_customer_type) {
      const typeLabel = coupon.target_customer_type === 'enthusiast' ? 'Enthusiast' : 'Professional';
      if (enforcementMode === 'hard') {
        return { passed: false };
      }
      return { passed: true, warning: `This coupon is intended for ${typeLabel} customers` };
    }
  }

  return { passed: true };
}

// ─── Conditions ─────────────────────────────────────────────

export interface ConditionsResult {
  passed: boolean;
  failedConditions: string[];
  missingItems: string[];
}

export function evaluateCouponConditions(
  coupon: CouponRow,
  items: CartItem[],
  subtotal: number,
  customer: CustomerData | null
): ConditionsResult {
  const conditionLogic = coupon.condition_logic || 'and';
  const conditions: { met: boolean; desc: string; missing?: string }[] = [];

  if (coupon.requires_product_ids && coupon.requires_product_ids.length > 0) {
    const met = items.some(
      (i) => i.item_type === 'product' && i.product_id && coupon.requires_product_ids!.includes(i.product_id)
    );
    conditions.push({ met, desc: 'required product', missing: met ? undefined : 'product' });
  }

  if (coupon.requires_service_ids && coupon.requires_service_ids.length > 0) {
    const met = items.some(
      (i) => i.item_type === 'service' && i.service_id && coupon.requires_service_ids!.includes(i.service_id)
    );
    conditions.push({ met, desc: 'required service', missing: met ? undefined : 'service' });
  }

  if (coupon.requires_product_category_ids && coupon.requires_product_category_ids.length > 0) {
    const met = items.some(
      (i) => i.item_type === 'product' && i.category_id && coupon.requires_product_category_ids!.includes(i.category_id)
    );
    conditions.push({ met, desc: 'product from required category', missing: met ? undefined : 'product_category' });
  }

  if (coupon.requires_service_category_ids && coupon.requires_service_category_ids.length > 0) {
    const met = items.some(
      (i) => i.item_type === 'service' && i.category_id && coupon.requires_service_category_ids!.includes(i.category_id)
    );
    conditions.push({ met, desc: 'service from required category', missing: met ? undefined : 'service_category' });
  }

  if (coupon.min_purchase != null) {
    conditions.push({
      met: subtotal >= coupon.min_purchase,
      desc: `minimum purchase of $${coupon.min_purchase.toFixed(2)}`,
      missing: subtotal < coupon.min_purchase ? `min_purchase:${coupon.min_purchase}` : undefined,
    });
  }

  if (coupon.max_customer_visits != null) {
    const met = customer ? customer.visit_count <= coupon.max_customer_visits : false;
    conditions.push({ met, desc: 'visit count limit' });
  }

  if (conditions.length === 0) {
    return { passed: true, failedConditions: [], missingItems: [] };
  }

  const passed = conditionLogic === 'and'
    ? conditions.every((c) => c.met)
    : conditions.some((c) => c.met);

  const failedConditions = conditions.filter((c) => !c.met).map((c) => c.desc);
  const missingItems = conditions.filter((c) => !c.met && c.missing).map((c) => c.missing!);

  return { passed, failedConditions, missingItems };
}

// ─── Discount Calculation ────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function calculateRewardDiscount(
  reward: CouponRewardRow,
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

function getMatchingItems(
  items: CartItem[],
  itemType: 'product' | 'service',
  targetId: string | null,
  targetCategoryId: string | null
): CartItem[] {
  return items.filter((item) => {
    if (item.item_type !== itemType) return false;
    if (targetId) {
      return itemType === 'product' ? item.product_id === targetId : item.service_id === targetId;
    }
    if (targetCategoryId) {
      return item.category_id === targetCategoryId;
    }
    return true;
  });
}

export function calculateCouponDiscount(
  rewards: CouponRewardRow[],
  items: CartItem[],
  subtotal: number
): number {
  let totalDiscount = 0;

  for (const reward of rewards) {
    let discountAmount = 0;

    if (reward.applies_to === 'order') {
      discountAmount = calculateRewardDiscount(reward, subtotal);
    } else if (reward.applies_to === 'product') {
      const matching = getMatchingItems(items, 'product', reward.target_product_id, reward.target_product_category_id);
      if (matching.length > 0) {
        const totalItemPrice = matching.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
        discountAmount = calculateRewardDiscount(reward, totalItemPrice);
      }
    } else if (reward.applies_to === 'service') {
      const matching = getMatchingItems(items, 'service', reward.target_service_id, reward.target_service_category_id);
      if (matching.length > 0) {
        const totalItemPrice = matching.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
        discountAmount = calculateRewardDiscount(reward, totalItemPrice);
      }
    }

    totalDiscount += round2(discountAmount);
  }

  totalDiscount = Math.min(totalDiscount, subtotal);
  return round2(totalDiscount);
}
