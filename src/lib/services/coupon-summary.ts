import { createAdminClient } from '@/lib/supabase/admin';
import type { Coupon, CouponReward } from '@/lib/supabase/types';
import { formatCurrency } from '@/lib/utils/format';

// ---------------------------------------------------------------------------
// AI Coupon Summary — generates plain-English summary for POS + admin display
// Reuses ANTHROPIC_API_KEY from existing AI integrations
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
// Generate summary via Claude API
// ---------------------------------------------------------------------------

export async function generateCouponSummary(
  input: CouponSummaryInput,
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured');
  }

  const prompt = buildPrompt(input);

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('AI coupon summary generation failed:', error);
    throw new Error(`AI coupon summary failed: ${response.status}`);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text;

  if (!text) {
    throw new Error('Empty AI summary response');
  }

  return text.trim();
}

// ---------------------------------------------------------------------------
// Build prompt from structured data
// ---------------------------------------------------------------------------

function buildPrompt(input: CouponSummaryInput): string {
  const parts: string[] = [];

  // Rewards
  for (const r of input.rewards) {
    if (r.discount_type === 'free') {
      parts.push(`Reward: Free ${r.target_name || r.applies_to}`);
    } else if (r.discount_type === 'percentage') {
      const cap = r.max_discount
        ? ` (max ${formatCurrency(r.max_discount)})`
        : '';
      parts.push(
        `Reward: ${r.discount_value}% off ${r.target_name || r.applies_to}${cap}`,
      );
    } else {
      parts.push(
        `Reward: ${formatCurrency(r.discount_value)} off ${r.target_name || r.applies_to}`,
      );
    }
  }

  // Targeting
  if (input.customer_name) {
    parts.push(`For: ${input.customer_name} only`);
  } else if (input.customer_tags?.length) {
    parts.push(
      `For: Customers tagged ${input.tag_match_mode === 'all' ? 'ALL of' : 'any of'}: ${input.customer_tags.join(', ')}`,
    );
  } else if (input.customer_type) {
    parts.push(`For: ${input.customer_type} customers`);
  }

  // Conditions
  if (input.min_purchase) {
    parts.push(
      `Requires minimum purchase of ${formatCurrency(input.min_purchase)}`,
    );
  }
  if (input.max_customer_visits != null) {
    parts.push(
      input.max_customer_visits === 0
        ? 'New customers only'
        : `Customers with ${input.max_customer_visits} or fewer visits`,
    );
  }
  if (input.requires_product_names?.length) {
    parts.push(
      `Requires product(s): ${input.requires_product_names.join(', ')}`,
    );
  }
  if (input.requires_service_names?.length) {
    parts.push(
      `Requires service(s): ${input.requires_service_names.join(', ')}`,
    );
  }
  if (input.requires_product_category_names?.length) {
    parts.push(
      `Requires product category: ${input.requires_product_category_names.join(', ')}`,
    );
  }
  if (input.requires_service_category_names?.length) {
    parts.push(
      `Requires service category: ${input.requires_service_category_names.join(', ')}`,
    );
  }
  if (
    input.condition_logic === 'or' &&
    parts.filter((p) => p.startsWith('Requires')).length > 1
  ) {
    parts.push('(Any ONE condition is enough)');
  }

  // Constraints
  if (input.is_single_use) parts.push('Single use per customer');
  if (input.max_uses) parts.push(`Limited to ${input.max_uses} total uses`);
  if (input.expires_at) {
    const date = new Date(input.expires_at);
    parts.push(`Expires: ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`);
  }

  return `You are writing a short, plain-English summary of a coupon/promotion for a point-of-sale system at an auto detailing business. The summary will be shown to cashiers and store managers.

Summarize this coupon in 1-2 concise sentences. Be conversational and clear. Don't use technical terms like "applies_to", "flat", "percentage". Don't repeat the coupon code. Focus on what the customer gets and any important conditions.

Coupon data:
${parts.join('\n')}

Write ONLY the summary — no quotes, no labels, no preamble.`;
}
