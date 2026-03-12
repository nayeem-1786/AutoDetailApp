'use client';

import { usePathname } from 'next/navigation';
import type { FooterData } from '@/lib/supabase/types';

interface ConditionalFooterProps {
  footerData: FooterData;
  children: React.ReactNode;
}

export function ConditionalFooter({ children }: ConditionalFooterProps) {
  const pathname = usePathname();
  const hideFooterPaths = ['/book', '/quote', '/receipt'];
  if (hideFooterPaths.some(p => pathname.startsWith(p))) return null;
  return <>{children}</>;
}
