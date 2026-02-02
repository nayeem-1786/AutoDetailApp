import { Suspense } from 'react';
import { SiteHeader } from '@/components/public/site-header';
import { SiteFooter } from '@/components/public/site-footer';

export default function CustomerAuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <SiteHeader />
      <main className="min-h-[calc(100vh-4rem)]">
        <Suspense>{children}</Suspense>
      </main>
      <SiteFooter />
    </>
  );
}
