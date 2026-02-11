import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: NextRequest) {
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

    // Read client ID from business_settings
    const { data: settings } = await supabase
      .from('business_settings')
      .select('key, value')
      .in('key', ['qbo_client_id', 'qbo_environment']);

    const map: Record<string, string> = {};
    for (const row of settings || []) {
      const val = row.value as string;
      map[row.key] = typeof val === 'string' ? val.replace(/^"|"$/g, '') : '';
    }

    const clientId = map.qbo_client_id;
    if (!clientId) {
      return NextResponse.redirect(
        new URL('/admin/settings/integrations/quickbooks?error=no_credentials', request.url)
      );
    }

    // Generate CSRF state
    const state = crypto.randomUUID();
    await supabase
      .from('business_settings')
      .update({ value: JSON.stringify(state), updated_at: new Date().toISOString() })
      .eq('key', 'qbo_oauth_state');

    // If qbo_oauth_state doesn't exist, insert it
    await supabase
      .from('business_settings')
      .upsert(
        { key: 'qbo_oauth_state', value: JSON.stringify(state), updated_at: new Date().toISOString() },
        { onConflict: 'key' }
      );

    // Build redirect URI
    const origin = new URL(request.url).origin;
    const redirectUri = `${origin}/api/admin/integrations/qbo/callback`;

    // Build Intuit authorization URL
    const authUrl = new URL('https://appcenter.intuit.com/connect/oauth2');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'com.intuit.quickbooks.accounting');
    authUrl.searchParams.set('state', state);

    return NextResponse.redirect(authUrl.toString());
  } catch (err) {
    console.error('QBO connect error:', err);
    return NextResponse.redirect(
      new URL('/admin/settings/integrations/quickbooks?error=connect_failed', request.url)
    );
  }
}
