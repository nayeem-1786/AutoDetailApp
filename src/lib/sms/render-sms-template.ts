import { createClient } from '@supabase/supabase-js';
import { renderTemplate } from '@/lib/utils/template';
import { getBusinessInfo } from '@/lib/data/business';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
  variables: SmsTemplateVariable[];
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

    const { data, error } = await supabase
      .from('sms_templates')
      .select('slug, body_template, is_active, can_silence, recipient_type, recipient_phones, variables');

    if (error) {
      console.error('[SmsTemplate] Cache load failed:', error.message);
      return cachedTemplates ?? new Map();
    }

    const map = new Map<string, CachedTemplate>();
    for (const row of data ?? []) {
      // Normalize variables to consistent {key, description, required} shape.
      // Production sms_templates.variables is stored as string[] (flat array of
      // variable keys). Some legacy seed migrations store [{key, description, required}].
      // Per Session 42X-1 + Session 42Z-audit Phase 5 Q schema-reform tracking, treat
      // every listed variable as required for hard-skip purposes — schema reform
      // (distinguishing required vs optional in the column itself) is deferred.
      const rawVars: unknown = row.variables;
      const normalizedVars: SmsTemplateVariable[] = Array.isArray(rawVars)
        ? rawVars.map((entry) => {
            if (typeof entry === 'string') {
              return { key: entry, description: '', required: true };
            }
            if (entry && typeof entry === 'object' && 'key' in entry) {
              const obj = entry as { key: string; description?: string; required?: boolean };
              return {
                key: obj.key,
                description: obj.description ?? '',
                required: obj.required ?? true,
              };
            }
            console.error(`[SmsTemplate] Unrecognized variable entry shape in slug "${row.slug}":`, entry);
            return null;
          }).filter((v): v is SmsTemplateVariable => v !== null)
        : [];

      map.set(row.slug, {
        slug: row.slug,
        bodyTemplate: row.body_template,
        isActive: row.is_active,
        canSilence: row.can_silence,
        recipientType: row.recipient_type as CachedTemplate['recipientType'],
        recipientPhones: row.recipient_phones,
        variables: normalizedVars,
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
 * @param slug - Template slug (e.g. 'appointment_confirmed')
 * @param variables - Key-value pairs to inject into the template
 * @param fallback - Pre-rendered hardcoded string used when template is inactive,
 *                   missing, or DB is unreachable. This is the disaster-recovery path.
 */
export async function renderSmsTemplate(
  slug: string,
  variables: Record<string, string | undefined>,
  fallback: string
): Promise<RenderResult> {
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
  const enriched = { ...variables };
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

  // Session 42X-1 (C2): hard-skip on missing required variables.
  // Runs BEFORE rendering so we don't waste work on a doomed message.
  // Per cache-load normalization above, every template variable is treated as
  // required (production schema is flat string[] with no required/optional flag).
  // Empty string and undefined both count as missing — both produce malformed output.
  const missingVars: string[] = [];
  for (const v of template.variables) {
    const val = enriched[v.key];
    if (val === undefined || val === '') {
      missingVars.push(v.key);
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

  // Render template
  let rendered = renderTemplate(template.bodyTemplate, enriched);

  // Post-render fallback pass: replace any remaining {variable} placeholders.
  // After C2 hard-skip above, this should rarely fire — survives only when a
  // template body references a variable not declared in template.variables
  // (i.e. the body and variable registry are out of sync). Empty fallback
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
