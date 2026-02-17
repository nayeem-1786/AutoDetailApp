import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { testShippoConnection, getShippingSettings } from '@/lib/services/shippo';

// POST — test Shippo API key connection
// Accepts optional { apiKey, mode } in body.
// If apiKey is missing or masked, resolves from DB settings → env vars.
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: employee } = await supabase
    .from('employees')
    .select('role')
    .eq('auth_user_id', user.id)
    .single();

  if (!employee || !['super_admin', 'admin'].includes(employee.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  let apiKey: string | undefined = body.apiKey;
  const isMaskedOrEmpty = !apiKey || typeof apiKey !== 'string' || apiKey.includes('••••');

  // If no usable key provided, resolve from DB → env vars
  if (isMaskedOrEmpty) {
    const settings = await getShippingSettings();
    const mode = body.mode || settings?.shippo_mode || process.env.SHIPPO_MODE || 'test';

    // Try DB key first
    apiKey = mode === 'live'
      ? settings?.shippo_api_key_live ?? undefined
      : settings?.shippo_api_key_test ?? undefined;

    // Fall back to env var
    if (!apiKey) {
      apiKey = mode === 'live'
        ? process.env.SHIPPO_API_KEY_LIVE
        : process.env.SHIPPO_API_KEY_TEST;
    }
  }

  if (!apiKey) {
    return NextResponse.json(
      { error: 'No API key found. Add a key in Settings or set SHIPPO_API_KEY_LIVE / SHIPPO_API_KEY_TEST in .env.local' },
      { status: 400 }
    );
  }

  const result = await testShippoConnection(apiKey);
  return NextResponse.json({ data: result });
}
