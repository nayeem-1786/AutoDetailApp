import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { AdminShell } from './admin-shell';

// Force dynamic rendering for all admin pages (they need auth)
export const dynamic = 'force-dynamic';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const admin = createAdminClient();
  const { data: employee } = await admin
    .from('employees')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (!employee) redirect('/login?reason=not_authorized');

  return <AdminShell>{children}</AdminShell>;
}
