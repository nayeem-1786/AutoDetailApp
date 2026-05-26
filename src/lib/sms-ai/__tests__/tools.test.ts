import { describe, it, expect } from 'vitest';

import {
  SMS_AI_V2_TOOLS,
  TOOL_NAMES,
  type SmsAiV2Tool,
  type SmsAiV2ToolName,
} from '@/lib/sms-ai/tools';

describe('SMS_AI_V2_TOOLS — declarative tool schema', () => {
  it('contains exactly 13 tools', () => {
    expect(SMS_AI_V2_TOOLS).toHaveLength(13);
  });

  it('every tool name is unique', () => {
    const names = SMS_AI_V2_TOOLS.map((t) => t.name);
    const dedupe = new Set(names);
    expect(dedupe.size).toBe(names.length);
  });

  it('TOOL_NAMES const matches SMS_AI_V2_TOOLS by name and order', () => {
    expect(TOOL_NAMES).toEqual(SMS_AI_V2_TOOLS.map((t) => t.name));
  });

  it('TOOL_NAMES contains all expected names', () => {
    const expected: SmsAiV2ToolName[] = [
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
    ];
    expect([...TOOL_NAMES].sort()).toEqual([...expected].sort());
  });

  it('every tool has non-empty description', () => {
    for (const tool of SMS_AI_V2_TOOLS) {
      expect(tool.description.length).toBeGreaterThan(30);
    }
  });

  it('every tool has input_schema as an object schema', () => {
    for (const tool of SMS_AI_V2_TOOLS) {
      expect(tool.input_schema.type).toBe('object');
      expect(typeof tool.input_schema.properties).toBe('object');
    }
  });

  it('every property in input_schema has a type', () => {
    for (const tool of SMS_AI_V2_TOOLS) {
      for (const [propName, propDef] of Object.entries(tool.input_schema.properties)) {
        const def = propDef as { type?: string };
        expect(def.type, `${tool.name}.${propName} must declare a type`).toBeDefined();
      }
    }
  });

  it('every required field is also declared in properties', () => {
    for (const tool of SMS_AI_V2_TOOLS) {
      for (const req of tool.input_schema.required ?? []) {
        expect(
          tool.input_schema.properties[req],
          `${tool.name}: required field "${req}" missing from properties`,
        ).toBeDefined();
      }
    }
  });

  it('side-effecting tools carry an explicit "Only call when ... confirmed" gate in their description', () => {
    // Audit §1 — tools 5, 6, 9, 10 have write/send side effects. Their
    // descriptions must include a confirmation gate to protect against
    // premature model action.
    const sideEffectTools: SmsAiV2ToolName[] = [
      'create_appointment',
      'send_info_sms',
      'send_quote_sms',
    ];
    for (const name of sideEffectTools) {
      const tool = SMS_AI_V2_TOOLS.find((t) => t.name === name)!;
      expect(
        tool.description.toLowerCase(),
        `${name} description must include a "explicitly confirmed" gate`,
      ).toMatch(/only call this when.+explicitly confirmed/);
    }
  });

  it('notify_staff description includes hand-off instruction', () => {
    const notify = SMS_AI_V2_TOOLS.find((t) => t.name === 'notify_staff')!;
    expect(notify.description.toLowerCase()).toContain('do not keep trying');
  });

  it('lookup_customer requires phone', () => {
    const tool = SMS_AI_V2_TOOLS.find((t) => t.name === 'lookup_customer')!;
    expect(tool.input_schema.required).toEqual(['phone']);
  });

  it('classify_vehicle requires only make', () => {
    const tool = SMS_AI_V2_TOOLS.find((t) => t.name === 'classify_vehicle')!;
    expect(tool.input_schema.required).toEqual(['make']);
  });

  it('check_availability requires date', () => {
    const tool = SMS_AI_V2_TOOLS.find((t) => t.name === 'check_availability')!;
    expect(tool.input_schema.required).toEqual(['date']);
  });

  it('create_appointment requires customer_name + customer_phone + date + time', () => {
    const tool = SMS_AI_V2_TOOLS.find((t) => t.name === 'create_appointment')!;
    expect([...(tool.input_schema.required ?? [])].sort()).toEqual(
      ['customer_name', 'customer_phone', 'date', 'time'].sort(),
    );
  });

  it('send_info_sms type enum lists all 6 info types', () => {
    const tool = SMS_AI_V2_TOOLS.find((t) => t.name === 'send_info_sms')!;
    const typeProp = tool.input_schema.properties.type as { enum?: string[] };
    expect([...(typeProp.enum ?? [])].sort()).toEqual(
      [
        'store_info',
        'product_link',
        'category_link',
        'service_page',
        'booking_link',
        'quote_link',
      ].sort(),
    );
  });

  it('notify_staff reason enum lists all 7 reason codes (including human_handoff)', () => {
    const tool = SMS_AI_V2_TOOLS.find((t) => t.name === 'notify_staff')!;
    const reasonProp = tool.input_schema.properties.reason as { enum?: string[] };
    expect([...(reasonProp.enum ?? [])].sort()).toEqual(
      [
        'appointment_change',
        'custom_quote',
        'beyond_scope',
        'transfer_request',
        'mobile_distance',
        'human_handoff',
        'other',
      ].sort(),
    );
  });

  it('get_services + get_products have no required fields (catalog calls)', () => {
    for (const name of ['get_services', 'get_products'] as const) {
      const tool = SMS_AI_V2_TOOLS.find((t) => t.name === name)!;
      expect(tool.input_schema.required ?? []).toEqual([]);
    }
  });

  // -------------------------------------------------------------------------
  // Issue 33 Layer 2 (2026-05-24) — get_services size_class optional param
  // -------------------------------------------------------------------------

  it('get_services declares optional size_class as a property (not required)', () => {
    const tool = SMS_AI_V2_TOOLS.find((t) => t.name === 'get_services')!;
    const sizeClassProp = tool.input_schema.properties.size_class as {
      type?: string;
      enum?: string[];
      description?: string;
    } | undefined;
    expect(sizeClassProp).toBeDefined();
    expect(sizeClassProp!.type).toBe('string');
    expect(tool.input_schema.required ?? []).not.toContain('size_class');
  });

  it('get_services size_class enum lists all 5 VehicleSizeClass values', () => {
    const tool = SMS_AI_V2_TOOLS.find((t) => t.name === 'get_services')!;
    const sizeClassProp = tool.input_schema.properties.size_class as { enum?: string[] };
    expect([...(sizeClassProp.enum ?? [])].sort()).toEqual(
      ['classic', 'exotic', 'sedan', 'suv_3row_van', 'truck_suv_2row'].sort(),
    );
  });

  it('get_services description mentions classify_vehicle as the source of size_class + escalation reminder', () => {
    const tool = SMS_AI_V2_TOOLS.find((t) => t.name === 'get_services')!;
    expect(tool.description).toContain('classify_vehicle');
    expect(tool.description.toLowerCase()).toContain('size_class');
    // size_class enum description should still flag exotic/classic escalation
    const sizeClassProp = tool.input_schema.properties.size_class as { description?: string };
    expect(sizeClassProp.description!.toLowerCase()).toContain('exotic');
    expect(sizeClassProp.description!.toLowerCase()).toContain('classic');
    expect(sizeClassProp.description).toContain('notify_staff');
  });

  // -------------------------------------------------------------------------
  // Workstream J Session 7 — D39 + Issue 36 (2026-05-24): size_class imperative
  // strengthening on get_services tool description + size_class parameter.
  // -------------------------------------------------------------------------

  it('D39: get_services description contains "ALWAYS pass `size_class`" imperative', () => {
    const tool = SMS_AI_V2_TOOLS.find((t) => t.name === 'get_services')!;
    expect(tool.description).toContain('ALWAYS pass `size_class`');
  });

  it('D39: get_services description cites the $300/$450 empirical failure', () => {
    const tool = SMS_AI_V2_TOOLS.find((t) => t.name === 'get_services')!;
    expect(tool.description).toContain('$300');
    expect(tool.description).toContain('$450');
    expect(tool.description.toLowerCase()).toContain('customer trust');
  });

  it('D39: get_services description updates "call once" guidance to size_class-aware version', () => {
    const tool = SMS_AI_V2_TOOLS.find((t) => t.name === 'get_services')!;
    // The pre-D39 "call once per conversation and reuse" guidance prevented
    // recall after classify_vehicle. D39 broadens to "call once per size_class
    // context (typically once or twice per conversation)".
    expect(tool.description).toContain('call once per size_class context');
    expect(tool.description).toContain('RECALL with size_class after classify_vehicle');
    // Stale wording must be gone
    expect(tool.description).not.toContain('call once per conversation and reuse');
  });

  it('D39: get_services description declares the cached-response recall mandate', () => {
    const tool = SMS_AI_V2_TOOLS.find((t) => t.name === 'get_services')!;
    expect(tool.description).toContain('MUST recall it with size_class');
  });

  it('D39: size_class parameter description uses "REQUIRED whenever" imperative (not "OPTIONAL")', () => {
    const tool = SMS_AI_V2_TOOLS.find((t) => t.name === 'get_services')!;
    const sizeClassProp = tool.input_schema.properties.size_class as { description?: string };
    expect(sizeClassProp.description).toContain('REQUIRED whenever');
    // Pre-D39 "OPTIONAL." prefix is gone.
    expect(sizeClassProp.description).not.toMatch(/^OPTIONAL\./);
  });

  it('D39: size_class parameter still appears in input_schema and is NOT in required[] (must stay schema-optional for the first-call-before-classify case)', () => {
    const tool = SMS_AI_V2_TOOLS.find((t) => t.name === 'get_services')!;
    // size_class is still a property of the schema
    expect(tool.input_schema.properties.size_class).toBeDefined();
    // But explicitly NOT in required[] — imperative lives in the description,
    // not in JSON schema enforcement (so the agent can make the first
    // discovery call before classify_vehicle has returned).
    expect(tool.input_schema.required ?? []).not.toContain('size_class');
  });

  it('D39: size_class parameter description preserves the exotic/classic escalation precedence note', () => {
    const tool = SMS_AI_V2_TOOLS.find((t) => t.name === 'get_services')!;
    const sizeClassProp = tool.input_schema.properties.size_class as { description?: string };
    expect(sizeClassProp.description).toContain('exotic and classic');
    expect(sizeClassProp.description).toContain('notify_staff');
    expect(sizeClassProp.description).toContain('escalation rule takes precedence');
  });

  it('SmsAiV2Tool type matches the readonly array entries structurally', () => {
    const sample: SmsAiV2Tool = SMS_AI_V2_TOOLS[0];
    expect(sample.name).toBeDefined();
    expect(sample.description).toBeDefined();
    expect(sample.input_schema).toBeDefined();
  });

  it('approve_addon requires addon_id and gates on explicit confirmation', () => {
    const tool = SMS_AI_V2_TOOLS.find((t) => t.name === 'approve_addon')!;
    expect(tool.input_schema.required).toEqual(['addon_id']);
    expect(
      (tool.input_schema.properties.addon_id as { type?: string }).type,
    ).toBe('string');
    expect(tool.description.toLowerCase()).toContain('only call this when');
    expect(tool.description.toLowerCase()).toContain('explicitly confirmed');
  });

  it('decline_addon requires addon_id and gates on explicit decline', () => {
    const tool = SMS_AI_V2_TOOLS.find((t) => t.name === 'decline_addon')!;
    expect(tool.input_schema.required).toEqual(['addon_id']);
    expect(
      (tool.input_schema.properties.addon_id as { type?: string }).type,
    ).toBe('string');
    expect(tool.description.toLowerCase()).toContain('only call this when');
    expect(tool.description.toLowerCase()).toContain('explicitly declined');
  });

  // -------------------------------------------------------------------------
  // Workstream J Session 3 — upsert_customer tool definition invariants
  // -------------------------------------------------------------------------

  it('upsert_customer requires only first_name', () => {
    const tool = SMS_AI_V2_TOOLS.find((t) => t.name === 'upsert_customer')!;
    expect(tool.input_schema.required).toEqual(['first_name']);
  });

  it('upsert_customer declares optional fields: last_name, email, customer_type, address_1/2, city, zip_code', () => {
    const tool = SMS_AI_V2_TOOLS.find((t) => t.name === 'upsert_customer')!;
    const props = tool.input_schema.properties;
    for (const field of [
      'first_name',
      'last_name',
      'email',
      'customer_type',
      'address_1',
      'address_2',
      'city',
      'zip_code',
    ]) {
      expect(props[field], `missing property ${field}`).toBeDefined();
      expect((props[field] as { type?: string }).type).toBe('string');
    }
  });

  it('upsert_customer customer_type enum is exactly ["enthusiast", "professional"]', () => {
    const tool = SMS_AI_V2_TOOLS.find((t) => t.name === 'upsert_customer')!;
    const ctProp = tool.input_schema.properties.customer_type as { enum?: string[] };
    expect([...(ctProp.enum ?? [])].sort()).toEqual(['enthusiast', 'professional']);
  });

  it('upsert_customer description does NOT request phone (dispatcher-injected, never from LLM)', () => {
    const tool = SMS_AI_V2_TOOLS.find((t) => t.name === 'upsert_customer')!;
    // Schema must not include phone
    expect(tool.input_schema.properties.phone).toBeUndefined();
    // Description must affirmatively tell the LLM not to pass phone
    expect(tool.description.toLowerCase()).toMatch(/do not pass it|phone.*captured automatically/);
  });

  it('upsert_customer description signals idempotency and call-multiple-times semantics', () => {
    const tool = SMS_AI_V2_TOOLS.find((t) => t.name === 'upsert_customer')!;
    expect(tool.description.toLowerCase()).toContain('idempotent');
  });

  // -------------------------------------------------------------------------
  // Issue 38 D43 (2026-05-25) — send_quote_sms tiers + quantities params.
  // Closes the tier-intent communication gap surfaced by Q-0084
  // (agent verbalized "$250 Per Row × 2", quote charged $450 complete-tier).
  // -------------------------------------------------------------------------

  describe('Issue 38 D43 — send_quote_sms tiers + quantities', () => {
    const sendQuote = () => SMS_AI_V2_TOOLS.find((t) => t.name === 'send_quote_sms')!;

    it('schema includes `tiers` as an optional string property', () => {
      const tool = sendQuote();
      const tiersProp = tool.input_schema.properties.tiers as
        | { type?: string; description?: string }
        | undefined;
      expect(tiersProp).toBeDefined();
      expect(tiersProp!.type).toBe('string');
      expect(tool.input_schema.required ?? []).not.toContain('tiers');
    });

    it('schema includes `quantities` as an optional string property', () => {
      const tool = sendQuote();
      const qtyProp = tool.input_schema.properties.quantities as
        | { type?: string; description?: string }
        | undefined;
      expect(qtyProp).toBeDefined();
      expect(qtyProp!.type).toBe('string');
      expect(tool.input_schema.required ?? []).not.toContain('quantities');
    });

    it('required[] is unchanged from pre-D43 (still exactly ["phone", "services"])', () => {
      const tool = sendQuote();
      expect([...(tool.input_schema.required ?? [])].sort()).toEqual(
        ['phone', 'services'].sort(),
      );
    });

    it('tiers description explains the parallel-array contract and verbatim tier_name source', () => {
      const tool = sendQuote();
      const tiersProp = tool.input_schema.properties.tiers as { description?: string };
      expect(tiersProp.description).toBeDefined();
      // Parallel-array contract pinned
      expect(tiersProp.description).toMatch(/parallel to `services`/);
      // tier_name source pinned to get_services VERBATIM
      expect(tiersProp.description).toContain('get_services');
      expect(tiersProp.description).toContain('VERBATIM');
      // Empirical tier-name examples pinned so prose can't drift away from them
      expect(tiersProp.description).toContain('per_row');
      expect(tiersProp.description).toContain('touring_bagger');
      // Empty-token + auto-pick contract pinned
      expect(tiersProp.description!.toLowerCase()).toContain('empty token');
    });

    it('quantities description documents default=1, max_qty rejection, and parallel-array contract', () => {
      const tool = sendQuote();
      const qtyProp = tool.input_schema.properties.quantities as { description?: string };
      expect(qtyProp.description).toBeDefined();
      expect(qtyProp.description).toMatch(/parallel to/);
      expect(qtyProp.description!.toLowerCase()).toContain('default');
      expect(qtyProp.description).toContain('max_qty');
      expect(qtyProp.description).toContain('instructions_for_agent');
    });

    it('send_quote_sms top-level description cites the Q-0084-class fidelity gap and Issue 36 parallel', () => {
      const tool = sendQuote();
      // Pin the empirical reference so future prose edits cannot weaken the
      // imperative back to abstract guidance.
      expect(tool.description).toContain('Issue 38');
      expect(tool.description).toContain('$250');
      expect(tool.description).toContain('$450');
      expect(tool.description).toContain('Issue 36');
      // Tiered-services imperative pinned
      expect(tool.description.toLowerCase()).toContain('multi-tier');
      expect(tool.description).toContain('MUST pass');
    });

    it('legacy `services` parameter still present, still string-typed, with parallel-array note added', () => {
      const tool = sendQuote();
      const servicesProp = tool.input_schema.properties.services as {
        type?: string;
        description?: string;
      };
      expect(servicesProp).toBeDefined();
      expect(servicesProp.type).toBe('string');
      // Existing exemplar preserved so any in-flight calls keep matching prose
      expect(servicesProp.description).toContain('Express Exterior Wash, Tire Shine');
      // New positional-anchor note added so the LLM understands the contract
      expect(servicesProp.description!.toLowerCase()).toContain('positional');
    });

    it('property count grows by exactly 2 (tiers + quantities) versus pre-D43 send_quote_sms schema', () => {
      const tool = sendQuote();
      const propNames = Object.keys(tool.input_schema.properties).sort();
      // Pre-D43 send_quote_sms schema: phone, customer_name, services,
      // vehicle_year, vehicle_make, vehicle_model, vehicle_color (7 props).
      // D43 adds tiers + quantities → 9.
      expect(propNames).toEqual(
        [
          'customer_name',
          'phone',
          'quantities',
          'services',
          'tiers',
          'vehicle_color',
          'vehicle_make',
          'vehicle_model',
          'vehicle_year',
        ].sort(),
      );
      expect(propNames.length).toBe(9);
    });

    it('D43 changes do not regress the explicit-confirmation gate or the side-effecting designation', () => {
      // Cross-check that the existing "Only call when ... explicitly confirmed"
      // gate from the side-effecting-tools test still passes after the
      // description was expanded for multi-tier guidance.
      const tool = sendQuote();
      expect(tool.description.toLowerCase()).toMatch(/only call this when.+explicitly confirmed/);
    });
  });
});

