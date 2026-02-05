import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('business_settings')
      .select('key, value')
      .in('key', ['pos_allowed_ips', 'pos_ip_whitelist_enabled']);

    if (error) {
      console.error('Error fetching IP whitelist settings:', error);
    }

    const settings: Record<string, unknown> = {};
    for (const row of data ?? []) {
      settings[row.key] = row.value;
    }

    const ips = Array.isArray(settings.pos_allowed_ips) ? settings.pos_allowed_ips : [];
    const enabled = settings.pos_ip_whitelist_enabled === true;

    return NextResponse.json(
      { ips, enabled },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        },
      }
    );
  } catch (err) {
    console.error('Error in allowed-ips route:', err);
    return NextResponse.json({ ips: [], enabled: false }, { status: 500 });
  }
}
