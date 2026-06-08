'use client';

/**
 * Phase 3 Theme E.3 — admin Credits tab (AC-15 operator UI).
 *
 * Self-contained tab for the customer detail page. Mirrors the Loyalty tab's
 * shape (balance card + ledger table + manual-adjust dialog) so the operator
 * UX is consistent across loyalty + credit ledger surfaces.
 *
 * Reads + writes via /api/admin/customers/[id]/credits (created in this same
 * theme). No business logic here — issuance + balance derivation live in the
 * E.1 repository the API wraps.
 */

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { FormField } from '@/components/ui/form-field';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogContent,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Wallet } from 'lucide-react';
import { formatMoney, formatDate } from '@/lib/utils/format';
import { toCents } from '@/lib/utils/money';
import { adminFetch } from '@/lib/utils/admin-fetch';
import type {
  CustomerCredit,
  CustomerCreditBalance,
  CustomerCreditReason,
} from '@/lib/credits/types';

const ISSUANCE_REASONS: { value: CustomerCreditReason; label: string }[] = [
  { value: 'manual_adjustment', label: 'Manual adjustment' },
  { value: 'goodwill', label: 'Goodwill' },
  { value: 'promotional', label: 'Promotional' },
  { value: 'refund_as_credit', label: 'Refund (as credit)' },
];

const REASON_LABELS: Record<CustomerCreditReason, string> = {
  cancellation_refund: 'Cancellation refund',
  manual_adjustment: 'Manual adjustment',
  goodwill: 'Goodwill',
  promotional: 'Promotional',
  refund_as_credit: 'Refund (as credit)',
};

function creditStatus(credit: CustomerCredit): {
  label: string;
  variant: 'success' | 'destructive' | 'warning' | 'info' | 'default';
} {
  if (credit.applied_at) return { label: 'Applied', variant: 'info' };
  if (
    credit.expires_at !== null &&
    new Date(credit.expires_at).getTime() < Date.now()
  ) {
    return { label: 'Expired', variant: 'destructive' };
  }
  return { label: 'Available', variant: 'success' };
}

