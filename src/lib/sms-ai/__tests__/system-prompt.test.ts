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

  it('Critical rules section contains exactly 15 numbered rules (D19 quote-first / never-book-directly added 2026-05-23)', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    const criticalIdx = out.indexOf('# Critical rules');
    expect(criticalIdx, 'expected # Critical rules header to exist').toBeGreaterThan(-1);
    const afterHeader = out.slice(criticalIdx + '# Critical rules'.length);
    const nextHeaderIdx = afterHeader.search(/\n# /);
    const section = nextHeaderIdx === -1 ? afterHeader : afterHeader.slice(0, nextHeaderIdx);
    const numbered = section.match(/^\d+\./gm) ?? [];
    expect(numbered.length).toBe(15);
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
  it('Critical rule 14 declares tool-grounded add-ons only', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    // Rule 14 specifically
    expect(out).toMatch(/14\.\s+\*\*Tool-grounded add-ons only/);
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

  it('Critical rule 15 declares quote-first / never-book-directly', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toMatch(/15\.\s+\*\*Quote first, never book directly/);
    expect(out).toContain('NEVER call `create_appointment` directly');
  });
});

describe('buildV2SystemPrompt — Issue 18 (customer type classification)', () => {
  it('includes Customer type classification subsection', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('## Customer type classification');
  });

  it('declares Enthusiast / Professional / Unknown values with signals', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('**Enthusiast**');
    expect(out).toContain('**Professional**');
    expect(out).toContain('**Unknown**');
    expect(out).toContain('for my shop');
    expect(out).toContain('for my dealership');
  });

  it('forbids asking the customer the classification question directly', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('do NOT ask the customer\n"are you a professional or an enthusiast?"');
    expect(out).toContain('this is internal\ncategorization, never customer-facing');
  });

  it('handles both branches: tool accepts customer_type vs does not', () => {
    const out = buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('If `send_quote_sms` tool accepts a `customer_type` parameter, pass the\ninferred value');
    expect(out).toContain('do NOT invent a parameter');
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
