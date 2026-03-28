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
}

interface CachedTemplate {
  slug: string;
  bodyTemplate: string;
  isActive: boolean;
  canSilence: boolean;
  recipientType: 'customer' | 'staff' | 'detailer';
  recipientPhones: string[] | null;
}

// ---------------------------------------------------------------------------
// Module-level cache (same pattern as src/lib/security/ip-whitelist.ts)
// ---------------------------------------------------------------------------

let cachedTemplates: Map<string, CachedTemplate> | null = null;
let cacheExpiry = 0;
const CACHE_TTL_MS = 60_000; // 60 seconds

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
      .select('slug, body_template, is_active, can_silence, recipient_type, recipient_phones');

    if (error) {
      console.error('[SmsTemplate] Cache load failed:', error.message);
      return cachedTemplates ?? new Map();
    }

    const map = new Map<string, CachedTemplate>();
    for (const row of data ?? []) {
      map.set(row.slug, {
        slug: row.slug,
        bodyTemplate: row.body_template,
        isActive: row.is_active,
        canSilence: row.can_silence,
        recipientType: row.recipient_type as CachedTemplate['recipientType'],
        recipientPhones: row.recipient_phones,
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

  // Render template
  let rendered = renderTemplate(template.bodyTemplate, enriched);

  // Post-render cleanup: strip lines that are only an unreplaced {variable}
  rendered = rendered
    .split('\n')
    .filter((line) => !/^\s*\{\w+\}\s*$/.test(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n') // collapse triple+ newlines
    .trim();

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