export function CreditsTab({
  customerId,
  canIssue,
}: {
  customerId: string;
  canIssue: boolean;
}) {
  const [balance, setBalance] = useState<CustomerCreditBalance | null>(null);
  const [credits, setCredits] = useState<CustomerCredit[]>([]);
  const [loading, setLoading] = useState(true);
  const [issueOpen, setIssueOpen] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [amountStr, setAmountStr] = useState('');
  const [reason, setReason] = useState<CustomerCreditReason>('goodwill');
  const [reasonNote, setReasonNote] = useState('');
  const [expiresAt, setExpiresAt] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminFetch(`/api/admin/customers/${customerId}/credits`);
      const json = (await res.json()) as
        | (CustomerCreditBalance & { credits?: CustomerCredit[] })
        | { error: string };
      if (!res.ok) {
        throw new Error(
          'error' in json ? json.error : 'Failed to fetch credits'
        );
      }
      const b = json as CustomerCreditBalance;
      setBalance(b);
      // The endpoint returns total/applied + unapplied_credits. For the history
      // table we need ALL rows including applied/expired — refetch directly
      // when the endpoint hands back the structured balance only.
      // Until the endpoint exposes the full ledger, derive history from
      // unapplied_credits (active rows). Applied rows surface in transaction
      // detail views, which is sufficient for v1 of the operator UI.
      setCredits(b.unapplied_credits);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load credits');
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    load();
  }, [load]);

  function resetIssueForm() {
    setAmountStr('');
    setReason('goodwill');
    setReasonNote('');
    setExpiresAt('');
  }

  async function handleIssue() {
    const dollars = Number.parseFloat(amountStr);
    if (!Number.isFinite(dollars) || dollars <= 0) {
      toast.error('Enter a positive amount');
      return;
    }
    setIssuing(true);
    try {
      const res = await adminFetch(`/api/admin/customers/${customerId}/credits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount_cents: toCents(dollars),
          reason,
          reason_note: reasonNote.trim() || undefined,
          expires_at: expiresAt
            ? new Date(`${expiresAt}T23:59:59`).toISOString()
            : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Failed to issue credit');
      }
      toast.success(`Issued ${formatMoney(toCents(dollars))} credit`);
      setIssueOpen(false);
      resetIssueForm();
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to issue credit');
    } finally {
      setIssuing(false);
    }
  }

  if (loading) {
    return (
      <div className="py-8 text-center text-sm text-gray-500">
        Loading credits…
      </div>
    );
  }

  const available = balance?.available_balance_cents ?? 0;
  const issued = balance?.total_issued_cents ?? 0;
  const applied = balance?.total_applied_cents ?? 0;

  return (
    <div className="space-y-6">
      {/* Balance Card */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Available Balance</p>
              <p className="text-4xl font-bold text-gray-900">
                {formatMoney(available)}
              </p>
              <p className="mt-1 text-sm text-gray-500">
                Issued {formatMoney(issued)} · Applied {formatMoney(applied)}
              </p>
            </div>
            <Wallet className="h-10 w-10 text-emerald-500" />
          </div>
          {canIssue && (
            <div className="mt-4">
              <Button variant="outline" onClick={() => setIssueOpen(true)}>
                Issue Credit
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* History Table */}
      <Card>
        <CardHeader>
          <CardTitle>Credit History</CardTitle>
        </CardHeader>
        <CardContent>
          {credits.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-500">
              No credits on file. Click Issue Credit to create a manual credit.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="pb-2">Date</th>
                  <th className="pb-2">Amount</th>
                  <th className="pb-2">Reason</th>
                  <th className="pb-2">Status</th>
                  <th className="pb-2">Expires</th>
                  <th className="pb-2">Note</th>
                </tr>
              </thead>
              <tbody>
                {credits.map((c) => {
                  const status = creditStatus(c);
                  return (
                    <tr key={c.id} className="border-t border-gray-100">
                      <td className="py-2 text-gray-600">
                        {formatDate(c.created_at)}
                      </td>
                      <td className="py-2 font-medium tabular-nums">
                        {formatMoney(c.amount_cents)}
                      </td>
                      <td className="py-2 text-gray-600">
                        {REASON_LABELS[c.reason] ?? c.reason}
                      </td>
                      <td className="py-2">
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </td>
                      <td className="py-2 text-gray-500">
                        {c.expires_at ? formatDate(c.expires_at) : '—'}
                      </td>
                      <td className="py-2 text-gray-600">
                        {c.reason_note ?? '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Issue Credit Dialog */}
      <Dialog open={issueOpen} onOpenChange={setIssueOpen}>
        <DialogClose onClose={() => setIssueOpen(false)} />
        <DialogHeader>
          <DialogTitle>Issue Credit</DialogTitle>
        </DialogHeader>
        <DialogContent>
          <div className="space-y-4">
            <FormField label="Amount" htmlFor="credit_amount">
              <Input
                id="credit_amount"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                placeholder="0.00"
              />
            </FormField>

            <FormField label="Reason" htmlFor="credit_reason">
              <Select
                id="credit_reason"
                value={reason}
                onChange={(e) =>
                  setReason(e.target.value as CustomerCreditReason)
                }
              >
                {ISSUANCE_REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </Select>
            </FormField>

            <FormField
              label="Note (optional)"
              htmlFor="credit_note"
              description="Internal context — surfaces in credit history and audit log"
            >
              <Textarea
                id="credit_note"
                value={reasonNote}
                onChange={(e) => setReasonNote(e.target.value)}
                rows={3}
                placeholder="e.g. detailing redo after first appointment"
              />
            </FormField>

            <FormField
              label="Expires (optional)"
              htmlFor="credit_expires"
              description="Leave blank for no expiration"
            >
              <Input
                id="credit_expires"
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </FormField>
          </div>
        </DialogContent>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setIssueOpen(false)}
            disabled={issuing}
          >
            Cancel
          </Button>
          <Button onClick={handleIssue} disabled={issuing || !amountStr}>
            {issuing ? 'Issuing…' : 'Issue Credit'}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
