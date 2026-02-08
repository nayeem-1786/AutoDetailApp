import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getQuotePipelineStats, getQuoteMetrics } from '@/lib/quotes/quote-service';

export async function GET() {
  try {
    // Auth: session + employee role check
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
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

    const [pipeline, metrics] = await Promise.all([
      getQuotePipelineStats(supabase),
      getQuoteMetrics(supabase),
    ]);

    return NextResponse.json({ pipeline, metrics });
  } catch (err) {
    console.error('Admin quotes stats GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
