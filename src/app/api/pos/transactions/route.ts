import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticatePosRequest } from '@/lib/pos/api-auth';
import { checkPosPermission } from '@/lib/pos/check-permission';
import { transactionCreateSchema } from '@/lib/utils/validation';
import { toCents } from '@/lib/utils/refund-math';
import { CC_FEE_RATE, LOYALTY, WATER_SKU, FEATURE_FLAGS } from '@/lib/utils/constants';
import { isFeatureEnabled } from '@/lib/utils/feature-flags';
import { isQboSyncEnabled, getQboSetting } from '@/lib/qbo/settings';
import { syncTransactionToQbo } from '@/lib/qbo/sync-transaction';
import { logAudit, getRequestIp } from '@/lib/services/audit';
import { sendSms } from '@/lib/utils/sms';
import { renderSmsTemplate } from '@/lib/sms/render-sms-template';
import { buildTransactionGreeting } from '@/lib/sms/composites';
import { createShortLink } from '@/lib/utils/short-link';
import { cleanVehicleDescription } from '@/lib/utils/vehicle-helpers';
import { getBusinessInfo } from '@/lib/data/business';
import { logStockAdjustment } from '@/lib/utils/stock-adjustments';

export async function POST(request: NextRequest) {
  try {
    const posEmployee = await authenticatePosRequest(request);
    if (!posEmployee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const supabase = createAdminClient();

    const body = await request.json();
    const parsed = transactionCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues.map((i) => i.message).join(', ') },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const isCloseOut = data.close_out === true;

    // Permission checks based on payment method.
    // Close-out (payment_method=null + close_out=true) bypasses these — no
    // money is moving, so cash/card/split tender permissions don't apply.
    // Any POS-authenticated user can close out a fully pre-paid appointment.
    const paymentMethod = data.payment_method;
    if (!isCloseOut) {
      if (paymentMethod === 'card') {
        const granted = await checkPosPermission(supabase, posEmployee.role, posEmployee.employee_id, 'pos.process_card');
        if (!granted) {
          return NextResponse.json({ error: 'Forbidden: cannot process card payments' }, { status: 403 });
        }
      } else if (paymentMethod === 'cash' || paymentMethod === 'check') {
        const granted = await checkPosPermission(supabase, posEmployee.role, posEmployee.employee_id, 'pos.process_cash');
        if (!granted) {
          return NextResponse.json({ error: 'Forbidden: cannot process cash/check payments' }, { status: 403 });
        }
      } else if (paymentMethod === 'split') {
        const granted = await checkPosPermission(supabase, posEmployee.role, posEmployee.employee_id, 'pos.process_split');
        if (!granted) {
          return NextResponse.json({ error: 'Forbidden: cannot process split payments' }, { status: 403 });
        }
      } else if (paymentMethod === 'digital') {
        // Phase 1A.5: digital payments gate under pos.process_cash. Zelle/Venmo/
        // AppleCash/etc. settle out-of-band (no card fee, no PCI scope), so the
        // existing cash permission is the natural fit. A dedicated
        // pos.process_digital permission may land in a future session if stricter
        // gating is desired.
        const granted = await checkPosPermission(supabase, posEmployee.role, posEmployee.employee_id, 'pos.process_cash');
        if (!granted) {
          return NextResponse.json({ error: 'Forbidden: cannot process digital payments' }, { status: 403 });
        }
      }
    }

    // Resolve the linked appointment_id ONCE up-front. Used twice:
    //   1. Overpay guard (below) — needs appointment.total_amount
    //   2. Transaction insert (later) — appointment_id was historically NULL
    //      on every POS-created transaction (cash/card/split/close-out)
    //      because no client path passed it. The route used to compute it
    //      only inside the overpay guard and discard it afterwards. As a
    //      result every appointment-linked POS sale was orphaned in the DB
    //      and receipts couldn't reach back to pay-link / booking-deposit
    //      history. Hoisting it here fixes both gaps with one lookup.
    //      Backfill SQL for historical rows is in CHANGELOG.
    let linkedApptId: string | null = null;
    if (data.customer_id) {
      const { data: linkedJob } = await supabase
        .from('jobs')
        .select('appointment_id')
        .eq('customer_id', data.customer_id)
        .eq('status', 'completed')
        .is('transaction_id', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      linkedApptId = linkedJob?.appointment_id ?? null;
    }

    // Overpay guard — pre-insert.
    // Race scenario: customer paid the pay link mid-checkout. The Session 1
    // webhook lands while staff is in the POS screen with a stale ticket. The
    // request hits this route with the original full-balance payment. We sum
    // existing payments for the appointment vs the appointment total. If the
    // request would push the appointment past total_amount, return 409 with
    // a code the UI can recognize. Tolerance is zero cents — refund-math
    // convention says the request and DB must match exactly.
    if (linkedApptId) {
      const { data: appt } = await supabase
        .from('appointments')
        .select('total_amount, payment_status')
        .eq('id', linkedApptId)
        .maybeSingle();

      if (appt) {
        const apptTotalCents = toCents(Number(appt.total_amount));

        const { data: existingTxs } = await supabase
          .from('transactions')
          .select('id')
          .eq('appointment_id', linkedApptId)
          .eq('status', 'completed');

        const txIds = (existingTxs ?? []).map((t) => t.id);
        let existingPaidCents = 0;
        if (txIds.length > 0) {
          const { data: existingPays } = await supabase
            .from('payments')
            .select('amount')
            .in('transaction_id', txIds);
          existingPaidCents = (existingPays ?? []).reduce(
            (sum, p) => sum + toCents(Number(p.amount)),
            0
          );
        }

        const incomingPaidCents = (data.payments ?? []).reduce(
          (sum, p) => sum + toCents(Number(p.amount)),
          0
        );

        if (
          appt.payment_status === 'paid' &&
          existingPaidCents + incomingPaidCents > apptTotalCents
        ) {
          return NextResponse.json(
            {
              error: 'Payment already received — refresh to see updated balance.',
              code: 'appointment_overpay_guard',
            },
            { status: 409 }
          );
        }
      }
    }

    // Permission check: manual discount
    if (data.discount_amount && data.discount_amount > 0) {
      // Only check if there's a manual discount (not coupon/loyalty-only discounts)
      // Coupon discount is tracked separately via coupon_id, so we only subtract loyalty
      const loyaltyDiscount = data.loyalty_discount || 0;
      const manualDiscountPortion = data.discount_amount - loyaltyDiscount;
      if (manualDiscountPortion > 0) {
        const granted = await checkPosPermission(supabase, posEmployee.role, posEmployee.employee_id, 'pos.manual_discounts');
        if (!granted) {
          return NextResponse.json({ error: 'Forbidden: cannot apply manual discounts' }, { status: 403 });
        }
      }
    }

    // 1. Insert transaction.
    // Close-out: stamp a recognizable notes marker so the audit trail shows
    // this was a fully pre-paid appointment closure (no money collected this
    // visit). payment_method=null is intentional — receipts will skip the
    // payment-method line and the empty payments[] array means the public
    // receipt page hides the payment block entirely.
    const closeOutNotes = 'Closed out — fully pre-paid';
    const { data: transaction, error: txError } = await supabase
      .from('transactions')
      .insert({
        customer_id: data.customer_id || null,
        vehicle_id: data.vehicle_id || null,
        appointment_id: linkedApptId,
        employee_id: posEmployee.employee_id,
        status: 'completed',
        subtotal: data.subtotal,
        tax_amount: data.tax_amount,
        tip_amount: data.tip_amount,
        discount_amount: data.discount_amount,
        deposit_credit: data.deposit_credit || 0,
        total_amount: data.total_amount,
        payment_method: data.payment_method,
        coupon_id: data.coupon_id || null,
        coupon_code: data.coupon_code || null,
        loyalty_points_earned: 0,
        loyalty_points_redeemed: data.loyalty_points_redeemed || 0,
        loyalty_discount: data.loyalty_discount || 0,
        notes: isCloseOut ? closeOutNotes : (data.notes || null),
        transaction_date: new Date().toISOString(),
      })
      .select('*')
      .single();

    if (txError || !transaction) {
      console.error('Transaction insert error:', txError);
      return NextResponse.json(
        { error: 'Failed to create transaction' },
        { status: 500 }
      );
    }

    // 2. Insert transaction items
    if (data.items && data.items.length > 0) {
      const itemRows = data.items.map((item: {
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
        standard_price?: number | null;
        pricing_type?: string | null;
        is_addon?: boolean;
        prerequisite_note?: string | null;
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
        standard_price: item.standard_price ?? null,
        pricing_type: item.pricing_type || 'standard',
        is_addon: item.is_addon ?? false,
        prerequisite_note: item.prerequisite_note || null,
      }));

      const { error: itemsError } = await supabase
        .from('transaction_items')
        .insert(itemRows);

      if (itemsError) {
        console.error('Transaction items insert error:', itemsError);
      }
    }

    // 3. Insert payment(s)
    if (data.payments && data.payments.length > 0) {
      // Method-vs-field validation: cash_tendered / change_given are cash-only.
      // A non-cash payment with either value populated returns 422 — the column
      // semantics don't apply to card/check/split rows.
      for (const p of data.payments) {
        if (p.method !== 'cash' && (p.cash_tendered != null || p.change_given != null)) {
          return NextResponse.json(
            {
              error: `cash_tendered and change_given are only valid for method='cash' (got method='${p.method}')`,
            },
            { status: 422 }
          );
        }
        // Phase 1A.5 Part A: digital_platform is required for method='digital'
        // and forbidden for all other methods. Mirrors the DB CHECK constraint
        // (payments_digital_platform_check) so the error is returned as a
        // useful 422 instead of a 500 from the constraint violation.
        if (p.method === 'digital') {
          const platform = (p.digital_platform ?? '').trim();
          if (!platform) {
            return NextResponse.json(
              {
                error: `digital_platform is required when method='digital'`,
              },
              { status: 422 }
            );
          }
        } else if (p.digital_platform != null) {
          return NextResponse.json(
            {
              error: `digital_platform is only valid for method='digital' (got method='${p.method}')`,
            },
            { status: 422 }
          );
        }
      }

      const paymentRows = data.payments.map((p: {
        method: string;
        amount: number;
        tip_amount: number;
        stripe_payment_intent_id?: string | null;
        card_brand?: string | null;
        card_last_four?: string | null;
        cash_tendered?: number | null;
        change_given?: number | null;
        digital_platform?: string | null;
      }) => {
        // Server is the source of truth for change_given. If the client sent
        // a value that disagrees with max(0, cash_tendered - amount), normalize
        // and warn — don't reject. Historical clients and offline-sync replays
        // may not send change_given at all; that's fine.
        let cashTendered: number | null = null;
        let changeGiven: number | null = null;
        if (p.method === 'cash' && p.cash_tendered != null) {
          cashTendered = Math.round(p.cash_tendered * 100) / 100;
          const expectedChange = Math.max(0, Math.round((cashTendered - p.amount) * 100) / 100);
          if (
            p.change_given != null &&
            Math.round(p.change_given * 100) / 100 !== expectedChange
          ) {
            console.warn(
              `[transactions] cash payment change_given (${p.change_given}) disagrees with computed (${expectedChange}); using server value`
            );
          }
          changeGiven = expectedChange;
        }

        return {
          transaction_id: transaction.id,
          method: p.method,
          amount: p.amount,
          tip_amount: p.tip_amount,
          tip_net: p.method === 'card'
            ? Math.round(p.tip_amount * (1 - CC_FEE_RATE) * 100) / 100
            : p.tip_amount,
          stripe_payment_intent_id: p.stripe_payment_intent_id || null,
          card_brand: p.card_brand || null,
          card_last_four: p.card_last_four || null,
          cash_tendered: cashTendered,
          change_given: changeGiven,
          // Phase 1A.5: persist canonical lowercase platform identifier when
          // method='digital'. Trimmed to defend against client whitespace.
          digital_platform: p.method === 'digital'
            ? (p.digital_platform ?? '').trim().toLowerCase()
            : null,
        };
      });

      const { error: payError } = await supabase
        .from('payments')
        .insert(paymentRows);

      if (payError) {
        console.error('Payments insert error:', payError);
      }
    }

    // 4. Decrement product inventory + log stock adjustments
    const productItems = (data.items ?? []).filter(
      (i: { item_type: string; product_id?: string | null; quantity: number }) =>
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
          reason: `Sold via POS (${transaction.receipt_number || transaction.id})`,
          reference_id: transaction.id,
          reference_type: 'transaction',
          created_by: posEmployee.employee_id,
          unit_cost: prod.cost_price ?? null,
        });
      }
    }

    // 5. Customer visit stats handled by DB trigger (tr_update_customer_stats)

    // 6. Loyalty points earn (if customer, and items qualify)
    const loyaltyEnabled = await isFeatureEnabled(FEATURE_FLAGS.LOYALTY_REWARDS);
    if (data.customer_id && loyaltyEnabled) {
      // Get current loyalty balance
      const { data: custForLoyalty } = await supabase
        .from('customers')
        .select('loyalty_points_balance')
        .eq('id', data.customer_id)
        .single();

      let currentBalance = custForLoyalty?.loyalty_points_balance ?? 0;

      // Handle loyalty redemption first (deduct points)
      if (data.loyalty_points_redeemed > 0) {
        currentBalance = Math.max(0, currentBalance - data.loyalty_points_redeemed);

        await supabase.from('loyalty_ledger').insert({
          customer_id: data.customer_id,
          transaction_id: transaction.id,
          action: 'redeemed',
          points_change: -data.loyalty_points_redeemed,
          points_balance: currentBalance,
          description: `Redeemed for -$${(data.loyalty_discount || 0).toFixed(2)} discount`,
        });

        await supabase
          .from('customers')
          .update({ loyalty_points_balance: currentBalance })
          .eq('id', data.customer_id);
      }

      // Calculate eligible spend (exclude WATER_SKU)
      const { data: waterProduct } = await supabase
        .from('products')
        .select('id')
        .eq('sku', WATER_SKU)
        .maybeSingle();

      const waterProductId = waterProduct?.id ?? null;

      const earnableSpend = (data.items ?? []).reduce(
        (sum: number, i: { item_type: string; product_id?: string | null; total_price: number }) => {
          if (i.item_type === 'product' && i.product_id === waterProductId) {
            return sum; // Exclude water
          }
          return sum + i.total_price;
        },
        0
      );

      // Earn points only on what the customer actually paid
      // discount_amount includes ALL discounts (coupon + loyalty + manual)
      const earnableAfterAllDiscounts = Math.max(0, earnableSpend - (data.discount_amount || 0));
      const pointsEarned = Math.floor(earnableAfterAllDiscounts * LOYALTY.EARN_RATE);

      if (pointsEarned > 0) {
        currentBalance += pointsEarned;

        await supabase.from('loyalty_ledger').insert({
          customer_id: data.customer_id,
          transaction_id: transaction.id,
          action: 'earned',
          points_change: pointsEarned,
          points_balance: currentBalance,
          description: `Earned from transaction #${transaction.receipt_number || transaction.id.slice(0, 8)}`,
        });

        await supabase
          .from('customers')
          .update({ loyalty_points_balance: currentBalance })
          .eq('id', data.customer_id);

        await supabase
          .from('transactions')
          .update({ loyalty_points_earned: pointsEarned })
          .eq('id', transaction.id);

        // Loyalty milestone notification — fire and forget
        const prevBalance = currentBalance - pointsEarned;
        if (prevBalance < LOYALTY.REDEEM_MINIMUM && currentBalance >= LOYALTY.REDEEM_MINIMUM) {
          (async () => {
            try {
              const { data: custMilestone } = await supabase
                .from('customers')
                .select('phone, first_name, last_name, email')
                .eq('id', data.customer_id!)
                .single();
              if (!custMilestone?.phone) return;

              const bizInfo = await getBusinessInfo();
              const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
              const bookingLink = await createShortLink(`${appUrl}/book`);
              const cashValue = `$${(currentBalance * LOYALTY.REDEEM_RATE).toFixed(2)}`;

              const vars = {
                first_name: custMilestone.first_name || '',
                loyalty_points_balance: String(currentBalance),
                loyalty_cash_value: cashValue,
                booking_link: bookingLink,
                business_name: bizInfo.name,
                // Session 2D cheap-add (loaded by Phase 1.5 SELECT expansion).
                last_name: custMilestone.last_name || undefined,
              };

              const fallback = `Great news ${vars.first_name}! You now have ${currentBalance} loyalty points — that's ${cashValue} off your next visit! Book now: ${bookingLink}\n\n${bizInfo.name}`;

              const rendered = await renderSmsTemplate('loyalty_milestone', vars, fallback);
              if (!rendered.isActive) return;

              await sendSms(custMilestone.phone, rendered.body, {
                customerId: data.customer_id!,
                source: 'transactional',
                logToConversation: true,
                notificationType: 'loyalty_milestone',
                contextId: transaction.id,
              });
              console.log(`[LoyaltyMilestone] SMS sent to ${custMilestone.phone} — ${currentBalance} pts crossed ${LOYALTY.REDEEM_MINIMUM} threshold`);
            } catch (err) {
              console.error('[LoyaltyMilestone] Failed to send milestone SMS:', err);
            }
          })();
        }
      }
    }

    // 7. Increment coupon use_count and attribute campaign metrics
    if (data.coupon_id) {
      const { data: coupon } = await supabase
        .from('coupons')
        .select('use_count, campaign_id')
        .eq('id', data.coupon_id)
        .single();

      if (coupon) {
        await supabase
          .from('coupons')
          .update({ use_count: coupon.use_count + 1 })
          .eq('id', data.coupon_id);

        // If coupon is linked to a campaign, update campaign metrics
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
                revenue_attributed: Math.round(((camp.revenue_attributed || 0) + data.total_amount) * 100) / 100,
              })
              .eq('id', coupon.campaign_id);
          }
        }
      }
    }

    // QBO Sync — fire and forget, never block POS
    // Checks realtime toggle: when OFF, skips immediate sync (EOD batch or cron will catch it)
    if (transaction.status === 'completed') {
      isQboSyncEnabled().then(async (enabled) => {
        if (enabled) {
          const realtimeSync = await getQboSetting('qbo_realtime_sync');
          if (realtimeSync === 'false') return;
          await supabase.from('transactions').update({ qbo_sync_status: 'pending' }).eq('id', transaction.id);
          syncTransactionToQbo(transaction.id, 'pos_hook').catch(err => {
            console.error('[QBO] Background sync failed for transaction:', transaction.id, err);
          });
        }
      }).catch(err => {
        console.error('[QBO] Failed to check sync status:', err);
      });
    }

    // Job linking — fire and forget, never block POS
    // If customer has completed jobs, link the most recent one to this transaction and close it.
    // Also mark the linked appointment as completed.
    if (data.customer_id) {
      Promise.resolve(
        supabase
          .from('jobs')
          .select('id, appointment_id')
          .eq('customer_id', data.customer_id)
          .eq('status', 'completed')
          .is('transaction_id', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
      ).then(async ({ data: completedJob }) => {
        if (completedJob) {
          await supabase
            .from('jobs')
            .update({
              transaction_id: transaction.id,
              status: 'closed',
              updated_at: new Date().toISOString(),
            })
            .eq('id', completedJob.id);
          console.log(`[JobCheckout] Job ${completedJob.id} linked to transaction ${transaction.id}, status → closed`);

          // Mark linked appointment as completed
          if (completedJob.appointment_id) {
            await supabase
              .from('appointments')
              .update({ status: 'completed', updated_at: new Date().toISOString() })
              .eq('id', completedJob.appointment_id);
            console.log(`[JobCheckout] Appointment ${completedJob.appointment_id} → completed`);
          }
        }
      }).catch((err: unknown) => {
        console.error('[JobCheckout] Failed to link job to transaction:', err);
      });
    }

    // Auto-send receipt SMS — 30s delay so staff can manually send first, then dedup check
    if (data.customer_id) {
      const autoReceiptCustomerId = data.customer_id;
      const autoReceiptVehicleId = data.vehicle_id || null;
      const autoReceiptTxId = transaction.id;
      const autoReceiptAccessToken = transaction.access_token;
      const autoReceiptHasServices = (data.items || []).some((i: { item_type: string }) => i.item_type === 'service');

      setTimeout(async () => {
        try {
          const admin = createAdminClient();

          // Dedup: skip if a receipt SMS was already sent (manually or otherwise)
          const { data: alreadySent } = await admin
            .from('messages')
            .select('id')
            .contains('metadata', { notificationType: 'receipt_sent', contextId: autoReceiptTxId })
            .limit(1)
            .maybeSingle();

          if (alreadySent) {
            console.log(`[AutoReceipt] Skipped — receipt already sent for transaction ${autoReceiptTxId}`);
            return;
          }

          // Session 42X-1 (D): status interlock — re-fetch transaction status before sending.
          // If the operator voided/refunded during the 30s window, skip the send.
          // This query is hoisted from its previous position (post-vehicle-lookup) so we can
          // exit early without paying for the customer/vehicle/short-link work. The single
          // SELECT now returns both status and loyalty_points_earned (used downstream).
          const { data: txRefresh } = await admin
            .from('transactions')
            .select('status, loyalty_points_earned')
            .eq('id', autoReceiptTxId)
            .single();

          const skipStatuses: ReadonlyArray<string> = ['voided', 'refunded', 'partial_refund'];
          if (!txRefresh || skipStatuses.includes(txRefresh.status)) {
            const observedStatus = txRefresh?.status ?? 'not_found';
            console.log(`[AutoReceipt] Skipped — status=${observedStatus} for transaction ${autoReceiptTxId}`);
            try {
              await admin.from('audit_log').insert({
                action: 'auto_receipt_skipped',
                entity_type: 'transaction',
                entity_id: autoReceiptTxId,
                source: 'system',
                details: {
                  reason: 'auto_receipt_skipped_due_to_status_change',
                  original_status: observedStatus,
                  skipped_at: new Date().toISOString(),
                },
              });
            } catch (auditErr) {
              console.error('[AutoReceipt] audit_log insert failed:', auditErr);
            }
            return;
          }

          // Fetch customer phone (Session 2D: SELECT expanded with last_name/email
          // for cheap-add chip wiring at the payment_receipt callsite below).
          const { data: cust } = await admin
            .from('customers')
            .select('phone, first_name, last_name, email')
            .eq('id', autoReceiptCustomerId)
            .single();
          if (!cust?.phone) return;

          // Build receipt link
          const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
          const receiptUrl = `${appUrl}/receipt/${autoReceiptAccessToken}`;
          const receiptLink = await createShortLink(receiptUrl);

          // Build vehicle description
          let vehicleDesc = '';
          if (autoReceiptVehicleId) {
            const { data: veh } = await admin
              .from('vehicles')
              .select('year, make, model')
              .eq('id', autoReceiptVehicleId)
              .single();
            if (veh) vehicleDesc = cleanVehicleDescription(veh);
          }

          // Loyalty points earned came from the txRefresh query above (status interlock).
          // txRefresh is non-null here (status check returned early on null).
          const pointsEarned = txRefresh.loyalty_points_earned ?? 0;

          const businessInfo = await getBusinessInfo();

          // Build context-aware greeting
          const greeting = buildTransactionGreeting({ hasServices: autoReceiptHasServices, vehicleDesc });

          const vars = {
            first_name: cust.first_name || '',
            transaction_greeting: greeting,
            receipt_link: receiptLink,
            business_name: businessInfo.name,
            // Session 2D cheap-add (loaded by Phase 1.5 SELECT expansion).
            last_name: cust.last_name || undefined,
          };

          const pointsLine = pointsEarned > 0 ? ` You earned ${pointsEarned} loyalty points today.` : '';
          const fallback = `Thank you ${vars.first_name}! ${greeting}${pointsLine} View your receipt: ${receiptLink}\n\n${businessInfo.name}`;

          const rendered = await renderSmsTemplate('payment_receipt', vars, fallback);
          if (!rendered.isActive) return;

          await sendSms(cust.phone, rendered.body, {
            customerId: autoReceiptCustomerId,
            source: 'transactional',
            logToConversation: true,
            notificationType: 'receipt_sent',
            contextId: autoReceiptTxId,
          });
          console.log(`[AutoReceipt] SMS sent to ${cust.phone} for transaction ${autoReceiptTxId}`);
        } catch (err) {
          console.error('[AutoReceipt] Failed to send auto receipt SMS:', err);
        }
      }, 30_000);
    }

    logAudit({
      userId: posEmployee.auth_user_id,
      userEmail: posEmployee.email,
      employeeName: `${posEmployee.first_name} ${posEmployee.last_name}`,
      action: 'create',
      entityType: 'transaction',
      entityId: transaction.id,
      entityLabel: `Transaction $${data.total_amount}`,
      details: {
        total_amount: data.total_amount,
        payment_method: data.payment_method,
        items_count: data.items?.length ?? 0,
      },
      ipAddress: getRequestIp(request),
      source: 'pos',
    });

    return NextResponse.json({ data: transaction }, { status: 201 });
  } catch (err) {
    console.error('Transaction create route error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
