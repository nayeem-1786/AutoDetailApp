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

    // Read refresh token for revocation
    const { data: tokenRow } = await supabase
      .from('business_settings')
      .select('value')
      .eq('key', 'qbo_refresh_token')
      .single();

    const refreshToken = tokenRow
      ? (typeof tokenRow.value === 'string' ? (tokenRow.value as string).replace(/^"|"$/g, '') : '')
      : '';

    // Attempt to revoke the refresh token with Intuit
    const clientId = process.env.QBO_CLIENT_ID;
    const clientSecret = process.env.QBO_CLIENT_SECRET;
    if (refreshToken && clientId && clientSecret) {
      try {
        const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
        await fetch('https://developer.api.intuit.com/v2/oauth2/tokens/revoke', {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${basicAuth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({ token: refreshToken }),
        });
      } catch (revokeErr) {
        console.warn('Failed to revoke QBO token (continuing with disconnect):', revokeErr);
      }
    }

    // Clear token fields (keep sync settings)
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
