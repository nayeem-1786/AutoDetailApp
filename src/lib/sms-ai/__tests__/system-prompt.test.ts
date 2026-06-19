import { describe, it, expect, vi, beforeEach } from 'vitest';

// Phase C (Workstream A Layer 5, 2026-06-18) — await buildV2SystemPrompt is now
// async + DB-first. By default the supabase admin mock returns null for
// the messaging_ai_instructions row, forcing the hardcoded fallback path
// (getStandardTemplate). Existing 174 tests assert prompt CONTENT, which
// is byte-identical between the DB-set and fallback paths once grounding
// substitutions are applied — so the migration to async is a pure await
// + mock additions. New tests further down exercise the DB-set path,
// the null/empty/error fallback branches, and the getStandardTemplate
// snapshot contract directly.
const messagingAiInstructionsValue: { value: unknown; error: { message: string } | null } = {
  value: null,
  error: null,
};

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (_table: string) => ({
      select: (_cols: string) => ({
        eq: (_col: string, _key: string) => ({
          maybeSingle: () =>
            Promise.resolve({
              data:
                messagingAiInstructionsValue.value === null
                  ? null
                  : { value: messagingAiInstructionsValue.value },
              error: messagingAiInstructionsValue.error,
            }),
        }),
      }),
    }),
  }),
}));

beforeEach(() => {
  messagingAiInstructionsValue.value = null;
  messagingAiInstructionsValue.error = null;
});

import {
  buildV2SystemPrompt,
  CUSTOMER_CONTEXT_PLACEHOLDER,
  BUSINESS_NAME_PLACEHOLDER,
  BUSINESS_HOURS_PLACEHOLDER,
  CURRENT_DATE_PLACEHOLDER,
  getStandardTemplate,
} from '@/lib/sms-ai/system-prompt';

const SAMPLE_INPUTS = {
  businessName: 'Smart Details Auto Spa',
  businessHours: 'Mon–Fri 9–6, Sat 10–4, Sun closed',
  currentDate: '2026-05-18',
};

describe('buildV2SystemPrompt — structural output', () => {
  it('returns a non-empty string', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(1500);
  });

  it('interpolates businessName', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('Smart Details Auto Spa');
  });

  it('interpolates businessHours and currentDate', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('Mon–Fri 9–6, Sat 10–4, Sun closed');
    expect(out).toContain('2026-05-18');
  });

  it('includes the {CUSTOMER_CONTEXT} placeholder UN-substituted (runner fills it later)', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain(CUSTOMER_CONTEXT_PLACEHOLDER);
    expect(CUSTOMER_CONTEXT_PLACEHOLDER).toBe('{CUSTOMER_CONTEXT}');
  });

  it('contains all 8 required section headings (post-2026-05-22 rename)', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toMatch(/# Identity/);
    expect(out).toMatch(/# Channel rules/);
    expect(out).toMatch(/# Critical rules/);
    expect(out).toMatch(/# Tool usage guide/);
    expect(out).toMatch(/# Escalation guide/);
    expect(out).toMatch(/# Discovery and conversation flow/);
    expect(out).toMatch(/# Context for this conversation/);
    expect(out).toMatch(/# Grounding/);
  });

  it('opens with the Tom persona on first line', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toMatch(/You are Tom/);
  });

  it('declares America/Los_Angeles timezone', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('America/Los_Angeles');
  });

  it('declares SMS-channel constraints (segment length, no markdown)', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out.toLowerCase()).toContain('160 char');
    expect(out.toLowerCase()).toContain('no markdown');
  });

  it('enforces the one-primary-service quote rule', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toMatch(/one primary service/i);
  });

  it('forbids specialty-vehicle quoting and directs to notify_staff', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out.toLowerCase()).toContain('exotic');
    expect(out.toLowerCase()).toContain('classic');
    expect(out).toContain('notify_staff');
    expect(out).toContain('custom_quote');
  });

  it('lists all 7 notify_staff reasons in the escalation guide', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
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

  it('names every tool in the tool usage guide section', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
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

  it('honors STOP/UNSUBSCRIBE silent-handoff rule', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out.toUpperCase()).toContain('STOP');
    expect(out.toUpperCase()).toContain('UNSUBSCRIBE');
  });

  it('forbids inventing discounts/promotions', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out.toLowerCase()).toMatch(/never (invent|offer discount)/);
  });

  it('produces identical output for identical inputs (no Date.now hidden injection)', async () => {
    const a = await buildV2SystemPrompt(SAMPLE_INPUTS);
    const b = await buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(a).toBe(b);
  });

  it('substitutes only the explicit inputs — replacing businessName changes output', async () => {
    const a = await buildV2SystemPrompt(SAMPLE_INPUTS);
    const b = await buildV2SystemPrompt({ ...SAMPLE_INPUTS, businessName: 'Other Co' });
    expect(a).not.toBe(b);
    expect(b).toContain('Other Co');
    expect(b).not.toContain('Smart Details Auto Spa');
  });
});

// ---------------------------------------------------------------------------
// Layer 1+2 fixup — expanded prompt sections + structural invariants
// ---------------------------------------------------------------------------

describe('buildV2SystemPrompt — expanded sections (fixup)', () => {
  it('includes Cross-channel awareness section header', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('# Cross-channel awareness');
  });

  it('includes Vehicle size mapping (for pricing lookup) section header', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('# Vehicle size mapping (for pricing lookup)');
  });

  it('includes RO Water section header', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('# RO Water');
  });

  it('includes Language handling section header (renamed from Multi-language support 2026-05-22)', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('# Language handling');
    // Old header must NOT remain — prevents accidental duplicate section
    expect(out).not.toContain('# Multi-language support');
  });

  it('includes What you cannot do section header', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('# What you cannot do');
  });

  it('Critical rules section contains exactly 22 numbered rules (D49 auto-send rule added 2026-05-27 as Rule 17; was 21 pre-D49 / 19 pre-D47 / 17 pre-D43)', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    const criticalIdx = out.indexOf('# Critical rules');
    expect(criticalIdx, 'expected # Critical rules header to exist').toBeGreaterThan(-1);
    const afterHeader = out.slice(criticalIdx + '# Critical rules'.length);
    const nextHeaderIdx = afterHeader.search(/\n# /);
    const section = nextHeaderIdx === -1 ? afterHeader : afterHeader.slice(0, nextHeaderIdx);
    const numbered = section.match(/^\d+\./gm) ?? [];
    expect(numbered.length).toBe(22);
  });

  it('{CUSTOMER_CONTEXT} placeholder appears exactly once', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    const occurrences = out.split(CUSTOMER_CONTEXT_PLACEHOLDER).length - 1;
    expect(occurrences).toBe(1);
  });

  it('all three dynamic inputs appear in the output (sanity)', async () => {
    const out = await buildV2SystemPrompt({
      businessName: 'Acme Detail Co',
      businessHours: 'Mon–Sat 7am–9pm',
      currentDate: '2026-12-25',
    });
    expect(out).toContain('Acme Detail Co');
    expect(out).toContain('Mon–Sat 7am–9pm');
    expect(out).toContain('2026-12-25');
  });

  it('cross-channel awareness section mentions voice agent and references quotes by number', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    const crossIdx = out.indexOf('# Cross-channel awareness');
    const section = out.slice(crossIdx, out.indexOf('# Conversation freshness', crossIdx));
    expect(section.toLowerCase()).toContain('voice agent');
    expect(section).toContain('Q-0023');
  });

  it('language-handling section lists supported languages', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
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
  it('includes the "Pending addon authorization" section header', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('# Pending addon authorization (mid-job)');
  });

  it('mentions both approve_addon and decline_addon tools in the addon section', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    const addonIdx = out.indexOf('# Pending addon authorization (mid-job)');
    expect(addonIdx).toBeGreaterThan(-1);
    const ctxIdx = out.indexOf('# Context for this conversation', addonIdx);
    const section = out.slice(addonIdx, ctxIdx);
    expect(section).toContain('approve_addon');
    expect(section).toContain('decline_addon');
  });

  it('references pending_addons context list explicitly', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('pending_addons');
  });

  it('places the addon section BEFORE the {CUSTOMER_CONTEXT} placeholder (cache boundary)', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
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
  it('includes Formatting and naming section header', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('# Formatting and naming');
  });

  it('specifies Year + Color + Make + Model order with capitalization', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('Year + Color + Make + Model');
    // At least one positive Y+C+M+M example present
    expect(out).toMatch(/2016 Silver Honda Accord|2026 Yellow Ferrari Roma Spider/);
    // Lowercase-to-Title example pinned
    expect(out).toContain('"silver" → "Silver"');
  });
});

describe('buildV2SystemPrompt — Issue 2 + Issue 3 (closure + short replies)', () => {
  it('includes Reading short replies subsection in Discovery and conversation flow', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('Reading short replies');
    // Short affirmatives enumerated
    expect(out).toContain('"yes"');
    expect(out).toContain('"yeah"');
    expect(out).toContain('"sí"');
  });

  it('includes Graceful closure rule + canonical examples', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('Graceful closure');
    expect(out).toContain('You got it');
    expect(out).toMatch(/talk soon|see you then/i);
  });
});

describe('buildV2SystemPrompt — Issue 4 + Issue 5 (Mexican Spanish + current-message-led switching)', () => {
  it('declares Mexican Spanish dialect with vocab pins', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('Mexican Spanish');
    expect(out).toContain('carro');
    expect(out).toContain('ustedes');
    expect(out).toContain('NOT "coche"');
    expect(out).toContain('NEVER "vosotros"');
  });

  it('declares current-message-led language switching rule', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toMatch(/language of the customer's CURRENT message/);
    expect(out).toContain('in English please');
  });
});