// ---------------------------------------------------------------------------
// D47 — Issues 43 + 44 — get_services tool description tightening
// (2026-05-26). Belt + suspenders for system-prompt Rule 8 (price lookup
// never recall) + system-prompt Rule 9 (scope-pricing tier enumeration).
// ---------------------------------------------------------------------------

describe('SMS_AI_V2_TOOLS — D47 / Issue 43 (get_services "Lookup, never recall" guidance)', () => {
  function getServices() {
    return SMS_AI_V2_TOOLS.find((t) => t.name === 'get_services')!;
  }

  it('get_services description contains the "LOOKUP, NEVER RECALL" headline', () => {
    const tool = getServices();
    expect(tool.description).toContain('LOOKUP, NEVER RECALL');
  });

  it('get_services description references the Q-0087 empirical failure for grounding', () => {
    const tool = getServices();
    expect(tool.description).toContain('Q-0087');
    expect(tool.description).toContain('$85');
    expect(tool.description).toContain('$110');
  });

  it('get_services description prescribes INDEX-into-cached-array pattern + RECALL-when-stale', () => {
    const tool = getServices();
    expect(tool.description).toContain('INDEX into');
    expect(tool.description).toContain('RECALL');
  });

  it('get_services description discourages cross-service price-blending from memory', () => {
    const tool = getServices();
    expect(tool.description).toMatch(/multi-service quotes/i);
    expect(tool.description).toMatch(/don't blend prices across services from memory/i);
  });
});

describe('SMS_AI_V2_TOOLS — D47 / Issue 44 (get_services SCOPE-PRICING TIERS metadata note)', () => {
  function getServices() {
    return SMS_AI_V2_TOOLS.find((t) => t.name === 'get_services')!;
  }

  it('get_services description announces the new per-tier metadata fields (tier_label, qty_label, max_qty)', () => {
    const tool = getServices();
    expect(tool.description).toContain('tier_label');
    expect(tool.description).toContain('qty_label');
    expect(tool.description).toContain('max_qty');
  });

  it('get_services description instructs the agent to use tier_label (NEVER raw snake_case tier_name slugs)', () => {
    const tool = getServices();
    expect(tool.description).toContain('NEVER raw snake_case');
    expect(tool.description).toContain('"per_row"');
    expect(tool.description).toContain('"floor_mats"');
  });

  it('get_services description identifies scope-pricing services explicitly (`pricing_model: "scope"`)', () => {
    const tool = getServices();
    expect(tool.description).toContain('pricing_model: "scope"');
    expect(tool.description).toContain('Hot Shampoo Extraction');
  });
});
