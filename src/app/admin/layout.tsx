import { AdminShell } from './admin-shell';

// Force dynamic rendering for all admin pages (they need auth)
export const dynamic = 'force-dynamic';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AdminShell>{children}</AdminShell>;
}