describe('buildV2SystemPrompt — Issue 6 + Issue 10 (multi-vehicle disambiguation + color rule)', () => {
  it('declares multi-vehicle disambiguation fires every turn', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('Multi-vehicle disambiguation');
    expect(out).toContain('fires every turn');
    expect(out).toContain('ALWAYS ask which vehicle');
  });

  it('declares color-ask-once-then-proceed rule (D9 / Issue 10)', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    // The exact non-loop language
    expect(out).toContain('Color: ask once if missing');
    expect(out).toMatch(/don't loop/i);
  });
});

describe('buildV2SystemPrompt — Issue 7 (discovery before menu)', () => {
  it('declares Discovery before menu enumeration rule', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('Discovery before menu enumeration');
    expect(out).toMatch(/ONE focused clarifying question/);
  });
});

describe('buildV2SystemPrompt — Issue 8 (quote-intent recognition phrasings)', () => {
  it('declares quote-send intent recognition with English + Spanish phrasings', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
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
  it('forbids asking for name when context has one and forbids asking for phone always', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    // Both forbids inside Critical rule 9
    expect(out).toContain('Use the first name on file; never ask for it');
    expect(out).toContain('NEVER ask the customer to confirm or provide their phone');
  });
});

describe('buildV2SystemPrompt — Issue 13 (4-hour fresh-conversation threshold, D14)', () => {
  it('includes Conversation freshness section header', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('# Conversation freshness');
  });

  it('declares the 4-hour threshold with both branches', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toMatch(/Gap < 4 hours/);
    expect(out).toMatch(/Gap ≥ 4 hours/);
    expect(out).toContain('FRESH request');
  });

  it('declares the explicit-prior-reference exception (carries continuation regardless of elapsed time)', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('explicitly references prior context');
    expect(out).toMatch(/regardless of elapsed time/);
  });
});

describe('buildV2SystemPrompt — Issue 14 (bundle-pricing hallucination hard guardrail, D15)', () => {
  it('Critical rule 20 declares tool-grounded add-ons only (was Rule 14 pre-D38; was Rule 15 pre-D39; was Rule 16 pre-D43; was Rule 17 pre-D47; was Rule 19 pre-D49)', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    // Rule 20 specifically — shifted 14→15 by D38 (Issue 35 Rule 2 insert),
    // 15→16 by D39 (Issue 36 size_class Rule 6 insert), 16→17 by D43
    // (Issue 38 tier-intent Rule 7 insert), 17→19 by D47 (Issues
    // 43/44 inserted Rules 8 + 9 — price-lookup-never-recall + scope-tier
    // enumeration), then 19→20 by D49 (Issue 45 inserted Rule 17 — auto-send).
    expect(out).toMatch(/20\.\s+\*\*Tool-grounded add-ons only/);
    expect(out).toContain('NEVER invent add-ons');
    expect(out).toContain('addon_suggestions');
  });

  it('Add-ons and bundle quoting section provides the "no configured bundles" canned response', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('# Add-ons and bundle quoting');
    expect(out).toContain('no current bundle pricing configured');
    expect(out).toContain("Don't fabricate");
  });
});

describe('buildV2SystemPrompt — Issue 15 (proactive add-on disclosure, D16)', () => {
  it('declares proactive add-on surfacing rule when configured', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('surface proactively');
    expect(out).toMatch(/SAME message as the standalone quote/);
    expect(out).toContain("don't wait for pushback");
  });

  it('uses tool-response fields combo_price + savings when surfacing', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('combo_price');
    expect(out).toContain('savings');
  });

  it('caps add-on disclosure at one mention per turn', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('One mention per turn');
  });
});

describe('buildV2SystemPrompt — section ordering (post-2026-05-22 outline)', () => {
  it('Formatting and naming appears between Channel rules and Critical rules', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    const channelIdx = out.indexOf('# Channel rules');
    const formatIdx = out.indexOf('# Formatting and naming');
    const criticalIdx = out.indexOf('# Critical rules');
    expect(channelIdx).toBeLessThan(formatIdx);
    expect(formatIdx).toBeLessThan(criticalIdx);
  });

  it('Conversation freshness appears between Cross-channel awareness and Vehicle size mapping', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    const crossIdx = out.indexOf('# Cross-channel awareness');
    const freshIdx = out.indexOf('# Conversation freshness');
    const vmapIdx = out.indexOf('# Vehicle size mapping');
    expect(crossIdx).toBeLessThan(freshIdx);
    expect(freshIdx).toBeLessThan(vmapIdx);
  });

  it('Add-ons and bundle quoting appears between Tool usage guide and Discovery and conversation flow', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
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
  it('includes Contact information handling subsection', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('## Contact information handling');
  });

  it('declares the hard "never ask for phone on SMS" rule with no-exception wording', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('NEVER ask the customer for their phone number on SMS');
    expect(out).toContain('There is no scenario where it is acceptable');
  });

  it('lists positive acknowledgment examples for "this one" / "number I\'m texting from"', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('the number I\'m texting from');
    expect(out).toContain('Got it — using this number');
  });
});

describe('buildV2SystemPrompt — Issue 25 (vehicle info collected in same turn, color not asked mid-booking)', () => {
  it('includes Vehicle information collection subsection', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('## Vehicle information collection');
  });

  it('declares year + make + model + color in the SAME turn', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('year,\nmake, model, AND color in the SAME turn');
    expect(out).toContain('Year, make, model, and color');
  });

  it('declares ask-color-once-in-next-turn if omitted, then proceed (per D9)', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('ask for color ONCE in the next turn');
    expect(out).toContain("don't loop on it");
  });
});

describe('buildV2SystemPrompt — Issue 24 (no internal-mechanics leakage)', () => {
  it('includes Never expose internal mechanics subsection inside What you cannot do', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    const mechanicsIdx = out.indexOf('## Never expose internal mechanics');
    const cannotDoIdx = out.indexOf('# What you cannot do');
    const pendingIdx = out.indexOf('# Pending addon authorization');
    expect(cannotDoIdx).toBeGreaterThan(-1);
    expect(mechanicsIdx).toBeGreaterThan(cannotDoIdx);
    expect(mechanicsIdx).toBeLessThan(pendingIdx);
  });

  it('enumerates forbidden language: tool names, IDs, "behind the scenes", database concepts', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('"Behind the scenes"');
    expect(out).toContain('Service IDs, customer IDs, quote IDs');
    expect(out).toContain('Tool names');
    expect(out).toContain('size_class names like "suv_3row_van"');
  });

  it('declares recoverable vs non-recoverable handling without leaking the issue', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('If recoverable: redirect conversationally without mentioning the issue');
    expect(out).toContain('Let me have a team member follow up with you');
  });
});

describe('buildV2SystemPrompt — Issue 23 + D19 (quote-first booking, no availability claims)', () => {
  it('includes Booking flow — quote first, scheduling second subsection', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('## Booking flow — quote first, scheduling second');
  });

  it('forbids direct create_appointment call in the booking flow', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('DO NOT call `create_appointment` in this flow');
    // D49 reflowed the opening paragraph; the "You DO NOT book the
    // appointment directly" anti-direct-booking sentence is preserved
    // (now on a single line instead of wrapping mid-word).
    expect(out).toContain('You DO NOT book the appointment directly');
  });

  it('includes the canonical post-quote handoff line (D49 auto-send phrasing)', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    // D49 (Issue 45, 2026-05-27): the canonical post-quote handoff line is
    // now the auto-send reply "Sending the quote now — check your texts!"
    // (tool-result-agnostic per Critical Rule 17 + Issue 27 safety). The
    // pre-D49 past-tense "Sent the quote to your phone..." was replaced
    // because optimistic claims of success risk Issue 27-class fabrication
    // if the tool fails.
    expect(out).toContain('Sending the quote now — check your texts!');
    // Old past-tense canonical phrase is GONE
    expect(out).not.toContain('Sent the quote to your phone — tap the link to review and accept');
  });

  it('distinguishes business-hours statements (OK) from specific-slot availability claims (NEVER)', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('Open/closed days and hours: OK to state from your `businessHours`');
    expect(out).toContain('Specific time slot availability: NEVER state');
  });

  it('lists forbidden availability phrases verbatim', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('"Monday is fully booked,"');
    expect(out).toContain('"9 AM just filled up,"');
  });

  it('forbids predicting staff follow-up timing ("within a few hours")', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('NEVER say "within a\nfew hours"');
  });

  it('Critical rule 21 declares quote-first / never-book-directly (was Rule 15 pre-D38; was Rule 16 pre-D39; was Rule 17 pre-D43; was Rule 18 pre-D47; was Rule 20 pre-D49)', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toMatch(/21\.\s+\*\*Quote first, never book directly/);
    expect(out).toContain('NEVER call `create_appointment` directly');
  });
});

describe('buildV2SystemPrompt — Issue 18 (customer type classification) [revised Workstream J Session 3]', () => {
  it('includes Customer type classification subsection', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('## Customer type classification');
  });

  it('declares Enthusiast / Professional values with signals', async () => {
    // Session 3: subsection rewritten to point at upsert_customer; the
    // "Unknown" enum value was dropped — the server now defaults to
    // 'enthusiast' rather than leaving the column nullable.
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('**Enthusiast**');
    expect(out).toContain('**Professional**');
    expect(out).toContain('for my shop');
    expect(out).toContain('for my dealership');
  });

  it('forbids asking the customer the classification question directly', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('are you a professional or an enthusiast?');
    expect(out).toContain('internal\ncategorization, never customer-facing');
  });

  it('directs the agent to upsert_customer with customer_type (replaces old send_quote_sms branch language)', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    // New wording (Workstream J Session 3 — D34)
    expect(out).toContain('`upsert_customer` accepts a `customer_type` parameter');
    expect(out).toContain("defaults to `'enthusiast'`");
    // The old conditional language must be gone — guards against
    // accidentally restoring the pre-Session-3 wording.
    expect(out).not.toContain('If `send_quote_sms` tool accepts a `customer_type` parameter');
  });
});

