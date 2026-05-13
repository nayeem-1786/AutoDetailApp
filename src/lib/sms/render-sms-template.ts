import { createClient } from '@supabase/supabase-js';
import { renderTemplate } from '@/lib/utils/template';
import { getBusinessInfo } from '@/lib/data/business';
import { formatPhone } from '@/lib/utils/format';
import { parseContractFromRow, ContractValidationError } from './contract';
import { SMS_PALETTE } from './palette';
import type { SmsSlug, RenderVarsBySlug } from './generated-contracts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Legacy chip-definition shape exported for any pre-2A consumer that imported
 * it. Engine itself reads required_variables + optional_variables from the new
 * DB columns instead. Retained as a re-export only.
 */
export interface SmsTemplateVariable {
  key: string;
  description: string;
  required: boolean;
}

export interface RenderResult {
  /** Rendered SMS body text. Empty string if template not found and no fallback. */
  body: string;
  /** Whether the template is active. When false, caller should skip sending. */
  isActive: boolean;
  /** Whether the admin can silence (toggle off) this template without a scary warning. */
  canSilence: boolean;
  /** Who receives this SMS. */
  recipientType: 'customer' | 'staff' | 'detailer';
  /** Explicit phone numbers for staff templates. NULL = fall back to business phone. */
  recipientPhones: string[] | null;
  /** True when render was hard-skipped (e.g. missing required variable). Caller skips on isActive:false regardless. */
  skipped?: boolean;
  /** Reason for skip — for logs/audit. */
  skipReason?: string;
  /** Variable keys that were missing/empty when skipped due to required-variable check. */
  missingVars?: string[];
}

interface CachedTemplate {
  slug: string;
  bodyTemplate: string;
  isActive: boolean;
  canSilence: boolean;
  recipientType: 'customer' | 'staff' | 'detailer';
  recipientPhones: string[] | null;
  /** Chips that hard-skip the send when missing/empty. Loaded from required_variables column. */
  required: string[];
  /** Chips whose referencing line is REMOVE_LINE'd when missing/empty. Loaded from optional_variables column. */
  optional: string[];
}

// ---------------------------------------------------------------------------
// Module-level cache (same pattern as src/lib/security/ip-whitelist.ts)
// ---------------------------------------------------------------------------

let cachedTemplates: Map<string, CachedTemplate> | null = null;
let cacheExpiry = 0;
const CACHE_TTL_MS = 60_000; // 60 seconds

/** Bust the template cache so the next render reads fresh data from DB. */
export function invalidateSmsTemplateCache(): void {
  cachedTemplates = null;
  cacheExpiry = 0;
  cachedPhoneOverride = null;
  phoneOverrideExpiry = 0;
}

async function loadTemplates(): Promise<Map<string, CachedTemplate>> {
  const now = Date.now();

  if (cachedTemplates !== null && now < cacheExpiry) {
    return cachedTemplates;
  }

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Session 2A: engine reads contract from required_variables + optional_variables
    // (added by migration 20260425000003). Legacy `variables` column is retained for
    // admin UI / PUT validation compatibility but is NOT read by the engine.
    const { data, error } = await supabase
      .from('sms_templates')
      .select('slug, body_template, is_active, can_silence, recipient_type, recipient_phones, required_variables, optional_variables');

    if (error) {
      console.error('[SmsTemplate] Cache load failed:', error.message);
      return cachedTemplates ?? new Map();
    }

    const map = new Map<string, CachedTemplate>();
    for (const row of data ?? []) {
      // Validate contract on load. parseContractFromRow throws on invalid shape,
      // overlap, duplicates, or unknown chip keys (not in SMS_PALETTE). Fail-safe:
      // mark the template inactive so callers fall through to their fallback prose.
      let required: string[];
      let optional: string[];
      try {
        const contract = parseContractFromRow({
          slug: row.slug,
          required_variables: row.required_variables,
          optional_variables: row.optional_variables,
        });
        required = contract.required_variables;
        optional = contract.optional_variables;
      } catch (err) {
        if (err instanceof ContractValidationError) {
          console.error(`[SmsTemplate] Invalid contract for slug "${row.slug}" — treating as inactive (fail-safe):`, err.message);
        } else {
          console.error(`[SmsTemplate] Contract parse error for slug "${row.slug}" — treating as inactive (fail-safe):`, err);
        }
        map.set(row.slug, {
          slug: row.slug,
          bodyTemplate: row.body_template,
          isActive: false,
          canSilence: row.can_silence,
          recipientType: row.recipient_type as CachedTemplate['recipientType'],
          recipientPhones: row.recipient_phones,
          required: [],
          optional: [],
        });
        continue;
      }

      map.set(row.slug, {
        slug: row.slug,
        bodyTemplate: row.body_template,
        isActive: row.is_active,
        canSilence: row.can_silence,
        recipientType: row.recipient_type as CachedTemplate['recipientType'],
        recipientPhones: row.recipient_phones,
        required,
        optional,
      });
    }

    cachedTemplates = map;
    cacheExpiry = now + CACHE_TTL_MS;
    return map;
  } catch (err) {
    console.error('[SmsTemplate] Cache load error:', err);
    return cachedTemplates ?? new Map();
  }
}

