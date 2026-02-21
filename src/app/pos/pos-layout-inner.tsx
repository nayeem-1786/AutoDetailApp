'use client';

import { usePathname } from 'next/navigation';
import { PosShell } from './pos-shell';
import { PosServiceWorker } from './components/pos-service-worker';

export function PosLayoutInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Login page renders without PosShell (no auth required)
  if (pathname === '/pos/login') {
    return (
      <>
        <PosServiceWorker />
        {children}
      </>
    );
  }

  return (
    <>
      <PosServiceWorker />
      <PosShell>{children}</PosShell>
    </>
  );
}
