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

  it('contains all 8 required section headings (post-2026-05-22 rename)', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toMatch(/# Identity/);
    expect(out).toMatch(/# Channel rules/);
    expect(out).toMatch(/# Critical rules/);
    expect(out).toMatch(/# Tool usage guide/);
    expect(out).toMatch(/# Escalation guide/);
    expect(out).toMatch(/# Discovery and conversation flow/);
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
      'upsert_customer',
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

  it('includes Language handling section header (renamed from Multi-language support 2026-05-22)', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('# Language handling');
    // Old header must NOT remain — prevents accidental duplicate section
    expect(out).not.toContain('# Multi-language support');
  });

  it('includes What you cannot do section header', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('# What you cannot do');
  });

  it('Critical rules section contains exactly 18 numbered rules (D39 size_class imperative rule added 2026-05-24 as Rule 6)', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    const criticalIdx = out.indexOf('# Critical rules');
    expect(criticalIdx, 'expected # Critical rules header to exist').toBeGreaterThan(-1);
    const afterHeader = out.slice(criticalIdx + '# Critical rules'.length);
    const nextHeaderIdx = afterHeader.search(/\n# /);
    const section = nextHeaderIdx === -1 ? afterHeader : afterHeader.slice(0, nextHeaderIdx);
    const numbered = section.match(/^\d+\./gm) ?? [];
    expect(numbered.length).toBe(18);
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
    const section = out.slice(crossIdx, out.indexOf('# Conversation freshness', crossIdx));
    expect(section.toLowerCase()).toContain('voice agent');
    expect(section).toContain('Q-0023');
  });

  it('language-handling section lists supported languages', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    const langIdx = out.indexOf('# Language handling');
    const section = out.slice(langIdx, out.indexOf('# RO Water', langIdx));
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

// ---------------------------------------------------------------------------
// 2026-05-22 batched prompt tuning — Issues 1-8, 10-15 from
// docs/dev/SMS_AI_V2_PROMPT_OBSERVATIONS.md. Each test pins the prompt
// CONTAINS the rule wording; behavioral testing happens via live re-test
// after deploy. Issue 9 (capitalization) is code work (Workstream H
// Session 4), not prompt — no test here.
// ---------------------------------------------------------------------------

describe('buildV2SystemPrompt — Issue 1 (vehicle naming Y+C+M+M)', () => {
  it('includes Formatting and naming section header', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('# Formatting and naming');
  });

  it('specifies Year + Color + Make + Model order with capitalization', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('Year + Color + Make + Model');
    // At least one positive Y+C+M+M example present
    expect(out).toMatch(/2016 Silver Honda Accord|2026 Yellow Ferrari Roma Spider/);
    // Lowercase-to-Title example pinned
    expect(out).toContain('"silver" → "Silver"');
  });
});

describe('buildV2SystemPrompt — Issue 2 + Issue 3 (closure + short replies)', () => {
  it('includes Reading short replies subsection in Discovery and conversation flow', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('Reading short replies');
    // Short affirmatives enumerated
    expect(out).toContain('"yes"');
    expect(out).toContain('"yeah"');
    expect(out).toContain('"sí"');
  });

  it('includes Graceful closure rule + canonical examples', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('Graceful closure');
    expect(out).toContain('You got it');
    expect(out).toMatch(/talk soon|see you then/i);
  });
});

describe('buildV2SystemPrompt — Issue 4 + Issue 5 (Mexican Spanish + current-message-led switching)', () => {
  it('declares Mexican Spanish dialect with vocab pins', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('Mexican Spanish');
    expect(out).toContain('carro');
    expect(out).toContain('ustedes');
    expect(out).toContain('NOT "coche"');
    expect(out).toContain('NEVER "vosotros"');
  });

  it('declares current-message-led language switching rule', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toMatch(/language of the customer's CURRENT message/);
    expect(out).toContain('in English please');
  });
});

describe('buildV2SystemPrompt — Issue 6 + Issue 10 (multi-vehicle disambiguation + color rule)', () => {
  it('declares multi-vehicle disambiguation fires every turn', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('Multi-vehicle disambiguation');
    expect(out).toContain('fires every turn');
    expect(out).toContain('ALWAYS ask which vehicle');
  });

  it('declares color-ask-once-then-proceed rule (D9 / Issue 10)', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    // The exact non-loop language
    expect(out).toContain('Color: ask once if missing');
    expect(out).toMatch(/don't loop/i);
  });
});

describe('buildV2SystemPrompt — Issue 7 (discovery before menu)', () => {
  it('declares Discovery before menu enumeration rule', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('Discovery before menu enumeration');
    expect(out).toMatch(/ONE focused clarifying question/);
  });
});

describe('buildV2SystemPrompt — Issue 8 (quote-intent recognition phrasings)', () => {
  it('declares quote-send intent recognition with English + Spanish phrasings', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('Quote-send intent recognition');
    // English variants
    expect(out).toContain('text me the price');
    expect(out).toContain('give me an estimate');
    // Spanish variants from Issue 8 evidence
    expect(out).toContain('me puedes mandar un quote');
    expect(out).toContain('me puedes cotizar');
    expect(out).toContain('me puedes dar un presupuesto');
  });
});