describe('buildV2SystemPrompt — Tool usage guide updates (Issue 17 + D19)', () => {
  it('Tool usage guide directs product/catalog inquiries to get_products BEFORE asking customer for anything', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('Call `get_products` or `get_product_details` BEFORE asking the customer for anything');
  });

  it('Tool usage guide replaces the old "call create_appointment with confirmed date+time+service" bullet with the quote-first path', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    // Old bullet content must NOT remain unchanged — the quote-first replacement points to send_quote_sms.
    expect(out).toContain('This is the booking path — staff handles scheduling confirmation in a follow-up');
    expect(out).toContain('Do NOT call `create_appointment` directly');
  });
});

// ---------------------------------------------------------------------------
// Workstream J Session 3 — upsert_customer prompt rules
// ---------------------------------------------------------------------------

describe('buildV2SystemPrompt — Workstream J Session 3 (upsert_customer)', () => {
  it('includes "Capturing the customer\'s first name" subsection', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain("## Capturing the customer's first name");
  });

  it('directs the agent to call upsert_customer IMMEDIATELY upon learning first_name', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('IMMEDIATELY call `upsert_customer`');
  });

  it('declares one-polite-re-ask-then-proceed deflection rule', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('After ONE polite\nre-ask, proceed without');
  });

  it('includes "Using upsert_customer to enrich customer records" subsection', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('## Using upsert_customer to enrich customer records');
  });

  it('describes upsert_customer as idempotent in the enrichment subsection', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('`upsert_customer` is idempotent');
  });

  it('lists the "When NOT to call upsert_customer" cases (already in context, no name, just browsing)', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('When NOT to call `upsert_customer`');
    expect(out).toContain('already in CUSTOMER CONTEXT');
    expect(out).toContain('just browsing');
  });

  it('forbids passing placeholder values like "Customer" or "Caller" as first_name', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('Never pass\n  placeholder values like "Customer" or "Caller"');
  });

  it('"For NEW conversations" step 1 now references upsert_customer call timing', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    // The updated step 1 wording — pinned literally so we catch silent regressions
    expect(out).toContain('The MOMENT the customer shares a usable first name, call `upsert_customer`');
  });

  it('Customer type classification subsection now references upsert_customer (not send_quote_sms)', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
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

  it('Critical rule 22 declares instructions_for_agent silent-follow handling (was Rule 16 pre-D38; was Rule 17 pre-D39 size_class insert; was Rule 18 pre-D43 tier-intent insert; was Rule 19 pre-D47 scope-pricing inserts; was Rule 21 pre-D49 auto-send insert)', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    // Session 4 broadened "Tool errors" → "Tool responses" so the same rule
    // covers both isError:true error paths AND isError:false success paths
    // that ship a directive (e.g. send_quote_sms's was_duplicate:true case).
    // Session 5 (D38, Issue 35) renumbered this from Rule 16 → Rule 17 after
    // inserting the mandatory-reply rule as Rule 2. Session 7 (D39, Issue 36)
    // renumbered 17 → 18 after inserting the size_class imperative as Rule 6.
    // Session B (D43, Issue 38) renumbered 18 → 19 after inserting the
    // multi-tier tiers+quantities imperative as Rule 7. D47 (Issues 43/44)
    // renumbered 19 → 21 after inserting the price-lookup-never-recall +
    // scope-tier enumeration imperatives as Rules 8 + 9. D49 (Issue 45)
    // renumbered 21 → 22 after inserting the auto-send imperative as Rule 17.
    expect(out).toMatch(/22\.\s+\*\*Tool responses with `instructions_for_agent`/);
    expect(out).toContain('follow those instructions silently');
    expect(out).toContain('Never share tool error messages');
    // Explicit Session 4 additions — confirm both success+error wording and
    // the was_duplicate exemplar are present so the rule covers Session 4's
    // dedup-response path.
    expect(out).toContain('success OR error');
    expect(out).toContain('was_duplicate');
  });

  it('upsert_customer subsections appear inside Discovery and conversation flow (before Escalation guide)', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
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
  it('Discovery and conversation flow subsections appear in expected order: Contact info → Vehicle info → Booking flow → Customer type', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    const contactIdx = out.indexOf('## Contact information handling');
    const vehicleIdx = out.indexOf('## Vehicle information collection');
    const bookingIdx = out.indexOf('## Booking flow — quote first, scheduling second');
    const customerTypeIdx = out.indexOf('## Customer type classification');
    expect(contactIdx).toBeGreaterThan(-1);
    expect(contactIdx).toBeLessThan(vehicleIdx);
    expect(vehicleIdx).toBeLessThan(bookingIdx);
    expect(bookingIdx).toBeLessThan(customerTypeIdx);
  });

  it('All new 2026-05-23 subsections live inside their parent # sections', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
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
  it('declares the no-new-fields-no-call rule under upsert_customer enrichment subsection', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('You already called `upsert_customer` earlier in this conversation');
    expect(out).toContain('200-400ms of latency');
    expect(out).toContain('ONLY call `upsert_customer` when you are\n  persisting NEW information');
  });

  it('includes Invocation cadence guide with first/subsequent/no-fields branches', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('Invocation cadence guide');
    expect(out).toContain('**First call**');
    expect(out).toContain('**Subsequent calls**');
    expect(out).toContain('**No new fields = no call.**');
  });

  it('keeps the existing "When NOT to call" anchor bullets (back-compat with Session 3)', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
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
  it('includes the new "Passing size_class to get_services after classify_vehicle" subsection inside # Add-ons and bundle quoting', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('## Passing size_class to get_services after classify_vehicle');
    const addonIdx = out.indexOf('# Add-ons and bundle quoting');
    const sizeClassIdx = out.indexOf('## Passing size_class to get_services after classify_vehicle');
    const discoveryIdx = out.indexOf('# Discovery and conversation flow');
    expect(addonIdx).toBeLessThan(sizeClassIdx);
    expect(sizeClassIdx).toBeLessThan(discoveryIdx);
  });

  it('directs the agent to pass size_class after classify_vehicle returns (D39 imperative wording)', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('classify_vehicle');
    // D39 strengthened "pass that same" → "you MUST pass that same".
    expect(out).toMatch(/you MUST pass that same `size_class` value to/);
  });

  it('preserves the exotic/classic escalation reminder in the size_class subsection', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    const sizeClassIdx = out.indexOf('## Passing size_class to get_services after classify_vehicle');
    const nextSection = out.indexOf('# Discovery and conversation flow', sizeClassIdx);
    const section = out.slice(sizeClassIdx, nextSection);
    expect(section).toContain('exotic and classic');
    expect(section).toContain('notify_staff');
    expect(section).toContain('custom_quote');
  });

  it('DELETES the obsolete Session 4 combo-pricing-mitigation subsection (replaced by Layer 1 endpoint fix)', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).not.toContain('## Combo and bundle pricing — confirm before stating');
    expect(out).not.toContain('Do NOT state combo/bundle pricing');
    expect(out).not.toContain('JUST called `get_services`');
  });

  it('preserves Rule 22 (instructions_for_agent silent-follow) — untouched by Layer 2 (renumbered 16→17 by D38; 17→18 by D39; 18→19 by D43; 19→21 by D47; 21→22 by D49)', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toMatch(/22\.\s+\*\*Tool responses with `instructions_for_agent`/);
    expect(out).toContain('success OR error');
    expect(out).toContain('was_duplicate');
  });

  it('preserves Critical rule 4 exotic/classic escalation (untouched by Layer 2; renumbered 3→4 by D38 Issue 35)', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toMatch(/4\.\s+\*\*Specialty vehicles require staff/);
    expect(out).toContain('"exotic" or "classic"');
  });
});

