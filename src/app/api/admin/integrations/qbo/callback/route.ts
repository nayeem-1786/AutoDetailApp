import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { QboClient } from '@/lib/qbo/client';

export async function GET(request: NextRequest) {
  const redirectBase = new URL('/admin/settings/integrations/quickbooks', request.url);

  try {
    // Auth check
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createAdminClient();

    // Extract OAuth params
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const realmId = searchParams.get('realmId');

    if (!code || !state || !realmId) {
      redirectBase.searchParams.set('error', 'missing_params');
      return NextResponse.redirect(redirectBase.toString());
    }

    // Verify CSRF state
    const { data: stateRow } = await supabase
      .from('business_settings')
      .select('value')
      .eq('key', 'qbo_oauth_state')
      .single();

    const storedState = stateRow
      ? (typeof stateRow.value === 'string' ? (stateRow.value as string).replace(/^"|"$/g, '') : '')
      : '';

    if (!storedState || storedState !== state) {
      redirectBase.searchParams.set('error', 'invalid_state');
      return NextResponse.redirect(redirectBase.toString());
    }

    // Read client credentials from env vars
    const clientId = process.env.QBO_CLIENT_ID;
    const clientSecret = process.env.QBO_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      redirectBase.searchParams.set('error', 'no_credentials');
      return NextResponse.redirect(redirectBase.toString());
    }

    // Exchange authorization code for tokens
    const origin = new URL(request.url).origin;
    const redirectUri = `${origin}/api/admin/integrations/qbo/callback`;
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const tokenRes = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenRes.ok) {
      console.error('QBO token exchange failed:', await tokenRes.text());
      redirectBase.searchParams.set('error', 'token_exchange_failed');
      return NextResponse.redirect(redirectBase.toString());
    }

    const tokenData = await tokenRes.json();
    const tokenExpiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

    // Store tokens in business_settings
    const now = new Date().toISOString();
    const settingsToSave = [
      { key: 'qbo_access_token', value: JSON.stringify(tokenData.access_token) },
      { key: 'qbo_refresh_token', value: JSON.stringify(tokenData.refresh_token) },
      { key: 'qbo_realm_id', value: JSON.stringify(realmId) },
      { key: 'qbo_token_expires_at', value: JSON.stringify(tokenExpiresAt) },
    ];

    for (const { key, value } of settingsToSave) {
      await supabase
        .from('business_settings')
        .upsert({ key, value, updated_at: now }, { onConflict: 'key' });
    }

    // Clear OAuth state
    await supabase
      .from('business_settings')
      .update({ value: JSON.stringify(''), updated_at: now })
      .eq('key', 'qbo_oauth_state');

    // Test connection by fetching company info
    try {
      const client = new QboClient();
      await client.getCompanyInfo();
    } catch (testErr) {
      console.warn('QBO connection test failed after OAuth:', testErr);
      redirectBase.searchParams.set('warning', 'connection_test_failed');
      return NextResponse.redirect(redirectBase.toString());
    }

    redirectBase.searchParams.set('connected', 'true');
    return NextResponse.redirect(redirectBase.toString());
  } catch (err) {
    console.error('QBO callback error:', err);
    redirectBase.searchParams.set('error', 'token_exchange_failed');
    return NextResponse.redirect(redirectBase.toString());
  }
}
