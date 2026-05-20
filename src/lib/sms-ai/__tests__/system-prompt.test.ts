import { describe, it, expect } from 'vitest';

import {
  buildV2SystemPrompt,
  CUSTOMER_CONTEXT_PLACEHOLDER,
} from '@/lib/sms-ai/system-prompt';

const SAMPLE_INPUTS = {
  businessName: 'Smart Details Auto Spa',
  businessHours: 'Mon–Fri 9–6, Sat 10–4, Sun closed',
  currentDate: '2026-05-18',
};

describe('buildV2SystemPrompt — structural output', () => {
  it('returns a non-empty string', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(1500);
  });

  it('interpolates businessName', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('Smart Details Auto Spa');
  });

  it('interpolates businessHours and currentDate', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('Mon–Fri 9–6, Sat 10–4, Sun closed');
    expect(out).toContain('2026-05-18');
  });

  it('includes the {CUSTOMER_CONTEXT} placeholder UN-substituted (runner fills it later)', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain(CUSTOMER_CONTEXT_PLACEHOLDER);
    expect(CUSTOMER_CONTEXT_PLACEHOLDER).toBe('{CUSTOMER_CONTEXT}');
  });

  it('contains all 8 required sections by heading', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    // Loose heading checks — text-search resilient to formatting tweaks.
    expect(out).toMatch(/# Identity/);
    expect(out).toMatch(/# Channel rules/);
    expect(out).toMatch(/# Critical rules/);
    expect(out).toMatch(/# Tool usage guide/);
    expect(out).toMatch(/# Escalation guide/);
    expect(out).toMatch(/# Conversation flow/);
    expect(out).toMatch(/# Context for this conversation/);
    expect(out).toMatch(/# Grounding/);
  });

  it('opens with the Tom persona on first line', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toMatch(/You are Tom/);
  });

  it('declares America/Los_Angeles timezone', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('America/Los_Angeles');
  });

  it('declares SMS-channel constraints (segment length, no markdown)', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out.toLowerCase()).toContain('160 char');
    expect(out.toLowerCase()).toContain('no markdown');
  });

  it('enforces the one-primary-service quote rule', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toMatch(/one primary service/i);
  });

  it('forbids specialty-vehicle quoting and directs to notify_staff', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out.toLowerCase()).toContain('exotic');
    expect(out.toLowerCase()).toContain('classic');
    expect(out).toContain('notify_staff');
    expect(out).toContain('custom_quote');
  });

  it('lists all 7 notify_staff reasons in the escalation guide', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    for (const reason of [
      'appointment_change',
      'custom_quote',
      'beyond_scope',
      'transfer_request',
      'mobile_distance',
      'human_handoff',
      'other',
    ]) {
      expect(out, `escalation guide missing reason "${reason}"`).toContain(reason);
    }
  });

  it('names every tool in the tool usage guide section', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    for (const tool of [
      'lookup_customer',
      'get_services',
      'classify_vehicle',
      'check_availability',
      'create_appointment',
      'send_info_sms',
      'send_quote_sms',
      'get_products',
      'get_product_details',
      'notify_staff',
      'approve_addon',
      'decline_addon',
    ]) {
      expect(out, `tool usage guide missing "${tool}"`).toContain(tool);
    }
  });

  it('honors STOP/UNSUBSCRIBE silent-handoff rule', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out.toUpperCase()).toContain('STOP');
    expect(out.toUpperCase()).toContain('UNSUBSCRIBE');
  });

  it('forbids inventing discounts/promotions', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out.toLowerCase()).toMatch(/never (invent|offer discount)/);
  });

  it('produces identical output for identical inputs (no Date.now hidden injection)', () => {
    const a = buildV2SystemPrompt(SAMPLE_INPUTS);
    const b = buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(a).toBe(b);
  });

  it('substitutes only the explicit inputs — replacing businessName changes output', () => {
    const a = buildV2SystemPrompt(SAMPLE_INPUTS);
    const b = buildV2SystemPrompt({ ...SAMPLE_INPUTS, businessName: 'Other Co' });
    expect(a).not.toBe(b);
    expect(b).toContain('Other Co');
    expect(b).not.toContain('Smart Details Auto Spa');
  });
});

