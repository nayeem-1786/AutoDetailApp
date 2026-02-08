'use client';

import { formatCurrency } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';

interface AppointmentStatsProps {
  today: { count: number; revenue: number };
  thisWeek: { count: number; revenue: number };
  pending: number;
  newBookings: number;
  bookedRevenue: number;
  activePendingFilter: boolean;
  onPendingClick: () => void;
  loading: boolean;
}

export function AppointmentStats({
  today,
  thisWeek,
  pending,
  newBookings,
  bookedRevenue,
  activePendingFilter,
  onPendingClick,
  loading,
}: AppointmentStatsProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
      {/* Today */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 border-l-4 border-l-green-500">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Today</p>
        {loading ? (
          <div className="h-8 w-24 rounded bg-gray-200 animate-pulse mt-1" />
        ) : (
          <>
            <p className="text-2xl font-bold text-gray-900 tabular-nums mt-1">{today.count}</p>
            <p className="text-xs text-gray-500 mt-1">Revenue: {formatCurrency(today.revenue)}</p>
          </>
        )}
      </div>

      {/* This Week */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 border-l-4 border-l-blue-500">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">This Week</p>
        {loading ? (
          <div className="h-8 w-24 rounded bg-gray-200 animate-pulse mt-1" />
        ) : (
          <>
            <p className="text-2xl font-bold text-gray-900 tabular-nums mt-1">{thisWeek.count}</p>
            <p className="text-xs text-gray-500 mt-1">Revenue: {formatCurrency(thisWeek.revenue)}</p>
          </>
        )}
      </div>

      {/* Pending — clickable */}
      <button
        type="button"
        onClick={onPendingClick}
        className={cn(
          'bg-white rounded-lg border border-gray-200 shadow-sm p-4 border-l-4 border-l-amber-500 text-left cursor-pointer transition-all hover:shadow-md',
          activePendingFilter && 'ring-2 ring-offset-1 ring-gray-900'
        )}
      >
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Pending</p>
        {loading ? (
          <div className="h-8 w-24 rounded bg-gray-200 animate-pulse mt-1" />
        ) : (
          <>
            <p className="text-2xl font-bold text-gray-900 tabular-nums mt-1">{pending}</p>
            <p className="text-xs text-gray-500 mt-1">needs confirmation</p>
          </>
        )}
      </button>

      {/* New Bookings */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 border-l-4 border-l-purple-500">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">New Bookings</p>
        {loading ? (
          <div className="h-8 w-24 rounded bg-gray-200 animate-pulse mt-1" />
        ) : (
          <>
            <p className="text-2xl font-bold text-gray-900 tabular-nums mt-1">{newBookings}</p>
            <p className="text-xs text-gray-500 mt-1">last 7 days</p>
          </>
        )}
      </div>

      {/* Booked Revenue */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 border-l-4 border-l-gray-400">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Booked Revenue</p>
        {loading ? (
          <div className="h-8 w-24 rounded bg-gray-200 animate-pulse mt-1" />
        ) : (
          <>
            <p className="text-2xl font-bold text-gray-900 tabular-nums mt-1">{formatCurrency(bookedRevenue)}</p>
            <p className="text-xs text-gray-500 mt-1">next 30 days</p>
          </>
        )}
      </div>
    </div>
  );
}
