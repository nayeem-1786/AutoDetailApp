import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { listCarrierAccounts } from '@/lib/services/shippo';

// GET — list available carrier accounts from Shippo
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

  if (!employee || !['super_admin', 'admin'].includes(employee.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const carriers = await listCarrierAccounts();
    return NextResponse.json({ data: carriers });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch carriers';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
