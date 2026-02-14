'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';

const navLinks = [
  { href: '/services', label: 'Services' },
  { href: '/products', label: 'Products' },
  { href: '/gallery', label: 'Gallery' },
];

interface MobileMenuProps {
  customerName: string | null;
}

export function MobileMenu({ customerName }: MobileMenuProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Hamburger button */}
      <button
        type="button"
        className="inline-flex md:hidden items-center justify-center h-10 w-10 rounded-full text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
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
            className="absolute inset-0 bg-navy/95 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />

          {/* Menu content */}
          <div className="relative flex h-full flex-col items-center justify-center">
            {/* Close button */}
            <button
              type="button"
              className="absolute top-5 right-5 flex items-center justify-center h-10 w-10 rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-colors"
              onClick={() => setOpen(false)}
              aria-label="Close menu"
            >
              <X className="h-6 w-6" />
            </button>

            {/* Nav links */}
            <nav className="flex flex-col items-center gap-8">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="font-display text-3xl font-semibold text-white hover:text-brand-200 transition-colors"
                  onClick={() => setOpen(false)}
                >
                  {link.label}
                </Link>
              ))}
              <div className="mt-4 h-px w-16 bg-white/20" />
              <Link
                href={customerName ? '/account' : '/signin'}
                className="text-lg font-medium text-white/60 hover:text-white transition-colors"
                onClick={() => setOpen(false)}
              >
                {customerName ? `Hi, ${customerName}` : 'Sign In'}
              </Link>
              <Link
                href="/book"
                className="mt-4 inline-flex items-center justify-center rounded-full bg-white text-navy font-semibold text-lg h-14 px-10 shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300"
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