describe('buildV2SystemPrompt — Workstream J Session 4 (Issue 34 last_name capture at quote-send)', () => {
  it('includes "Capturing the customer\'s last name at quote-send" subsection inside Discovery and conversation flow', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain("## Capturing the customer's last name at quote-send");
    const flowIdx = out.indexOf('# Discovery and conversation flow');
    const lastNameIdx = out.indexOf("## Capturing the customer's last name at quote-send");
    const escalIdx = out.indexOf('# Escalation guide');
    expect(flowIdx).toBeLessThan(lastNameIdx);
    expect(lastNameIdx).toBeLessThan(escalIdx);
  });

  it('positions last_name capture between Booking flow and Customer type classification', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    const bookingIdx = out.indexOf('## Booking flow — quote first, scheduling second');
    const lastNameIdx = out.indexOf("## Capturing the customer's last name at quote-send");
    const customerTypeIdx = out.indexOf('## Customer type classification');
    expect(bookingIdx).toBeGreaterThan(-1);
    expect(bookingIdx).toBeLessThan(lastNameIdx);
    expect(lastNameIdx).toBeLessThan(customerTypeIdx);
  });

  it('declares the three response paths (just-last-name, full-name, declines)', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('Just their last name');
    expect(out).toContain('Their full name');
    expect(out).toContain('First name only or declines');
  });

  it('declares the aggressive full-name parsing rule (Q1 operator answer)', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('Parse aggressively');
    expect(out).toContain('"Nayeem Khan"');
    expect(out).toContain('`last_name: "Khan"`');
    // Existing first_name must be preserved per Policy B
    expect(out).toContain('preserved per\n   Policy B');
  });

  it('declares non-blocking + no-re-ask rule', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('Do not block the quote on last_name capture');
    expect(out).toContain('Do NOT re-ask');
    expect(out).toContain("customer's choice is respected");
  });

  it('uses casual ask wording — "What name should I put on the quote?" or "Last name?"', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
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
  it('declares Critical rule 2 as the mandatory-reply rule with the distinctive headline phrase', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    // The new rule is the second numbered item under # Critical rules.
    expect(out).toMatch(/2\.\s+\*\*Every customer turn requires a customer-facing reply/);
  });

  it('mandatory-reply rule appears WITHIN the # Critical rules section (high-priority placement)', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    const criticalIdx = out.indexOf('# Critical rules');
    expect(criticalIdx).toBeGreaterThan(-1);
    const ruleIdx = out.indexOf('Every customer turn requires a customer-facing reply', criticalIdx);
    expect(ruleIdx).toBeGreaterThan(-1);
    // Find the next top-level header — must come AFTER the rule
    const nextH1 = out.indexOf('\n# ', criticalIdx + '# Critical rules'.length);
    expect(nextH1).toBeGreaterThan(ruleIdx);
  });

  it('mandatory-reply rule explicitly names upsert_customer (the Issue 35 trigger tool)', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    const criticalIdx = out.indexOf('# Critical rules');
    const nextH1 = out.indexOf('\n# ', criticalIdx);
    const section = out.slice(criticalIdx, nextH1);
    // The new rule lists upsert_customer among the internal tool calls.
    // Use [\s\S]* instead of the `s` flag for tsconfig target compatibility.
    expect(section).toMatch(/Tool calls[\s\S]*upsert_customer/);
  });

  it('mandatory-reply rule classifies tool calls as INTERNAL ACTIONS, not replies', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('INTERNAL ACTIONS');
    expect(out).toContain('are NOT replies');
  });

  it('mandatory-reply rule includes BOTH the WRONG (silent) and RIGHT (text + tool) example labels', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    // Verify the Issue 35 reproduction example uses Sarah / Camry shape
    expect(out).toContain("I'm Sarah with a 2020 Camry");
    expect(out).toContain('WRONG — silent after tool');
    expect(out).toContain('RIGHT — tool plus conversational reply');
  });

  it('mandatory-reply rule asserts "Silence is never the right answer to a customer message"', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('Silence is never the right answer to a customer message');
  });

  it('mandatory-reply rule includes coexistence cross-reference to Rule 22 (instructions_for_agent)', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    // D38 must explicitly call out that following instructions_for_agent
    // still satisfies the reply requirement (both rules satisfied).
    // Reference updated 17 → 18 by D39 (size_class rule insert at position 6),
    // 18 → 19 by D43 (tier-intent rule insert at position 7), 19 → 21
    // by D47 (price-lookup + scope-tier inserts at positions 8 + 9), then
    // 21 → 22 by D49 (auto-send insert at position 17).
    expect(out).toMatch(/When a tool response contains `instructions_for_agent`, follow it \(per Rule 22\)/);
  });

  it('Rule 22 (was Rule 17 pre-D39; was Rule 18 pre-D43; was Rule 19 pre-D47; was Rule 21 pre-D49) wording for instructions_for_agent is preserved unchanged in substance', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    // Substantive wording must be intact — only the rule NUMBER changed
    // from 17 → 18 because D39 added a new Rule 6 (size_class imperative),
    // 18 → 19 because D43 added a new Rule 7 (tier intent), 19 → 21
    // because D47 inserted Rules 8 + 9 (price-lookup + scope-tier), then
    // 21 → 22 because D49 inserted Rule 17 (auto-send).
    expect(out).toMatch(/22\.\s+\*\*Tool responses with `instructions_for_agent`/);
    expect(out).toContain('follow those instructions silently');
    expect(out).toContain('success OR error');
    expect(out).toContain('was_duplicate');
  });

  it('D37 invocation discipline (When NOT to call upsert_customer) remains intact alongside D38', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    // D37 governs WHEN to call upsert_customer; D38 governs ALWAYS reply.
    // Both must coexist. Verify the D37-distinctive substrings are still present.
    expect(out).toContain('You already called `upsert_customer` earlier in this conversation');
    expect(out).toContain('200-400ms of latency');
    expect(out).toContain('No new fields = no call');
  });

  it('Critical rule 4 (exotic/classic escalation) language remains intact at every pinned site', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
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
  it('declares Critical rule 6 with the CRITICAL — ALWAYS pass size_class headline', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    // Rule 6 specifically — inserted by D39 between Rule 5 (Classify before
    // quoting) and the prior Rule 6 (now Rule 7 — appointment confirmation).
    expect(out).toMatch(/6\.\s+\*\*CRITICAL — ALWAYS pass `size_class` to `get_services` after `classify_vehicle`\.\*\*/);
  });

  it('new Critical Rule 6 appears WITHIN the # Critical rules section (high-priority placement, top 6)', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
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

  it('new Critical Rule 6 references the empirical $300/$450 Suburban failure', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    // Pin the Q-0084-class empirical evidence so future edits can't silently
    // weaken the rule to abstract language.
    expect(out).toContain('2018 Suburban');
    expect(out).toContain('Hot Shampoo Extraction Complete');
    expect(out).toContain('$300');
    expect(out).toContain('$450');
    expect(out).toContain('$150 fidelity gap');
  });

  it('new Critical Rule 6 names classify_vehicle as the trigger for passing size_class', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
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

  it('new Critical Rule 6 declares the recall directive (cached response scenario)', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
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

  it('new Critical Rule 6 reinforces exotic/classic escalation precedence (Critical Rule 4)', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
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

  it('"Passing size_class" subsection is strengthened with imperative wording (you MUST pass)', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    const sizeIdx = out.indexOf('## Passing size_class to get_services after classify_vehicle');
    expect(sizeIdx).toBeGreaterThan(-1);
    const sizeEnd = out.indexOf('\n# ', sizeIdx);
    const subsection = out.slice(sizeIdx, sizeEnd);
    expect(subsection).toMatch(/you MUST pass that same `size_class` value/);
    // Cross-reference to Critical Rule 6 (kept loosely coupled so a future
    // renumber catches if these two stop pointing at each other)
    expect(subsection).toContain('Critical Rule 6');
  });

  it('"Passing size_class" subsection cites the Q-0084-class fidelity gap example', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
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

  it('"Passing size_class" subsection declares the Recall directive header + stale-cache language', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    const sizeIdx = out.indexOf('## Passing size_class to get_services after classify_vehicle');
    const sizeEnd = out.indexOf('\n# ', sizeIdx);
    const subsection = out.slice(sizeIdx, sizeEnd);
    expect(subsection).toContain('### Recall directive');
    expect(subsection).toContain('STALE');
    expect(subsection).toContain('at most twice');
  });

  it('"Passing size_class" subsection still cites Critical Rule 4 for exotic/classic precedence', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    const sizeIdx = out.indexOf('## Passing size_class to get_services after classify_vehicle');
    const sizeEnd = out.indexOf('\n# ', sizeIdx);
    const subsection = out.slice(sizeIdx, sizeEnd);
    expect(subsection).toContain('Critical Rule 4');
    expect(subsection).toContain('exotic and classic');
  });

  it('D38 mandatory-reply rule (Rule 2) wording is preserved unchanged by D39', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    // D38's headline must remain at Rule 2 — D39 inserted at position 6,
    // not at position 2/3, so Rules 1-5 are untouched.
    expect(out).toMatch(/2\.\s+\*\*Every customer turn requires a customer-facing reply/);
    expect(out).toContain('Silence is never the right answer to a customer message');
    expect(out).toContain('INTERNAL ACTIONS');
  });

  it('Rule 22 (instructions_for_agent, was Rule 17 pre-D39; was Rule 18 pre-D43; was Rule 19 pre-D47; was Rule 21 pre-D49) wording is preserved unchanged by D39+D43+D47+D49', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toMatch(/22\.\s+\*\*Tool responses with `instructions_for_agent`/);
    expect(out).toContain('follow those instructions silently');
    expect(out).toContain('was_duplicate');
  });

  it('Critical rule 4 (exotic/classic escalation) language preserved at all 4 pinned sites', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
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

// ---------------------------------------------------------------------------
// Session B (D43 + Issue 38, 2026-05-25): multi-tier tier-intent imperative
// on send_quote_sms. Inserted as Critical rule 7 (renumbers prior Rules 7-18
// → 8-19). Parallel pattern to Rule 6 (size_class) for the tier dimension.
// Closes the Q-0084 fidelity gap (agent verbalized "$250 Per Row × 2",
// quote charged $450 complete-tier).
// ---------------------------------------------------------------------------

describe('buildV2SystemPrompt — D43 / Issue 38 (multi-tier tier intent on send_quote_sms)', () => {
  it('declares Critical rule 7 with the CRITICAL — Multi-tier services headline', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    // Rule 7 specifically — inserted by D43 between Rule 6 (size_class) and
    // the prior Rule 7 (now Rule 8 — appointment confirmation).
    expect(out).toMatch(
      /7\.\s+\*\*CRITICAL — Multi-tier services: pass `tiers` \(and `quantities` when relevant\) to `send_quote_sms`\.\*\*/,
    );
  });

  it('new Critical Rule 7 appears WITHIN the # Critical rules section (top-tier placement, between size_class and appointment confirmation — appointment confirmation moved from Rule 8 → Rule 10 by D47)', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    const criticalIdx = out.indexOf('# Critical rules');
    expect(criticalIdx).toBeGreaterThan(-1);
    // Must come AFTER Rule 6 (size_class) — pedagogical pairing
    const rule6Idx = out.indexOf('6. **CRITICAL — ALWAYS pass `size_class`', criticalIdx);
    const rule7Idx = out.indexOf('7. **CRITICAL — Multi-tier services', criticalIdx);
    // Appointment-confirmation rule moved from Rule 8 → Rule 10 by D47
    // (Rules 8 + 9 inserted for Issues 43 + 44 — price-lookup + scope-tier).
    const appointmentIdx = out.indexOf('10. **Never confirm an appointment', criticalIdx);
    expect(rule6Idx).toBeGreaterThan(-1);
    expect(rule7Idx).toBeGreaterThan(rule6Idx);
    expect(appointmentIdx).toBeGreaterThan(rule7Idx);
    // Must come BEFORE the next top-level header
    const nextH1 = out.indexOf('\n# ', criticalIdx + '# Critical rules'.length);
    expect(nextH1).toBeGreaterThan(rule7Idx);
  });

  it('new Critical Rule 7 references the empirical Q-0084 Hot Shampoo Per-Row failure', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    const criticalIdx = out.indexOf('# Critical rules');
    const nextH1 = out.indexOf('\n# ', criticalIdx);
    const section = out.slice(criticalIdx, nextH1);
    const rule7Idx = section.indexOf('7. **CRITICAL — Multi-tier services');
    const rule7End = section.indexOf('\n8. ', rule7Idx);
    const rule7Body = section.slice(rule7Idx, rule7End);
    // Empirical evidence pin so future edits can't weaken to abstract language.
    expect(rule7Body).toContain('2018 Suburban');
    expect(rule7Body).toContain('Hot Shampoo Extraction');
    expect(rule7Body).toContain('Per Row × 2');
    expect(rule7Body).toContain('$250');
    expect(rule7Body).toContain('$450');
    expect(rule7Body).toContain('Q-0084');
  });

  it('new Critical Rule 7 names both Hot Shampoo Extraction tiers and Complete Motorcycle Detail tiers verbatim', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    const criticalIdx = out.indexOf('# Critical rules');
    const nextH1 = out.indexOf('\n# ', criticalIdx);
    const section = out.slice(criticalIdx, nextH1);
    const rule7Idx = section.indexOf('7. **CRITICAL — Multi-tier services');
    const rule7End = section.indexOf('\n8. ', rule7Idx);
    const rule7Body = section.slice(rule7Idx, rule7End);
    // Hot Shampoo's 4 tier_names
    expect(rule7Body).toContain('floor_mats');
    expect(rule7Body).toContain('per_row');
    expect(rule7Body).toContain('carpet_mats');
    expect(rule7Body).toContain('complete');
    // Complete Motorcycle Detail's 2 tier_names (latent vulnerability)
    expect(rule7Body).toContain('Complete Motorcycle Detail');
    expect(rule7Body).toContain('standard_cruiser');
    expect(rule7Body).toContain('touring_bagger');
  });

  it('new Critical Rule 7 pins tier_name source as get_services with VERBATIM imperative', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    const criticalIdx = out.indexOf('# Critical rules');
    const nextH1 = out.indexOf('\n# ', criticalIdx);
    const section = out.slice(criticalIdx, nextH1);
    const rule7Idx = section.indexOf('7. **CRITICAL — Multi-tier services');
    const rule7End = section.indexOf('\n8. ', rule7Idx);
    const rule7Body = section.slice(rule7Idx, rule7End);
    expect(rule7Body).toContain('tier_name');
    expect(rule7Body).toContain('get_services');
    expect(rule7Body).toContain('VERBATIM');
  });

  it('new Critical Rule 7 declares parallel-array contract and empty-token / omit semantics', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    const criticalIdx = out.indexOf('# Critical rules');
    const nextH1 = out.indexOf('\n# ', criticalIdx);
    const section = out.slice(criticalIdx, nextH1);
    const rule7Idx = section.indexOf('7. **CRITICAL — Multi-tier services');
    const rule7End = section.indexOf('\n8. ', rule7Idx);
    const rule7Body = section.slice(rule7Idx, rule7End);
    expect(rule7Body).toContain('Parallel arrays');
    expect(rule7Body).toContain('positional');
    expect(rule7Body.toLowerCase()).toContain('empty token');
    // Auto-pick contract pinned for size_class-determined tiers
    expect(rule7Body.toLowerCase()).toContain('auto-pick');
  });

  it('new Critical Rule 7 declares max_qty rejection path with instructions_for_agent recovery', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    const criticalIdx = out.indexOf('# Critical rules');
    const nextH1 = out.indexOf('\n# ', criticalIdx);
    const section = out.slice(criticalIdx, nextH1);
    const rule7Idx = section.indexOf('7. **CRITICAL — Multi-tier services');
    const rule7End = section.indexOf('\n8. ', rule7Idx);
    const rule7Body = section.slice(rule7Idx, rule7End);
    expect(rule7Body).toContain('max_qty');
    expect(rule7Body).toContain('instructions_for_agent');
    // Rule 22 cross-reference for the recovery path (was Rule 19 pre-D47
    // — D47 inserted Rules 8 + 9 so instructions_for_agent shifted 19 → 21;
    // D49 inserted Rule 17 auto-send so 21 → 22).
    expect(rule7Body).toMatch(/Rule 22/);
  });

  it('new Critical Rule 7 contains BOTH the WRONG ❌ and RIGHT ✅ exemplar pair', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    const criticalIdx = out.indexOf('# Critical rules');
    const nextH1 = out.indexOf('\n# ', criticalIdx);
    const section = out.slice(criticalIdx, nextH1);
    const rule7Idx = section.indexOf('7. **CRITICAL — Multi-tier services');
    const rule7End = section.indexOf('\n8. ', rule7Idx);
    const rule7Body = section.slice(rule7Idx, rule7End);
    expect(rule7Body).toContain('❌ WRONG');
    expect(rule7Body).toContain('✅ RIGHT');
    // The correct invocation shape exemplified
    expect(rule7Body).toContain('tiers: "per_row"');
    expect(rule7Body).toContain('quantities: "2"');
  });

  it('new Critical Rule 7 explicitly cross-references Critical Rule 6 (architectural parallel)', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    const criticalIdx = out.indexOf('# Critical rules');
    const nextH1 = out.indexOf('\n# ', criticalIdx);
    const section = out.slice(criticalIdx, nextH1);
    const rule7Idx = section.indexOf('7. **CRITICAL — Multi-tier services');
    const rule7End = section.indexOf('\n8. ', rule7Idx);
    const rule7Body = section.slice(rule7Idx, rule7End);
    // Architectural parallel to Rule 6 (size_class) — keeps the two rules
    // loosely coupled so any future renumber catches if either drifts.
    expect(rule7Body).toContain('Critical Rule 6');
    expect(rule7Body.toLowerCase()).toContain('parallel');
  });

  it('D43 preserves Critical Rule 6 (size_class) wording unchanged', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    // Rule 6's headline must remain at Rule 6 (D43 inserted at Rule 7, NOT
    // before Rule 6). The size_class empirical evidence must remain intact.
    expect(out).toMatch(/6\.\s+\*\*CRITICAL — ALWAYS pass `size_class` to `get_services` after `classify_vehicle`\.\*\*/);
    expect(out).toContain('Hot Shampoo Extraction Complete');
    expect(out).toContain('$150 fidelity gap');
  });

  it('D49 preserves the tool-usage-guide cross-reference (now points to Rule 21 after D49 renumber)', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    // The "see Booking flow + Critical rule N" cross-refs in both the
    // Tool usage guide bullet and the "For NEW conversations" step 5
    // shifted from Rule 17 → Rule 18 by D43 (the quote-first rule
    // moved), 18 → 20 by D47 (Rules 8 + 9 inserted for Issues
    // 43/44 — price-lookup + scope-tier), then 20 → 21 by D49 (Rule 17
    // inserted for Issue 45 — auto-send).
    expect(out).toContain('see "Booking flow" + Critical rule 21');
    expect(out).toContain('see "Booking flow" below + Critical rule 21');
    // Stale Rule 17 + Rule 18 + Rule 20 cross-refs must NOT remain
    expect(out).not.toContain('see "Booking flow" + Critical rule 17');
    expect(out).not.toContain('see "Booking flow" below + Critical rule 17');
    expect(out).not.toContain('see "Booking flow" + Critical rule 18');
    expect(out).not.toContain('see "Booking flow" below + Critical rule 18');
    expect(out).not.toContain('see "Booking flow" + Critical rule 20');
    expect(out).not.toContain('see "Booking flow" below + Critical rule 20');
  });
});

