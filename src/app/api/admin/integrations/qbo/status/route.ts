import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { QboClient } from '@/lib/qbo/client';

export async function GET() {
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

    // Read all QBO settings
    const { data: rows } = await supabase
      .from('business_settings')
      .select('key, value')
      .like('key', 'qbo_%');

    const map: Record<string, string> = {};
    for (const row of rows || []) {
      const val = row.value as string;
      map[row.key] = typeof val === 'string' ? val.replace(/^"|"$/g, '') : '';
    }

    const realmId = map.qbo_realm_id || '';
    const connected = !!realmId;
    let companyName: string | null = null;

    if (connected) {
      try {
        const client = new QboClient();
        const info = await client.getCompanyInfo();
        companyName = info.CompanyName;
      } catch {
        // Connection test failed but we're still "connected" (have tokens)
      }
    }

    return NextResponse.json({
      status: connected ? 'connected' : 'disconnected',
      company_name: companyName,
      realm_id: realmId || null,
      environment: map.qbo_environment || 'sandbox',
      enabled: map.qbo_enabled === 'true',
      last_sync_at: map.qbo_last_sync_at || null,
      auto_sync: {
        transactions: map.qbo_auto_sync_transactions !== 'false',
        customers: map.qbo_auto_sync_customers !== 'false',
        catalog: map.qbo_auto_sync_catalog !== 'false',
      },
    });
  } catch (err) {
    console.error('QBO status error:', err);
    return NextResponse.json({ error: 'Failed to get status' }, { status: 500 });
  }
}
