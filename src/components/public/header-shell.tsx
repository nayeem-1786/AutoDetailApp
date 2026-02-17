'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

export function HeaderShell({ children }: { children: ReactNode }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header
      className={cn(
        'sticky top-0 z-50 w-full transition-all duration-300',
        scrolled
          ? 'bg-site-header-bg/95 backdrop-blur-md shadow-sm border-b border-site-border'
          : 'bg-site-header-bg border-b border-site-border-light'
      )}
    >
      {children}
    </header>
  );
}
