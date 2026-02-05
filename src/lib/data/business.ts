import { cache } from 'react';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createAnonClient } from '@/lib/supabase/anon';

// ---------------------------------------------------------------------------
// BusinessInfo — shape returned to public components
// ---------------------------------------------------------------------------

export interface BusinessInfo {
  name: string;
  phone: string;
  /** Formatted one-line address: "2021 Lomita Blvd., Lomita, CA 90717" */
  address: string;
  /** Structured address parts for JSON-LD PostalAddress */
  streetAddress: string;
  city: string;
  state: string;
  zip: string;
  email: string | null;
  website: string | null;
}

// ---------------------------------------------------------------------------
// getBusinessInfo
// Fetches business_name, business_phone, and business_address from the
// business_settings table. Wrapped with React.cache() so multiple Server
// Components calling it in the same render pass share a single query.
// ---------------------------------------------------------------------------

async function fetchBusinessInfo(): Promise<BusinessInfo> {
  let supabase;
  try {
    supabase = await createServerClient();
  } catch {
    supabase = createAnonClient();
  }

  const { data } = await supabase
    .from('business_settings')
    .select('key, value')
    .in('key', ['business_name', 'business_phone', 'business_address', 'business_email', 'business_website']);

  const settings: Record<string, unknown> = {};
  for (const row of data ?? []) {
    settings[row.key] = row.value;
  }

  // Parse address — stored as JSON object { line1, city, state, zip }
  const rawAddr = settings.business_address;
  const addr =
    typeof rawAddr === 'object' && rawAddr !== null
      ? (rawAddr as { line1: string; city: string; state: string; zip: string })
      : { line1: '2021 Lomita Blvd', city: 'Lomita', state: 'CA', zip: '90717' };

  return {
    name: (settings.business_name as string) || 'Smart Detail Auto Spa & Supplies',
    phone: (settings.business_phone as string) || '+13109990000',
    address: `${addr.line1}, ${addr.city}, ${addr.state} ${addr.zip}`,
    streetAddress: addr.line1,
    city: addr.city,
    state: addr.state,
    zip: addr.zip,
    email: (settings.business_email as string) || null,
    website: (settings.business_website as string) || null,
  };
}

export const getBusinessInfo = cache(fetchBusinessInfo);
