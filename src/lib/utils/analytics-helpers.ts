import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Get period date range from query parameter.
 * Accepts: '7d', '30d', '90d', 'all'
 */
export function getPeriodDates(period: string): { start: string; end: string } {
  const end = new Date().toISOString();
  const days = period === '7d' ? 7 : period === '30d' ? 30 : period === '90d' ? 90 : 365 * 10;
  const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  return { start, end };
}

/**
 * Standard admin auth check. Returns { user, adminClient } or a NextResponse error.
 */
export async function authenticateAdmin(): Promise<
  | { error: NextResponse }
  | { user: { id: string }; adminClient: ReturnType<typeof createAdminClient> }
> {
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const { data: employee } = await authClient
    .from('employees')
    .select('role')
    .eq('auth_user_id', user.id)
    .single();

  if (!employee) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  return { user, adminClient: createAdminClient() };
}
