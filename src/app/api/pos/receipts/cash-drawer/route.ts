import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { authenticatePosRequest } from '@/lib/pos/api-auth';
import { checkPosPermission } from '@/lib/pos/check-permission';
import { escPosOpenDrawer } from '@/app/pos/lib/receipt-template';
import { fetchReceiptConfig } from '@/lib/data/receipt-config';

export async function POST(request: NextRequest) {
  try {
    // Accept POS token auth OR admin Supabase session auth
    const posEmployee = await authenticatePosRequest(request);
    if (!posEmployee) {
      const supabaseSession = await createClient();
      const { data: { user } } = await supabaseSession.auth.getUser();
      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      // Admin session auth — skip permission check (admin dashboard users)
    } else {
      // POS token auth — check pos.open_close_register permission
      const supabaseForPermCheck = createAdminClient();
      const granted = await checkPosPermission(supabaseForPermCheck, posEmployee.role, posEmployee.employee_id, 'pos.open_close_register');
      if (!granted) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }
    const supabase = createAdminClient();

    const { print_server_url } = await fetchReceiptConfig(supabase);

    if (!print_server_url) {
      console.error('print_server_url is null — receipt_config may not have been saved with this field yet');
      return NextResponse.json(
        { error: 'Print server not configured' },
        { status: 400 }
      );
    }

    const drawerData = escPosOpenDrawer();

    // Send cash drawer kick command with 3-second timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    try {
      const res = await fetch(`${print_server_url}/cash-drawer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: Buffer.from(drawerData),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        return NextResponse.json(
          { error: 'Cash drawer command failed' },
          { status: 502 }
        );
      }
    } catch (fetchErr) {
      clearTimeout(timeout);
      const msg = fetchErr instanceof Error && fetchErr.name === 'AbortError'
        ? 'Print server timeout (3s)'
        : 'Print server unreachable';
      return NextResponse.json({ error: msg }, { status: 502 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Cash drawer error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
