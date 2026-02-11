import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST() {
  try {
    // Auth check
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: employee } = await authClient
      .from('employees')
      .select('role')
      .eq('auth_user_id', user.id)
      .single();
    if (!employee) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createAdminClient();

    // Read current tokens and credentials for revocation
    const { data: settings } = await supabase
      .from('business_settings')
      .select('key, value')
      .in('key', ['qbo_refresh_token', 'qbo_client_id', 'qbo_client_secret']);

    const map: Record<string, string> = {};
    for (const row of settings || []) {
      const val = row.value as string;
      map[row.key] = typeof val === 'string' ? val.replace(/^"|"$/g, '') : '';
    }

    // Attempt to revoke the refresh token with Intuit
    if (map.qbo_refresh_token && map.qbo_client_id && map.qbo_client_secret) {
      try {
        const basicAuth = Buffer.from(`${map.qbo_client_id}:${map.qbo_client_secret}`).toString('base64');
        await fetch('https://developer.api.intuit.com/v2/oauth2/tokens/revoke', {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${basicAuth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({ token: map.qbo_refresh_token }),
        });
      } catch (revokeErr) {
        console.warn('Failed to revoke QBO token (continuing with disconnect):', revokeErr);
      }
    }

    // Clear token fields (keep client_id, client_secret, and sync settings)
    const now = new Date().toISOString();
    const tokenKeys = [
      'qbo_access_token',
      'qbo_refresh_token',
      'qbo_realm_id',
      'qbo_token_expires_at',
    ];

    for (const key of tokenKeys) {
      await supabase
        .from('business_settings')
        .update({ value: JSON.stringify(''), updated_at: now })
        .eq('key', key);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('QBO disconnect error:', err);
    return NextResponse.json({ error: 'Failed to disconnect' }, { status: 500 });
  }
}
