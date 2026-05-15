'use client';

import { formatCurrency } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import { Info } from 'lucide-react';

interface CustomerStatsProps {
  total: number;
  newThisMonth: number;
  repeatCount: number;
  repeatRate: number;
  lifetimeRevenue: number;
  avgPerCustomer: number;
  atRiskCount: number;
  uncategorizedCount: number;
  activeAtRiskFilter: boolean;
  activeUncategorizedFilter: boolean;
  onAtRiskClick: () => void;
  onUncategorizedClick: () => void;
  loading: boolean;
}

export function CustomerStats({
  total,
  newThisMonth,
  repeatCount,
  repeatRate,
  lifetimeRevenue,
  avgPerCustomer,
  atRiskCount,
  uncategorizedCount,
  activeAtRiskFilter,
  activeUncategorizedFilter,
  onAtRiskClick,
  onUncategorizedClick,
  loading,
}: CustomerStatsProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
      {/* Total Customers */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 border-l-4 border-l-blue-500">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Total Customers</p>
        {loading ? (
          <div className="h-8 w-24 rounded bg-gray-200 animate-pulse mt-1" />
        ) : (
          <>
            <p className="text-2xl font-bold text-gray-900 tabular-nums mt-1">{total}</p>
            <p className="text-xs text-gray-500 mt-1">{newThisMonth} new this month</p>
          </>
        )}
      </div>

      {/* Repeat Rate */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 border-l-4 border-l-green-500">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Repeat Rate</p>
        {loading ? (
          <div className="h-8 w-24 rounded bg-gray-200 animate-pulse mt-1" />
        ) : (
          <>
            <p className="text-2xl font-bold text-gray-900 tabular-nums mt-1">{repeatRate}%</p>
            <p className="text-xs text-gray-500 mt-1">{repeatCount} with 2+ visits</p>
          </>
        )}
      </div>

      {/* Lifetime Revenue */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 border-l-4 border-l-purple-500">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
          Lifetime Revenue
          <span className="relative inline-block ml-1 align-middle group">
            <Info className="h-3.5 w-3.5 text-gray-400 hover:text-gray-600 cursor-help" />
            <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-[60] hidden w-max max-w-[250px] rounded-lg bg-gray-900 px-3 py-2 text-xs font-normal normal-case text-white shadow-lg group-hover:block">
              Sum of lifetime spend across all named customers. This is lower than total transaction revenue because it excludes anonymous walk-in transactions.
            </span>
          </span>
        </p>
        {loading ? (
          <div className="h-8 w-24 rounded bg-gray-200 animate-pulse mt-1" />
        ) : (
          <>
            <p className="text-2xl font-bold text-gray-900 tabular-nums mt-1">{formatCurrency(lifetimeRevenue)}</p>
            <p className="text-xs text-gray-500 mt-1">{formatCurrency(avgPerCustomer)} avg per customer</p>
          </>
        )}
      </div>

      {/* At Risk — clickable */}
      <button
        type="button"
        onClick={onAtRiskClick}
        className={cn(
          'bg-white rounded-lg border border-gray-200 shadow-sm p-4 border-l-4 border-l-amber-500 text-left cursor-pointer transition-all hover:shadow-md',
          activeAtRiskFilter && 'ring-2 ring-offset-1 ring-gray-900'
        )}
      >
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">At Risk</p>
        {loading ? (
          <div className="h-8 w-24 rounded bg-gray-200 animate-pulse mt-1" />
        ) : (
          <>
            <p className="text-2xl font-bold text-gray-900 tabular-nums mt-1">{atRiskCount}</p>
            <p className="text-xs text-gray-500 mt-1">no visit in 90+ days</p>
          </>
        )}
      </button>

      {/* Uncategorized — clickable */}
      <button
        type="button"
        onClick={onUncategorizedClick}
        className={cn(
          'bg-white rounded-lg border border-gray-200 shadow-sm p-4 border-l-4 border-l-red-500 text-left cursor-pointer transition-all hover:shadow-md',
          activeUncategorizedFilter && 'ring-2 ring-offset-1 ring-gray-900'
        )}
      >
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Uncategorized</p>
        {loading ? (
          <div className="h-8 w-24 rounded bg-gray-200 animate-pulse mt-1" />
        ) : (
          <>
            <p className="text-2xl font-bold text-gray-900 tabular-nums mt-1">{uncategorizedCount}</p>
            <p className="text-xs text-gray-500 mt-1">no customer type set</p>
          </>
        )}
      </button>
    </div>
  );
}
