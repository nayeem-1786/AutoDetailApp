import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticatePosRequest } from '@/lib/pos/api-auth';
import { LOYALTY, WATER_SKU, FEATURE_FLAGS } from '@/lib/utils/constants';
import { isFeatureEnabled } from '@/lib/utils/feature-flags';
import { isQboSyncEnabled, getQboSetting } from '@/lib/qbo/settings';
import { syncTransactionToQbo } from '@/lib/qbo/sync-transaction';
import { logStockAdjustment } from '@/lib/utils/stock-adjustments';
import { toCents } from '@/lib/utils/money';
import { generateReceiptNumber } from '@/lib/utils/receipt-number';

/**
 * POST /api/pos/sync-offline-transaction
 *
 * Syncs a transaction that was queued while the POS was offline.
 * Replicates the same logic as the main transaction creation route.
 * Uses the offline transaction ID as an idempotency key to prevent duplicates.
 */
export async function POST(request: NextRequest) {
  try {
    const posEmployee = await authenticatePosRequest(request);
    if (!posEmployee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createAdminClient();
    const body = await request.json();

    const offlineId: string = body.id;
    if (!offlineId || !offlineId.startsWith('offline-')) {
      return NextResponse.json(
        { error: 'Invalid offline transaction ID' },
        { status: 400 }
      );
    }

    // Idempotency check — see if we already synced this offline transaction
    const { data: existing } = await supabase
      .from('transactions')
      .select('id, receipt_number')
      .eq('offline_id', offlineId)
      .maybeSingle();

    if (existing) {
      // Already synced — return success without re-processing
      return NextResponse.json({ data: existing }, { status: 200 });
    }

    // Use the original timestamp from offline queue
    const transactionDate = body.timestamp
      ? new Date(body.timestamp).toISOString()
      : new Date().toISOString();

    // Resolve linked appointment_id from the most recent completed-but-unlinked
    // job for this customer. Mirrors the live POS path in transactions/route.ts.
    // Pre-Session 5b bug: offline-synced transactions also orphaned appointment_id.
    let linkedApptId: string | null = null;
    if (body.customer_id) {
      const { data: linkedJob } = await supabase
        .from('jobs')
        .select('appointment_id')
        .eq('customer_id', body.customer_id)
        .eq('status', 'completed')
        .is('transaction_id', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      linkedApptId = linkedJob?.appointment_id ?? null;
    }

    // Cash tip captured at offline checkout (Item 4 / 4a-cash). Default to 0
    // for records queued before the field existed (Appendix A bug #2 — without
    // reading this, even a fixed cash UI would lose the tip on replay). Cash
    // tips take no CC-fee deduction, so tip_net = tip_amount, matching the
    // non-card else-branch in transactions/route.ts.
    const tipAmount =
      typeof body.tip_amount === 'number'
        ? Math.max(0, Math.round(body.tip_amount * 100) / 100)
        : 0;

    // 1. Insert transaction.
    // Phase 3 Theme A (AC-10 v1.4): receipt_number generated via
    // next_identifier('receipt') (no longer auto-supplied by trigger).
    const receiptNumber = await generateReceiptNumber(supabase);
    const { data: transaction, error: txError } = await supabase
      .from('transactions')
      .insert({
        customer_id: body.customer_id || null,
        vehicle_id: body.vehicle_id || null,
        appointment_id: linkedApptId,
        employee_id: posEmployee.employee_id,
        status: 'completed',
        subtotal: body.subtotal,
        tax_amount: body.tax_amount,
        tip_amount: tipAmount,
        discount_amount: body.discount_amount || 0,
        total_amount: body.total_amount,
        payment_method: 'cash',
        coupon_id: body.coupon_id || null,
        coupon_code: body.coupon_code || null,
        loyalty_points_earned: 0,
        loyalty_points_redeemed: body.loyalty_points_redeemed || 0,
        loyalty_discount: body.loyalty_discount || 0,
        notes: body.notes
          ? `[Offline] ${body.notes}`
          : '[Offline transaction]',
        transaction_date: transactionDate,
        offline_id: offlineId,
        receipt_number: receiptNumber,
      })
      .select('*')
      .single();

    if (txError || !transaction) {
      console.error('Offline sync: transaction insert error:', txError);
      return NextResponse.json(
        { error: 'Failed to create transaction' },
        { status: 500 }
      );
    }

    // 2. Insert transaction items
    if (body.items && body.items.length > 0) {
      const itemRows = body.items.map(
        (item: {
          item_type: string;
          product_id?: string | null;
          service_id?: string | null;
          item_name: string;
          quantity: number;
          unit_price: number;
          total_price: number;
          tax_amount: number;
          is_taxable: boolean;
          tier_name?: string | null;
          vehicle_size_class?: string | null;
          notes?: string | null;
        }) => ({
          transaction_id: transaction.id,
          item_type: item.item_type,
          product_id: item.product_id || null,
          service_id: item.service_id || null,
          item_name: item.item_name,
          quantity: item.quantity,
          unit_price: item.unit_price,
          total_price: item.total_price,
          tax_amount: item.tax_amount,
          is_taxable: item.is_taxable,
          tier_name: item.tier_name || null,
          vehicle_size_class: item.vehicle_size_class || null,
          notes: item.notes || null,
        })
      );

      const { error: itemsError } = await supabase
        .from('transaction_items')
        .insert(itemRows);

      if (itemsError) {
        console.error('Offline sync: items insert error:', itemsError);
      }
    }

    // 3. Insert cash payment.
    // The offline-queue payload (src/lib/pos/offline-queue.ts) uses
    // cash_tendered + cash_change. Reconcile to the DB column names
    // (cash_tendered + change_given) and recompute change_given server-side
    // from cash_tendered and amount, mirroring transactions/route.ts so the
    // server stays the source of truth even for replayed offline records.
    let cashTendered: number | null = null;
    let changeGiven: number | null = null;
    if (typeof body.cash_tendered === 'number') {
      cashTendered = Math.round(body.cash_tendered * 100) / 100;
      const expectedChange = Math.max(0, Math.round((cashTendered - body.total_amount) * 100) / 100);
      const clientChange = typeof body.cash_change === 'number' ? Math.round(body.cash_change * 100) / 100 : null;
      if (clientChange != null && clientChange !== expectedChange) {
        console.warn(
          `[offline-sync] cash_change (${body.cash_change}) disagrees with computed (${expectedChange}) for offline tx ${offlineId}; using server value`
        );
      }
      changeGiven = expectedChange;
    }

    const { error: payError } = await supabase.from('payments').insert({
      transaction_id: transaction.id,
      method: 'cash',
      amount: body.total_amount,
      tip_amount: tipAmount,
      tip_net: tipAmount,
      cash_tendered: cashTendered,
      change_given: changeGiven,
    });

    if (payError) {
      console.error('Offline sync: payment insert error:', payError);
    }

    // 4. Decrement product inventory + log stock adjustments
    const productItems = (body.items ?? []).filter(
      (i: { item_type: string; product_id?: string | null }) =>
        i.item_type === 'product' && i.product_id
    );

    for (const item of productItems) {
      const productId = item.product_id as string; // guaranteed by filter above

      const { data: prod } = await supabase
        .from('products')
        .select('quantity_on_hand, cost_price')
        .eq('id', productId)
        .single();

      if (prod) {
        const quantityBefore = prod.quantity_on_hand;
        const quantityAfter = Math.max(0, quantityBefore - item.quantity);

        await supabase
          .from('products')
          .update({ quantity_on_hand: quantityAfter })
          .eq('id', productId);

        await logStockAdjustment({
          supabase,
          product_id: productId,
          adjustment_type: 'sold',
          quantity_change: -(item.quantity),
          quantity_before: quantityBefore,
          quantity_after: quantityAfter,
          reason: `Sold via POS (offline sync: ${transaction.receipt_number || transaction.id})`,
          reference_id: transaction.id,
          reference_type: 'transaction',
          created_by: posEmployee.employee_id,
          // TODO Unify-D: when Family D migrates products.cost_price to
          // cents, remove toCents() and use prod.cost_price_cents
          // directly. See docs/sessions/money-unify-0-migration-
          // playbook-v2.md §Family D.
          unit_cost_cents: prod.cost_price != null ? toCents(prod.cost_price) : null,
        });
      }
    }

    // 5. Customer visit stats handled by DB trigger (tr_update_customer_stats)

    // 6. Loyalty points
    const loyaltyEnabled = await isFeatureEnabled(FEATURE_FLAGS.LOYALTY_REWARDS);
    if (body.customer_id && loyaltyEnabled) {
      const { data: custForLoyalty } = await supabase
        .from('customers')
        .select('loyalty_points_balance')
        .eq('id', body.customer_id)
        .single();

      let currentBalance = custForLoyalty?.loyalty_points_balance ?? 0;

      if (body.loyalty_points_redeemed > 0) {
        currentBalance = Math.max(
          0,
          currentBalance - body.loyalty_points_redeemed
        );

        await supabase.from('loyalty_ledger').insert({
          customer_id: body.customer_id,
          transaction_id: transaction.id,
          action: 'redeemed',
          points_change: -body.loyalty_points_redeemed,
          points_balance: currentBalance,
          description: `Redeemed for -$${(body.loyalty_discount || 0).toFixed(2)} discount`,
        });

        await supabase
          .from('customers')
          .update({ loyalty_points_balance: currentBalance })
          .eq('id', body.customer_id);
      }

      const { data: waterProduct } = await supabase
        .from('products')
        .select('id')
        .eq('sku', WATER_SKU)
        .maybeSingle();

      const waterProductId = waterProduct?.id ?? null;

      const earnableSpend = (body.items ?? []).reduce(
        (
          sum: number,
          i: {
            item_type: string;
            product_id?: string | null;
            total_price: number;
          }
        ) => {
          if (i.item_type === 'product' && i.product_id === waterProductId) {
            return sum;
          }
          return sum + i.total_price;
        },
        0
      );

      const pointsEarned = Math.floor(earnableSpend * LOYALTY.EARN_RATE);

      if (pointsEarned > 0) {
        currentBalance += pointsEarned;

        await supabase.from('loyalty_ledger').insert({
          customer_id: body.customer_id,
          transaction_id: transaction.id,
          action: 'earned',
          points_change: pointsEarned,
          points_balance: currentBalance,
          description: `Earned from offline transaction #${transaction.receipt_number || transaction.id.slice(0, 8)}`,
        });

        await supabase
          .from('customers')
          .update({ loyalty_points_balance: currentBalance })
          .eq('id', body.customer_id);

        await supabase
          .from('transactions')
          .update({ loyalty_points_earned: pointsEarned })
          .eq('id', transaction.id);
      }
    }

    // 7. Coupon usage
    if (body.coupon_id) {
      const { data: coupon } = await supabase
        .from('coupons')
        .select('use_count, campaign_id')
        .eq('id', body.coupon_id)
        .single();

      if (coupon) {
        await supabase
          .from('coupons')
          .update({ use_count: coupon.use_count + 1 })
          .eq('id', body.coupon_id);

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
                redeemed_count: (camp.redeemed_count || 0) + 1,
                revenue_attributed:
                  Math.round(
                    ((camp.revenue_attributed || 0) + body.total_amount) * 100
                  ) / 100,
              })
              .eq('id', coupon.campaign_id);
          }
        }
      }
    }

    // QBO Sync — fire and forget
    if (transaction.status === 'completed') {
      isQboSyncEnabled()
        .then(async (enabled) => {
          if (enabled) {
            const realtimeSync = await getQboSetting('qbo_realtime_sync');
            if (realtimeSync === 'false') return;
            await supabase
              .from('transactions')
              .update({ qbo_sync_status: 'pending' })
              .eq('id', transaction.id);
            syncTransactionToQbo(transaction.id, 'pos_hook').catch((err) => {
              console.error(
                '[QBO] Background sync failed for offline transaction:',
                transaction.id,
                err
              );
            });
          }
        })
        .catch((err) => {
          console.error('[QBO] Failed to check sync status:', err);
        });
    }

    // Job linking — fire and forget
    if (body.customer_id) {
      Promise.resolve(
        supabase
          .from('jobs')
          .select('id')
          .eq('customer_id', body.customer_id)
          .eq('status', 'completed')
          .is('transaction_id', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
      )
        .then(async ({ data: completedJob }) => {
          if (completedJob) {
            await supabase
              .from('jobs')
              .update({
                transaction_id: transaction.id,
                status: 'closed',
                updated_at: new Date().toISOString(),
              })
              .eq('id', completedJob.id);
          }
        })
        .catch((err: unknown) => {
          console.error(
            '[JobCheckout] Failed to link job for offline transaction:',
            err
          );
        });
    }

    return NextResponse.json({ data: transaction }, { status: 201 });
  } catch (err) {
    console.error('Offline sync route error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