// ---------------------------------------------------------------------------
// D47 — Issues 43 + 44 — Scope-pricing agent prompt discipline (2026-05-26).
// Critical Rule 8 = Price lookup, never price recall. Critical Rule 9 =
// Scope-pricing services enumerate tiers + probe + anchor on Complete.
// ---------------------------------------------------------------------------

describe('buildV2SystemPrompt — D47 / Issue 43 (Critical Rule 8: price lookup, never price recall)', () => {
  it('declares Critical Rule 8 with the CRITICAL — Price lookup headline', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toMatch(/8\.\s+\*\*CRITICAL — Price lookup, never price recall\.\*\*/);
  });

  it('Rule 8 appears WITHIN the # Critical rules section, between Rule 7 and Rule 9 (pricing-discipline cluster contiguous)', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    const criticalIdx = out.indexOf('# Critical rules');
    const rule7Idx = out.indexOf('7. **CRITICAL — Multi-tier services', criticalIdx);
    const rule8Idx = out.indexOf('8. **CRITICAL — Price lookup', criticalIdx);
    const rule9Idx = out.indexOf('9. **CRITICAL — Scope-pricing services', criticalIdx);
    expect(rule7Idx).toBeGreaterThan(-1);
    expect(rule8Idx).toBeGreaterThan(rule7Idx);
    expect(rule9Idx).toBeGreaterThan(rule8Idx);
  });

  it('Rule 8 cites the Q-0087 empirical evidence (Express Exterior Wash $85 → $110 self-correction)', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    const rule8Idx = out.indexOf('8. **CRITICAL — Price lookup');
    const rule9Idx = out.indexOf('9. **CRITICAL — Scope-pricing services');
    const rule8Body = out.slice(rule8Idx, rule9Idx);
    expect(rule8Body).toContain('Q-0087');
    expect(rule8Body).toContain('Express Exterior Wash');
    expect(rule8Body).toContain('$85');
    expect(rule8Body).toContain('$110');
  });

  it('Rule 8 prescribes the LOOKUP-from-cached-response pattern + RECALL when stale', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    const rule8Idx = out.indexOf('8. **CRITICAL — Price lookup');
    const rule9Idx = out.indexOf('9. **CRITICAL — Scope-pricing services');
    const rule8Body = out.slice(rule8Idx, rule9Idx);
    expect(rule8Body).toContain('INDEX');
    expect(rule8Body).toContain('cached');
    expect(rule8Body).toContain('RECALL');
  });

  it('Rule 8 includes the WRONG ❌ / RIGHT ✅ exemplar pair for the recall trap', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    const rule8Idx = out.indexOf('8. **CRITICAL — Price lookup');
    const rule9Idx = out.indexOf('9. **CRITICAL — Scope-pricing services');
    const rule8Body = out.slice(rule8Idx, rule9Idx);
    expect(rule8Body).toContain('❌ WRONG');
    expect(rule8Body).toContain('✅ RIGHT');
  });

  it('Rule 8 cross-references Rules 1, 6, 7 architecturally', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    const rule8Idx = out.indexOf('8. **CRITICAL — Price lookup');
    const rule9Idx = out.indexOf('9. **CRITICAL — Scope-pricing services');
    const rule8Body = out.slice(rule8Idx, rule9Idx);
    expect(rule8Body).toMatch(/Rules 1, 6, 7|Rule 1|Rule 6|Rule 7/);
    expect(rule8Body.toLowerCase()).toContain('parallel');
  });
});

