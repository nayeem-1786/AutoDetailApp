import { describe, it, expect } from 'vitest';

import {
  SMS_AI_V2_TOOLS,
  TOOL_NAMES,
  type SmsAiV2Tool,
  type SmsAiV2ToolName,
} from '@/lib/sms-ai/tools';

describe('SMS_AI_V2_TOOLS — declarative tool schema', () => {
  it('contains exactly 10 tools', () => {
    expect(SMS_AI_V2_TOOLS).toHaveLength(10);
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

  it('SmsAiV2Tool type matches the readonly array entries structurally', () => {
    const sample: SmsAiV2Tool = SMS_AI_V2_TOOLS[0];
    expect(sample.name).toBeDefined();
    expect(sample.description).toBeDefined();
    expect(sample.input_schema).toBeDefined();
  });
});
