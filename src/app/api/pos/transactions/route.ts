import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticatePosRequest } from '@/lib/pos/api-auth';
import { checkPosPermission } from '@/lib/pos/check-permission';
import { transactionCreateSchema } from '@/lib/utils/validation';
import { CC_FEE_RATE, LOYALTY, WATER_SKU, FEATURE_FLAGS } from '@/lib/utils/constants';
import { isFeatureEnabled } from '@/lib/utils/feature-flags';
import { isQboSyncEnabled, getQboSetting } from '@/lib/qbo/settings';
import { syncTransactionToQbo } from '@/lib/qbo/sync-transaction';
import { logAudit, getRequestIp } from '@/lib/services/audit';
import { sendSms } from '@/lib/utils/sms';
import { renderSmsTemplate } from '@/lib/sms/render-sms-template';
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

    // Permission checks based on payment method
    const paymentMethod = data.payment_method;
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

    // 1. Insert transaction
    const { data: transaction, error: txError } = await supabase
      .from('transactions')
      .insert({
        customer_id: data.customer_id || null,
        vehicle_id: data.vehicle_id || null,
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
        notes: data.notes || null,
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
      const paymentRows = data.payments.map((p: {
        method: string;
        amount: number;
        tip_amount: number;
        stripe_payment_intent_id?: string | null;
        card_brand?: string | null;
        card_last_four?: string | null;
      }) => ({
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
      }));

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
                .select('phone, first_name')
                .eq('id', data.customer_id!)
                .single();
              if (!custMilestone?.phone) return;

              const bizInfo = await getBusinessInfo();
              const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
              const bookingLink = await createShortLink(`${appUrl}/book`);
              const cashValue = `$${(currentBalance * LOYALTY.REDEEM_RATE).toFixed(2)}`;

              const vars: Record<string, string> = {
                first_name: custMilestone.first_name || '',
                loyalty_points_balance: String(currentBalance),
                loyalty_cash_value: cashValue,
                booking_link: bookingLink,
                business_name: bizInfo.name,
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

          // Fetch customer phone
          const { data: cust } = await admin
            .from('customers')
            .select('phone, first_name')
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

          // Fetch loyalty points earned (updated after insert)
          const { data: txRefresh } = await admin
            .from('transactions')
            .select('loyalty_points_earned')
            .eq('id', autoReceiptTxId)
            .single();
          const pointsEarned = txRefresh?.loyalty_points_earned ?? 0;

          const businessInfo = await getBusinessInfo();

          // Build context-aware greeting
          const greeting = autoReceiptHasServices && vehicleDesc
            ? `Your ${vehicleDesc} is looking great.`
            : 'We appreciate your purchase.';

          const vars: Record<string, string> = {
            first_name: cust.first_name || '',
            vehicle_description: vehicleDesc || 'your vehicle',
            transaction_greeting: greeting,
            loyalty_points_earned: String(pointsEarned),
            receipt_link: receiptLink,
            business_name: businessInfo.name,
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
