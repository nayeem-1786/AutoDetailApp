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

  const { data, error } = await admin
    .from('conversations')
    .select('unread_count')
    .eq('status', 'open');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const count = (data || []).reduce((sum, c) => sum + (c.unread_count || 0), 0);

  return NextResponse.json({ data: { count } });
}