describe('buildV2SystemPrompt — Issue 11 + Issue 12 (don\'t ask for name or phone when on file)', () => {
  it('forbids asking for name when context has one and forbids asking for phone always', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    // Both forbids inside Critical rule 9
    expect(out).toContain('Use the first name on file; never ask for it');
    expect(out).toContain('NEVER ask the customer to confirm or provide their phone');
  });
});

describe('buildV2SystemPrompt — Issue 13 (4-hour fresh-conversation threshold, D14)', () => {
  it('includes Conversation freshness section header', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('# Conversation freshness');
  });

  it('declares the 4-hour threshold with both branches', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toMatch(/Gap < 4 hours/);
    expect(out).toMatch(/Gap ≥ 4 hours/);
    expect(out).toContain('FRESH request');
  });

  it('declares the explicit-prior-reference exception (carries continuation regardless of elapsed time)', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('explicitly references prior context');
    expect(out).toMatch(/regardless of elapsed time/);
  });
});

describe('buildV2SystemPrompt — Issue 14 (bundle-pricing hallucination hard guardrail, D15)', () => {
  it('Critical rule 16 declares tool-grounded add-ons only (was Rule 14 pre-D38; was Rule 15 pre-D39)', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    // Rule 16 specifically — shifted 14→15 by D38 (Issue 35 Rule 2 insert)
    // then 15→16 by D39 (Issue 36 size_class Rule 6 insert).
    expect(out).toMatch(/16\.\s+\*\*Tool-grounded add-ons only/);
    expect(out).toContain('NEVER invent add-ons');
    expect(out).toContain('addon_suggestions');
  });

  it('Add-ons and bundle quoting section provides the "no configured bundles" canned response', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('# Add-ons and bundle quoting');
    expect(out).toContain('no current bundle pricing configured');
    expect(out).toContain("Don't fabricate");
  });
});

describe('buildV2SystemPrompt — Issue 15 (proactive add-on disclosure, D16)', () => {
  it('declares proactive add-on surfacing rule when configured', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('surface proactively');
    expect(out).toMatch(/SAME message as the standalone quote/);
    expect(out).toContain("don't wait for pushback");
  });

  it('uses tool-response fields combo_price + savings when surfacing', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('combo_price');
    expect(out).toContain('savings');
  });

  it('caps add-on disclosure at one mention per turn', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('One mention per turn');
  });
});

describe('buildV2SystemPrompt — section ordering (post-2026-05-22 outline)', () => {
  it('Formatting and naming appears between Channel rules and Critical rules', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    const channelIdx = out.indexOf('# Channel rules');
    const formatIdx = out.indexOf('# Formatting and naming');
    const criticalIdx = out.indexOf('# Critical rules');
    expect(channelIdx).toBeLessThan(formatIdx);
    expect(formatIdx).toBeLessThan(criticalIdx);
  });

  it('Conversation freshness appears between Cross-channel awareness and Vehicle size mapping', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    const crossIdx = out.indexOf('# Cross-channel awareness');
    const freshIdx = out.indexOf('# Conversation freshness');
    const vmapIdx = out.indexOf('# Vehicle size mapping');
    expect(crossIdx).toBeLessThan(freshIdx);
    expect(freshIdx).toBeLessThan(vmapIdx);
  });

  it('Add-ons and bundle quoting appears between Tool usage guide and Discovery and conversation flow', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    const toolsIdx = out.indexOf('# Tool usage guide');
    const addonsIdx = out.indexOf('# Add-ons and bundle quoting');
    const flowIdx = out.indexOf('# Discovery and conversation flow');
    expect(toolsIdx).toBeLessThan(addonsIdx);
    expect(addonsIdx).toBeLessThan(flowIdx);
  });
});

// ---------------------------------------------------------------------------
// 2026-05-23 batched prompt tuning — Issues 18, 22-25 + D19 quote-first
// booking. Each test pins the prompt CONTAINS the rule wording; behavioral
// testing happens via live re-test after deploy.
// ---------------------------------------------------------------------------

describe('buildV2SystemPrompt — Issue 22 (phone-from-SMS, no asking)', () => {
  it('includes Contact information handling subsection', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('## Contact information handling');
  });

  it('declares the hard "never ask for phone on SMS" rule with no-exception wording', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('NEVER ask the customer for their phone number on SMS');
    expect(out).toContain('There is no scenario where it is acceptable');
  });

  it('lists positive acknowledgment examples for "this one" / "number I\'m texting from"', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('the number I\'m texting from');
    expect(out).toContain('Got it — using this number');
  });
});

describe('buildV2SystemPrompt — Issue 25 (vehicle info collected in same turn, color not asked mid-booking)', () => {
  it('includes Vehicle information collection subsection', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('## Vehicle information collection');
  });

  it('declares year + make + model + color in the SAME turn', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('year,\nmake, model, AND color in the SAME turn');
    expect(out).toContain('Year, make, model, and color');
  });

  it('declares ask-color-once-in-next-turn if omitted, then proceed (per D9)', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('ask for color ONCE in the next turn');
    expect(out).toContain("don't loop on it");
  });
});

