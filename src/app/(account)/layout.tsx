import { SiteHeader } from '@/components/public/site-header';
import { SiteFooter } from '@/components/public/site-footer';
import { CustomerAuthProvider } from '@/lib/auth/customer-auth-provider';

export const dynamic = 'force-dynamic';

export default function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <SiteHeader />
      <main className="min-h-[calc(100vh-4rem)]">
        <CustomerAuthProvider>{children}</CustomerAuthProvider>
      </main>
      <SiteFooter />
    </>
  );
}
