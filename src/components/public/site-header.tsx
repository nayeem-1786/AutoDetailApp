import Link from 'next/link';
import { Phone, User } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { getBusinessInfo } from '@/lib/data/business';
import { formatPhone, phoneToE164 } from '@/lib/utils/format';
import { createClient } from '@/lib/supabase/server';

export async function SiteHeader() {
  const biz = await getBusinessInfo();

  // Check if the current user is a customer (for "Hello, Name" / "Sign In" link)
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
    // Not authenticated or server component without cookies — ignore
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Left: Business Name */}
        <div className="flex-shrink-0">
          <Link
            href="/"
            className="text-lg font-bold text-gray-900 dark:text-gray-100 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
          >
            {biz.name}
          </Link>
        </div>

        {/* Center: Navigation Links (hidden on mobile) */}
        <div className="hidden md:flex md:items-center md:gap-8">
          <Link
            href="/services"
            className="text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
          >
            Services
          </Link>
          <Link
            href="/products"
            className="text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
          >
            Products
          </Link>
        </div>

        {/* Right: Phone + Book Now */}
        <div className="flex items-center gap-4">
          <a
            href={`tel:${phoneToE164(biz.phone)}`}
            className="hidden sm:inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
          >
            <Phone className="h-4 w-4" />
            <span>{formatPhone(biz.phone)}</span>
          </a>
          <a
            href={`tel:${phoneToE164(biz.phone)}`}
            className="inline-flex sm:hidden items-center justify-center h-9 w-9 rounded-md text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            aria-label="Call us"
          >
            <Phone className="h-5 w-5" />
          </a>
          <Link
            href={customerName ? '/account' : '/signin'}
            className="hidden sm:inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
          >
            <User className="h-4 w-4" />
            <span>{customerName ? `Hello, ${customerName}` : 'Sign In'}</span>
          </Link>
          <Link
            href={customerName ? '/account' : '/signin'}
            className="inline-flex sm:hidden items-center justify-center h-9 w-9 rounded-md text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            aria-label={customerName ? `Hello, ${customerName}` : 'Sign In'}
          >
            <User className="h-5 w-5" />
          </Link>
          <Link
            href="/book"
            className={cn(
              'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors',
              'bg-gray-900 text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200',
              'h-9 px-4 py-2'
            )}
          >
            Book Now
          </Link>
        </div>
      </nav>

      {/* Mobile Navigation Row */}
      <div className="flex md:hidden border-t border-gray-100 dark:border-gray-800">
        <Link
          href="/services"
          className="flex-1 py-2.5 text-center text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          Services
        </Link>
        <div className="w-px bg-gray-100 dark:bg-gray-800" />
        <Link
          href="/products"
          className="flex-1 py-2.5 text-center text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          Products
        </Link>
      </div>
    </header>
  );
}
