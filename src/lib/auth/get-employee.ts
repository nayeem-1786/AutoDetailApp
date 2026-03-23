import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isIpAllowed } from '@/lib/security/ip-whitelist';
import type { NextRequest } from 'next/server';
import type { UserRole } from '@/lib/supabase/types';

export interface AuthenticatedEmployee {
  id: string;
  auth_user_id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  role: UserRole;
  role_id: string;
  is_super: boolean;
}

/**
 * Get the authenticated employee from the current session.
 * Returns null if not authenticated, not an active employee, or IP not allowed.
 *
 * Pass `request` to enable IP whitelist enforcement (recommended for all admin API routes).
 * When `request` is omitted, IP check is skipped (backwards compatible).
 *
 * Usage in admin API routes:
 *   const employee = await getEmployeeFromSession(request);
 *   if (!employee) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 */
export async function getEmployeeFromSession(
  request?: NextRequest
): Promise<AuthenticatedEmployee | null> {
  // IP whitelist check when request is provided
  if (request) {
    const allowed = await isIpAllowed(request.headers);
    if (!allowed) return null;
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();
  const { data: employee } = await admin
    .from('employees')
    .select('id, auth_user_id, email, first_name, last_name, role, role_id')
    .eq('auth_user_id', user.id)
    .eq('status', 'active')
    .single();

  if (!employee) return null;

  return {
    id: employee.id,
    auth_user_id: employee.auth_user_id,
    email: employee.email || null,
    first_name: employee.first_name || null,
    last_name: employee.last_name || null,
    role: employee.role as UserRole,
    role_id: employee.role_id,
    is_super: employee.role === 'super_admin',
  };
}