describe('buildV2SystemPrompt — Issue 24 (no internal-mechanics leakage)', () => {
  it('includes Never expose internal mechanics subsection inside What you cannot do', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    const mechanicsIdx = out.indexOf('## Never expose internal mechanics');
    const cannotDoIdx = out.indexOf('# What you cannot do');
    const pendingIdx = out.indexOf('# Pending addon authorization');
    expect(cannotDoIdx).toBeGreaterThan(-1);
    expect(mechanicsIdx).toBeGreaterThan(cannotDoIdx);
    expect(mechanicsIdx).toBeLessThan(pendingIdx);
  });

  it('enumerates forbidden language: tool names, IDs, "behind the scenes", database concepts', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('"Behind the scenes"');
    expect(out).toContain('Service IDs, customer IDs, quote IDs');
    expect(out).toContain('Tool names');
    expect(out).toContain('size_class names like "suv_3row_van"');
  });

  it('declares recoverable vs non-recoverable handling without leaking the issue', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('If recoverable: redirect conversationally without mentioning the issue');
    expect(out).toContain('Let me have a team member follow up with you');
  });
});

describe('buildV2SystemPrompt — Issue 23 + D19 (quote-first booking, no availability claims)', () => {
  it('includes Booking flow — quote first, scheduling second subsection', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('## Booking flow — quote first, scheduling second');
  });

  it('forbids direct create_appointment call in the booking flow', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('DO NOT call `create_appointment` in this flow');
    expect(out).toContain('You DO NOT book the appointment\ndirectly');
  });

  it('includes the canonical post-quote handoff line', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('Sent the quote to your phone — tap the link to review and accept.\n   Our team will call to confirm scheduling.');
  });

  it('distinguishes business-hours statements (OK) from specific-slot availability claims (NEVER)', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('Open/closed days and hours: OK to state from your `businessHours`');
    expect(out).toContain('Specific time slot availability: NEVER state');
  });

  it('lists forbidden availability phrases verbatim', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('"Monday is fully booked,"');
    expect(out).toContain('"9 AM just filled up,"');
  });

  it('forbids predicting staff follow-up timing ("within a few hours")', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('NEVER say "within a\nfew hours"');
  });

  it('Critical rule 17 declares quote-first / never-book-directly (was Rule 15 pre-D38; was Rule 16 pre-D39)', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toMatch(/17\.\s+\*\*Quote first, never book directly/);
    expect(out).toContain('NEVER call `create_appointment` directly');
  });
});

describe('buildV2SystemPrompt — Issue 18 (customer type classification) [revised Workstream J Session 3]', () => {
  it('includes Customer type classification subsection', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('## Customer type classification');
  });

  it('declares Enthusiast / Professional values with signals', () => {
    // Session 3: subsection rewritten to point at upsert_customer; the
    // "Unknown" enum value was dropped — the server now defaults to
    // 'enthusiast' rather than leaving the column nullable.
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('**Enthusiast**');
    expect(out).toContain('**Professional**');
    expect(out).toContain('for my shop');
    expect(out).toContain('for my dealership');
  });

  it('forbids asking the customer the classification question directly', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('are you a professional or an enthusiast?');
    expect(out).toContain('internal\ncategorization, never customer-facing');
  });

  it('directs the agent to upsert_customer with customer_type (replaces old send_quote_sms branch language)', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    // New wording (Workstream J Session 3 — D34)
    expect(out).toContain('`upsert_customer` accepts a `customer_type` parameter');
    expect(out).toContain("defaults to `'enthusiast'`");
    // The old conditional language must be gone — guards against
    // accidentally restoring the pre-Session-3 wording.
    expect(out).not.toContain('If `send_quote_sms` tool accepts a `customer_type` parameter');
  });
});

describe('buildV2SystemPrompt — Tool usage guide updates (Issue 17 + D19)', () => {
  it('Tool usage guide directs product/catalog inquiries to get_products BEFORE asking customer for anything', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('Call `get_products` or `get_product_details` BEFORE asking the customer for anything');
  });

  it('Tool usage guide replaces the old "call create_appointment with confirmed date+time+service" bullet with the quote-first path', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    // Old bullet content must NOT remain unchanged — the quote-first replacement points to send_quote_sms.
    expect(out).toContain('This is the booking path — staff handles scheduling confirmation in a follow-up');
    expect(out).toContain('Do NOT call `create_appointment` directly');
  });
});

// ---------------------------------------------------------------------------
// Workstream J Session 3 — upsert_customer prompt rules
// ---------------------------------------------------------------------------

