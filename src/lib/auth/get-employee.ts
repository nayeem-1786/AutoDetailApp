import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { UserRole } from '@/lib/supabase/types';

export interface AuthenticatedEmployee {
  id: string;
  role: UserRole;
  role_id: string;
  is_super: boolean;
}

/**
 * Get the authenticated employee from the current session.
 * Returns null if not authenticated or not an active employee.
 *
 * Usage in admin API routes:
 *   const employee = await getEmployeeFromSession();
 *   if (!employee) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 */
export async function getEmployeeFromSession(): Promise<AuthenticatedEmployee | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();
  const { data: employee } = await admin
    .from('employees')
    .select('id, role, role_id')
    .eq('auth_user_id', user.id)
    .eq('status', 'active')
    .single();

  if (!employee) return null;

  return {
    id: employee.id,
    role: employee.role as UserRole,
    role_id: employee.role_id,
    is_super: employee.role === 'super_admin',
  };
}
