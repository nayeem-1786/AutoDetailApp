'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Menu, X, ChevronDown, Phone, MapPin, LayoutDashboard, LogOut } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import type { WebsiteNavItem } from '@/lib/supabase/types';
import { CartIconButton } from './cart/cart-icon-button';
import { ThemeToggle } from './theme-toggle';

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
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const userDropdownTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    return () => {
      if (userDropdownTimer.current) clearTimeout(userDropdownTimer.current);
    };
  }, []);

  const openUserDropdown = useCallback(() => {
    if (userDropdownTimer.current) clearTimeout(userDropdownTimer.current);
    setUserDropdownOpen(true);
  }, []);

  const closeUserDropdown = useCallback(() => {
    userDropdownTimer.current = setTimeout(() => setUserDropdownOpen(false), 150);
  }, []);

  const handleSignOut = useCallback(async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = '/';
  }, []);

  return (
    <header
      className={`sticky z-40 transition-all duration-500 ${
        scrolled
          ? 'bg-site-header-bg/95 backdrop-blur-xl shadow-2xl shadow-black/20'
          : 'bg-site-header-bg'
      }`}
      style={{ top: 'var(--ticker-height, 0px)' }}
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
              <Image src={logoUrl} alt={businessName} width={160} height={48} className="h-10 lg:h-12 w-auto" priority />
            ) : (
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 lg:w-12 lg:h-12 rounded-xl bg-lime flex items-center justify-center">
                  <span className="text-site-text-on-primary font-black text-lg lg:text-xl">S</span>
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

                {/* Dropdown — CSS transition */}
                {item.children && item.children.length > 0 && (
                  <div
                    className={`absolute top-full left-0 mt-1 w-72 bg-brand-surface border border-site-border rounded-2xl shadow-2xl shadow-black/50 overflow-hidden p-2 transition-all duration-200 ${
                      activeDropdown === i
                        ? 'opacity-100 translate-y-0 scale-100 pointer-events-auto'
                        : 'opacity-0 translate-y-2 scale-[0.96] pointer-events-none'
                    }`}
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
                  </div>
                )}
              </div>
            ))}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-3">
            {/* Account — desktop */}
            {customerName ? (
              <div
                className="relative hidden lg:block"
                onMouseEnter={openUserDropdown}
                onMouseLeave={closeUserDropdown}
              >
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-sm font-medium text-site-text-muted hover:text-site-text transition-colors"
                >
                  Hi, {customerName}
                  <ChevronDown
                    className={`w-3.5 h-3.5 transition-transform duration-200 ${
                      userDropdownOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>
                <div
                  className={`absolute top-full right-0 mt-1 w-44 bg-brand-surface border border-site-border rounded-xl shadow-2xl shadow-black/50 overflow-hidden p-1.5 transition-all duration-200 ${
                    userDropdownOpen
                      ? 'opacity-100 translate-y-0 scale-100 pointer-events-auto'
                      : 'opacity-0 translate-y-2 scale-[0.96] pointer-events-none'
                  }`}
                >
                  <Link
                    href="/account"
                    className="flex items-center gap-2.5 px-3 py-2 text-sm text-site-text hover:bg-lime/10 rounded-lg transition-colors"
                  >
                    <LayoutDashboard className="w-4 h-4 text-site-text-muted" />
                    Dashboard
                  </Link>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-site-text hover:bg-red-500/10 hover:text-red-400 rounded-lg transition-colors"
                  >
                    <LogOut className="w-4 h-4 text-site-text-muted" />
                    Log Out
                  </button>
                </div>
              </div>
            ) : (
              <Link
                href="/signin"
                className="hidden lg:inline-flex items-center text-sm font-medium text-site-text-muted hover:text-site-text transition-colors"
              >
                Sign In
              </Link>
            )}

            {/* Theme toggle */}
            <ThemeToggle />

            {/* Cart icon — always visible */}
            <CartIconButton />

            {/* CTA */}
            <Link
              href="/book"
              className="hidden sm:inline-flex items-center gap-2 px-6 py-2.5 site-btn-cta text-sm font-bold transition-all duration-300 shadow-lg shadow-lime/25 hover:shadow-lime/40 hover:scale-[1.02] btn-lime-glow"
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

      {/* Mobile menu — CSS transition via grid row trick */}
      <div
        className={`lg:hidden grid transition-[grid-template-rows] duration-300 border-t bg-brand-dark ${
          mobileOpen ? 'grid-rows-[1fr] border-site-border' : 'grid-rows-[0fr] border-transparent'
        }`}
      >
        <div className="overflow-hidden">
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

            {/* Account — mobile */}
            <div className="pt-2 border-t border-site-border space-y-1">
              {customerName ? (
                <>
                  <p className="px-3 pt-1 text-xs font-medium text-site-text-dim">
                    Hi, {customerName}
                  </p>
                  <Link
                    href="/account"
                    className="flex items-center gap-2.5 py-3 px-3 text-site-text-muted hover:text-site-text hover:bg-site-border-light rounded-xl transition-colors font-medium"
                    onClick={() => setMobileOpen(false)}
                  >
                    <LayoutDashboard className="w-4 h-4" />
                    Dashboard
                  </Link>
                  <button
                    type="button"
                    onClick={() => { setMobileOpen(false); handleSignOut(); }}
                    className="flex w-full items-center gap-2.5 py-3 px-3 text-site-text-muted hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-colors font-medium"
                  >
                    <LogOut className="w-4 h-4" />
                    Log Out
                  </button>
                </>
              ) : (
                <Link
                  href="/signin"
                  className="block py-3 px-3 text-site-text-muted hover:text-site-text hover:bg-site-border-light rounded-xl transition-colors font-medium"
                  onClick={() => setMobileOpen(false)}
                >
                  Sign In
                </Link>
              )}
            </div>

            <div className="pt-3">
              <Link
                href="/book"
                className="block w-full text-center py-3 site-btn-cta font-bold"
                onClick={() => setMobileOpen(false)}
              >
                Book Now
              </Link>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
