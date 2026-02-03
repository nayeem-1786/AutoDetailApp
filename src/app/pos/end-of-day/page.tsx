'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/utils/format';
import { useAuth } from '@/lib/auth/auth-provider';
import { CashCountForm } from '../components/eod/cash-count-form';
import { DaySummary } from '../components/eod/day-summary';
import {
  DrawerStatusBanner,
  closeDrawerSession,
  getLastOpeningFloat,
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
  const { employee } = useAuth();
  const [summary, setSummary] = useState<DaySummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [countedCash, setCountedCash] = useState(0);
  const [depositAmount, setDepositAmount] = useState('');
  const [nextDayFloat, setNextDayFloat] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Pre-fill next-day float from the last drawer session opening float
  useEffect(() => {
    const lastFloat = getLastOpeningFloat();
    if (lastFloat !== null && nextDayFloat === '') {
      setNextDayFloat(lastFloat.toFixed(2));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    async function fetchSummary() {
      try {
        const res = await fetch('/api/pos/end-of-day/summary');
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
  }, []);

  const handleTotalChange = useCallback((total: number) => {
    setCountedCash(total);
  }, []);

  const expectedCash = summary
    ? summary.payments_by_method.cash.amount +
      summary.payments_by_method.cash.tips
    : 0;

  const variance = countedCash - expectedCash;

  async function handleSubmit() {
    setSubmitting(true);
    try {
      const res = await fetch('/api/pos/end-of-day', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          counted_cash: countedCash,
          deposit_amount: parseFloat(depositAmount) || 0,
          next_day_float: parseFloat(nextDayFloat) || 0,
          notes,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || 'Failed to close register');
      }

      // Close the drawer session in localStorage
      closeDrawerSession();
      setDrawerOpen(false);

      toast.success('Register closed');
      setSubmitted(true);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to close register'
      );
    } finally {
      setSubmitting(false);
    }
  }

  const todayFormatted = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date());

  // Success state after register is closed
  if (submitted) {
    return (
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
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl overflow-y-auto px-4 py-6">
      {/* Drawer Status Banner */}
      <DrawerStatusBanner
        onStatusChange={(isOpen) => setDrawerOpen(isOpen)}
        employeeName={
          employee
            ? `${employee.first_name ?? ''} ${employee.last_name ?? ''}`.trim()
            : undefined
        }
      />

      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">End of Day</h1>
        <p className="mt-1 text-sm text-gray-500">{todayFormatted}</p>
      </div>

      {/* Day Summary */}
      <DaySummary summary={summary} loading={loading} />

      {/* Divider */}
      <div className="my-6 border-t border-gray-200" />

      {/* Cash Count */}
      <section>
        <h2 className="mb-3 text-lg font-semibold text-gray-900">
          Cash Count
        </h2>
        <CashCountForm onTotalChange={handleTotalChange} />
      </section>

      {/* Divider */}
      <div className="my-6 border-t border-gray-200" />

      {/* Expected vs Counted */}
      <section>
        <h2 className="mb-3 text-lg font-semibold text-gray-900">
          Expected vs Counted
        </h2>
        {summary ? (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">
                Cash Sales + Tips
              </span>
              <span className="text-sm font-medium tabular-nums text-gray-900">
                {formatCurrency(expectedCash)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Counted Cash</span>
              <span className="text-sm font-medium tabular-nums text-gray-900">
                {formatCurrency(countedCash)}
              </span>
            </div>
            <div className="border-t border-gray-200 pt-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-900">
                  Variance
                </span>
                <span
                  className={`text-sm font-bold tabular-nums ${
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
            {loading
              ? 'Loading summary...'
              : 'Complete the summary above to see expected cash.'}
          </p>
        )}
      </section>

      {/* Divider */}
      <div className="my-6 border-t border-gray-200" />

      {/* Deposit Section */}
      <section>
        <h2 className="mb-3 text-lg font-semibold text-gray-900">Deposit</h2>
        <div className="space-y-4">
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
              placeholder="0.00"
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
            />
          </div>
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

      {/* Submit */}
      <div className="mt-8 pb-8">
        <Button
          variant="default"
          size="lg"
          className="w-full"
          onClick={handleSubmit}
          disabled={submitting || submitted}
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Closing Register...
            </>
          ) : (
            'Close Register'
          )}
        </Button>
      </div>
    </div>
  );
}
