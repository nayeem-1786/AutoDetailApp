import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticatePosRequest } from '@/lib/pos/api-auth';
import { requirePermission } from '@/lib/auth/require-permission';
import { refundCreateSchema } from '@/lib/utils/validation';
import type { RefundDisposition } from '@/lib/utils/validation';
import Stripe from 'stripe';
import { logAudit, getRequestIp } from '@/lib/services/audit';
import {
  computeTotalRefundCents,
  fromCents,
  toCents,
} from '@/lib/utils/refund-math';
import { logStockAdjustment } from '@/lib/utils/stock-adjustments';
import type { AdjustmentType } from '@/lib/utils/stock-adjustments';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(request: NextRequest) {
  try {
    const posEmployee = await authenticatePosRequest(request);
    if (!posEmployee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const denied = await requirePermission(posEmployee.employee_id, 'pos.issue_refunds');
    if (denied) return denied;

    const supabase = createAdminClient();

    const body = await request.json();
    const parsed = refundCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues.map((i) => i.message).join(', ') },
        { status: 400 }
      );
    }

    const data = parsed.data;

    // Normalize disposition: new clients send disposition directly;
    // cached PWA clients may send legacy restock boolean instead.
    const normalizedItems = data.items.map((item) => {
      const disposition: RefundDisposition =
        item.disposition ??
        (item.restock === true ? 'restock' : 'customer_retained');
      return { ...item, disposition };
    });

    // Fetch the transaction with payments
    const { data: transaction, error: txError } = await supabase
      .from('transactions')
      .select('*, payments(*)')
      .eq('id', data.transaction_id)
      .single();

    if (txError || !transaction) {
      return NextResponse.json(
        { error: 'Transaction not found' },
        { status: 404 }
      );
    }

    // Verify transaction status allows refunds
    if (!['completed', 'partial_refund'].includes(transaction.status)) {
      return NextResponse.json(
        { error: 'Transaction cannot be refunded (status: ' + transaction.status + ')' },
        { status: 400 }
      );
    }

    // Bulk fetch transaction_items — needed for server-side refund math
    // recompute. See src/lib/utils/refund-math.ts invariants.
    const { data: txItems, error: txItemsError } = await supabase
      .from('transaction_items')
      .select('id, unit_price, quantity, tax_amount')
      .eq('transaction_id', data.transaction_id);

    if (txItemsError || !txItems) {
      console.error('Transaction items fetch error:', txItemsError);
      return NextResponse.json(
        { error: 'Failed to load transaction items' },
        { status: 500 }
      );
    }

    const itemsById = new Map(
      txItems.map((row) => [row.id as string, row])
    );

    // Validate every payload item resolves to a real transaction_item row
    for (const payloadItem of data.items) {
      if (!itemsById.has(payloadItem.transaction_item_id)) {
        return NextResponse.json(
          { error: `Unknown transaction_item_id: ${payloadItem.transaction_item_id}` },
          { status: 400 }
        );
      }
    }

    // Recompute refund amounts server-side from stored transaction_items.
    // Client-sent amounts are validated input; server values are authoritative
    // on write.
    const tipRefund = data.tip_refund ?? 0;
    const recomputed = computeTotalRefundCents({
      transaction: {
        subtotal: transaction.subtotal,
        discount_amount: transaction.discount_amount || 0,
        tip_amount: transaction.tip_amount || 0,
      },
      items: data.items.map((payloadItem) => {
        const row = itemsById.get(payloadItem.transaction_item_id)!;
        return {
          unit_price: row.unit_price,
          quantity: row.quantity,
          tax_amount: row.tax_amount || 0,
          refund_quantity: payloadItem.quantity,
        };
      }),
      tip_refund: tipRefund,
    });

    // Per-line exact-match check (tolerance 0). Both client and server use the
    // shared helper — any disagreement indicates a bug, not rounding drift.
    for (let i = 0; i < data.items.length; i++) {
      const clientCents = toCents(data.items[i].amount);
      const serverCents = recomputed.lineAmountsCents[i];
      if (clientCents !== serverCents) {
        return NextResponse.json(
          {
            error: `Refund line ${i + 1} amount mismatch: expected $${fromCents(
              serverCents
            ).toFixed(2)}, got $${fromCents(clientCents).toFixed(2)}`,
          },
          { status: 400 }
        );
      }
    }

    const totalRefundAmount = fromCents(recomputed.totalCents);

    // Allow $0 refunds when there's loyalty, coupon, or restock to reverse
    const hasLoyaltyToReverse = (transaction.loyalty_points_redeemed > 0 || transaction.loyalty_points_earned > 0);
    const hasCouponToReverse = !!transaction.coupon_id;
    const hasItemsToRestock = data.items.some((item) => item.restock);

    if (recomputed.totalCents <= 0 && !hasLoyaltyToReverse && !hasCouponToReverse && !hasItemsToRestock) {
      return NextResponse.json(
        { error: 'Nothing to refund — no payment, loyalty points, or items to restock' },
        { status: 400 }
      );
    }

    // ─────────────────────────────────────────────────────────────────────
    // Close-out detection (Pay-Link Session 5c).
    // The notes prefix is the primary signal — Session 4b writes it
    // explicitly. The empty/insufficient-payments branch is a defensive
    // secondary, in case someone routes a non-close-out tx through this path
    // with no payments (shouldn't happen, but cheaper to guard than to debug).
    //
    // For close-outs, the money lives across sibling completed transactions
    // on the same appointment. We refund LIFO (most recent first), one Stripe
    // call per source, persist a JSON breakdown in refunds.notes, and update
    // each touched source's status independently. Mid-flight failure persists
    // the partial-success state honestly — Stripe doesn't allow rollback.
    // ─────────────────────────────────────────────────────────────────────
    const isCloseOut =
      transaction.notes === 'Closed out — fully pre-paid' ||
      (transaction.appointment_id != null &&
        (transaction.payments ?? []).reduce(
          (s: number, p: { amount: number }) => s + toCents(p.amount),
          0
        ) < recomputed.totalCents);

    // Source-of-money refund plan. For non-close-out: a single entry pointing
    // at this transaction (preserves the existing single-source flow). For
    // close-out: LIFO list of sibling completed transactions on the same
    // appointment, each annotated with its remaining refundable cents.
    interface SourcePlan {
      transaction_id: string;
      payments: Array<{ method: string; amount: number; stripe_payment_intent_id: string | null }>;
      remaining_refundable_cents: number;
      total_amount: number;
      tip_amount: number;
    }
    const sourcePlan: SourcePlan[] = [];

    if (isCloseOut && transaction.appointment_id) {
      // Gather sibling completed transactions on the same appointment, newest
      // first. Exclude already-fully-refunded sources.
      const { data: siblings } = await supabase
        .from('transactions')
        .select('id, total_amount, tip_amount, status, payments(*)')
        .eq('appointment_id', transaction.appointment_id)
        .eq('status', 'completed')
        .neq('id', transaction.id)
        .order('transaction_date', { ascending: false });

      for (const sib of (siblings ?? []) as Array<{
        id: string;
        total_amount: number;
        tip_amount: number;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        payments?: any[];
      }>) {
        const sibPaidCents = (sib.payments ?? []).reduce(
          (s: number, p: { amount: number }) => s + toCents(p.amount),
          0
        );
        if (sibPaidCents <= 0) continue;
        // Subtract any prior refunds against this source.
        const { data: priorRefunds } = await supabase
          .from('refunds')
          .select('amount')
          .eq('transaction_id', sib.id)
          .eq('status', 'processed');
        const priorRefundedCents = (priorRefunds ?? []).reduce(
          (s: number, r: { amount: number }) => s + toCents(r.amount),
          0
        );
        const remaining = Math.max(0, sibPaidCents - priorRefundedCents);
        if (remaining <= 0) continue;
        sourcePlan.push({
          transaction_id: sib.id,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          payments: (sib.payments ?? []) as any[],
          remaining_refundable_cents: remaining,
          total_amount: sib.total_amount,
          tip_amount: sib.tip_amount || 0,
        });
      }

      const totalAvailableCents = sourcePlan.reduce(
        (s, sp) => s + sp.remaining_refundable_cents,
        0
      );

      if (recomputed.totalCents > totalAvailableCents + 1) {
        return NextResponse.json(
          {
            error: `Refund amount ($${fromCents(recomputed.totalCents).toFixed(
              2
            )}) exceeds available refundable across appointment sources ($${fromCents(
              totalAvailableCents
            ).toFixed(2)})`,
          },
          { status: 400 }
        );
      }

      // Pre-flight: each source we'll touch must be refundable. For card
      // payments, that means a non-null stripe_payment_intent_id. For cash,
      // we just record it. Walk LIFO until requested cents are covered, and
      // bail loudly if we hit a card source without a PI.
      let need = recomputed.totalCents;
      for (const sp of sourcePlan) {
        if (need <= 0) break;
        const portion = Math.min(need, sp.remaining_refundable_cents);
        const cardPmt = sp.payments.find((p) => p.method === 'card');
        if (cardPmt && !cardPmt.stripe_payment_intent_id) {
          return NextResponse.json(
            {
              error: `Source transaction ${sp.transaction_id} is missing Stripe PaymentIntent — cannot refund. Contact support.`,
              code: 'refund_source_missing_pi',
            },
            { status: 400 }
          );
        }
        need -= portion;
      }
    } else {
      // Single-source path: aggregate cap vs THIS transaction.
      if (recomputed.totalCents > 0) {
        const { data: existingRefunds } = await supabase
          .from('refunds')
          .select('amount')
          .eq('transaction_id', data.transaction_id)
          .eq('status', 'processed');
        const alreadyRefundedCents = (existingRefunds || []).reduce(
          (sum: number, r: { amount: number }) => sum + toCents(r.amount),
          0
        );
        const maxRefundableCents =
          toCents(transaction.total_amount) +
          toCents(transaction.tip_amount || 0) -
          alreadyRefundedCents;
        if (recomputed.totalCents > maxRefundableCents + 1) {
          return NextResponse.json(
            {
              error: `Refund amount ($${fromCents(
                recomputed.totalCents
              ).toFixed(2)}) exceeds maximum refundable ($${fromCents(
                maxRefundableCents
              ).toFixed(2)})`,
            },
            { status: 400 }
          );
        }
      }
      // Single-source plan: this transaction.
      sourcePlan.push({
        transaction_id: transaction.id,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        payments: (transaction.payments ?? []) as any[],
        remaining_refundable_cents:
          toCents(transaction.total_amount) + toCents(transaction.tip_amount || 0),
        total_amount: transaction.total_amount,
        tip_amount: transaction.tip_amount || 0,
      });
    }

    // 1. Walk the source plan LIFO, issuing Stripe refunds for card sources.
    // For close-out: multiple sources; for single-source: at most one card
    // payment (existing behavior preserved).
    interface RefundedSource {
      transaction_id: string;
      stripe_pi: string | null;
      stripe_refund_id: string | null;
      amount: number;
      method: string;
    }
    const refundedSources: RefundedSource[] = [];
    let stripeRefundId: string | null = null; // primary id for the refunds row
    let remainingNeedCents = recomputed.totalCents;
    let stripeFailure: { transaction_id: string; error: string } | null = null;

    for (const sp of sourcePlan) {
      if (remainingNeedCents <= 0) break;
      const portionCents = Math.min(remainingNeedCents, sp.remaining_refundable_cents);
      const portionDollars = fromCents(portionCents);
      const cardPmt = sp.payments.find((p) => p.method === 'card');

      if (cardPmt && cardPmt.stripe_payment_intent_id && portionCents > 0) {
        // Cap at the card payment amount (rest was cash/check on this source)
        const stripeAmountCents = Math.min(portionCents, toCents(cardPmt.amount || 0));
        if (stripeAmountCents > 0) {
          try {
            const stripeRefund = await stripe.refunds.create({
              payment_intent: cardPmt.stripe_payment_intent_id,
              amount: stripeAmountCents,
            });
            if (!stripeRefundId) stripeRefundId = stripeRefund.id;
            refundedSources.push({
              transaction_id: sp.transaction_id,
              stripe_pi: cardPmt.stripe_payment_intent_id,
              stripe_refund_id: stripeRefund.id,
              amount: fromCents(stripeAmountCents),
              method: 'card',
            });
            remainingNeedCents -= stripeAmountCents;
          } catch (stripeErr) {
            console.error('Stripe refund error (close-out source):', stripeErr);
            stripeFailure = {
              transaction_id: sp.transaction_id,
              error: stripeErr instanceof Error ? stripeErr.message : 'Stripe error',
            };
            break;
          }
        }
        // Cash portion (if any) on this source after the card cap is covered
        const cashPortion = portionCents - stripeAmountCents;
        if (cashPortion > 0 && remainingNeedCents > 0) {
          refundedSources.push({
            transaction_id: sp.transaction_id,
            stripe_pi: null,
            stripe_refund_id: null,
            amount: fromCents(cashPortion),
            method: 'cash',
          });
          remainingNeedCents -= cashPortion;
        }
      } else if (portionCents > 0) {
        // Cash/check source — no Stripe call, just record the portion
        refundedSources.push({
          transaction_id: sp.transaction_id,
          stripe_pi: null,
          stripe_refund_id: null,
          amount: portionDollars,
          method: cardPmt ? 'card' : (sp.payments[0]?.method ?? 'cash'),
        });
        remainingNeedCents -= portionCents;
      }
    }

    // If Stripe failed mid-flight AND nothing succeeded yet, abort hard (no
    // partial state to commit). Otherwise persist what moved + return a
    // partial-success payload so staff knows manual recovery is needed.
    if (stripeFailure && refundedSources.length === 0) {
      return NextResponse.json(
        { error: 'Stripe refund failed. No records created.' },
        { status: 500 }
      );
    }
    const committedRefundCents = recomputed.totalCents - remainingNeedCents;
    const committedRefundAmount = fromCents(committedRefundCents);

    // 2. Insert refund record. amount = what actually moved (partial-success
    // case persists committed cents only). notes = JSON breakdown of source
    // transactions touched (NULL for traditional single-source flow).
    const refundNotes =
      isCloseOut || refundedSources.length > 1
        ? JSON.stringify({ sources: refundedSources })
        : null;
    const { data: refund, error: refundError } = await supabase
      .from('refunds')
      .insert({
        transaction_id: data.transaction_id,
        status: 'processed',
        amount: committedRefundAmount,
        reason: data.reason,
        processed_by: posEmployee.employee_id,
        stripe_refund_id: stripeRefundId,
        notes: refundNotes,
      })
      .select('*')
      .single();

    if (refundError || !refund) {
      console.error('Refund insert error:', refundError);
      return NextResponse.json(
        { error: 'Failed to create refund record' },
        { status: 500 }
      );
    }

    // 3. Insert refund items (server-computed amounts; client values were
    //    validated input only)
    const refundItemRows = normalizedItems.map((item, i) => ({
      refund_id: refund.id,
      transaction_item_id: item.transaction_item_id,
      quantity: item.quantity,
      amount: fromCents(recomputed.lineAmountsCents[i]),
      restock: item.disposition === 'restock',
      disposition: item.disposition,
    }));

    const { error: refundItemsError } = await supabase
      .from('refund_items')
      .insert(refundItemRows);

    if (refundItemsError) {
      console.error('Refund items insert error:', refundItemsError);
    }

    // 4. Inventory handling per disposition.
    // - restock: increment products.quantity_on_hand, log 'returned' adjustment
    // - damaged: no quantity change, log 'damaged' adjustment (quantity_change=0)
    // - customer_retained: no quantity change, log 'customer_retained' adjustment (quantity_change=0)
    // Non-product refund items skip this block entirely.
    for (const item of normalizedItems) {
      const { data: txItem } = await supabase
        .from('transaction_items')
        .select('product_id')
        .eq('id', item.transaction_item_id)
        .single();

      if (!txItem?.product_id) continue;

      const { data: prod } = await supabase
        .from('products')
        .select('quantity_on_hand, cost_price')
        .eq('id', txItem.product_id)
        .single();
      if (!prod) continue;

      const before = prod.quantity_on_hand;
      let after = before;
      let adjustmentType: AdjustmentType;
      let reasonPrefix: string;

      if (item.disposition === 'restock') {
        after = before + item.quantity;
        await supabase
          .from('products')
          .update({ quantity_on_hand: after })
          .eq('id', txItem.product_id);
        adjustmentType = 'returned';
        reasonPrefix = 'Refund — restocked';
      } else if (item.disposition === 'damaged') {
        adjustmentType = 'damaged';
        reasonPrefix = 'Refund — damaged / not resellable';
      } else {
        adjustmentType = 'customer_retained';
        reasonPrefix = 'Refund — customer kept item';
      }

      await logStockAdjustment({
        supabase,
        product_id: txItem.product_id,
        adjustment_type: adjustmentType,
        quantity_change: after - before,
        quantity_before: before,
        quantity_after: after,
        reason: `${reasonPrefix} (refund ${refund.id})`,
        reference_id: refund.id,
        reference_type: 'refund',
        created_by: posEmployee.employee_id,
        unit_cost: prod.cost_price ?? null,
      });
    }

    // 5. Adjust loyalty points if applicable
    let clawbackPoints = 0;
    let restoredPoints = 0;

    if (transaction.customer_id && (transaction.loyalty_points_redeemed > 0 || transaction.loyalty_points_earned > 0)) {
      // Get current customer balance
      const { data: customer } = await supabase
        .from('customers')
        .select('loyalty_points_balance')
        .eq('id', transaction.customer_id)
        .single();

      if (customer) {
        let runningBalance = customer.loyalty_points_balance;
        const txFullAmount = transaction.total_amount + (transaction.tip_amount || 0);
        const isFullRefund = totalRefundAmount >= txFullAmount;

        // 5a. Restore redeemed points
        if (transaction.loyalty_points_redeemed > 0) {
          restoredPoints = isFullRefund
            ? transaction.loyalty_points_redeemed
            : Math.floor(transaction.loyalty_points_redeemed * (totalRefundAmount / transaction.total_amount));

          if (restoredPoints > 0) {
            runningBalance = runningBalance + restoredPoints;

            await supabase.from('loyalty_ledger').insert({
              customer_id: transaction.customer_id,
              transaction_id: transaction.id,
              action: 'adjusted',
              points_change: restoredPoints,
              points_balance: runningBalance,
              description: `Refund: restored ${restoredPoints} redeemed pts`,
              created_by: posEmployee.employee_id,
            });
          }
        }

        // 5b. Claw back earned points
        if (transaction.loyalty_points_earned > 0) {
          clawbackPoints = isFullRefund
            ? transaction.loyalty_points_earned
            : Math.floor(transaction.loyalty_points_earned * (totalRefundAmount / transaction.total_amount));

          if (clawbackPoints > 0) {
            runningBalance = Math.max(0, runningBalance - clawbackPoints);

            await supabase.from('loyalty_ledger').insert({
              customer_id: transaction.customer_id,
              transaction_id: transaction.id,
              action: 'adjusted',
              points_change: -clawbackPoints,
              points_balance: runningBalance,
              description: `Refund: reversed ${clawbackPoints} earned pts`,
              created_by: posEmployee.employee_id,
            });
          }
        }

        // Single customer balance update
        await supabase
          .from('customers')
          .update({ loyalty_points_balance: Math.max(0, runningBalance) })
          .eq('id', transaction.customer_id);
      }
    }

    // Store loyalty adjustments on the refund record
    if (clawbackPoints > 0 || restoredPoints > 0) {
      await supabase
        .from('refunds')
        .update({
          points_clawed_back: clawbackPoints,
          points_restored: restoredPoints,
        })
        .eq('id', refund.id);
    }

    // 6. Update transaction status.
    // Per-source: each source we drew from gets 'refunded' if its remaining
    // refundable hit 0, else 'partial_refund'. Sources we never touched stay
    // unchanged. Close-out target itself flips based on whether the requested
    // refund total was fully met.
    for (const sp of sourcePlan) {
      const sourceCents = refundedSources
        .filter((r) => r.transaction_id === sp.transaction_id)
        .reduce((s, r) => s + toCents(r.amount), 0);
      if (sourceCents <= 0) continue;
      const sourceFullyRefunded = sourceCents >= sp.remaining_refundable_cents;
      // Skip self (close-out target) here — we update it below to reflect the
      // overall refund status, not a per-source check.
      if (sp.transaction_id === transaction.id) continue;
      await supabase
        .from('transactions')
        .update({ status: sourceFullyRefunded ? 'refunded' : 'partial_refund' })
        .eq('id', sp.transaction_id);
    }

    const targetFullyRefunded = remainingNeedCents <= 0;
    const newStatus = targetFullyRefunded ? 'refunded' : 'partial_refund';
    await supabase
      .from('transactions')
      .update({ status: newStatus })
      .eq('id', transaction.id);

    // 7. Reverse coupon use_count + campaign metrics on full refund
    if (transaction.coupon_id && newStatus === 'refunded') {
      const { data: coupon } = await supabase
        .from('coupons')
        .select('use_count, campaign_id')
        .eq('id', transaction.coupon_id)
        .single();

      if (coupon) {
        if (coupon.use_count > 0) {
          await supabase
            .from('coupons')
            .update({ use_count: coupon.use_count - 1 })
            .eq('id', transaction.coupon_id);
        }

        if (coupon.campaign_id) {
          const { data: camp } = await supabase
            .from('campaigns')
            .select('redeemed_count, revenue_attributed')
            .eq('id', coupon.campaign_id)
            .single();

          if (camp) {
            await supabase
              .from('campaigns')
              .update({
                redeemed_count: Math.max(0, (camp.redeemed_count || 0) - 1),
                revenue_attributed: Math.max(0, Math.round(((camp.revenue_attributed || 0) - transaction.total_amount) * 100) / 100),
              })
              .eq('id', coupon.campaign_id);
          }
        }
      }
    }

    logAudit({
      userId: posEmployee.auth_user_id,
      userEmail: posEmployee.email,
      employeeName: `${posEmployee.first_name} ${posEmployee.last_name}`,
      action: 'refund',
      entityType: 'transaction',
      entityId: data.transaction_id,
      entityLabel: `Refund $${totalRefundAmount.toFixed(2)}`,
      details: {
        amount: totalRefundAmount,
        reason: data.reason,
        item_count: data.items.length,
      },
      ipAddress: getRequestIp(request),
      source: 'pos',
    });

    // Partial-success path: Stripe failed mid-flight AFTER at least one
    // source committed. Honest reporting — modal toasts the partial state.
    if (stripeFailure) {
      return NextResponse.json(
        {
          partialSuccess: true,
          refundedAmount: committedRefundAmount,
          failedAt: stripeFailure.transaction_id,
          error: `Partial refund: $${committedRefundAmount.toFixed(2)} committed; remaining $${fromCents(remainingNeedCents).toFixed(2)} failed at source ${stripeFailure.transaction_id}: ${stripeFailure.error}. Contact support for manual recovery.`,
          data: refund,
        },
        { status: 207 }
      );
    }

    return NextResponse.json({ data: refund }, { status: 201 });
  } catch (err) {
    console.error('Refund create route error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
