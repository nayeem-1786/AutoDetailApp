'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LogOut,
  ShoppingCart,
  Receipt,
  CalendarClock,
  MoreHorizontal,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useAuth } from '@/lib/auth/auth-provider';
import { useTicket } from '../context/ticket-context';
import { useCheckout } from '../context/checkout-context';
import { clearPosSession } from '../pos-shell';

export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { employee, signOut } = useAuth();
  const { ticket } = useTicket();
  const { openCheckout } = useCheckout();

  const itemCount = ticket.items.length;
  const initials = employee
    ? `${employee.first_name?.[0] ?? ''}${employee.last_name?.[0] ?? ''}`.toUpperCase()
    : '';

  function handleCheckout() {
    if (itemCount > 0) {
      openCheckout();
    }
  }

  async function handleLogout() {
    clearPosSession();
    await signOut();
    router.replace('/pos/login');
  }

  return (
    <nav className="flex h-14 shrink-0 items-center justify-around border-t border-gray-200 bg-white px-2">
      {/* Log out */}
      <button
        onClick={handleLogout}
        className="flex flex-col items-center gap-0.5 px-3 py-1 text-gray-500 hover:text-gray-800"
      >
        <LogOut className="h-5 w-5" />
        <span className="text-[10px] font-medium leading-tight">{initials || 'Out'}</span>
      </button>

      {/* Checkout */}
      <button
        onClick={handleCheckout}
        className={cn(
          'relative flex flex-col items-center gap-0.5 px-3 py-1',
          itemCount > 0 ? 'text-gray-800' : 'text-gray-400'
        )}
      >
        <div className="relative">
          <ShoppingCart className="h-5 w-5" />
          {itemCount > 0 && (
            <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
              {itemCount}
            </span>
          )}
        </div>
        <span className="text-[10px] font-medium leading-tight">Checkout</span>
      </button>

      {/* Transactions */}
      <Link
        href="/pos/transactions"
        className={cn(
          'flex flex-col items-center gap-0.5 px-3 py-1',
          pathname.startsWith('/pos/transactions') ? 'text-blue-600' : 'text-gray-500 hover:text-gray-800'
        )}
      >
        <Receipt className="h-5 w-5" />
        <span className="text-[10px] font-medium leading-tight">Txns</span>
      </Link>

      {/* End of Day */}
      <Link
        href="/pos/end-of-day"
        className={cn(
          'flex flex-col items-center gap-0.5 px-3 py-1',
          pathname === '/pos/end-of-day' ? 'text-blue-600' : 'text-gray-500 hover:text-gray-800'
        )}
      >
        <CalendarClock className="h-5 w-5" />
        <span className="text-[10px] font-medium leading-tight">EOD</span>
      </Link>

      {/* More */}
      <button className="flex flex-col items-center gap-0.5 px-3 py-1 text-gray-500 hover:text-gray-800">
        <MoreHorizontal className="h-5 w-5" />
        <span className="text-[10px] font-medium leading-tight">More</span>
      </button>
    </nav>
  );
}