describe('buildV2SystemPrompt — D47 / Issue 44 (Critical Rule 9: scope-pricing services enumerate tiers + probe + anchor)', () => {
  it('declares Critical Rule 9 with the CRITICAL — Scope-pricing services headline', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toMatch(/9\.\s+\*\*CRITICAL — Scope-pricing services: enumerate tiers \+ probe \+ anchor on Complete\.\*\*/);
  });

  it('Rule 9 appears WITHIN the # Critical rules section, between Rule 8 and Rule 10 (new appointment-confirmation slot)', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    const rule8Idx = out.indexOf('8. **CRITICAL — Price lookup');
    const rule9Idx = out.indexOf('9. **CRITICAL — Scope-pricing services');
    const rule10Idx = out.indexOf('10. **Never confirm an appointment');
    expect(rule9Idx).toBeGreaterThan(rule8Idx);
    expect(rule10Idx).toBeGreaterThan(rule9Idx);
  });

  it('Rule 9 mandates use of tier_label (not raw snake_case tier_name slugs) in agent prose', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    const rule9Idx = out.indexOf('9. **CRITICAL — Scope-pricing services');
    const rule10Idx = out.indexOf('10. **Never confirm an appointment');
    const rule9Body = out.slice(rule9Idx, rule10Idx);
    expect(rule9Body).toContain('tier_label');
    expect(rule9Body).toMatch(/never raw snake_case|NEVER raw snake_case/);
  });

  it('Rule 9 lists ≥3 probe-phrasing examples so the agent can vary natural language', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    const rule9Idx = out.indexOf('9. **CRITICAL — Scope-pricing services');
    const rule10Idx = out.indexOf('10. **Never confirm an appointment');
    const rule9Body = out.slice(rule9Idx, rule10Idx);
    expect(rule9Body).toContain('anything else inside?');
    expect(rule9Body).toContain('any other concerns inside?');
    expect(rule9Body).toContain('while we\'re at it, anything else?');
  });

  it('Rule 9 prescribes the Complete-anchor in flexible (not literal "best value") wording', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    const rule9Idx = out.indexOf('9. **CRITICAL — Scope-pricing services');
    const rule10Idx = out.indexOf('10. **Never confirm an appointment');
    const rule9Body = out.slice(rule9Idx, rule10Idx);
    // At least one of the operator-locked flexible-anchor phrasings must appear.
    expect(rule9Body).toMatch(/If you want everything covered|The whole interior|The all-in option/);
  });

  it('Rule 9 cites the Q-0087 empirical evidence (Hot Shampoo per_row mention without sibling enumeration)', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    const rule9Idx = out.indexOf('9. **CRITICAL — Scope-pricing services');
    const rule10Idx = out.indexOf('10. **Never confirm an appointment');
    const rule9Body = out.slice(rule9Idx, rule10Idx);
    expect(rule9Body).toContain('Q-0087');
    expect(rule9Body).toContain('Hot Shampoo Extraction');
    expect(rule9Body).toContain('Per Row');
    expect(rule9Body).toContain('Floor Mats');
  });

  it('Rule 9 covers all 6 audit-Target-8 edge cases (direct / exploratory / operator-bypass / multi-service / vehicle pivot / Complete short-circuit)', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    const rule9Idx = out.indexOf('9. **CRITICAL — Scope-pricing services');
    const rule10Idx = out.indexOf('10. **Never confirm an appointment');
    const rule9Body = out.slice(rule9Idx, rule10Idx);
    expect(rule9Body).toContain('Direct price query');
    expect(rule9Body).toContain('Exploratory phrasing');
    expect(rule9Body).toContain('Operator-bypass');
    expect(rule9Body).toContain('Multi-service interleaving');
    expect(rule9Body).toContain('Mid-conversation vehicle pivot');
    expect(rule9Body).toContain('Complete-package short-circuit');
  });

  it('Rule 9 cross-references Critical Rule 20 (architectural parallel — within-service vs cross-service enumeration; renumbered 19 → 20 by D49 auto-send insert at Rule 17)', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    const rule9Idx = out.indexOf('9. **CRITICAL — Scope-pricing services');
    const rule10Idx = out.indexOf('10. **Never confirm an appointment');
    const rule9Body = out.slice(rule9Idx, rule10Idx);
    expect(rule9Body).toContain('Critical Rule 20');
    expect(rule9Body.toLowerCase()).toContain('parallel');
    expect(rule9Body).toContain('addon_suggestions');
  });
});

// ---------------------------------------------------------------------------
// D49 — Issue 45 — Auto-send for send_quote_sms when configuration is
// finalized (Critical Rule 17 insert; renumbers 17-21 → 18-22).
// Operator-locked decisions: Option A (proactive auto-send), reply phrasing
// "Sending the quote now — check your texts!", friction step deleted
// entirely, 7-pattern matrix matches operator intent, observability log
// added in tool-dispatcher.ts.
// ---------------------------------------------------------------------------

