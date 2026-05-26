/**
 * SMS AI v2 — Anthropic tool definitions.
 *
 * Declarative tool schemas only. NO runner logic. Layer 3 (agent loop)
 * imports these and dispatches each `tool_use` block to the corresponding
 * voice-agent endpoint per audit §1 mapping.
 *
 * Schema convention:
 *   - `name` must match the runner's dispatcher cases exactly.
 *   - `description` is the model's primary signal for tool selection. Keep
 *     it terse, declarative, and prescriptive about WHEN to call.
 *   - Side-effecting tools (writes, sends) carry a "Only call this when the
 *     customer has explicitly confirmed they want to take this action."
 *     sentence — protects against premature action.
 *   - `input_schema` is JSON Schema (subset Anthropic accepts: object root,
 *     properties, required, types). No `$ref`, no `oneOf`.
 *
 * The `@anthropic-ai/sdk` dependency is NOT yet installed (Layer 3 brings
 * it). We define a minimal structural type that matches the Anthropic
 * `Tool` shape so we don't depend on the SDK for declarative data.
 */

export type SmsAiV2ToolName =
  | 'lookup_customer'
  | 'get_services'
  | 'classify_vehicle'
  | 'check_availability'
  | 'create_appointment'
  | 'send_info_sms'
  | 'get_products'
  | 'get_product_details'
  | 'notify_staff'
  | 'send_quote_sms'
  | 'approve_addon'
  | 'decline_addon'
  | 'upsert_customer';

export const TOOL_NAMES: readonly SmsAiV2ToolName[] = [
  'lookup_customer',
  'get_services',
  'classify_vehicle',
  'check_availability',
  'create_appointment',
  'send_info_sms',
  'get_products',
  'get_product_details',
  'notify_staff',
  'send_quote_sms',
  'approve_addon',
  'decline_addon',
  'upsert_customer',
] as const;

