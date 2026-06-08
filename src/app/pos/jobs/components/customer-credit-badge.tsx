'use client';

/**
 * Phase 3 Theme E.3 — passive credit-balance badge for POS appointment view.
 *
 * At-a-glance display of unapplied credit balance on the customer card. Reads
 * via /api/admin/customers/[id]/credits (E.3 GET endpoint) and renders nothing
 * when the customer has zero balance — operators see the badge only when it's
 * actionable. Read-only; the actual apply path lives on the payment-complete
 * screen where a finalized transaction id exists.
 */

import { useEffect, useState } from 'react';
import { Wallet } from 'lucide-react';
import { formatMoney } from '@/lib/utils/format';
import { posFetch } from '../../lib/pos-fetch';

export function CustomerCreditBadge({ customerId }: { customerId: string }) {
  const [availableCents, setAvailableCents] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await posFetch(`/api/admin/customers/${customerId}/credits`);
        if (!res.ok) return;
        const json = await res.json();
        if (cancelled) return;
        setAvailableCents(
          typeof json.available_balance_cents === 'number'
            ? json.available_balance_cents
            : 0
        );
      } catch {
        // Silent failure — badge is informational; absence is acceptable.
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [customerId]);

  if (availableCents === null || availableCents <= 0) return null;

  return (
    <div
      className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 dark:bg-emerald-900/30 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400"
      title="Customer has unapplied credit on file"
    >
      <Wallet className="h-3 w-3" />
      {formatMoney(availableCents)} credit available
    </div>
  );
}
