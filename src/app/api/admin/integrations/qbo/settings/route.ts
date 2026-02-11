import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const ALLOWED_KEYS = [
  'qbo_enabled',
  'qbo_environment',
  'qbo_auto_sync_transactions',
  'qbo_auto_sync_customers',
  'qbo_auto_sync_catalog',
  'qbo_client_id',
  'qbo_client_secret',
  'qbo_income_account_id',
  'qbo_default_payment_method_id',
] as const;

const ALL_QBO_KEYS = [
  ...ALLOWED_KEYS,
  'qbo_realm_id',
  'qbo_token_expires_at',
  'qbo_last_sync_at',
  'qbo_access_token',
  'qbo_refresh_token',
];

async function authCheck() {
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return null;

  const { data: employee } = await authClient
    .from('employees')
    .select('role')
    .eq('auth_user_id', user.id)
    .single();

  return employee ? user : null;
}

export async function GET() {
  try {
    const user = await authCheck();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createAdminClient();
    const { data: rows } = await supabase
      .from('business_settings')
      .select('key, value')
      .in('key', ALL_QBO_KEYS);

    const settings: Record<string, string> = {};
    for (const row of rows || []) {
      const val = row.value as string;
      settings[row.key] = typeof val === 'string' ? val.replace(/^"|"$/g, '') : '';
    }

    // Don't expose access/refresh tokens to the client
    delete settings.qbo_access_token;
    delete settings.qbo_refresh_token;

    return NextResponse.json(settings);
  } catch (err) {
    console.error('QBO settings GET error:', err);
    return NextResponse.json({ error: 'Failed to load settings' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await authCheck();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const supabase = createAdminClient();
    const now = new Date().toISOString();

    // Validate: qbo_enabled can only be true if connected
    if (body.qbo_enabled === 'true' || body.qbo_enabled === true) {
      const { data: realmRow } = await supabase
        .from('business_settings')
        .select('value')
        .eq('key', 'qbo_realm_id')
        .single();

      const realmId = realmRow
        ? (typeof realmRow.value === 'string' ? (realmRow.value as string).replace(/^"|"$/g, '') : '')
        : '';

      if (!realmId) {
        return NextResponse.json(
          { error: 'Cannot enable QBO sync — not connected. Please connect first.' },
          { status: 400 }
        );
      }
    }

    // Update each allowed key that was provided
    for (const key of ALLOWED_KEYS) {
      if (key in body) {
        let value = body[key];
        // Normalize booleans to strings
        if (typeof value === 'boolean') value = value.toString();

        await supabase
          .from('business_settings')
          .upsert(
            { key, value: JSON.stringify(value), updated_at: now },
            { onConflict: 'key' }
          );
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('QBO settings PATCH error:', err);
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
  }
}