describe('buildV2SystemPrompt — Workstream J Session 3 (upsert_customer)', () => {
  it('includes "Capturing the customer\'s first name" subsection', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain("## Capturing the customer's first name");
  });

  it('directs the agent to call upsert_customer IMMEDIATELY upon learning first_name', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('IMMEDIATELY call `upsert_customer`');
  });

  it('declares one-polite-re-ask-then-proceed deflection rule', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('After ONE polite\nre-ask, proceed without');
  });

  it('includes "Using upsert_customer to enrich customer records" subsection', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('## Using upsert_customer to enrich customer records');
  });

  it('describes upsert_customer as idempotent in the enrichment subsection', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('`upsert_customer` is idempotent');
  });

  it('lists the "When NOT to call upsert_customer" cases (already in context, no name, just browsing)', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('When NOT to call `upsert_customer`');
    expect(out).toContain('already in CUSTOMER CONTEXT');
    expect(out).toContain('just browsing');
  });

  it('forbids passing placeholder values like "Customer" or "Caller" as first_name', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('Never pass\n  placeholder values like "Customer" or "Caller"');
  });

  it('"For NEW conversations" step 1 now references upsert_customer call timing', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    // The updated step 1 wording — pinned literally so we catch silent regressions
    expect(out).toContain('The MOMENT the customer shares a usable first name, call `upsert_customer`');
  });

  it('Customer type classification subsection now references upsert_customer (not send_quote_sms)', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    const ctIdx = out.indexOf('## Customer type classification');
    expect(ctIdx).toBeGreaterThan(-1);
    // Section ends at the next top-level header (e.g. `# Escalation guide`).
    // Using `\n# ` avoids matching `##` substrings within the subsection.
    const nextH1 = out.indexOf('\n# ', ctIdx + 1);
    const ctSection = nextH1 === -1 ? out.slice(ctIdx) : out.slice(ctIdx, nextH1);
    expect(ctSection).toContain('`upsert_customer`');
    expect(ctSection).toContain("defaults to `'enthusiast'`");
    // The old send_quote_sms-customer_type conditional language must be gone
    expect(ctSection).not.toContain('If `send_quote_sms` tool accepts a `customer_type` parameter');
  });

  it('Critical rule 18 declares instructions_for_agent silent-follow handling (was Rule 16 pre-D38; was Rule 17 pre-D39 size_class insert)', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    // Session 4 broadened "Tool errors" → "Tool responses" so the same rule
    // covers both isError:true error paths AND isError:false success paths
    // that ship a directive (e.g. send_quote_sms's was_duplicate:true case).
    // Session 5 (D38, Issue 35) renumbered this from Rule 16 → Rule 17 after
    // inserting the mandatory-reply rule as Rule 2. Session 7 (D39, Issue 36)
    // renumbered 17 → 18 after inserting the size_class imperative as Rule 6.
    expect(out).toMatch(/18\.\s+\*\*Tool responses with `instructions_for_agent`/);
    expect(out).toContain('follow those instructions silently');
    expect(out).toContain('Never share tool error messages');
    // Explicit Session 4 additions — confirm both success+error wording and
    // the was_duplicate exemplar are present so the rule covers Session 4's
    // dedup-response path.
    expect(out).toContain('success OR error');
    expect(out).toContain('was_duplicate');
  });

  it('upsert_customer subsections appear inside Discovery and conversation flow (before Escalation guide)', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    const flowIdx = out.indexOf('# Discovery and conversation flow');
    const captureIdx = out.indexOf("## Capturing the customer's first name");
    const enrichIdx = out.indexOf('## Using upsert_customer to enrich customer records');
    const escalIdx = out.indexOf('# Escalation guide');
    expect(flowIdx).toBeGreaterThan(-1);
    expect(flowIdx).toBeLessThan(captureIdx);
    expect(captureIdx).toBeLessThan(enrichIdx);
    expect(enrichIdx).toBeLessThan(escalIdx);
  });
});

describe('buildV2SystemPrompt — section ordering (post-2026-05-23 outline)', () => {
  it('Discovery and conversation flow subsections appear in expected order: Contact info → Vehicle info → Booking flow → Customer type', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    const contactIdx = out.indexOf('## Contact information handling');
    const vehicleIdx = out.indexOf('## Vehicle information collection');
    const bookingIdx = out.indexOf('## Booking flow — quote first, scheduling second');
    const customerTypeIdx = out.indexOf('## Customer type classification');
    expect(contactIdx).toBeGreaterThan(-1);
    expect(contactIdx).toBeLessThan(vehicleIdx);
    expect(vehicleIdx).toBeLessThan(bookingIdx);
    expect(bookingIdx).toBeLessThan(customerTypeIdx);
  });

  it('All new 2026-05-23 subsections live inside their parent # sections', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    // Contact / Vehicle / Booking / Customer-type live inside Discovery and conversation flow
    const flowIdx = out.indexOf('# Discovery and conversation flow');
    const escalIdx = out.indexOf('# Escalation guide');
    const contactIdx = out.indexOf('## Contact information handling');
    const customerTypeIdx = out.indexOf('## Customer type classification');
    expect(flowIdx).toBeLessThan(contactIdx);
    expect(customerTypeIdx).toBeLessThan(escalIdx);
    // Never-expose-mechanics lives inside What you cannot do
    const cannotDoIdx = out.indexOf('# What you cannot do');
    const mechanicsIdx = out.indexOf('## Never expose internal mechanics');
    const pendingIdx = out.indexOf('# Pending addon authorization');
    expect(cannotDoIdx).toBeLessThan(mechanicsIdx);
    expect(mechanicsIdx).toBeLessThan(pendingIdx);
  });
});