describe('buildV2SystemPrompt — D49 / Issue 45 (Critical Rule 17: auto-send when configuration is finalized)', () => {
  it('declares Critical Rule 17 with the CRITICAL — Auto-send quotes headline', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toMatch(/17\.\s+\*\*CRITICAL — Auto-send quotes when configuration is finalized\.\*\*/);
  });

  it('Rule 17 appears WITHIN the # Critical rules section, immediately after Rule 16 (Don\'t double-act) and before Rule 18 (Never pitch mobile)', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    const criticalIdx = out.indexOf('# Critical rules');
    expect(criticalIdx).toBeGreaterThan(-1);
    const rule16Idx = out.indexOf("16. **Don't double-act", criticalIdx);
    const rule17Idx = out.indexOf('17. **CRITICAL — Auto-send', criticalIdx);
    const rule18Idx = out.indexOf('18. **Never pitch mobile service', criticalIdx);
    expect(rule16Idx).toBeGreaterThan(-1);
    expect(rule17Idx).toBeGreaterThan(rule16Idx);
    expect(rule18Idx).toBeGreaterThan(rule17Idx);
    // Must come BEFORE the next top-level header
    const nextH1 = out.indexOf('\n# ', criticalIdx + '# Critical rules'.length);
    expect(nextH1).toBeGreaterThan(rule17Idx);
  });

  it('Rule 17 declares all THREE auto-send preconditions (commit signal + total stated + no mid-flux)', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    const rule17Idx = out.indexOf('17. **CRITICAL — Auto-send');
    const rule18Idx = out.indexOf('18. **Never pitch mobile service');
    const rule17Body = out.slice(rule17Idx, rule18Idx);
    // Precondition 1: commit signal
    expect(rule17Body).toContain('Commit signal');
    expect(rule17Body).toContain('send it');
    // Precondition 2: total stated in prior turn
    expect(rule17Body).toContain('Total stated in your immediately-prior turn');
    // Precondition 3: no mid-flux signals
    expect(rule17Body).toContain('No mid-flux signals');
    expect(rule17Body).toContain('change-request');
    expect(rule17Body).toContain('negation');
  });

  it('Rule 17 specifies the exact auto-send reply phrasing "Sending the quote now — check your texts!"', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    const rule17Idx = out.indexOf('17. **CRITICAL — Auto-send');
    const rule18Idx = out.indexOf('18. **Never pitch mobile service');
    const rule17Body = out.slice(rule17Idx, rule18Idx);
    expect(rule17Body).toContain('Sending the quote now — check your texts!');
    // Past-tense "Quote sent!" is explicitly forbidden per Issue 27 safety
    expect(rule17Body).toContain('Do NOT use past-tense');
    expect(rule17Body).toContain('tool-result-agnostic');
  });

  it('Rule 17 contains the Pattern 3 example (conditional commitment with trailing change-request → recompute then auto-fire)', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    const rule17Idx = out.indexOf('17. **CRITICAL — Auto-send');
    const rule18Idx = out.indexOf('18. **Never pitch mobile service');
    const rule17Body = out.slice(rule17Idx, rule18Idx);
    // Pattern 3 canonical example from audit Target 9
    expect(rule17Body).toContain('Pattern 3');
    expect(rule17Body).toContain('Yes send it, but actually can you add an exterior wash first?');
    expect(rule17Body).toContain('Express Exterior Wash adds $110');
    expect(rule17Body).toContain('$360');
    // The rule must explicitly direct "recompute first, then auto-fire on next turn"
    expect(rule17Body).toContain('recompute');
  });

  it('Rule 17 contains the Issue 27 safety clause (post-failure correction, no fabrication)', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    const rule17Idx = out.indexOf('17. **CRITICAL — Auto-send');
    const rule18Idx = out.indexOf('18. **Never pitch mobile service');
    const rule17Body = out.slice(rule17Idx, rule18Idx);
    expect(rule17Body).toContain('Issue 27 safety');
    expect(rule17Body).toContain('is_error: true');
    expect(rule17Body).toContain('that send failed');
    expect(rule17Body).toContain('Do NOT fabricate success');
  });

  it('Rule 17 explicitly forbids the "Want me to send a quote?" question (friction step deletion)', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    const rule17Idx = out.indexOf('17. **CRITICAL — Auto-send');
    const rule18Idx = out.indexOf('18. **Never pitch mobile service');
    const rule17Body = out.slice(rule17Idx, rule18Idx);
    // Two explicit anti-friction mentions per the rule body
    expect(rule17Body).toContain('You do NOT ask "Want me to send a quote?"');
    expect(rule17Body).toContain('You NEVER ask "Want me to send a quote?"');
    // D50 (2026-05-27) expanded the prohibition with capitalized "The friction
    // step is deleted from the agent's repertoire entirely" — the substring
    // 'friction step is deleted' remains the stable invariant.
    expect(rule17Body).toContain('friction step is deleted');
  });

  it('Rule 17 cross-references Rule 16 (architectural parallel — Rule 16 governs firing rate, Rule 17 governs trigger timing)', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    const rule17Idx = out.indexOf('17. **CRITICAL — Auto-send');
    const rule18Idx = out.indexOf('18. **Never pitch mobile service');
    const rule17Body = out.slice(rule17Idx, rule18Idx);
    expect(rule17Body).toContain('Architectural parallel');
    expect(rule17Body).toContain('Rule 16');
  });

  it('Rule 2 ✅ RIGHT example uses the new Rule 17 auto-send phrasing ("Sending the quote now — check your texts!"); past-tense "Quote sent!" removed', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    // Locate Rule 2 body
    const rule2Idx = out.indexOf('2. **Every customer turn requires a customer-facing reply');
    const rule3Idx = out.indexOf('3. **One primary service per quote');
    const rule2Body = out.slice(rule2Idx, rule3Idx);
    // New auto-send phrasing present
    expect(rule2Body).toContain('Sending the quote now — check your texts!');
    // Past-tense optimistic phrasing removed
    expect(rule2Body).not.toContain('Quote sent! Tap the link to review and accept. Our team will follow up to confirm scheduling. Anything else?');
    // The customer-input example updated from "Sure, send the quote" to a
    // more natural variant
    expect(rule2Body).toContain('Cool, send it');
  });

  it('Tool usage guide trigger references Critical Rule 17 (configuration-finalized framing) instead of customer-agreed framing', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    // The tool-usage-guide bullet's framing now keys on Rule 17 preconditions
    expect(out).toContain("Customer's configuration is finalized (commit signal + total stated in your prior turn + no mid-flux signals — per Critical Rule 17)?");
    // Old "Customer agreed on a service" framing removed
    expect(out).not.toContain("Customer agreed on a service (any \"yes book it\" / \"let's do it\" / \"sounds good\" agreement after price)?");
  });

  it('Booking flow Step 1 references Critical Rule 17 preconditions (and explicitly forbids the friction question)', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    const bookingIdx = out.indexOf('## Booking flow — quote first, scheduling second');
    expect(bookingIdx).toBeGreaterThan(-1);
    const nextH2 = out.indexOf('\n## ', bookingIdx + '## Booking flow — quote first, scheduling second'.length);
    const bookingSection = out.slice(bookingIdx, nextH2 > -1 ? nextH2 : undefined);
    expect(bookingSection).toContain('Critical Rule 17');
    expect(bookingSection).toContain('You do NOT ask "Want me to send a quote?"');
    // Old friction-trigger framing removed
    expect(bookingSection).not.toContain('Customer agrees to service ("Yes book it" / "Sounds good" / "Let\'s\n   do it"). You have the price, vehicle, color, name in context.');
  });

  it('Quote-send intent recognition paragraph preserved (still documents commit phrasings) AND adds Rule 17 framing', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    // Original explicit-phrase examples preserved
    expect(out).toContain('send me the quote');
    expect(out).toContain('me puedes mandar un quote');
    expect(out).toContain("Don't require the literal word \"quote\" — recognize the intent");
    // New Rule 17 framing sentence added
    expect(out).toContain('count as a commit signal for the Critical Rule 17 auto-send trigger');
    expect(out).toContain('implicit commitment');
    expect(out).toContain('total stated in your prior turn AND no mid-flux');
  });

  it('No "Want me to send a quote?" question anywhere except inside Rule 17 (which FORBIDS it) and Booking flow Step 1 (which references the prohibition)', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    // Locate every match
    const matches = [...out.matchAll(/Want me to send a quote\?/g)];
    // Every match must be inside a forbidding context — count is small
    // (3 occurrences: 2 inside Rule 17 + 1 inside Booking flow Step 1)
    expect(matches.length).toBe(3);
    // Each match must be wrapped by "NOT ask" / "NEVER ask" / "forbidden"
    // language to confirm it's a prohibition, not a prescription
    for (const match of matches) {
      const idx = match.index ?? 0;
      const context = out.slice(Math.max(0, idx - 60), idx + 30);
      const forbids =
        /NOT ask|NEVER ask|forbidden|forbidden by|deleted from/i.test(context);
      expect(forbids).toBe(true);
    }
  });

  it('Total Critical Rules count is now 22 (was 21 pre-D49)', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    const criticalIdx = out.indexOf('# Critical rules');
    expect(criticalIdx).toBeGreaterThan(-1);
    const nextH1 = out.indexOf('\n# ', criticalIdx + '# Critical rules'.length);
    const criticalSection = out.slice(criticalIdx, nextH1);
    // Count numbered rules — each begins with `\n\d+\. \*\*`
    const ruleMatches = [...criticalSection.matchAll(/\n(\d+)\.\s\*\*/g)];
    expect(ruleMatches.length).toBe(22);
    // Rules numbered 1..22 contiguously
    const numbers = ruleMatches.map((m) => Number(m[1]));
    for (let i = 0; i < numbers.length; i += 1) {
      expect(numbers[i]).toBe(i + 1);
    }
  });
});

// ---------------------------------------------------------------------------
// D50 — Issue 45 follow-up — universal prohibition of "Want me to send a
// quote?" friction question (2026-05-27, post-D49 empirical verification).
// D49 forbade the friction question only when the three auto-send
// preconditions weren't met. Operator's Scenario 1 verification showed the
// LLM emitting "Want me to send you a quote?" at discovery-phase after an
// add-on pitch — a loophole in D49's contextual prohibition. D50 escalates
// to universal-scope prohibition + ❌ WRONG / ✅ RIGHT discovery-phase
// examples + Rule 20 add-on example refactor ("if you want" → "if you'd
// like to add it") to remove the pattern-matchable hook.
// ---------------------------------------------------------------------------

