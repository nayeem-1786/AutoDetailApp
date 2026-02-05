import type { SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// MergedReceiptConfig — the shape consumed by receipt templates
// ---------------------------------------------------------------------------

export interface MergedReceiptConfig {
  name: string;
  phone: string;
  address: string;
  email: string | null;
  website: string | null;
  logo_url: string | null;
  logo_width: number;
  logo_placement: 'above_name' | 'below_name' | 'above_footer';
  logo_alignment: 'left' | 'center' | 'right';
  custom_text: string | null;
  custom_text_placement: 'below_header' | 'above_footer' | 'below_footer';
}

// ---------------------------------------------------------------------------
// ReceiptConfig — raw shape stored in business_settings receipt_config key
// ---------------------------------------------------------------------------

interface ReceiptConfig {
  printer_ip: string | null;
  override_name: string | null;
  override_phone: string | null;
  override_address: string | null;
  override_email: string | null;
  override_website: string | null;
  logo_url: string | null;
  logo_width: number;
  logo_placement: 'above_name' | 'below_name' | 'above_footer';
  logo_alignment: 'left' | 'center' | 'right';
  custom_text: string | null;
  custom_text_placement: 'below_header' | 'above_footer' | 'below_footer';
}

const DEFAULT_RECEIPT_CONFIG: ReceiptConfig = {
  printer_ip: null,
  override_name: null,
  override_phone: null,
  override_address: null,
  override_email: null,
  override_website: null,
  logo_url: null,
  logo_width: 200,
  logo_placement: 'above_name',
  logo_alignment: 'center',
  custom_text: null,
  custom_text_placement: 'below_footer',
};

// ---------------------------------------------------------------------------
// fetchReceiptConfig
// Fetches receipt_config + business profile defaults from business_settings,
// then merges overrides. Called by API routes that already have a supabase client.
// ---------------------------------------------------------------------------

export async function fetchReceiptConfig(
  supabase: SupabaseClient
): Promise<{ merged: MergedReceiptConfig; printer_ip: string | null }> {
  const { data } = await supabase
    .from('business_settings')
    .select('key, value')
    .in('key', [
      'receipt_config',
      'business_name',
      'business_phone',
      'business_address',
      'business_email',
      'business_website',
      'star_printer_ip', // legacy key — used as fallback for printer_ip
    ]);

  const settings: Record<string, unknown> = {};
  for (const row of data ?? []) {
    settings[row.key] = row.value;
  }

  // Parse receipt config (may not exist yet)
  const raw = settings.receipt_config;
  const rc: ReceiptConfig = {
    ...DEFAULT_RECEIPT_CONFIG,
    ...(typeof raw === 'object' && raw !== null ? (raw as Partial<ReceiptConfig>) : {}),
  };

  // Parse business address
  const rawAddr = settings.business_address;
  const addr =
    typeof rawAddr === 'object' && rawAddr !== null
      ? (rawAddr as { line1: string; city: string; state: string; zip: string })
      : { line1: '2021 Lomita Blvd', city: 'Lomita', state: 'CA', zip: '90717' };
  const formattedAddress = `${addr.line1}, ${addr.city}, ${addr.state} ${addr.zip}`;

  // Format phone for display
  const rawPhone = (settings.business_phone as string) || '+13109990000';
  const displayPhone = rawPhone.replace('+1', '(').replace(/(\d{3})(\d{3})(\d{4})/, '$1) $2-$3');

  // Merge: override wins over business profile default; null/empty = use default
  const merged: MergedReceiptConfig = {
    name: rc.override_name || (settings.business_name as string) || 'Smart Detail Auto Spa & Supplies',
    phone: rc.override_phone || displayPhone,
    address: rc.override_address || formattedAddress,
    email: rc.override_email || (settings.business_email as string) || null,
    website: rc.override_website || (settings.business_website as string) || null,
    logo_url: rc.logo_url,
    logo_width: rc.logo_width || 200,
    logo_placement: rc.logo_placement || 'above_name',
    logo_alignment: rc.logo_alignment || 'center',
    custom_text: rc.custom_text,
    custom_text_placement: rc.custom_text_placement || 'below_footer',
  };

  // Printer IP: receipt_config.printer_ip wins, fall back to legacy star_printer_ip
  const printer_ip = rc.printer_ip || (settings.star_printer_ip as string) || null;

  return { merged, printer_ip };
}