// ---------------------------------------------------------------------------
// Workstream J Session 4 — Three prompt rule additions per D37 + Issue 33
// mitigation + Issue 34 capture (operator-locked 2026-05-24).
// ---------------------------------------------------------------------------

describe('buildV2SystemPrompt — Workstream J Session 4 (D37 invocation discipline)', () => {
  it('declares the no-new-fields-no-call rule under upsert_customer enrichment subsection', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('You already called `upsert_customer` earlier in this conversation');
    expect(out).toContain('200-400ms of latency');
    expect(out).toContain('ONLY call `upsert_customer` when you are\n  persisting NEW information');
  });

  it('includes Invocation cadence guide with first/subsequent/no-fields branches', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('Invocation cadence guide');
    expect(out).toContain('**First call**');
    expect(out).toContain('**Subsequent calls**');
    expect(out).toContain('**No new fields = no call.**');
  });

  it('keeps the existing "When NOT to call" anchor bullets (back-compat with Session 3)', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    // Session 3 bullets must persist — Session 4 only APPENDED, did not delete
    expect(out).toContain('Customer is already in CUSTOMER CONTEXT');
    expect(out).toContain("You don't have a usable first name yet");
    expect(out).toContain('"just browsing"');
  });
});

// ---------------------------------------------------------------------------
// Issue 33 Layer 2 (2026-05-24) — get_services size_class prompt rule
// (REPLACES the Workstream J Session 4 combo-pricing mitigation rule, which
// was a temporary prompt-level workaround for the Issue 33 endpoint bug.
// Layer 1 fixes combos at the endpoint level, obsoleting the workaround.)
// ---------------------------------------------------------------------------

describe('buildV2SystemPrompt — Issue 33 Layer 2 (size_class on get_services)', () => {
  it('includes the new "Passing size_class to get_services after classify_vehicle" subsection inside # Add-ons and bundle quoting', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('## Passing size_class to get_services after classify_vehicle');
    const addonIdx = out.indexOf('# Add-ons and bundle quoting');
    const sizeClassIdx = out.indexOf('## Passing size_class to get_services after classify_vehicle');
    const discoveryIdx = out.indexOf('# Discovery and conversation flow');
    expect(addonIdx).toBeLessThan(sizeClassIdx);
    expect(sizeClassIdx).toBeLessThan(discoveryIdx);
  });

  it('directs the agent to pass size_class after classify_vehicle returns (D39 imperative wording)', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('classify_vehicle');
    // D39 strengthened "pass that same" → "you MUST pass that same".
    expect(out).toMatch(/you MUST pass that same `size_class` value to/);
  });

  it('preserves the exotic/classic escalation reminder in the size_class subsection', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    const sizeClassIdx = out.indexOf('## Passing size_class to get_services after classify_vehicle');
    const nextSection = out.indexOf('# Discovery and conversation flow', sizeClassIdx);
    const section = out.slice(sizeClassIdx, nextSection);
    expect(section).toContain('exotic and classic');
    expect(section).toContain('notify_staff');
    expect(section).toContain('custom_quote');
  });

  it('DELETES the obsolete Session 4 combo-pricing-mitigation subsection (replaced by Layer 1 endpoint fix)', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).not.toContain('## Combo and bundle pricing — confirm before stating');
    expect(out).not.toContain('Do NOT state combo/bundle pricing');
    expect(out).not.toContain('JUST called `get_services`');
  });

  it('preserves Rule 18 (instructions_for_agent silent-follow) — untouched by Layer 2 (renumbered 16→17 by D38; 17→18 by D39)', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toMatch(/18\.\s+\*\*Tool responses with `instructions_for_agent`/);
    expect(out).toContain('success OR error');
    expect(out).toContain('was_duplicate');
  });

  it('preserves Critical rule 4 exotic/classic escalation (untouched by Layer 2; renumbered 3→4 by D38 Issue 35)', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toMatch(/4\.\s+\*\*Specialty vehicles require staff/);
    expect(out).toContain('"exotic" or "classic"');
  });
});

