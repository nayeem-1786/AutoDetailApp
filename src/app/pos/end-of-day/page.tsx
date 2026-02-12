'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, CheckCircle2, LockOpen, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/utils/format';
import { posFetch } from '../lib/pos-fetch';
import { usePosAuth } from '../context/pos-auth-context';
import { usePosPermission } from '../context/pos-permission-context';
import { CashCountForm } from '../components/eod/cash-count-form';
import { DaySummary } from '../components/eod/day-summary';
import {
  closeDrawerSession,
  getLastOpeningFloat,
  getDrawerSession,
  openDrawerSession,
} from '../components/eod/drawer-status';

interface DaySummaryData {
  date: string;
  total_transactions: number;
  total_revenue: number;
  total_subtotal: number;
  total_tax: number;
  total_tips: number;
  total_discounts: number;
  total_refunds: number;
  payments_by_method: {
    cash: { count: number; amount: number; tips: number };
    card: { count: number; amount: number; tips: number };
  };
}

export default function EndOfDayPage() {
  const { employee } = usePosAuth();
  const { granted: canEndOfDay } = usePosPermission('pos.end_of_day');

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Open Register state
  const [openingFloat, setOpeningFloat] = useState(0);
  const [skipChange, setSkipChange] = useState(false);

  // Close Register state
  const [summary, setSummary] = useState<DaySummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [countedCash, setCountedCash] = useState(0);
  const [depositAmount, setDepositAmount] = useState('');
  const [nextDayFloat, setNextDayFloat] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Session info for display
  const [sessionOpenedAt, setSessionOpenedAt] = useState<string | null>(null);
  const [sessionOpenedBy, setSessionOpenedBy] = useState<string | null>(null);
  const [sessionOpeningFloat, setSessionOpeningFloat] = useState(0);

  const employeeName = employee
    ? `${employee.first_name ?? ''} ${employee.last_name ?? ''}`.trim()
    : 'Staff';

  // Load drawer state from localStorage
  useEffect(() => {
    const session = getDrawerSession();
    if (session && session.status === 'open') {
      setDrawerOpen(true);
      setSessionOpenedAt(session.openedAt);
      setSessionOpenedBy(session.openedBy);
      setSessionOpeningFloat(session.openingFloat);
    } else {
      setDrawerOpen(false);
    }

    // Pre-fill next-day float from last session
    const lastFloat = getLastOpeningFloat();
    if (lastFloat !== null) {
      setNextDayFloat(lastFloat.toFixed(2));
    }

    setMounted(true);
  }, []);

  // Fetch day summary when in Close mode
  useEffect(() => {
    if (!drawerOpen) {
      setLoading(false);
      return;
    }
    async function fetchSummary() {
      try {
        const res = await posFetch('/api/pos/end-of-day/summary');
        const json = await res.json();
        if (res.ok && json.data) {
          setSummary(json.data);
        }
      } catch {
        toast.error('Failed to load day summary');
      } finally {
        setLoading(false);
      }
    }
    fetchSummary();
  }, [drawerOpen]);

  const handleOpeningFloatChange = useCallback((total: number) => {
    setOpeningFloat(total);
  }, []);

  const handleCountedCashChange = useCallback((total: number) => {
    setCountedCash(total);
  }, []);

  // Expected cash = opening float + cash sales + cash tips
  const cashSales = summary
    ? summary.payments_by_method.cash.amount + summary.payments_by_method.cash.tips
    : 0;
  const expectedCash = sessionOpeningFloat + cashSales;
  const variance = countedCash - expectedCash;

  // Auto-calculate deposit = counted cash - next-day float
  const nextDayFloatNum = parseFloat(nextDayFloat) || 0;
  const autoDeposit = Math.max(0, countedCash - nextDayFloatNum);

  function handleOpenRegister() {
    openDrawerSession(openingFloat, employeeName);
    setDrawerOpen(true);
    setSessionOpenedAt(new Date().toISOString());
    setSessionOpenedBy(employeeName);
    setSessionOpeningFloat(openingFloat);
    setLoading(true);
    toast.success('Register opened');

    // Trigger storage event for other components (e.g., bottom nav)
    window.dispatchEvent(new StorageEvent('storage', {
      key: 'pos_drawer_session',
      newValue: localStorage.getItem('pos_drawer_session'),
    }));

    // Fetch summary for the close view
    (async () => {
      try {
        const res = await posFetch('/api/pos/end-of-day/summary');
        const json = await res.json();
        if (res.ok && json.data) {
          setSummary(json.data);
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }

  async function handleCloseRegister() {
    setSubmitting(true);
    try {
      const res = await posFetch('/api/pos/end-of-day', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          counted_cash: countedCash,
          deposit_amount: parseFloat(depositAmount) || autoDeposit,
          next_day_float: nextDayFloatNum,
          notes,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || 'Failed to close register');
      }

      closeDrawerSession();
      toast.success('Register closed');
      setSubmitted(true);

      // Trigger storage event for other components
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'pos_drawer_session',
        newValue: localStorage.getItem('pos_drawer_session'),
      }));
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to close register'
      );
    } finally {
      setSubmitting(false);
    }
  }

  function handleReopenFromSuccess() {
    setSubmitted(false);
    setDrawerOpen(false);
    setCountedCash(0);
    setDepositAmount('');
    setNotes('');
    setSummary(null);
    setSkipChange(false);
  }

  const todayFormatted = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date());

  // Avoid hydration mismatch
  if (!mounted) {
    return (
      <div className="flex h-full items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  // Success state after register is closed
  if (submitted) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-2xl px-4 py-6">
          <div className="rounded-lg border border-green-200 bg-green-50 p-8 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-green-600" />
            <h2 className="mt-4 text-xl font-bold text-gray-900">
              Register Closed
            </h2>
            <p className="mt-2 text-sm text-gray-600">{todayFormatted}</p>
            <div className="mt-4 space-y-1">
              <p className="text-sm text-gray-600">
                Counted Cash:{' '}
                <span className="font-medium tabular-nums text-gray-900">
                  {formatCurrency(countedCash)}
                </span>
              </p>
              <p className="text-sm text-gray-600">
                Expected Cash:{' '}
                <span className="font-medium tabular-nums text-gray-900">
                  {formatCurrency(expectedCash)}
                </span>
              </p>
              <p className="text-sm text-gray-600">
                Variance:{' '}
                <span
                  className={`font-bold tabular-nums ${
                    variance > 0
                      ? 'text-green-600'
                      : variance < 0
                        ? 'text-red-600'
                        : 'text-gray-900'
                  }`}
                >
                  {variance >= 0 ? '+' : ''}
                  {formatCurrency(variance)}
                </span>
              </p>
            </div>
            <div className="mt-6">
              <Button variant="outline" onClick={handleReopenFromSuccess}>
                Open New Register
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Mode A: Open Register ───────────────────────────────────────────
  if (!drawerOpen) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-2xl px-4 py-6 pb-8">
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            {/* Header */}
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50">
                <LockOpen className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Open Register</h1>
                <p className="text-sm text-gray-500">{todayFormatted}</p>
              </div>
            </div>

            {/* Cash count for starting float */}
            <div className="mt-6">
              <CashCountForm
                onTotalChange={handleOpeningFloatChange}
                title="Count Starting Float"
                skipChange={skipChange}
              />
            </div>

            {/* Skip change checkbox */}
            <label className="mt-4 flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={skipChange}
                onChange={(e) => setSkipChange(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-600">Skip counting change (coins)</span>
            </label>

            {/* Open Register button */}
            <div className="mt-6">
              <Button
                size="lg"
                className="w-full bg-green-600 hover:bg-green-700"
                onClick={handleOpenRegister}
              >
                <LockOpen className="mr-2 h-4 w-4" />
                Open Register — {formatCurrency(openingFloat)}
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Mode B: Close Register ──────────────────────────────────────────
  const openedTime = sessionOpenedAt
    ? new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      }).format(new Date(sessionOpenedAt))
    : '';

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl px-4 py-6 pb-8">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-50">
              <Lock className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Close Register</h1>
              <p className="text-sm text-gray-500">{todayFormatted}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500">
              Opened at {openedTime}
            </p>
            <p className="text-xs text-gray-500">
              by {sessionOpenedBy} &middot; Float: {formatCurrency(sessionOpeningFloat)}
            </p>
          </div>
        </div>

        {/* Section 1: Day Summary */}
        <section className="mb-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Day Summary
          </h2>
          <DaySummary summary={summary} loading={loading} />
        </section>

        {/* Access control: permission gated */}
        {!canEndOfDay ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-6 text-center">
            <Lock className="mx-auto h-8 w-8 text-amber-500" />
            <p className="mt-2 text-sm font-medium text-amber-800">
              Manager access required to close the register.
            </p>
            <p className="mt-1 text-xs text-amber-600">
              Ask a manager to close out for the day.
            </p>
          </div>
        ) : (
          <>
            {/* Section 2: Count Your Drawer */}
            <section className="mb-6">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
                Count Your Drawer
              </h2>
              <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <CashCountForm onTotalChange={handleCountedCashChange} />
              </div>
            </section>

            {/* Section 3: Reconciliation */}
            <section className="mb-6">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
                Reconciliation
              </h2>
              <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                {summary ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Opening Float</span>
                      <span className="text-sm font-medium tabular-nums text-gray-900">
                        {formatCurrency(sessionOpeningFloat)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Cash Sales + Tips</span>
                      <span className="text-sm font-medium tabular-nums text-gray-900">
                        {formatCurrency(cashSales)}
                      </span>
                    </div>
                    <div className="border-t border-gray-100 pt-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-gray-900">Expected Cash</span>
                        <span className="text-sm font-bold tabular-nums text-gray-900">
                          {formatCurrency(expectedCash)}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Counted Cash</span>
                      <span className="text-sm font-medium tabular-nums text-gray-900">
                        {formatCurrency(countedCash)}
                      </span>
                    </div>
                    <div className="border-t border-gray-100 pt-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-gray-900">
                          Variance {variance > 0 ? '(Over)' : variance < 0 ? '(Short)' : ''}
                        </span>
                        <span
                          className={`text-lg font-bold tabular-nums ${
                            variance > 0
                              ? 'text-green-600'
                              : variance < 0
                                ? 'text-red-600'
                                : 'text-gray-900'
                          }`}
                        >
                          {variance >= 0 ? '+' : ''}
                          {formatCurrency(variance)}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">
                    {loading ? 'Loading summary...' : 'No sales data available.'}
                  </p>
                )}
              </div>
            </section>

            {/* Section 4: Close Out */}
            <section className="mb-6">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
                Close Out
              </h2>
              <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-4">
                <div>
                  <label
                    htmlFor="next-day-float"
                    className="mb-1 block text-sm font-medium text-gray-700"
                  >
                    Next Day Float
                  </label>
                  <Input
                    id="next-day-float"
                    type="number"
                    min={0}
                    step={0.01}
                    placeholder="0.00"
                    value={nextDayFloat}
                    onChange={(e) => setNextDayFloat(e.target.value)}
                  />
                </div>
                <div>
                  <label
                    htmlFor="deposit-amount"
                    className="mb-1 block text-sm font-medium text-gray-700"
                  >
                    Deposit Amount
                  </label>
                  <Input
                    id="deposit-amount"
                    type="number"
                    min={0}
                    step={0.01}
                    placeholder={autoDeposit.toFixed(2)}
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                  />
                  <p className="mt-1 text-xs text-gray-400">
                    Auto-calculated: {formatCurrency(autoDeposit)} (counted − next-day float)
                  </p>
                </div>
                <div>
                  <label
                    htmlFor="eod-notes"
                    className="mb-1 block text-sm font-medium text-gray-700"
                  >
                    Notes
                  </label>
                  <textarea
                    id="eod-notes"
                    rows={3}
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-1"
                    placeholder="Any notes for this day..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
              </div>
            </section>

            {/* Close Register Button */}
            <div className="pb-8">
              <Button
                size="lg"
                className="w-full bg-red-600 hover:bg-red-700"
                onClick={handleCloseRegister}
                disabled={submitting}
              >
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Closing Register...
                  </>
                ) : (
                  <>
                    <Lock className="mr-2 h-4 w-4" />
                    Close Register
                  </>
                )}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
