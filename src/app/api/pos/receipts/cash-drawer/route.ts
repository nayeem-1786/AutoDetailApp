import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { authenticatePosRequest } from '@/lib/pos/api-auth';
import { checkPosPermission } from '@/lib/pos/check-permission';
import { escPosOpenDrawer } from '@/app/pos/lib/receipt-template';

export async function POST(request: NextRequest) {
  try {
    let employeeId: string | null = null;
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
      employeeId = posEmployee.employee_id;
      // POS token auth — check pos.open_close_register permission
      const supabaseForPermCheck = createAdminClient();
      const granted = await checkPosPermission(supabaseForPermCheck, posEmployee.role, posEmployee.employee_id, 'pos.open_close_register');
      if (!granted) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const supabase = createAdminClient();
    const drawerData = escPosOpenDrawer();
    const payload = Buffer.from(drawerData).toString('base64');

    // Insert cash drawer kick into print_jobs queue.
    // The OptiPlex polling agent picks up pending jobs and sends to the local printer.
    const { data: job, error: insertError } = await supabase
      .from('print_jobs')
      .insert({
        type: 'cash_drawer',
        payload,
        created_by: employeeId,
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('Failed to create cash drawer job:', insertError);
      return NextResponse.json(
        { error: 'Failed to queue cash drawer command' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, job_id: job.id });
  } catch (err) {
    console.error('Cash drawer error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
