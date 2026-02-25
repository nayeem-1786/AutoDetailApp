'use client';

import { usePathname } from 'next/navigation';
import type { FooterData } from '@/lib/supabase/types';

interface ConditionalFooterProps {
  footerData: FooterData;
  children: React.ReactNode;
}

export function ConditionalFooter({ children }: ConditionalFooterProps) {
  const pathname = usePathname();
  if (pathname.startsWith('/book')) return null;
  return <>{children}</>;
}