export interface SmsAiV2Tool {
  name: SmsAiV2ToolName;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export const SMS_AI_V2_TOOLS: readonly SmsAiV2Tool[] = [
  {
    name: 'lookup_customer',
    description:
      'Look up a customer by phone number. Returns customer profile, vehicles on file, and a count of upcoming appointments. Call this once at the start of any conversation where you do not already have the customer in context. Returns 404 if the phone is unknown — that is an expected result, not an error.',
    input_schema: {
      type: 'object',
      properties: {
        phone: {
          type: 'string',
          description: 'Customer phone number. E.164 preferred but any format accepted; server normalizes.',
        },
      },
      required: ['phone'],
    },
  },
  {
    name: 'get_services',
    description:
      'Return the full active service catalog with current pricing tiers, add-on suggestions, and prerequisites. Call this BEFORE quoting any service — never guess prices from memory. Response is large (~18KB); call once per size_class context (typically once or twice per conversation: once if size_class unknown, then RECALL with size_class after classify_vehicle returns).\n\nCRITICAL: ALWAYS pass `size_class` when calling this after classify_vehicle. Many services (e.g., Hot Shampoo Extraction Complete) have prices that vary by vehicle size — sedan vs SUV vs 3-row van. Without size_class, the response returns the fallback `price` field which may be substantially DIFFERENT from the actual quote price (real-world failure: customer told $300, quote charged $450, customer trust damaged). With size_class, both the correct standard_price AND savings figures populate for size-aware services and addons.\n\nIf you called this BEFORE classify_vehicle returned, you MUST recall it with size_class once size_class is known. Do not rely on the cached non-size-aware response for quoting.\n\nLOOKUP, NEVER RECALL (Issue 43 / D47, 2026-05-26): when the customer mentions a NEW service mid-conversation, INDEX into THIS response\'s `pricing` array for the matching `tier_name` and quote that `price`. Do NOT recall a price from an earlier turn or training-data baseline — that is the empirical Q-0087 failure mode (agent recalled $85 for Express Exterior Wash instead of looking up $110 for the suv_3row_van tier, then self-corrected next turn). Prices vary by size_class, tier, sale-window, and combo eligibility; recall produces stale answers. If the service is missing from your cached response OR the cached response was called without `size_class` for a size-aware service, RECALL `get_services` (with `size_class`) BEFORE quoting. For multi-service quotes, the cached array IS the authoritative source per service; don\'t blend prices across services from memory.\n\nSCOPE-PRICING TIERS (Issue 44 / D47, 2026-05-26): when a returned service has `pricing_model: "scope"` (multiple meaningful tier_name values within one primary service, like Hot Shampoo Extraction\'s floor_mats / per_row / carpet_mats / complete), the per-tier `pricing` entries carry operator-curated human-readable fields: `tier_label` (e.g., "Per Row" / "Floor Mats"), `qty_label` (e.g., "row" for per_row), `max_qty` (per-tier quantity cap). Use `tier_label` in agent prose — NEVER raw snake_case `tier_name` slugs ("per_row", "floor_mats"). The same enrichment ships for `vehicle_size` and `specialty` services for consistency.',
    input_schema: {
      type: 'object',
      properties: {
        size_class: {
          type: 'string',
          enum: ['sedan', 'truck_suv_2row', 'suv_3row_van', 'exotic', 'classic'],
          description:
            'REQUIRED whenever the customer\'s vehicle has been classified via classify_vehicle. Without it, size-aware service prices (Hot Shampoo Extraction Complete, etc.) return the fallback `price` field — which may differ substantially from the actual quote price. With it, both standard_price AND savings populate correctly. Available values match VehicleSizeClass: sedan, truck_suv_2row, suv_3row_van, exotic, classic.\n\nFor exotic and classic vehicles: still escalate via notify_staff per the exotic/classic Critical Rule — do NOT use this parameter to bypass the custom-quote escalation flow. The escalation rule takes precedence.',
        },
      },
    },
  },
  {
    name: 'classify_vehicle',
    description:
      'Classify a vehicle by make/model/year. Returns size_class (sedan, truck_suv_2row, suv_3row_van, exotic, classic), vehicle_category (automobile, motorcycle, rv, boat, aircraft), and a human-friendly tier_name. ALWAYS call this for any vehicle whose type isn\'t already known from customer context — pricing depends on size_class, and exotic/classic/RV/boat/aircraft require notify_staff with reason="custom_quote" rather than a direct quote.',
    input_schema: {
      type: 'object',
      properties: {
        make: { type: 'string', description: 'Vehicle make (required).' },
        model: { type: 'string', description: 'Vehicle model.' },
        year: { type: 'integer', description: 'Vehicle model year.' },
        color: { type: 'string', description: 'Vehicle color (optional context only).' },
      },
      required: ['make'],
    },
  },
  {
    name: 'check_availability',
    description:
      'Return available appointment slots (30-min intervals) for a date, given a service duration. Call this BEFORE suggesting a specific time to the customer. Pass expected_day (lowercase day name) when the customer named a day verbally — the server validates that the date matches and returns a corrected_date if the agent miscalculated.',
    input_schema: {
      type: 'object',
      properties: {
        date: {
          type: 'string',
          description: 'Target date in YYYY-MM-DD format. America/Los_Angeles timezone.',
        },
        service_id: {
          type: 'string',
          description: 'Service UUID. Pass when known so duration is factored in; otherwise server defaults to 60 minutes.',
        },
        expected_day: {
          type: 'string',
          description: 'Day name lowercase (monday, tuesday, …). Server returns error if date is a different day.',
        },
      },
      required: ['date'],
    },
  },
  {
    name: 'create_appointment',
    description:
      'Create a new appointment. TWO BRANCHES: (A) Direct booking — provide service_id, date, time, vehicle details. (B) Quote conversion — provide quote_id (or quote_number like "Q-0023") instead of service_id; services and pricing come from the quote items. Only call this when the customer has explicitly confirmed the date, time, and service. Default status is "pending" — staff confirms after review. Server sends an appointment_confirmed SMS to the customer automatically when sms_consent is true.',
    input_schema: {
      type: 'object',
      properties: {
        customer_name: { type: 'string', description: 'Customer full name (first + last).' },
        customer_phone: { type: 'string', description: 'Customer phone, any format.' },
        service_id: { type: 'string', description: 'Service UUID — required unless quote_id provided.' },
        quote_id: { type: 'string', description: 'Quote UUID or quote_number ("Q-0023"). Required unless service_id provided.' },
        date: { type: 'string', description: 'Appointment date, YYYY-MM-DD.' },
        time: { type: 'string', description: 'Start time, "HH:MM" 24h or "HH:MM AM/PM" 12h.' },
        vehicle_year: { type: 'integer', description: 'Vehicle model year.' },
        vehicle_make: { type: 'string', description: 'Vehicle make.' },
        vehicle_model: { type: 'string', description: 'Vehicle model.' },
        vehicle_color: { type: 'string', description: 'Vehicle color.' },
        notes: { type: 'string', description: 'Free-form notes for staff.' },
      },
      required: ['customer_name', 'customer_phone', 'date', 'time'],
    },
  },
  {
    name: 'send_info_sms',
    description:
      'Text the customer a link or info card. SIX types: "store_info" (address + hours + Maps link), "product_link" (identifier=product slug or name), "category_link" (identifier=category slug or name), "service_page" (identifier=service slug or name), "booking_link" (identifier=optional service hint), "quote_link" (identifier=optional; server finds the most recent actionable quote for the phone). Only call this when the customer has explicitly confirmed they want to receive that info — do not text links the customer did not ask for.',
    input_schema: {
      type: 'object',
      properties: {
        phone: { type: 'string', description: 'Recipient phone, any format.' },
        type: {
          type: 'string',
          enum: ['store_info', 'product_link', 'category_link', 'service_page', 'booking_link', 'quote_link'],
          description: 'Which info card to send.',
        },
        identifier: {
          type: 'string',
          description: 'Slug or name (required for product_link, category_link, service_page; optional for booking_link; ignored for store_info; optional for quote_link).',
        },
      },
      required: ['phone', 'type'],
    },
  },
  {
    name: 'get_products',
    description:
      'Lightweight product catalog — all active products with minimal fields. Use for "what do you carry?" or "do you sell X?" questions. Response is ~38KB so call once and reuse. For "tell me more about X", use get_product_details instead.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_product_details',
    description:
      'Detailed lookup for one or a few specific products. Pass a search term — ILIKE match against name and description. Returns up to 5 products with description, specs, vendor, variants, and product URL.',
    input_schema: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Search term — name or description keyword.' },
      },
      required: ['search'],
    },
  },
  {
    name: 'notify_staff',
    description:
      'Alert staff via SMS when you cannot handle a request yourself. Pick the most specific reason — staff prioritize by reason code. Only call this when escalation is actually needed: specialty vehicles (custom_quote), reschedule/cancel beyond your tools (appointment_change), explicit human request (transfer_request or human_handoff), out-of-area mobile request (mobile_distance), or questions outside your scope (beyond_scope). After calling this, tell the customer staff has been notified and will follow up — do not keep trying to handle the request yourself.',
    input_schema: {
      type: 'object',
      properties: {
        customer_name: { type: 'string', description: 'Customer name or "Unknown" if you have not collected it.' },
        customer_phone: { type: 'string', description: 'Customer phone (the conversation\'s From number).' },
        reason: {
          type: 'string',
          enum: [
            'appointment_change',
            'custom_quote',
            'beyond_scope',
            'transfer_request',
            'mobile_distance',
            'human_handoff',
            'other',
          ],
          description: 'Escalation reason — staff routing depends on this.',
        },
        details: {
          type: 'string',
          description: 'Free-form details: what the customer asked, what you tried, what staff needs to know to follow up.',
        },
      },
      required: ['customer_name', 'customer_phone', 'reason', 'details'],
    },
  },
  {
    name: 'send_quote_sms',
    description:
      'Create a quote AND text the customer a link to it. Server resolves comma-separated service names to catalog entries (sale-aware) and creates a real Quote record.\n\nWHEN TO CALL (Issue 45 / D49, 2026-05-27): call this when the customer has committed to a finalized configuration per Critical Rule 17 auto-send preconditions — commit signal in their most recent message AND total stated in your prior turn AND no mid-flux signals (no change-request, no question, no negation, no trailing modifier proposing a different configuration). You do NOT need the customer to explicitly ask "text me the quote" — the auto-send rule covers proactive firing on configuration-finalization. NEVER ask "Want me to send a quote?" as a permission step (Rule 17 forbids it). Pair the tool call with the auto-send reply ("Sending the quote now — check your texts!") in the SAME turn — tool-result-agnostic phrasing protects against Issue 27-class fabrication if the tool fails.\n\nMulti-tier services (Issue 38 D43): when a service has multiple tiers (e.g., Hot Shampoo Extraction\'s floor_mats / per_row / carpet_mats / complete) AND the customer chose a specific tier that is NOT fully determined by size_class, you MUST pass `tiers` with that tier_name in the same position as the service. Pass `quantities` when the customer chose more than one unit (e.g., "Per Row × 2"). Failing to pass these for tiered services causes the quote to default to a tier the customer was not told about (e.g., agent quotes "$250 per_row × 2", quote document charges $450 complete-tier — same fidelity-gap class as the Issue 36 size_class failure).',
    input_schema: {
      type: 'object',
      properties: {
        phone: { type: 'string', description: 'Recipient phone, any format.' },
        customer_name: { type: 'string', description: 'Customer name, if known.' },
        services: { type: 'string', description: 'Comma-separated service names matching the catalog (e.g. "Express Exterior Wash, Tire Shine"). Positional anchor for the parallel `tiers` and `quantities` arrays — position N in those refers to the service at position N here.' },
        tiers: {
          type: 'string',
          description:
            'OPTIONAL. Comma-separated tier_name values parallel to `services`. Use when the customer chose a specific tier within a multi-tier service (e.g., `per_row` for Hot Shampoo Extraction, `touring_bagger` for Complete Motorcycle Detail). Each token corresponds to the same position in the services list. Use an empty token (e.g. "per_row,,floor_mats") for services that have only one tier OR where the tier is fully determined by size_class (most vehicle_size services like Signature Complete Detail). Tier names come from the `tier_name` field in the get_services response — pass them VERBATIM, do not rename, abbreviate, translate, or guess. If a tier_name does not match a tier on the chosen service, the server rejects the call with an instructions_for_agent directive so you can clarify with the customer and retry.',
        },
        quantities: {
          type: 'string',
          description:
            'OPTIONAL. Comma-separated positive integers parallel to `services` and `tiers`. Use when quoting multiple units of a tier (e.g., "Per Row × 2 rows" → `2`). Defaults to 1 per service when omitted or when a position holds an empty token. Each tier has a `max_qty` configured in the catalog — exceeding it will be rejected with instructions_for_agent so you can confirm the count with the customer and resend.',
        },
        vehicle_year: { type: 'integer', description: 'Vehicle model year.' },
        vehicle_make: { type: 'string', description: 'Vehicle make.' },
        vehicle_model: { type: 'string', description: 'Vehicle model.' },
        vehicle_color: { type: 'string', description: 'Vehicle color.' },
      },
      required: ['phone', 'services'],
    },
  },
  {
    name: 'approve_addon',
    description:
      "Approve a pending addon authorization on the customer's behalf. Only call this when the customer has explicitly confirmed they want to approve the pending addon (e.g., 'yes', 'go ahead', 'sounds good', 'approve it'). Pass the addon's UUID from the customer context's pending_addons list. Only call once per addon.",
    input_schema: {
      type: 'object',
      properties: {
        addon_id: {
          type: 'string',
          description:
            'The UUID of the pending addon to approve. Must match an id in the customer context pending_addons list.',
        },
      },
      required: ['addon_id'],
    },
  },
  {
    name: 'decline_addon',
    description:
      "Decline a pending addon authorization on the customer's behalf. Only call this when the customer has explicitly declined the pending addon (e.g., 'no', 'skip it', 'not today', 'maybe next time'). Pass the addon's UUID from the customer context's pending_addons list. Only call once per addon.",
    input_schema: {
      type: 'object',
      properties: {
        addon_id: {
          type: 'string',
          description:
            'The UUID of the pending addon to decline. Must match an id in the customer context pending_addons list.',
        },
      },
      required: ['addon_id'],
    },
  },
  {
    name: 'upsert_customer',
    description:
      'Create or update the customer record for this conversation. Call this AS SOON as you learn the customer\'s first name — do not wait for a quote or booking trigger. Call AGAIN later in the same conversation as you learn more (last_name, email, address, customer_type signal); only the fields you pass are updated, and human-curated values on existing records are preserved. The customer\'s phone is captured automatically from the SMS conversation — do NOT pass it. customer_type defaults to "enthusiast" if omitted; only pass "professional" on EXPLICIT B2B signals (for my shop, dealership, fleet, bulk purchase). This tool is idempotent — calling it twice with overlapping data is safe. Skip when the customer is already in CUSTOMER CONTEXT (record exists) or when you do not yet have a usable first name.',
    input_schema: {
      type: 'object',
      properties: {
        first_name: {
          type: 'string',
          description: 'Customer first name (required). Never pass placeholder values like "Customer" or "Caller".',
        },
        last_name: {
          type: 'string',
          description: 'Customer last name. Optional; pass when learned.',
        },
        email: {
          type: 'string',
          description: 'Customer email address. Optional; pass when learned.',
        },
        customer_type: {
          type: 'string',
          enum: ['enthusiast', 'professional'],
          description: 'Customer classification. Defaults to "enthusiast" on creation when omitted. Only pass "professional" on explicit B2B signals.',
        },
        address_1: {
          type: 'string',
          description: 'Street address line 1. Optional; pass when learned (e.g. mobile-service location).',
        },
        address_2: {
          type: 'string',
          description: 'Street address line 2 (apt/suite). Optional.',
        },
        city: {
          type: 'string',
          description: 'City. Optional.',
        },
        zip_code: {
          type: 'string',
          description: 'ZIP code. Optional.',
        },
      },
      required: ['first_name'],
    },
  },
] as const;