describe('buildV2SystemPrompt — Workstream J Session 4 (Issue 34 last_name capture at quote-send)', () => {
  it('includes "Capturing the customer\'s last name at quote-send" subsection inside Discovery and conversation flow', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain("## Capturing the customer's last name at quote-send");
    const flowIdx = out.indexOf('# Discovery and conversation flow');
    const lastNameIdx = out.indexOf("## Capturing the customer's last name at quote-send");
    const escalIdx = out.indexOf('# Escalation guide');
    expect(flowIdx).toBeLessThan(lastNameIdx);
    expect(lastNameIdx).toBeLessThan(escalIdx);
  });

  it('positions last_name capture between Booking flow and Customer type classification', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    const bookingIdx = out.indexOf('## Booking flow — quote first, scheduling second');
    const lastNameIdx = out.indexOf("## Capturing the customer's last name at quote-send");
    const customerTypeIdx = out.indexOf('## Customer type classification');
    expect(bookingIdx).toBeGreaterThan(-1);
    expect(bookingIdx).toBeLessThan(lastNameIdx);
    expect(lastNameIdx).toBeLessThan(customerTypeIdx);
  });

  it('declares the three response paths (just-last-name, full-name, declines)', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('Just their last name');
    expect(out).toContain('Their full name');
    expect(out).toContain('First name only or declines');
  });

  it('declares the aggressive full-name parsing rule (Q1 operator answer)', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('Parse aggressively');
    expect(out).toContain('"Nayeem Khan"');
    expect(out).toContain('`last_name: "Khan"`');
    // Existing first_name must be preserved per Policy B
    expect(out).toContain('preserved per\n   Policy B');
  });

  it('declares non-blocking + no-re-ask rule', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('Do not block the quote on last_name capture');
    expect(out).toContain('Do NOT re-ask');
    expect(out).toContain("customer's choice is respected");
  });

  it('uses casual ask wording — "What name should I put on the quote?" or "Last name?"', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('"What name should I put on the quote?"');
    expect(out).toContain('"Last name?"');
  });
});

// ---------------------------------------------------------------------------
// Workstream J Session 5 — D38 + Issue 35 (2026-05-24): mandatory
// customer-facing reply on every turn. Inserted as Critical rule 2 in
// the system prompt; renumbers prior Rules 2-16 → 3-17.
// ---------------------------------------------------------------------------

describe('buildV2SystemPrompt — D38 / Issue 35 (mandatory customer-facing reply on every turn)', () => {
  it('declares Critical rule 2 as the mandatory-reply rule with the distinctive headline phrase', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    // The new rule is the second numbered item under # Critical rules.
    expect(out).toMatch(/2\.\s+\*\*Every customer turn requires a customer-facing reply/);
  });

  it('mandatory-reply rule appears WITHIN the # Critical rules section (high-priority placement)', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    const criticalIdx = out.indexOf('# Critical rules');
    expect(criticalIdx).toBeGreaterThan(-1);
    const ruleIdx = out.indexOf('Every customer turn requires a customer-facing reply', criticalIdx);
    expect(ruleIdx).toBeGreaterThan(-1);
    // Find the next top-level header — must come AFTER the rule
    const nextH1 = out.indexOf('\n# ', criticalIdx + '# Critical rules'.length);
    expect(nextH1).toBeGreaterThan(ruleIdx);
  });

  it('mandatory-reply rule explicitly names upsert_customer (the Issue 35 trigger tool)', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    const criticalIdx = out.indexOf('# Critical rules');
    const nextH1 = out.indexOf('\n# ', criticalIdx);
    const section = out.slice(criticalIdx, nextH1);
    // The new rule lists upsert_customer among the internal tool calls.
    // Use [\s\S]* instead of the `s` flag for tsconfig target compatibility.
    expect(section).toMatch(/Tool calls[\s\S]*upsert_customer/);
  });

  it('mandatory-reply rule classifies tool calls as INTERNAL ACTIONS, not replies', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('INTERNAL ACTIONS');
    expect(out).toContain('are NOT replies');
  });

  it('mandatory-reply rule includes BOTH the WRONG (silent) and RIGHT (text + tool) example labels', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    // Verify the Issue 35 reproduction example uses Sarah / Camry shape
    expect(out).toContain("I'm Sarah with a 2020 Camry");
    expect(out).toContain('WRONG — silent after tool');
    expect(out).toContain('RIGHT — tool plus conversational reply');
  });

  it('mandatory-reply rule asserts "Silence is never the right answer to a customer message"', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('Silence is never the right answer to a customer message');
  });

  it('mandatory-reply rule includes coexistence cross-reference to Rule 18 (instructions_for_agent)', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    // D38 must explicitly call out that following instructions_for_agent
    // still satisfies the reply requirement (both rules satisfied).
    // Reference updated 17 → 18 by D39 (size_class rule insert at position 6).
    expect(out).toMatch(/When a tool response contains `instructions_for_agent`, follow it \(per Rule 18\)/);
  });

  it('Rule 18 (was Rule 17) wording for instructions_for_agent is preserved unchanged in substance', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    // Substantive wording must be intact — only the rule NUMBER changed
    // from 17 → 18 because D39 added a new Rule 6 (size_class imperative).
    expect(out).toMatch(/18\.\s+\*\*Tool responses with `instructions_for_agent`/);
    expect(out).toContain('follow those instructions silently');
    expect(out).toContain('success OR error');
    expect(out).toContain('was_duplicate');
  });

  it('D37 invocation discipline (When NOT to call upsert_customer) remains intact alongside D38', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    // D37 governs WHEN to call upsert_customer; D38 governs ALWAYS reply.
    // Both must coexist. Verify the D37-distinctive substrings are still present.
    expect(out).toContain('You already called `upsert_customer` earlier in this conversation');
    expect(out).toContain('200-400ms of latency');
    expect(out).toContain('No new fields = no call');
  });

  it('Critical rule 4 (exotic/classic escalation) language remains intact at every pinned site', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    // The exotic/classic escalation lives at Critical rule 4 (was Rule 3
    // pre-D38) and is referenced from "Vehicle size mapping" and the
    // size_class-on-get_services subsection. Verify all three sites intact.
    expect(out).toMatch(/4\.\s+\*\*Specialty vehicles require staff/);
    expect(out).toContain('"exotic" or "classic"');
    // Vehicle size mapping section still references custom_quote handoff
    const vmapIdx = out.indexOf('# Vehicle size mapping');
    const nextHeader = out.indexOf('# ', vmapIdx + 1);
    const vmapSection = out.slice(vmapIdx, nextHeader);
    expect(vmapSection).toContain('Exotic, Classic, RV, Boat, Aircraft');
    expect(vmapSection).toContain('custom_quote');
    // size_class subsection still has the exotic/classic reminder
    const sizeIdx = out.indexOf('## Passing size_class to get_services after classify_vehicle');
    const sizeSectionEnd = out.indexOf('\n# ', sizeIdx);
    const sizeSection = out.slice(sizeIdx, sizeSectionEnd);
    expect(sizeSection).toContain('exotic and classic');
    expect(sizeSection).toContain('custom_quote');
  });
});