describe('buildV2SystemPrompt — D50 / Issue 45 follow-up (universal prohibition of friction question)', () => {
  it('Rule 17 contains the universal-scope prohibition clause ("in ANY conversational position")', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    const rule17Idx = out.indexOf('17. **CRITICAL — Auto-send');
    const rule18Idx = out.indexOf('18. **Never pitch mobile service');
    const rule17Body = out.slice(rule17Idx, rule18Idx);
    expect(rule17Body).toContain('in ANY conversational position');
    expect(rule17Body).toContain('not at discovery-phase, not at close-phase, not after an add-on pitch, not anywhere');
    expect(rule17Body).toContain('The friction step is deleted from the agent\'s repertoire entirely');
  });

  it('Rule 17 contains the two-path framing (Preconditions met / Preconditions NOT met)', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    const rule17Idx = out.indexOf('17. **CRITICAL — Auto-send');
    const rule18Idx = out.indexOf('18. **Never pitch mobile service');
    const rule17Body = out.slice(rule17Idx, rule18Idx);
    expect(rule17Body).toContain('**Preconditions met:**');
    expect(rule17Body).toContain('**Preconditions NOT met:**');
    // The "met" path fires auto-send + reply
    expect(rule17Body).toContain('auto-fire `send_quote_sms`');
    // The "NOT met" path continues discovery; explicit "do NOT elicit permission"
    expect(rule17Body).toContain('Do NOT elicit permission to send a quote');
  });

  it('Rule 17 contains the ❌ WRONG discovery-phase friction-question anti-pattern (operator\'s 2026-05-27 D49 verification reproduction)', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    const rule17Idx = out.indexOf('17. **CRITICAL — Auto-send');
    const rule18Idx = out.indexOf('18. **Never pitch mobile service');
    const rule17Body = out.slice(rule17Idx, rule18Idx);
    // Empirical evidence anchor — the literal customer message from Scenario 1
    expect(rule17Body).toContain('How much for Express Exterior Wash on my 2018 Suburban?');
    // The literal friction question variant the LLM emitted at discovery-phase
    expect(rule17Body).toContain('Want me to send you a quote?');
    // ❌ WRONG label present
    expect(rule17Body).toContain('❌ WRONG — friction question at discovery-phase');
    // Outcome explanation pinned
    expect(rule17Body).toContain('wastes a turn');
  });

  it('Rule 17 contains the ✅ RIGHT discovery-phase counterpart (present pricing + add-on, no permission ask)', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    const rule17Idx = out.indexOf('17. **CRITICAL — Auto-send');
    const rule18Idx = out.indexOf('18. **Never pitch mobile service');
    const rule17Body = out.slice(rule17Idx, rule18Idx);
    expect(rule17Body).toContain('✅ RIGHT — present pricing + add-on, no permission ask');
    // The corrected reply phrasing — uses "if you'd like to add it" (D50 Rule 20 alignment)
    expect(rule17Body).toContain('Engine Bay Detail bundles in for $125 ($50 off) if you\'d like to add it');
    // Outcome explanation: customer commits naturally on next turn
    expect(rule17Body).toContain('agent auto-fires when commitment arrives');
  });

  it('Rule 17 explicitly states the customer commitment "will arrive naturally as they engage" (no permission-elicitation needed)', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    const rule17Idx = out.indexOf('17. **CRITICAL — Auto-send');
    const rule18Idx = out.indexOf('18. **Never pitch mobile service');
    const rule17Body = out.slice(rule17Idx, rule18Idx);
    expect(rule17Body).toContain('will arrive naturally as they engage');
    expect(rule17Body).toContain("You don't need to ASK for it");
  });

  it('Rule 20 add-on example refactored: "if you want" → "if you\'d like to add it" (D50 Refactor A; removes pattern-matchable permission-ask hook)', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    // Locate the "When configured, surface proactively" bullet within
    // # Add-ons and bundle quoting
    const addonIdx = out.indexOf('# Add-ons and bundle quoting');
    const nextSection = out.indexOf('\n# ', addonIdx + '# Add-ons and bundle quoting'.length);
    const addonSection = out.slice(addonIdx, nextSection > -1 ? nextSection : undefined);
    // New phrasing
    expect(addonSection).toContain('Engine Bay Detail bundles in for $140 ($35 off) if you\'d like to add it');
    // Old phrasing (the open-ended "if you want" trailing) GONE
    expect(addonSection).not.toContain('Engine Bay Detail bundles in for $140 ($35 off) if you want.');
    // Inline operator-facing explanation references Rule 17 (cross-link)
    expect(addonSection).toContain('Critical Rule 17 forbids');
  });

  it('Friction question variant "Want me to send you a quote?" appears ONLY in forbidding contexts (Rule 17 ❌ WRONG example + Rule 20 refactor explanation)', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    // The "send you a quote" variant (with explicit "you") — distinct from
    // the canonical "send a quote" form covered by the D49 pin
    const matches = [...out.matchAll(/Want me to send you a quote\?/g)];
    // 2 occurrences expected: ❌ WRONG example in Rule 17 + Rule 20 refactor explanation
    expect(matches.length).toBe(2);
    for (const match of matches) {
      const idx = match.index ?? 0;
      // Wide window — Rule 20's forbid-marker ("Critical Rule 17 forbids")
      // appears AFTER the friction-question variant within ~30 chars; the
      // Rule 17 ❌ WRONG label appears BEFORE within ~300 chars (heading +
      // intro line + example body up to the friction question).
      const context = out.slice(Math.max(0, idx - 500), idx + 200);
      // Each match must be wrapped by forbidding/exemplar context
      const forbids =
        /❌ WRONG|forbids|permission-ask|forbidden/i.test(context);
      expect(forbids).toBe(true);
    }
  });

  it('Canonical friction question "Want me to send a quote?" still appears in only-forbidding contexts after D50 (D49 invariant preserved; count = 3 unchanged: Rule 17 first prohibition + Rule 17 universal clause + Booking flow Step 1)', async () => {
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    // D49 pinned count=3 for the canonical form. D50 added a SECOND
    // sentence to Rule 17 (universal clause) that re-uses the canonical
    // form, AND added a ❌ WRONG example that uses the variant "send you
    // a quote?" form. Net effect on canonical /Want me to send a quote\?/g:
    // line 221 (Rule 17 first prohibition) + line 253 (universal clause)
    // + Booking flow Step 1 = 3 matches. Unchanged from D49.
    const matches = [...out.matchAll(/Want me to send a quote\?/g)];
    expect(matches.length).toBe(3);
    // Forbidding-context invariant preserved per D49
    for (const match of matches) {
      const idx = match.index ?? 0;
      const context = out.slice(Math.max(0, idx - 80), idx + 30);
      const forbids =
        /NOT ask|NEVER ask|forbidden|forbidden by|deleted from/i.test(context);
      expect(forbids).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Phase C (Workstream A Layer 5, 2026-06-18) — getStandardTemplate +
// buildV2SystemPrompt DB-first / hardcoded-fallback contract.
// ---------------------------------------------------------------------------

describe('getStandardTemplate — canonical hardcoded body', () => {
  it('returns a pure string with no DB or async work', () => {
    const out = getStandardTemplate();
    expect(typeof out).toBe('string');
    // The body is large (50KB-class) and contains the # Identity opener.
    expect(out.length).toBeGreaterThan(20_000);
    expect(out.startsWith('# Identity\n')).toBe(true);
  });

  it('contains the four placeholder tokens UN-substituted', () => {
    const out = getStandardTemplate();
    // The body MUST carry placeholder tokens — buildV2SystemPrompt substitutes
    // the first three; the Layer 3 runner substitutes {CUSTOMER_CONTEXT}.
    expect(out).toContain(BUSINESS_NAME_PLACEHOLDER);
    expect(out).toContain(BUSINESS_HOURS_PLACEHOLDER);
    expect(out).toContain(CURRENT_DATE_PLACEHOLDER);
    expect(out).toContain(CUSTOMER_CONTEXT_PLACEHOLDER);
  });

  it('is the same byte content used by buildV2SystemPrompt fallback (modulo grounding substitution)', async () => {
    // DB returns null → buildV2SystemPrompt MUST use getStandardTemplate() as
    // the template, then apply grounding substitutions. The substituted
    // output should equal `template.replaceAll(...)`.
    messagingAiInstructionsValue.value = null;
    const built = await buildV2SystemPrompt(SAMPLE_INPUTS);
    const template = getStandardTemplate();
    const expected = template
      .split(BUSINESS_NAME_PLACEHOLDER).join(SAMPLE_INPUTS.businessName)
      .split(BUSINESS_HOURS_PLACEHOLDER).join(SAMPLE_INPUTS.businessHours)
      .split(CURRENT_DATE_PLACEHOLDER).join(SAMPLE_INPUTS.currentDate);
    expect(built).toBe(expected);
  });
});

describe('buildV2SystemPrompt — DB-source path (Phase C)', () => {
  it('reads from business_settings.messaging_ai_instructions when set (non-empty string)', async () => {
    // Custom DB body that omits the standard prompt content entirely — proves
    // the DB value is the source, not the hardcoded fallback.
    const customBody = `# Custom prompt for testing\nBusiness: ${BUSINESS_NAME_PLACEHOLDER}\nHours: ${BUSINESS_HOURS_PLACEHOLDER}\nDate: ${CURRENT_DATE_PLACEHOLDER}\nCtx:\n${CUSTOMER_CONTEXT_PLACEHOLDER}`;
    messagingAiInstructionsValue.value = customBody;

    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    // Custom body appears (with substitutions).
    expect(out).toContain('# Custom prompt for testing');
    expect(out).toContain(`Business: ${SAMPLE_INPUTS.businessName}`);
    expect(out).toContain(`Hours: ${SAMPLE_INPUTS.businessHours}`);
    expect(out).toContain(`Date: ${SAMPLE_INPUTS.currentDate}`);
    // {CUSTOMER_CONTEXT} stays UN-substituted (filled by Layer 3 runner).
    expect(out).toContain(CUSTOMER_CONTEXT_PLACEHOLDER);
    // Standard template's content is NOT present (custom body wins).
    expect(out).not.toContain('You are Tom, the SMS assistant');
  });

  it('falls back to getStandardTemplate when DB row is null', async () => {
    messagingAiInstructionsValue.value = null;
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    // Standard template signature line is present.
    expect(out).toContain('You are Tom, the SMS assistant');
  });

  it('falls back when DB value is an empty string', async () => {
    messagingAiInstructionsValue.value = '';
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('You are Tom, the SMS assistant');
  });

  it('falls back when DB value is whitespace only', async () => {
    messagingAiInstructionsValue.value = '   \n\t  \n';
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('You are Tom, the SMS assistant');
  });

  it('falls back when supabase returns an error', async () => {
    messagingAiInstructionsValue.error = { message: 'simulated DB outage' };
    const out = await buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(out).toContain('You are Tom, the SMS assistant');
  });

  it('applies grounding substitutions identically on DB-source and fallback paths', async () => {
    // First: DB-set custom body
    messagingAiInstructionsValue.value =
      `BIZ=${BUSINESS_NAME_PLACEHOLDER} HRS=${BUSINESS_HOURS_PLACEHOLDER} DATE=${CURRENT_DATE_PLACEHOLDER}`;
    const fromDb = await buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(fromDb).toBe(
      `BIZ=${SAMPLE_INPUTS.businessName} HRS=${SAMPLE_INPUTS.businessHours} DATE=${SAMPLE_INPUTS.currentDate}`,
    );

    // Then: fallback path — both substitutions still apply.
    messagingAiInstructionsValue.value = null;
    const fromFallback = await buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(fromFallback).toContain(SAMPLE_INPUTS.businessName);
    expect(fromFallback).toContain(SAMPLE_INPUTS.businessHours);
    expect(fromFallback).toContain(SAMPLE_INPUTS.currentDate);
    // Placeholder tokens NOT present in the final output (other than
    // {CUSTOMER_CONTEXT} which stays for the runner).
    expect(fromFallback).not.toContain(BUSINESS_NAME_PLACEHOLDER);
    expect(fromFallback).not.toContain(BUSINESS_HOURS_PLACEHOLDER);
    expect(fromFallback).not.toContain(CURRENT_DATE_PLACEHOLDER);
    expect(fromFallback).toContain(CUSTOMER_CONTEXT_PLACEHOLDER);
  });

  it('preserves the {CUSTOMER_CONTEXT} placeholder on both source paths (runner substitutes later)', async () => {
    // DB body that explicitly includes the placeholder
    messagingAiInstructionsValue.value =
      `Top\n${CUSTOMER_CONTEXT_PLACEHOLDER}\nBot`;
    const fromDb = await buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(fromDb).toContain(CUSTOMER_CONTEXT_PLACEHOLDER);

    messagingAiInstructionsValue.value = null;
    const fromFallback = await buildV2SystemPrompt(SAMPLE_INPUTS);
    expect(fromFallback).toContain(CUSTOMER_CONTEXT_PLACEHOLDER);
  });
});
