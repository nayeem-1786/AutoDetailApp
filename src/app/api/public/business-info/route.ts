import { NextResponse } from 'next/server';
import { createAnonClient } from '@/lib/supabase/anon';
import { BUSINESS_DEFAULTS } from '@/lib/data/business';

export async function GET() {
  const supabase = createAnonClient();

  const { data } = await supabase
    .from('business_settings')
    .select('key, value')
    .in('key', [
      'business_name',
      'business_phone',
      'business_address',
      'business_email',
      'business_website',
      'receipt_config',
    ]);

  const settings: Record<string, unknown> = {};
  for (const row of data ?? []) {
    settings[row.key] = row.value;
  }

  // Parse address — stored as JSON object { line1, city, state, zip }
  const rawAddr = settings.business_address;
  const addr =
    typeof rawAddr === 'object' && rawAddr !== null
      ? (rawAddr as { line1: string; city: string; state: string; zip: string })
      : { ...BUSINESS_DEFAULTS.address };

  const info = {
    name: (settings.business_name as string) || BUSINESS_DEFAULTS.name,
    phone: (settings.business_phone as string) || BUSINESS_DEFAULTS.phone,
    address: `${addr.line1}, ${addr.city}, ${addr.state} ${addr.zip}`,
    streetAddress: addr.line1,
    city: addr.city,
    state: addr.state,
    zip: addr.zip,
    email: (settings.business_email as string) || null,
    website: (settings.business_website as string) || null,
    logo_url: (typeof settings.receipt_config === 'object' && settings.receipt_config !== null
      ? ((settings.receipt_config as Record<string, unknown>).logo_url as string) || null
      : null),
  };

  return NextResponse.json(info, {
    headers: {
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
    },
  });
}
