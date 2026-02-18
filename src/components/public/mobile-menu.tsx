'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import type { WebsiteNavItem } from '@/lib/supabase/types';

interface MobileMenuProps {
  customerName: string | null;
  navItems?: WebsiteNavItem[];
}

const defaultNavLinks = [
  { id: '1', label: 'Services', url: '/services', target: '_self' as const, children: [] as WebsiteNavItem[] },
  { id: '2', label: 'Products', url: '/products', target: '_self' as const, children: [] as WebsiteNavItem[] },
  { id: '3', label: 'Gallery', url: '/gallery', target: '_self' as const, children: [] as WebsiteNavItem[] },
];

export function MobileMenu({ customerName, navItems }: MobileMenuProps) {
  const [open, setOpen] = useState(false);

  const links = navItems && navItems.length > 0 ? navItems : defaultNavLinks;

  return (
    <>
      {/* Hamburger button */}
      <button
        type="button"
        className="inline-flex md:hidden items-center justify-center h-10 w-10 rounded-full text-site-text-muted hover:bg-site-border transition-colors"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Full-screen overlay */}
      {open && (
        <div className="fixed inset-0 z-[100] md:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-brand-black/95 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />

          {/* Menu content */}
          <div className="relative flex h-full flex-col items-center justify-center">
            {/* Close button */}
            <button
              type="button"
              className="absolute top-5 right-5 flex items-center justify-center h-10 w-10 rounded-full text-site-text/60 hover:text-site-text hover:bg-site-border transition-colors"
              onClick={() => setOpen(false)}
              aria-label="Close menu"
            >
              <X className="h-6 w-6" />
            </button>

            {/* Nav links */}
            <nav className="flex flex-col items-center gap-8">
              {links.map((item) => (
                <div key={item.id} className="flex flex-col items-center gap-3">
                  <Link
                    href={item.url}
                    target={item.target}
                    className="font-display text-3xl font-semibold text-site-text hover:text-lime transition-colors"
                    onClick={() => setOpen(false)}
                  >
                    {item.label}
                  </Link>
                  {/* Render children as indented sub-items */}
                  {item.children && item.children.length > 0 && (
                    <div className="flex flex-col items-center gap-2">
                      {item.children.map((child) => (
                        <Link
                          key={child.id}
                          href={child.url}
                          target={child.target}
                          className="text-lg font-medium text-site-text/60 hover:text-site-text transition-colors"
                          onClick={() => setOpen(false)}
                        >
                          {child.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              <div className="mt-4 h-px w-16 bg-site-border-medium" />
              <Link
                href={customerName ? '/account' : '/signin'}
                className="text-lg font-medium text-site-text/60 hover:text-site-text transition-colors"
                onClick={() => setOpen(false)}
              >
                {customerName ? `Hi, ${customerName}` : 'Sign In'}
              </Link>
              <Link
                href="/book"
                className="mt-4 inline-flex items-center justify-center rounded-full site-btn-cta font-semibold text-lg h-14 px-10 shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300"
                onClick={() => setOpen(false)}
              >
                Book Now
              </Link>
            </nav>
          </div>
        </div>
      )}
    </>
  );
}
