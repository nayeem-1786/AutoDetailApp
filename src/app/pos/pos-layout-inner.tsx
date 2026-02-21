'use client';

import { usePathname } from 'next/navigation';
import { PosShell } from './pos-shell';
import { PosServiceWorker } from './components/pos-service-worker';
import { PosThemeProvider } from './context/pos-theme-context';

export function PosLayoutInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Login page renders without PosShell (no auth required)
  if (pathname === '/pos/login') {
    return (
      <>
        <PosServiceWorker />
        <PosThemeProvider>
          {children}
        </PosThemeProvider>
      </>
    );
  }

  return (
    <>
      <PosServiceWorker />
      <PosThemeProvider>
        <PosShell>{children}</PosShell>
      </PosThemeProvider>
    </>
  );
}
