import { createAdminClient } from '@/lib/supabase/admin';
import { type SupabaseClient } from '@supabase/supabase-js';
import { getBusinessInfo } from '@/lib/data/business';
import { getBusinessHours, isWithinBusinessHours, formatBusinessHoursText } from '@/lib/data/business-hours';
import { getDefaultSystemPrompt } from '@/lib/services/messaging-ai-prompt';
import type { Message } from '@/lib/supabase/types';

export { getDefaultSystemPrompt } from '@/lib/services/messaging-ai-prompt';

/**
 * Build the system prompt for the AI auto-responder.
 * Uses saved messaging_ai_instructions as the behavioral section (falls back to default template).
 * Appends dynamic data (service catalog, business info, hours, open/closed status) at runtime.
 */
export async function buildSystemPrompt(): Promise<string> {
  const businessInfo = await getBusinessInfo();
  const businessHours = await getBusinessHours();

  const supabase = createAdminClient();

  // Fetch active services with their pricing tiers
  const { data: services } = await supabase
    .from('services')
    .select(`
      name, description, pricing_model, flat_price, custom_starting_price,
      per_unit_price, per_unit_max, per_unit_label, mobile_eligible,
      base_duration_minutes,
      pricing:service_pricing(tier_name, tier_label, price, vehicle_size_sedan_price,
        vehicle_size_truck_suv_price, vehicle_size_suv_van_price, is_vehicle_size_aware, display_order)
    `)
    .eq('is_active', true)
    .order('name');

  // Fetch saved behavioral prompt from settings
  const { data: savedPrompt } = await supabase
    .from('business_settings')
    .select('value')
    .eq('key', 'messaging_ai_instructions')
    .single();

  const savedInstructions = savedPrompt?.value ? String(savedPrompt.value).trim() : '';
  const behavioralPrompt = savedInstructions || getDefaultSystemPrompt();

  const hoursText = businessHours ? formatBusinessHoursText(businessHours) : 'Hours not available';
  const bookingUrl = businessInfo.website ? `${businessInfo.website}/book` : 'our website';
  const isOpen = businessHours ? isWithinBusinessHours(businessHours) : true;

  const serviceCatalog = services?.map((s) => {
    let pricingText = '';

    switch (s.pricing_model) {
      case 'vehicle_size': {
        const tiers = (s.pricing as Array<{
          tier_name: string; price: number;
          vehicle_size_sedan_price: number | null;
          vehicle_size_truck_suv_price: number | null;
          vehicle_size_suv_van_price: number | null;
          display_order: number;
        }>) || [];
        if (tiers.length > 0) {
          const tier = tiers[0];
          if (tier.vehicle_size_sedan_price != null) {
            pricingText = `Sedan $${tier.vehicle_size_sedan_price}, Truck/SUV $${tier.vehicle_size_truck_suv_price}, SUV 3-Row/Van $${tier.vehicle_size_suv_van_price}`;
          } else {
            pricingText = tiers
              .sort((a, b) => a.display_order - b.display_order)
              .map((t) => `${t.tier_name}: $${t.price}`)
              .join(', ');
          }
        } else {
          pricingText = s.flat_price != null ? `$${s.flat_price}` : 'Contact for pricing';
        }
        break;
      }
      case 'scope': {
        const tiers = (s.pricing as Array<{
          tier_name: string; tier_label: string | null; price: number;
          is_vehicle_size_aware: boolean;
          vehicle_size_sedan_price: number | null;
          vehicle_size_truck_suv_price: number | null;
          vehicle_size_suv_van_price: number | null;
          display_order: number;
        }>) || [];
        pricingText = tiers
          .sort((a, b) => a.display_order - b.display_order)
          .map((t) => {
            const label = t.tier_label || t.tier_name;
            if (t.is_vehicle_size_aware && t.vehicle_size_sedan_price != null) {
              return `${label}: Sedan $${t.vehicle_size_sedan_price}, Truck/SUV $${t.vehicle_size_truck_suv_price}, SUV 3-Row/Van $${t.vehicle_size_suv_van_price}`;
            }
            return `${label}: $${t.price}`;
          })
          .join(' | ');
        break;
      }
      case 'specialty': {
        const tiers = (s.pricing as Array<{
          tier_name: string; tier_label: string | null; price: number; display_order: number;
        }>) || [];
        pricingText = tiers
          .sort((a, b) => a.display_order - b.display_order)
          .map((t) => `${t.tier_label || t.tier_name}: $${t.price}`)
          .join(', ');
        break;
      }
      case 'per_unit':
        pricingText = `$${s.per_unit_price} per ${s.per_unit_label || 'unit'}${s.per_unit_max ? ` (max ${s.per_unit_max})` : ''}`;
        break;
      case 'flat':
        pricingText = s.flat_price != null ? `$${s.flat_price}` : 'Contact for pricing';
        break;
      case 'custom':
        pricingText = s.custom_starting_price != null
          ? `Starting at $${s.custom_starting_price}+ (inspection required)`
          : 'Contact for quote';
        break;
      default:
        pricingText = 'Contact for pricing';
    }

    const duration = s.base_duration_minutes
      ? s.base_duration_minutes >= 60
        ? `${Math.floor(s.base_duration_minutes / 60)}-${Math.ceil(s.base_duration_minutes / 60) + 1} hours`
        : `${s.base_duration_minutes} min`
      : '';

    return `- ${s.name}: ${pricingText}${duration ? ` (${duration})` : ''}${s.mobile_eligible ? ' [Mobile]' : ''}`;
  }).join('\n') || 'No services available';

  // Fetch active general-purpose coupons with their rewards (joined via coupon_rewards)
  let couponSection = '';
  try {
    const { data: activeCoupons } = await supabase
      .from('coupons')
      .select(`
        code,
        name,
        expires_at,
        min_purchase,
        customer_id,
        coupon_rewards (
          applies_to,
          discount_type,
          discount_value,
          max_discount,
          target_product_id,
          target_service_id,
          target_product_category_id,
          target_service_category_id,
          products:target_product_id ( name ),
          services:target_service_id ( name ),
          product_categories:target_product_category_id ( name ),
          service_categories:target_service_category_id ( name )
        )
      `)
      .eq('status', 'active')
      .is('customer_id', null)
      .or(`expires_at.is.null,expires_at.gte.${new Date().toISOString()}`);

    if (activeCoupons && activeCoupons.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const promoLines = activeCoupons.map((c: any) => {
        const rewards = c.coupon_rewards || [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const discountParts = rewards.map((r: any) => {
          const targetName =
            r.products?.name ||
            r.services?.name ||
            r.product_categories?.name ||
            r.service_categories?.name ||
            (r.applies_to === 'order' ? 'entire order' :
             r.applies_to === 'product' ? 'any product' : 'any service');

          if (r.discount_type === 'free') return `Free ${targetName}`;
          if (r.discount_type === 'percentage') {
            const cap = r.max_discount ? ` (max $${r.max_discount})` : '';
            return `${r.discount_value}% off ${targetName}${cap}`;
          }
          // flat
          return `$${r.discount_value} off ${targetName}`;
        });

        const discountStr = discountParts.join(' + ') || 'Special offer';
        const expiry = c.expires_at
          ? `expires ${new Date(c.expires_at).toLocaleDateString()}`
          : 'no expiration';
        const minPurchase = c.min_purchase ? ` | min $${c.min_purchase} order` : '';
        const label = c.name ? ` — ${c.name}` : '';
        return `- Code "${c.code}"${label}: ${discountStr} (${expiry}${minPurchase})`;
      });

      couponSection = `\n\nACTIVE PROMOTIONS:\n${promoLines.join('\n')}`;
    }
  } catch (err) {
    console.error('Coupon query failed:', err);
  }

  return `${behavioralPrompt}

PRICING DATA (for your reference only — NEVER send this list to the customer):
${serviceCatalog}

BUSINESS INFO:
${businessInfo.name}
Phone: ${businessInfo.phone}
Hours: ${hoursText}
Status: ${isOpen ? 'CURRENTLY OPEN' : 'CURRENTLY CLOSED'}
Booking: ${bookingUrl}${couponSection}`;
}

// ---------------------------------------------------------------------------
// Product search — inject relevant products into system prompt on demand
// ---------------------------------------------------------------------------

const PRODUCT_KEYWORDS = [
  'product', 'buy', 'sell', 'purchase', 'spray', 'wax', 'cleaner', 'towel',
  'polish', 'soap', 'shampoo', 'kit', 'brush', 'applicator', 'sealant',
  'dressing', 'clay', 'compound', 'pad', 'microfiber', 'glove', 'mitt',
  'tire', 'wheel', 'glass', 'leather', 'interior', 'exterior', 'protectant',
];

async function searchRelevantProducts(
  admin: SupabaseClient,
  customerMessage: string,
  conversationHistory: Array<{ role: string; content: string }>
): Promise<string> {
  // Combine recent messages for keyword detection
  const recentText = [
    customerMessage,
    ...conversationHistory.slice(-3).map((m) => m.content),
  ].join(' ').toLowerCase();

  // Only search if the conversation has product intent
  const hasProductIntent = PRODUCT_KEYWORDS.some((kw) => recentText.includes(kw));
  if (!hasProductIntent) return '';

  // Find which keywords matched to build the search filter
  const matchedTerms = PRODUCT_KEYWORDS.filter((kw) => recentText.includes(kw));

  // Build OR filter for name/description matching
  const orFilters = matchedTerms
    .flatMap((term) => [`name.ilike.%${term}%`, `description.ilike.%${term}%`])
    .join(',');

  const { data: products, error } = await admin
    .from('products')
    .select('name, description, retail_price, category:product_categories(name)')
    .eq('is_active', true)
    .or(orFilters)
    .limit(10);

  if (error || !products || products.length === 0) return '';

  const productLines = products.map((p) => {
    const price = p.retail_price ? `$${Number(p.retail_price).toFixed(2)}` : 'Price varies';
    const catData = p.category as unknown as { name: string } | null;
    const cat = catData?.name;
    const desc = p.description
      ? ` — ${p.description.length > 80 ? p.description.slice(0, 80) + '…' : p.description}`
      : '';
    return `- ${p.name} (${price}${cat ? `, ${cat}` : ''})${desc}`;
  }).join('\n');

  const catalogUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/products`;

  return `\n\nPRODUCTS WE CARRY (relevant to this conversation):\n${productLines}\nBrowse our full product catalog: ${catalogUrl}\n\nWhen discussing products: share name, price, and a brief description. For purchases, share the catalog link so customers can browse online, or let them know they can visit in-store.`;
}

export interface CustomerContext {
  name: string;
  email?: string;
  transaction_history: Array<{
    date: string;
    services: string[];
    total: number;
  }>;
}

/**
 * Get an AI response using the Anthropic Messages API.
 * Passes conversation history for context (up to 20 messages).
 * When customerContext is provided, appends customer info to the system prompt.
 */
export async function getAIResponse(
  conversationHistory: Message[],
  newMessage: string,
  customerContext?: CustomerContext
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured');
  }

  let systemPrompt = await buildSystemPrompt();

  // Search for relevant products based on conversation context
  const admin = createAdminClient();
  const historyForSearch = conversationHistory.slice(-20).map((msg) => ({
    role: msg.direction === 'inbound' ? 'user' : 'assistant',
    content: msg.body,
  }));
  try {
    const productContext = await searchRelevantProducts(admin, newMessage, historyForSearch);
    if (productContext) {
      systemPrompt += productContext;
    }
  } catch (err) {
    console.error('Product search failed:', err);
  }

  // Append customer context for returning customers
  if (customerContext) {
    const historyLines = customerContext.transaction_history
      .map((t) => `- ${t.date}: ${t.services.join(', ')} — $${t.total}`)
      .join('\n');

    systemPrompt += `

CUSTOMER CONTEXT (this is a returning customer — greet them by name):
Name: ${customerContext.name}
${customerContext.email ? `Email: ${customerContext.email}` : ''}

${historyLines ? `TRANSACTION HISTORY:\n${historyLines}` : 'No previous transactions on file.'}

INSTRUCTIONS FOR RETURNING CUSTOMERS:
- Greet them by first name
- Reference their past services: "Last time you got a [service] — would you like to book that again?"
- If they had a premium service, suggest the same tier
- If it's been 2+ months since last visit, suggest a maintenance service
- You already have their vehicle info from past transactions — don't ask for it again
- Focus on booking, not collecting info you already have`;
  }

  // Build message history for context (last 20 messages max)
  const recentHistory = conversationHistory.slice(-20);
  const messages = recentHistory.map((msg) => ({
    role: msg.direction === 'inbound' ? ('user' as const) : ('assistant' as const),
    content: msg.body,
  }));

  // Add the new inbound message
  messages.push({ role: 'user', content: newMessage });

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system: systemPrompt,
      messages,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Anthropic API error:', error);
    throw new Error(`AI response failed: ${response.status}`);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text;

  if (!text) throw new Error('Empty AI response');

  // Return full text — truncation is handled by the webhook after
  // extracting any [GENERATE_QUOTE] blocks from the response.
  return text;
}
