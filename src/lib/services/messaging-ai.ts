import { createAdminClient } from '@/lib/supabase/admin';
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

  return `${behavioralPrompt}

PRICING DATA (for your reference only — NEVER send this list to the customer):
${serviceCatalog}

BUSINESS INFO:
${businessInfo.name}
Phone: ${businessInfo.phone}
Hours: ${hoursText}
Status: ${isOpen ? 'CURRENTLY OPEN' : 'CURRENTLY CLOSED'}
Booking: ${bookingUrl}`;
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
      max_tokens: 300,
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

  // Truncate to 320 chars for SMS-friendliness (2 segments max)
  return text.length > 320 ? text.slice(0, 317) + '...' : text;
}