// ---------------------------------------------------------------------------
// Workstream J Session 7 — D39 + Issue 36 (2026-05-24): size_class
// imperative. Inserted as Critical rule 6 in the system prompt (renumbers
// prior Rules 6-17 → 7-18). Strengthens the existing Issue 33 Layer 2
// subsection with imperative wording + recall directive.
// ---------------------------------------------------------------------------

describe('buildV2SystemPrompt — D39 / Issue 36 (size_class imperative on get_services)', () => {
  it('declares Critical rule 6 with the CRITICAL — ALWAYS pass size_class headline', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    // Rule 6 specifically — inserted by D39 between Rule 5 (Classify before
    // quoting) and the prior Rule 6 (now Rule 7 — appointment confirmation).
    expect(out).toMatch(/6\.\s+\*\*CRITICAL — ALWAYS pass `size_class` to `get_services` after `classify_vehicle`\.\*\*/);
  });

  it('new Critical Rule 6 appears WITHIN the # Critical rules section (high-priority placement, top 6)', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    const criticalIdx = out.indexOf('# Critical rules');
    expect(criticalIdx).toBeGreaterThan(-1);
    const ruleIdx = out.indexOf('CRITICAL — ALWAYS pass `size_class`', criticalIdx);
    expect(ruleIdx).toBeGreaterThan(-1);
    // Must come BEFORE the next top-level header
    const nextH1 = out.indexOf('\n# ', criticalIdx + '# Critical rules'.length);
    expect(nextH1).toBeGreaterThan(ruleIdx);
    // Must come AFTER Rule 5 (classify) — pedagogical order
    const rule5Idx = out.indexOf('5. **Classify before quoting');
    expect(rule5Idx).toBeGreaterThan(-1);
    expect(rule5Idx).toBeLessThan(ruleIdx);
  });

  it('new Critical Rule 6 references the empirical $300/$450 Suburban failure', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    // Pin the Q-0084-class empirical evidence so future edits can't silently
    // weaken the rule to abstract language.
    expect(out).toContain('2018 Suburban');
    expect(out).toContain('Hot Shampoo Extraction Complete');
    expect(out).toContain('$300');
    expect(out).toContain('$450');
    expect(out).toContain('$150 fidelity gap');
  });

  it('new Critical Rule 6 names classify_vehicle as the trigger for passing size_class', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    const criticalIdx = out.indexOf('# Critical rules');
    const nextH1 = out.indexOf('\n# ', criticalIdx);
    const section = out.slice(criticalIdx, nextH1);
    const rule6Idx = section.indexOf('6. **CRITICAL');
    // Look in the Rule 6 body for the trigger
    const rule6End = section.indexOf('\n7. ', rule6Idx);
    const rule6Body = section.slice(rule6Idx, rule6End);
    expect(rule6Body).toContain('classify_vehicle');
    expect(rule6Body).toMatch(/Customer mentions a vehicle → call `classify_vehicle`/);
  });

  it('new Critical Rule 6 declares the recall directive (cached response scenario)', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    const criticalIdx = out.indexOf('# Critical rules');
    const nextH1 = out.indexOf('\n# ', criticalIdx);
    const section = out.slice(criticalIdx, nextH1);
    const rule6Idx = section.indexOf('6. **CRITICAL');
    const rule6End = section.indexOf('\n7. ', rule6Idx);
    const rule6Body = section.slice(rule6Idx, rule6End);
    expect(rule6Body).toContain('Recall directive');
    expect(rule6Body).toContain('MUST recall `get_services`');
    expect(rule6Body).toContain('cached');
  });

  it('new Critical Rule 6 reinforces exotic/classic escalation precedence (Critical Rule 4)', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    const criticalIdx = out.indexOf('# Critical rules');
    const nextH1 = out.indexOf('\n# ', criticalIdx);
    const section = out.slice(criticalIdx, nextH1);
    const rule6Idx = section.indexOf('6. **CRITICAL');
    const rule6End = section.indexOf('\n7. ', rule6Idx);
    const rule6Body = section.slice(rule6Idx, rule6End);
    expect(rule6Body).toContain('exotic and classic');
    expect(rule6Body).toContain('notify_staff');
    expect(rule6Body).toContain('Critical Rule 4');
    // The rule must NOT instruct the agent to use size_class='exotic' to quote
    expect(rule6Body).toMatch(/do NOT use `size_class='exotic'`/);
  });

  it('"Passing size_class" subsection is strengthened with imperative wording (you MUST pass)', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    const sizeIdx = out.indexOf('## Passing size_class to get_services after classify_vehicle');
    expect(sizeIdx).toBeGreaterThan(-1);
    const sizeEnd = out.indexOf('\n# ', sizeIdx);
    const subsection = out.slice(sizeIdx, sizeEnd);
    expect(subsection).toMatch(/you MUST pass that same `size_class` value/);
    // Cross-reference to Critical Rule 6 (kept loosely coupled so a future
    // renumber catches if these two stop pointing at each other)
    expect(subsection).toContain('Critical Rule 6');
  });

  it('"Passing size_class" subsection cites the Q-0084-class fidelity gap example', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    const sizeIdx = out.indexOf('## Passing size_class to get_services after classify_vehicle');
    const sizeEnd = out.indexOf('\n# ', sizeIdx);
    const subsection = out.slice(sizeIdx, sizeEnd);
    // Service name may wrap across lines in the prompt body — match on a
    // \s+ regex so the test is robust to soft-wrap edits.
    expect(subsection).toMatch(/Hot Shampoo\s+Extraction Complete/);
    expect(subsection).toContain('$300');
    expect(subsection).toContain('$450');
    expect(subsection).toContain('Q-0084');
  });

  it('"Passing size_class" subsection declares the Recall directive header + stale-cache language', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    const sizeIdx = out.indexOf('## Passing size_class to get_services after classify_vehicle');
    const sizeEnd = out.indexOf('\n# ', sizeIdx);
    const subsection = out.slice(sizeIdx, sizeEnd);
    expect(subsection).toContain('### Recall directive');
    expect(subsection).toContain('STALE');
    expect(subsection).toContain('at most twice');
  });

  it('"Passing size_class" subsection still cites Critical Rule 4 for exotic/classic precedence', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    const sizeIdx = out.indexOf('## Passing size_class to get_services after classify_vehicle');
    const sizeEnd = out.indexOf('\n# ', sizeIdx);
    const subsection = out.slice(sizeIdx, sizeEnd);
    expect(subsection).toContain('Critical Rule 4');
    expect(subsection).toContain('exotic and classic');
  });

  it('D38 mandatory-reply rule (Rule 2) wording is preserved unchanged by D39', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    // D38's headline must remain at Rule 2 — D39 inserted at position 6,
    // not at position 2/3, so Rules 1-5 are untouched.
    expect(out).toMatch(/2\.\s+\*\*Every customer turn requires a customer-facing reply/);
    expect(out).toContain('Silence is never the right answer to a customer message');
    expect(out).toContain('INTERNAL ACTIONS');
  });

  it('Rule 18 (instructions_for_agent, was Rule 17 pre-D39) wording is preserved unchanged by D39', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toMatch(/18\.\s+\*\*Tool responses with `instructions_for_agent`/);
    expect(out).toContain('follow those instructions silently');
    expect(out).toContain('was_duplicate');
  });

  it('Critical rule 4 (exotic/classic escalation) language preserved at all 4 pinned sites', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    // Site 1: Critical Rule 4 itself
    expect(out).toMatch(/4\.\s+\*\*Specialty vehicles require staff/);
    expect(out).toContain('"exotic" or "classic"');
    // Site 2: Vehicle size mapping
    const vmapIdx = out.indexOf('# Vehicle size mapping');
    const vmapEnd = out.indexOf('# ', vmapIdx + 1);
    const vmap = out.slice(vmapIdx, vmapEnd);
    expect(vmap).toContain('Exotic, Classic, RV, Boat, Aircraft');
    // Site 3: Passing size_class subsection
    const sizeIdx = out.indexOf('## Passing size_class to get_services after classify_vehicle');
    const sizeEnd = out.indexOf('\n# ', sizeIdx);
    const subsection = out.slice(sizeIdx, sizeEnd);
    expect(subsection).toContain('exotic and classic');
    expect(subsection).toContain('custom_quote');
    // Site 4: Escalation guide
    expect(out).toContain('specialty vehicle (exotic/classic/RV/boat/aircraft)');
  });
});
