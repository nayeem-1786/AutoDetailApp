import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: NextRequest) {
  try {
    // Auth: session + employee check
    const authClient = await createClient();
    const {
      data: { user },
    } = await authClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { data: employee } = await authClient
      .from('employees')
      .select('role')
      .eq('auth_user_id', user.id)
      .single();
    if (!employee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    // Call Postgres RPC — aggregates in DB to avoid PostgREST row limits
    const { data, error } = await supabase.rpc('get_transaction_stats', {
      p_status: 'completed',
      p_from: from ? new Date(`${from}T00:00:00`).toISOString() : null,
      p_to: to ? new Date(`${to}T23:59:59.999`).toISOString() : null,
    });

    if (error) {
      console.error('Error fetching transaction stats:', error);
      return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error('Admin transaction stats GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