// ---------------------------------------------------------------------------
// Business phone override
// ---------------------------------------------------------------------------

let cachedPhoneOverride: string | null = null;
let phoneOverrideExpiry = 0;

async function getBusinessPhoneOverride(): Promise<string | null> {
  const now = Date.now();
  if (cachedPhoneOverride !== null && now < phoneOverrideExpiry) {
    return cachedPhoneOverride || null;
  }

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data } = await supabase
      .from('business_settings')
      .select('value')
      .eq('key', 'sms_business_phone_override')
      .maybeSingle();

    const val = typeof data?.value === 'string' ? data.value.trim() : '';
    cachedPhoneOverride = val;
    phoneOverrideExpiry = now + CACHE_TTL_MS;
    return val || null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Variable fallback map — safety net for unreplaced placeholders
// Business variables are NOT included here — auto-injection via getBusinessInfo()
// handles those (CLAUDE.md Rule 8: never hardcode business info).
// ---------------------------------------------------------------------------

// Session 42X-1 (C1): noun-phrase fallbacks emptied.
// Previously these substituted prose nouns ("your vehicle", "Valued Customer")
// for missing data, which collided with template prose ("Your {x}" + "your vehicle"
// = "Your your vehicle"). See docs/audits/SMS_TEMPLATE_ROOT_CAUSE_SESSION42W.md
// Phase 4. Empty fallback now triggers full-line removal via the REMOVE_LINE
// sentinel below — templates that need prose like "your vehicle" must include
// it as literal text, not rely on engine fabrication.
const DEFAULT_VARIABLE_FALLBACKS: Record<string, string> = {
  first_name: '',
  customer_name: '',
  appointment_date: '',
  appointment_time: '',
  service_name: '',
  services: '',
  service_total: '',
  vehicle_description: '',
  vehicle_type: '',
  gallery_link: '',
  short_url: '',
  hours_line: '',
  address: '',
  deposit_info: '',
  item_name: '',
  quote_number: '',
  detailer_first_name: '',
};

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

/**
 * Render an SMS template from the database.
 *
 * Generic over SmsSlug (Session 2A.5): the slug parameter narrows to one of the
 * 18 known slugs from generated-contracts.ts, and `variables` is statically
 * checked against that slug's contract. Required chips (per the slug's contract
 * minus auto-injected business chips) are required string properties; optional
 * chips and auto-inject chips are optional. Extra-key passes are compile errors.
 *
 * Runtime logic is unchanged from pre-2A.5: the engine still reads contracts
 * from the DB cache, hard-skips on missing required, REMOVE_LINEs on absent
 * optional, and auto-injects business_name/phone/address before the pre-check.
 *
 * @param slug - Template slug (e.g. 'appointment_confirmed')
 * @param variables - Key-value pairs to inject into the template, typed per
 *                    the slug's contract via RenderVarsBySlug.
 * @param fallback - Pre-rendered hardcoded string used when template is inactive,
 *                   missing, or DB is unreachable. This is the disaster-recovery path.
 */
