'use client';

import { usePathname } from 'next/navigation';
import { PosShell } from './pos-shell';

export function PosLayoutInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Login page renders without PosShell (no auth required)
  if (pathname === '/pos/login') {
    return <>{children}</>;
  }

  return <PosShell>{children}</PosShell>;
}
