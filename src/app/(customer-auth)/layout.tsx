import { Suspense } from 'react';
import { SiteHeader } from '@/components/public/site-header';
import { SiteFooter } from '@/components/public/site-footer';

export default function CustomerAuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="bg-black text-white min-h-screen">
      <SiteHeader />
      <main className="min-h-[calc(100vh-4rem)]">
        <Suspense>{children}</Suspense>
      </main>
      <SiteFooter />
    </div>
  );
}