export async function renderSmsTemplate<S extends SmsSlug>(
  slug: S,
  variables: RenderVarsBySlug[S],
  fallback: string,
): Promise<RenderResult> {
  // Internal logic uses a generic record view of variables — slug-specific
  // narrowing isn't useful inside the function body since the engine loops
  // over the contract chip names dynamically.
  const vars = variables as Record<string, string | undefined>;
  const templates = await loadTemplates();
  const template = templates.get(slug);

  // Template not found — use fallback, log warning
  if (!template) {
    console.warn(`[SmsTemplate] Template "${slug}" not found in DB — using fallback`);
    return {
      body: fallback,
      isActive: true,
      canSilence: true,
      recipientType: 'customer',
      recipientPhones: null,
    };
  }

  // Template inactive — caller should skip sending
  if (!template.isActive) {
    return {
      body: '',
      isActive: false,
      canSilence: template.canSilence,
      recipientType: template.recipientType,
      recipientPhones: template.recipientPhones,
    };
  }

  // Auto-inject business variables
  const enriched: Record<string, string | undefined> = { ...vars };
  try {
    const biz = await getBusinessInfo();
    if (!enriched.business_name) enriched.business_name = biz.name;
    if (!enriched.business_address) enriched.business_address = biz.address;

    // Business phone: check override first
    if (!enriched.business_phone) {
      const override = await getBusinessPhoneOverride();
      enriched.business_phone = override || biz.phone;
    }
  } catch {
    // Business info unavailable — variables stay as passed by caller
  }

  // Session 42X-1 (C2) + Session 2A: hard-skip on missing required variables.
  // Runs BEFORE rendering so we don't waste work on a doomed message.
  // Empty string and undefined both count as missing — both produce malformed output.
  const missingVars: string[] = [];
  for (const key of template.required) {
    const val = enriched[key];
    if (val === undefined || val === '') {
      missingVars.push(key);
    }
  }
  if (missingVars.length > 0) {
    console.warn(`[SMS] Template "${slug}" hard-skipped — missing required vars:`, missingVars);
    return {
      body: '',
      isActive: false,
      canSilence: template.canSilence,
      recipientType: template.recipientType,
      recipientPhones: template.recipientPhones,
      skipped: true,
      skipReason: 'missing_required_variable',
      missingVars,
    };
  }

  // Session 2A: pre-render REMOVE_LINE marker for absent/empty optional chips.
  // For each optional chip whose value is undefined or empty in the passed vars,
  // pre-substitute the REMOVE_LINE sentinel so the post-render line-strip pass
  // (below) removes the line. This must happen BEFORE renderTemplate so the
  // sentinel is in the output where the {key} placeholder would have been.
  for (const key of template.optional) {
    const val = enriched[key];
    if (val === undefined || val === '') {
      enriched[key] = '\x00REMOVE_LINE\x00';
    }
  }

  // Phase Phone-UX-1 (LOCKED-1): format chips declared as `format: 'phone'`
  // in SMS_PALETTE through formatPhone() before substitution. Single point of
  // enforcement — callers no longer need to format business_phone /
  // customer_phone by hand. Empty / unparseable formatPhone result substitutes
  // empty string; if such a chip is in the optional list and was already
  // REMOVE_LINE'd above we leave the sentinel intact.
  for (const [key, val] of Object.entries(enriched)) {
    if (val === undefined || val === '\x00REMOVE_LINE\x00') continue;
    const meta = SMS_PALETTE[key];
    if (meta?.format === 'phone' && val !== '') {
      enriched[key] = formatPhone(val);
    }
  }

  // Render template
  let rendered = renderTemplate(template.bodyTemplate, enriched);

  // Post-render fallback pass: replace any remaining {variable} placeholders.
  // After hard-skip + optional pre-marker above, this should rarely fire —
  // survives only when a template body references a variable that is neither
  // required nor optional in the contract (i.e., body and contract are out of
  // sync — operator added a chip without registering it). Empty fallback
  // strips the whole line via the REMOVE_LINE sentinel; unknown keys (not in
  // DEFAULT_VARIABLE_FALLBACKS) get silently stripped with a warning.
  rendered = rendered.replace(/\{([a-z_]+)\}/g, (_match, key: string) => {
    const defaultVal = DEFAULT_VARIABLE_FALLBACKS[key];
    if (defaultVal === undefined) {
      // Unknown variable — strip it and warn
      console.warn(`[SMS] Unknown variable with no fallback: {${key}} in template "${slug}"`);
      return '';
    }
    if (defaultVal === '') {
      // Empty fallback — mark for full-line removal below
      return `\x00REMOVE_LINE\x00`;
    }
    return defaultVal;
  });

  // Remove entire lines that contained empty-fallback variables
  // (avoids orphaned labels like "Total: " with nothing after it)
  rendered = rendered
    .split('\n')
    .filter((line) => !line.includes('\x00REMOVE_LINE\x00'))
    .join('\n');

  // Collapse multiple consecutive newlines and trim
  rendered = rendered.replace(/\n{3,}/g, '\n\n').trim();

  // If rendering produced nothing, fall back
  if (!rendered) {
    console.warn(`[SmsTemplate] Template "${slug}" rendered empty — using fallback`);
    return {
      body: fallback,
      isActive: true,
      canSilence: template.canSilence,
      recipientType: template.recipientType,
      recipientPhones: template.recipientPhones,
    };
  }

  return {
    body: rendered,
    isActive: true,
    canSilence: template.canSilence,
    recipientType: template.recipientType,
    recipientPhones: template.recipientPhones,
  };
}

// ---------------------------------------------------------------------------
// Test-only export
// ---------------------------------------------------------------------------

/**
 * Test-only: widened signature for exercising engine behavior with synthetic
 * slugs and contracts that are not registered in the production
 * SMS_CONTRACTS_SOURCE / generated-contracts.ts. Production code MUST use
 * renderSmsTemplate (the typed signature) to get caller-vs-contract
 * enforcement at compile time. Behavior is identical at runtime.
 */
export const __renderSmsTemplateForTesting = renderSmsTemplate as (
  slug: string,
  variables: Record<string, string | undefined>,
  fallback: string,
) => Promise<RenderResult>;
