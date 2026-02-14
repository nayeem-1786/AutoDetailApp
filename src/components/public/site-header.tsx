import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { getBusinessInfo } from '@/lib/data/business';
import { createClient } from '@/lib/supabase/server';
import { HeaderShell } from './header-shell';
import { MobileMenu } from './mobile-menu';

export async function SiteHeader() {
  const biz = await getBusinessInfo();

  let customerName: string | null = null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data: cust } = await supabase
        .from('customers')
        .select('id, first_name')
        .eq('auth_user_id', user.id)
        .single();
      if (cust?.first_name) {
        customerName = cust.first_name;
      }
    }
  } catch {
    // Not authenticated — ignore
  }

  return (
    <HeaderShell>
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <div className="flex-shrink-0">
          <Link
            href="/"
            className="group flex items-center gap-2 font-display text-xl font-bold tracking-tight text-gray-900 dark:text-gray-100 transition-colors"
          >
            <Sparkles className="h-5 w-5 text-brand-600" />
            <span className="hidden sm:inline">{biz.name}</span>
            <span className="sm:hidden">SD Auto Spa</span>
          </Link>
        </div>

        {/* Center Nav — desktop */}
        <div className="hidden md:flex md:items-center md:gap-1">
          {[
            { href: '/services', label: 'Services' },
            { href: '/products', label: 'Products' },
            { href: '/gallery', label: 'Gallery' },
          ].map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="relative px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors group"
            >
              {link.label}
              <span className="absolute inset-x-4 -bottom-px h-0.5 bg-brand-600 scale-x-0 group-hover:scale-x-100 transition-transform origin-left" />
            </Link>
          ))}
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-3">
          {/* Account — desktop only */}
          <Link
            href={customerName ? '/account' : '/signin'}
            className="hidden md:inline-flex items-center text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-brand-600 transition-colors"
          >
            {customerName ? `Hi, ${customerName}` : 'Sign In'}
          </Link>

          {/* Book Now CTA */}
          <Link
            href="/book"
            className="hidden sm:inline-flex items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white shadow-md shadow-brand-600/25 hover:bg-brand-700 hover:shadow-lg hover:shadow-brand-600/30 h-10 px-6 transition-all duration-300"
          >
            Book Now
          </Link>

          {/* Mobile hamburger */}
          <MobileMenu customerName={customerName} />
        </div>
      </nav>
    </HeaderShell>
  );
}
