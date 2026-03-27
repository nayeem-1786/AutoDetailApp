import { createAdminClient } from '@/lib/supabase/admin';
import { type SupabaseClient } from '@supabase/supabase-js';
import { getBusinessInfo } from '@/lib/data/business';
import { getBusinessHours, isWithinBusinessHours, formatBusinessHoursText } from '@/lib/data/business-hours';
import { getDefaultSystemPrompt } from '@/lib/services/messaging-ai-prompt';
import { getPendingAddonsForCustomer, buildAddonPromptSection } from '@/lib/services/job-addons';
import type { Message } from '@/lib/supabase/types';

export { getDefaultSystemPrompt } from '@/lib/services/messaging-ai-prompt';

/**
 * Build the system prompt for the AI auto-responder.
 * Uses saved messaging_ai_instructions as the behavioral section (falls back to default template).
 * Appends dynamic data (service catalog, business info, hours, open/closed status) at runtime.
 * When customerId is provided, injects pending addon authorization context.
 */
export async function buildSystemPrompt(customerId?: string | null): Promise<string> {
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

  // Inject pending addon authorization context for this customer
  let addonSection = '';
  if (customerId) {
    try {
      const addons = await getPendingAddonsForCustomer(customerId);
      addonSection = buildAddonPromptSection(addons);
    } catch (err) {
      console.error('Addon context injection failed:', err);
    }
  }

  return `${behavioralPrompt}

PRICING DATA (for your reference only — NEVER send this list to the customer):
${serviceCatalog}

BUSINESS INFO:
${businessInfo.name}
Phone: ${businessInfo.phone}
Hours: ${hoursText}
Status: ${isOpen ? 'CURRENTLY OPEN' : 'CURRENTLY CLOSED'}
Booking: ${bookingUrl}${couponSection}${addonSection}`;
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
  customer_type?: string | null;
  transaction_history: Array<{
    date: string;
    services: string[];
    total: number;
  }>;
  vehicles: Array<{
    year: number | null;
    make: string | null;
    model: string | null;
    color: string | null;
    vehicle_type: string | null;
    size_class: string | null;
  }>;
  appointments: Array<{
    date: string;
    time: string;
    status: string;
    services: string[];
  }>;
  quotes: Array<{
    quote_number: string;
    status: string;
    total: number;
    valid_until: string | null;
    services: string[];
  }>;
  loyalty_points: number;
  notes: string | null;
  tags: string[];
  first_visit: string | null;
  last_visit: string | null;
  visit_count: number;
  lifetime_spend: number;
}

/**
 * Get an AI response using the Anthropic Messages API.
 * Passes conversation history for context (up to 30 messages).
 * When customerContext is provided, appends customer info to the system prompt.
 * When customerId is provided, pending addon authorizations are injected into the prompt.
 * When conversationSummary is provided, injects it for cross-session memory.
 */
export async function getAIResponse(
  conversationHistory: Message[],
  newMessage: string,
  customerContext?: CustomerContext,
  customerId?: string | null,
  conversationSummary?: string | null
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured');
  }

  let systemPrompt = await buildSystemPrompt(customerId);

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

  // Inject conversation summary for cross-session memory
  if (conversationSummary) {
    systemPrompt += `

PREVIOUS CONVERSATION SUMMARY:
The following summary covers earlier parts of this conversation that may not appear in the recent message history. Use this context to maintain continuity — reference past discussions naturally without re-asking questions that were already answered.

${conversationSummary}`;
  }

  // Append customer context for returning customers
  if (customerContext) {
    const historyLines = customerContext.transaction_history
      .map((t) => `- ${t.date}: ${t.services.join(', ')} — $${t.total}`)
      .join('\n');

    const vehicleLines = customerContext.vehicles
      .map((v) => {
        const parts = [v.year, v.color, v.make, v.model].filter(Boolean);
        const sizeInfo = v.size_class ? ` (${v.size_class})` : '';
        return `- ${parts.join(' ') || 'Vehicle'}${sizeInfo}`;
      })
      .join('\n');

    const appointmentLines = customerContext.appointments
      .map((a) => `- ${a.date} at ${a.time}: ${a.services.join(', ')} [${a.status}]`)
      .join('\n');

    const quoteLines = customerContext.quotes
      .map((q) => {
        const validStr = q.valid_until
          ? `, valid until ${new Date(q.valid_until).toLocaleDateString()}`
          : '';
        return `- ${q.quote_number} (${q.status}${validStr}): ${q.services.join(', ')} — $${q.total}`;
      })
      .join('\n');

    const loyaltyValue = (customerContext.loyalty_points * 0.05).toFixed(2);

    const engagementParts: string[] = [];
    if (customerContext.first_visit) engagementParts.push(`Customer since ${customerContext.first_visit}`);
    if (customerContext.visit_count > 0) engagementParts.push(`${customerContext.visit_count} visits`);
    if (customerContext.lifetime_spend > 0) engagementParts.push(`$${customerContext.lifetime_spend.toFixed(0)} lifetime spend`);
    if (customerContext.last_visit) engagementParts.push(`Last visit: ${customerContext.last_visit}`);

    systemPrompt += `

CUSTOMER CONTEXT (this is a returning customer — greet them by name):
Name: ${customerContext.name}
${customerContext.email ? `Email: ${customerContext.email}` : ''}
${customerContext.customer_type ? `Type: ${customerContext.customer_type}` : ''}

${vehicleLines ? `VEHICLES ON FILE:\n${vehicleLines}` : 'No vehicles on file.'}

${appointmentLines ? `UPCOMING APPOINTMENTS:\n${appointmentLines}` : 'No upcoming appointments.'}

${quoteLines ? `RECENT QUOTES:\n${quoteLines}` : ''}

${historyLines ? `TRANSACTION HISTORY:\n${historyLines}` : 'No previous transactions on file.'}

${customerContext.loyalty_points > 0 ? `LOYALTY: ${customerContext.loyalty_points} points ($${loyaltyValue} value)` : ''}

${customerContext.notes ? `STAFF NOTES: ${customerContext.notes}` : ''}
${customerContext.tags.length > 0 ? `TAGS: ${customerContext.tags.join(', ')}` : ''}

${engagementParts.length > 0 ? `ENGAGEMENT: ${engagementParts.join(' | ')}` : ''}

INSTRUCTIONS FOR RETURNING CUSTOMERS:
- Greet them by first name
- Reference their vehicles by name (e.g., "your 2020 Honda Accord") — NEVER re-ask for vehicle info you already have
- If they have an upcoming appointment, mention it proactively
- If a recent quote is still valid, ask if they'd like to proceed with it
- Reference their past services: "Last time you got a [service] — would you like to book that again?"
- If they had a premium service, suggest the same tier
- If it's been 2+ months since last visit, suggest a maintenance service
- If loyalty balance > 100 points ($5+ value), mention they can redeem points on their next visit
- Focus on booking, not collecting info you already have
- Only ask for vehicle info if they mention a DIFFERENT vehicle not in their profile`;
  }

  // Build message history for context (last 100 messages max)
  const recentHistory = conversationHistory.slice(-100);
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
