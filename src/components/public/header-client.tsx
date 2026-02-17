'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, ChevronDown, Phone, MapPin } from 'lucide-react';
import Link from 'next/link';
import type { WebsiteNavItem } from '@/lib/supabase/types';

interface HeaderClientProps {
  navItems: WebsiteNavItem[];
  businessName: string;
  phone: string;
  logoUrl: string | null;
  customerName: string | null;
}

export function HeaderClient({
  navItems,
  businessName,
  phone,
  logoUrl,
  customerName,
}: HeaderClientProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<number | null>(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-500 ${
        scrolled
          ? 'bg-brand-black/95 backdrop-blur-xl shadow-2xl shadow-black/20'
          : 'bg-brand-black'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        {/* Top utility bar */}
        {phone && (
          <div className="hidden lg:flex items-center justify-end gap-6 py-1.5 text-xs text-site-text-muted border-b border-site-border-light">
            <a
              href={`tel:${phone}`}
              className="flex items-center gap-1.5 hover:text-site-text transition-colors"
            >
              <Phone className="w-3 h-3" />
              {phone}
            </a>
            <span className="flex items-center gap-1.5">
              <MapPin className="w-3 h-3" />
              Mobile Service &mdash; We Come to You
            </span>
          </div>
        )}

        {/* Main nav bar */}
        <div className="flex items-center justify-between h-16 lg:h-20">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 shrink-0">
            {logoUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={logoUrl} alt={businessName} className="h-10 lg:h-12 w-auto" />
            ) : (
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 lg:w-12 lg:h-12 rounded-xl bg-lime flex items-center justify-center">
                  <span className="text-black font-black text-lg lg:text-xl">S</span>
                </div>
                <div className="hidden sm:block">
                  <div className="text-site-text font-bold text-sm lg:text-base tracking-tight leading-none">
                    {businessName}
                  </div>
                  <div className="text-lime text-[10px] lg:text-xs font-semibold tracking-[0.2em] uppercase">
                    Premium Detail
                  </div>
                </div>
              </div>
            )}
          </Link>

          {/* Desktop nav */}
          <nav className="hidden lg:flex items-center gap-1">
            {navItems.map((item, i) => (
              <div
                key={item.id}
                className="relative"
                onMouseEnter={() =>
                  item.children && item.children.length > 0
                    ? setActiveDropdown(i)
                    : undefined
                }
                onMouseLeave={() => setActiveDropdown(null)}
              >
                <Link
                  href={item.url}
                  target={item.target || '_self'}
                  className="flex items-center gap-1 px-4 py-2 text-sm font-medium text-site-text-secondary hover:text-site-text transition-colors rounded-lg hover:bg-site-border-light"
                >
                  {item.label}
                  {item.children && item.children.length > 0 && (
                    <ChevronDown
                      className={`w-3.5 h-3.5 transition-transform duration-200 ${
                        activeDropdown === i ? 'rotate-180' : ''
                      }`}
                    />
                  )}
                </Link>

                {/* Dropdown */}
                <AnimatePresence>
                  {item.children &&
                    item.children.length > 0 &&
                    activeDropdown === i && (
                      <motion.div
                        initial={{ opacity: 0, y: 8, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 8, scale: 0.96 }}
                        transition={{ duration: 0.2 }}
                        className="absolute top-full left-0 mt-1 w-72 bg-brand-surface border border-site-border rounded-2xl shadow-2xl shadow-black/50 overflow-hidden p-2"
                      >
                        {item.children.map((child) => (
                          <Link
                            key={child.id}
                            href={child.url}
                            target={child.target || '_self'}
                            className="flex items-start gap-3 p-3 rounded-xl hover:bg-site-border-light transition-colors group"
                          >
                            <div className="text-sm font-medium text-site-text group-hover:text-lime transition-colors">
                              {child.label}
                            </div>
                          </Link>
                        ))}
                      </motion.div>
                    )}
                </AnimatePresence>
              </div>
            ))}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-3">
            {/* Account link — desktop */}
            <Link
              href={customerName ? '/account' : '/signin'}
              className="hidden lg:inline-flex items-center text-sm font-medium text-site-text-muted hover:text-site-text transition-colors"
            >
              {customerName ? `Hi, ${customerName}` : 'Sign In'}
            </Link>

            {/* CTA */}
            <Link
              href="/book"
              className="hidden sm:inline-flex items-center gap-2 px-6 py-2.5 bg-lime text-black text-sm font-bold rounded-full hover:bg-lime-200 transition-all duration-300 shadow-lg shadow-lime/25 hover:shadow-lime/40 hover:scale-[1.02] btn-lime-glow"
            >
              Book Now
            </Link>

            {/* Mobile toggle */}
            <button
              type="button"
              onClick={() => setMobileOpen(!mobileOpen)}
              className="lg:hidden p-2 text-site-text rounded-lg hover:bg-site-border transition-colors"
              aria-label="Toggle menu"
            >
              {mobileOpen ? (
                <X className="w-6 h-6" />
              ) : (
                <Menu className="w-6 h-6" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="lg:hidden overflow-hidden border-t border-site-border bg-brand-dark"
          >
            <div className="px-4 py-4 space-y-1">
              {navItems.map((item) => (
                <div key={item.id}>
                  <Link
                    href={item.url}
                    className="flex items-center justify-between py-3 px-3 text-site-text-secondary hover:text-site-text hover:bg-site-border-light rounded-xl transition-colors"
                    onClick={() =>
                      !(item.children && item.children.length > 0) &&
                      setMobileOpen(false)
                    }
                  >
                    <span className="font-medium">{item.label}</span>
                    {item.children && item.children.length > 0 && (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </Link>
                  {item.children && item.children.length > 0 && (
                    <div className="ml-4 space-y-1 mt-1">
                      {item.children.map((child) => (
                        <Link
                          key={child.id}
                          href={child.url}
                          className="block py-2 px-3 text-sm text-site-text-muted hover:text-site-text hover:bg-site-border-light rounded-lg transition-colors"
                          onClick={() => setMobileOpen(false)}
                        >
                          {child.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {/* Account link — mobile */}
              <div className="pt-2 border-t border-site-border">
                <Link
                  href={customerName ? '/account' : '/signin'}
                  className="block py-3 px-3 text-site-text-muted hover:text-site-text hover:bg-site-border-light rounded-xl transition-colors font-medium"
                  onClick={() => setMobileOpen(false)}
                >
                  {customerName ? `Hi, ${customerName}` : 'Sign In'}
                </Link>
              </div>

              <div className="pt-3">
                <Link
                  href="/book"
                  className="block w-full text-center py-3 bg-lime text-black font-bold rounded-xl"
                  onClick={() => setMobileOpen(false)}
                >
                  Book Now
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
