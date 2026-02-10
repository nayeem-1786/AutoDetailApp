import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
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

  if (!employee || !['super_admin', 'admin', 'cashier', 'detailer'].includes(employee.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = createAdminClient();

  const [openResult, closedResult, archivedResult] = await Promise.all([
    admin.from('conversations').select('id', { count: 'exact', head: true }).eq('status', 'open'),
    admin.from('conversations').select('id', { count: 'exact', head: true }).eq('status', 'closed'),
    admin.from('conversations').select('id', { count: 'exact', head: true }).eq('status', 'archived'),
  ]);

  return NextResponse.json({
    data: {
      open: openResult.count ?? 0,
      closed: closedResult.count ?? 0,
      archived: archivedResult.count ?? 0,
    },
  });
}