// ---------------------------------------------------------------------------
// Layer 1+2 fixup — expanded prompt sections + structural invariants
// ---------------------------------------------------------------------------

describe('buildV2SystemPrompt — expanded sections (fixup)', () => {
  it('includes Cross-channel awareness section header', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('# Cross-channel awareness');
  });

  it('includes Vehicle size mapping (for pricing lookup) section header', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('# Vehicle size mapping (for pricing lookup)');
  });

  it('includes RO Water section header', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('# RO Water');
  });

  it('includes Multi-language support section header', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('# Multi-language support');
  });

  it('includes What you cannot do section header', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('# What you cannot do');
  });

  it('Critical rules section contains exactly 13 numbered rules', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    // Slice from "# Critical rules" header to the next "# " header.
    const criticalIdx = out.indexOf('# Critical rules');
    expect(criticalIdx, 'expected # Critical rules header to exist').toBeGreaterThan(-1);
    const afterHeader = out.slice(criticalIdx + '# Critical rules'.length);
    const nextHeaderIdx = afterHeader.search(/\n# /);
    const section = nextHeaderIdx === -1 ? afterHeader : afterHeader.slice(0, nextHeaderIdx);
    // Count lines that begin with `<digit>.` (1–13).
    const numbered = section.match(/^\d+\./gm) ?? [];
    expect(numbered.length).toBe(13);
  });

  it('{CUSTOMER_CONTEXT} placeholder appears exactly once', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    const occurrences = out.split(CUSTOMER_CONTEXT_PLACEHOLDER).length - 1;
    expect(occurrences).toBe(1);
  });

  it('all three dynamic inputs appear in the output (sanity)', () => {
    const out = buildV2SystemPrompt({
      businessName: 'Acme Detail Co',
      businessHours: 'Mon–Sat 7am–9pm',
      currentDate: '2026-12-25',
    });
    expect(out).toContain('Acme Detail Co');
    expect(out).toContain('Mon–Sat 7am–9pm');
    expect(out).toContain('2026-12-25');
  });

  it('cross-channel awareness section mentions voice agent and references quotes by number', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    const crossIdx = out.indexOf('# Cross-channel awareness');
    const section = out.slice(crossIdx, out.indexOf('# Vehicle size mapping', crossIdx));
    expect(section.toLowerCase()).toContain('voice agent');
    expect(section).toContain('Q-0023');
  });

  it('multi-language section lists all 4 supported languages', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    const mlIdx = out.indexOf('# Multi-language support');
    const section = out.slice(mlIdx, out.indexOf('# What you cannot do', mlIdx));
    expect(section).toContain('Spanish');
    expect(section).toContain('Filipino');
    expect(section).toContain('Hindi');
    expect(section).toContain('Urdu');
  });
});

// ---------------------------------------------------------------------------
// Layer 3c — Pending Addon Authorization section invariants
// ---------------------------------------------------------------------------

describe('buildV2SystemPrompt — pending addon authorization section', () => {
  it('includes the "Pending addon authorization" section header', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('# Pending addon authorization (mid-job)');
  });

  it('mentions both approve_addon and decline_addon tools in the addon section', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    const addonIdx = out.indexOf('# Pending addon authorization (mid-job)');
    expect(addonIdx).toBeGreaterThan(-1);
    const ctxIdx = out.indexOf('# Context for this conversation', addonIdx);
    const section = out.slice(addonIdx, ctxIdx);
    expect(section).toContain('approve_addon');
    expect(section).toContain('decline_addon');
  });

  it('references pending_addons context list explicitly', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('pending_addons');
  });

  it('places the addon section BEFORE the {CUSTOMER_CONTEXT} placeholder (cache boundary)', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    const addonIdx = out.indexOf('# Pending addon authorization (mid-job)');
    const placeholderIdx = out.indexOf(CUSTOMER_CONTEXT_PLACEHOLDER);
    expect(addonIdx).toBeGreaterThan(-1);
    expect(placeholderIdx).toBeGreaterThan(-1);
    expect(addonIdx).toBeLessThan(placeholderIdx);
  });
});
