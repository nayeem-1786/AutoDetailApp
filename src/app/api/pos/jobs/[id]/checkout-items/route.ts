import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticatePosRequest } from '@/lib/pos/api-auth';
import { checkPosPermission } from '@/lib/pos/check-permission';
import { type PaymentMethodLike } from '@/lib/utils/payment-source-label';
import {
  composeReceiptPaymentLines,
  sourceToLabel,
  type ComposerPaymentInput,
} from '@/lib/data/receipt-composer';

interface PriorPayment {
  amount_cents: number;
  method: 'cash' | 'card' | 'check' | 'split';
  paid_at: string;
  source_label: string;
  stripe_payment_intent_id: string | null;
}

/**
 * GET /api/pos/jobs/[id]/checkout-items
 * Returns line items for POS ticket from:
 *   1. Job services (JSONB snapshot)
 *   2. Approved job addons
 *   3. Products from linked quote (via quote_id bridge)
 *   4. Coupon code from linked quote
 *
 * Permission: pos.jobs.view (all POS roles)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const posEmployee = await authenticatePosRequest(request);
    if (!posEmployee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createAdminClient();

    // Permission check: pos.jobs.view — any POS user who can see jobs can load checkout items
    const canView = await checkPosPermission(
      supabase,
      posEmployee.role,
      posEmployee.employee_id,
      'pos.jobs.view'
    );
    if (!canView) {
      return NextResponse.json(
        { error: "You don't have permission to checkout jobs. Ask your admin to update your permissions." },
        { status: 403 }
      );
    }

    // Fetch job with addons
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select(`
        id, status, services, customer_id, vehicle_id, quote_id, appointment_id,
        customer:customers!jobs_customer_id_fkey(id, first_name, last_name, phone, email, customer_type, tags),
        vehicle:vehicles!jobs_vehicle_id_fkey(id, year, make, model, color, size_class),
        addons:job_addons(
          id, service_id, product_id, custom_description, price,
          discount_amount, status, pickup_delay_minutes
        )
      `)
      .eq('id', id)
      .single();

    if (jobError || !job) {
      console.error('Checkout items - job fetch error:', jobError);
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // Prevent double checkout
    if (job.status === 'closed') {
      return NextResponse.json(
        { error: 'Job already checked out and closed' },
        { status: 400 }
      );
    }

    // Lookup service/product metadata for is_taxable and category_id
    const serviceIds = ((job.services || []) as Array<{ id: string }>).map((s) => s.id);
    const serviceMetaMap = new Map<string, { is_taxable: boolean; category_id: string | null }>();
    if (serviceIds.length > 0) {
      const { data: serviceMeta } = await supabase
        .from('services')
        .select('id, is_taxable, category_id')
        .in('id', serviceIds);
      if (serviceMeta) {
        for (const s of serviceMeta) {
          serviceMetaMap.set(s.id, { is_taxable: s.is_taxable, category_id: s.category_id });
        }
      }
    }

    // Build ticket items from services JSONB. Skip entries flagged
    // is_mobile_fee — those are rendered via the appointment-based synth
    // block below so the item_type is set to 'mobile_fee' rather than
    // 'service' (which would mis-classify the row as a real catalog service).
    const services = (job.services as Array<{
      id: string | null;
      name: string;
      price: number;
      quantity?: number;
      tier_name?: string;
      is_mobile_fee?: boolean;
    }>) || [];

    const items: Array<{
      item_type: 'service' | 'product' | 'custom' | 'mobile_fee';
      service_id?: string;
      product_id?: string;
      item_name: string;
      quantity: number;
      unit_price: number;
      is_addon?: boolean;
      discount_amount?: number;
      tier_name?: string;
      is_taxable: boolean;
      category_id?: string;
    }> = [];

    for (const svc of services) {
      if (svc.is_mobile_fee) continue;
      if (!svc.id) continue;
      const meta = serviceMetaMap.get(svc.id);
      items.push({
        item_type: 'service',
        service_id: svc.id,
        item_name: svc.name,
        quantity: svc.quantity ?? 1,
        unit_price: svc.quantity && svc.quantity > 1
          ? Math.round((svc.price / svc.quantity) * 100) / 100
          : svc.price,
        tier_name: svc.tier_name,
        is_taxable: meta?.is_taxable ?? false,
        category_id: meta?.category_id || undefined,
      });
    }

    // Add approved addon items
    const approvedAddons = ((job.addons || []) as Array<{
      id: string;
      service_id: string | null;
      product_id: string | null;
      custom_description: string | null;
      price: number;
      discount_amount: number;
      status: string;
    }>).filter((a) => a.status === 'approved');

    // Collect addon service/product IDs for metadata lookup
    const addonServiceIds = approvedAddons.filter((a) => a.service_id).map((a) => a.service_id!);
    const addonProductIds = approvedAddons.filter((a) => a.product_id).map((a) => a.product_id!);

    const addonServiceMetaMap = new Map<string, { is_taxable: boolean; category_id: string | null }>();
    if (addonServiceIds.length > 0) {
      const { data: meta } = await supabase.from('services').select('id, is_taxable, category_id').in('id', addonServiceIds);
      if (meta) for (const s of meta) addonServiceMetaMap.set(s.id, { is_taxable: s.is_taxable, category_id: s.category_id });
    }

    const addonProductMetaMap = new Map<string, { is_taxable: boolean; category_id: string | null }>();
    if (addonProductIds.length > 0) {
      const { data: meta } = await supabase.from('products').select('id, is_taxable, category_id').in('id', addonProductIds);
      if (meta) for (const s of meta) addonProductMetaMap.set(s.id, { is_taxable: s.is_taxable, category_id: s.category_id });
    }

    for (const addon of approvedAddons) {
      const finalPrice = Number(addon.price) - Number(addon.discount_amount);
      const addonMeta = addon.service_id
        ? addonServiceMetaMap.get(addon.service_id)
        : addon.product_id
          ? addonProductMetaMap.get(addon.product_id)
          : null;
      items.push({
        item_type: addon.service_id ? 'service' : addon.product_id ? 'product' : 'custom',
        service_id: addon.service_id || undefined,
        product_id: addon.product_id || undefined,
        item_name: addon.custom_description || 'Add-on Service',
        quantity: 1,
        unit_price: finalPrice,
        is_addon: true,
        discount_amount: Number(addon.discount_amount) > 0 ? Number(addon.discount_amount) : undefined,
        is_taxable: addonMeta?.is_taxable ?? false,
        category_id: addonMeta?.category_id || undefined,
      });
    }

    // Bridge: load products + coupon from linked quote (if quote_id exists)
    let coupon_code: string | null = null;

    if (job.quote_id) {
      // Fetch quote for coupon code
      const { data: quote } = await supabase
        .from('quotes')
        .select('coupon_code')
        .eq('id', job.quote_id)
        .single();

      if (quote?.coupon_code) {
        coupon_code = quote.coupon_code;
      }

      // Fetch product items from quote
      const { data: quoteProducts } = await supabase
        .from('quote_items')
        .select('id, product_id, item_name, quantity, unit_price, total_price, tier_name, notes')
        .eq('quote_id', job.quote_id)
        .not('product_id', 'is', null);

      if (quoteProducts && quoteProducts.length > 0) {
        // Lookup product metadata
        const qpIds = quoteProducts.map((p) => p.product_id!);
        const qpMetaMap = new Map<string, { is_taxable: boolean; category_id: string | null }>();
        if (qpIds.length > 0) {
          const { data: meta } = await supabase.from('products').select('id, is_taxable, category_id').in('id', qpIds);
          if (meta) for (const p of meta) qpMetaMap.set(p.id, { is_taxable: p.is_taxable, category_id: p.category_id });
        }

        for (const prod of quoteProducts) {
          const pMeta = qpMetaMap.get(prod.product_id!);
          items.push({
            item_type: 'product',
            product_id: prod.product_id!,
            item_name: prod.item_name,
            quantity: prod.quantity,
            unit_price: prod.unit_price,
            is_taxable: pMeta?.is_taxable ?? true,
            category_id: pMeta?.category_id || undefined,
          });
        }
      }
    }

    // Look up deposit from linked appointment + deposit transaction date.
    // Also fetch mobile fields so we can synthesize the mobile_fee display
    // line (Write Point 3) — gives the cashier visibility and flows the line
    // through to checkout submit naturally.
    //
    // Item 15g Layer 15g-i: also fetch `coupon_code` so we can fall back to the
    // appointment when no quote-side coupon was recovered. Closes the
    // online-booking-leaks-at-checkout gap (booking wizard writes
    // `appointments.coupon_code` but `job.quote_id` is NULL for online-booked
    // jobs) AND the future case where a POS-converted appointment loses its
    // `quote_id` bridge for any reason.
    //
    // Item 15g Layer 15g-ii: extends the appointment SELECT to include
    // loyalty + manual-discount + coupon_discount snapshot. Returns them
    // in the response so `handleCheckout` in `pos/jobs/page.tsx` can dispatch
    // `SET_LOYALTY_REDEEM` + `APPLY_MANUAL_DISCOUNT` after `RESTORE_TICKET`
    // (Layer 15g-iii wires the dispatches; this layer makes the data
    // available). All four are nullable in the response so the client can
    // distinguish "modifier not set" from "modifier is zero."
    let deposit_amount = 0;
    let deposit_date: string | null = null;
    let coupon_discount: number | null = null;
    let loyalty_points_redeemed: number | null = null;
    let loyalty_discount: number | null = null;
    let manual_discount_value: number | null = null;
    let manual_discount_label: string | null = null;
    // Item 15f Phase 1 Layer 8d — `scheduled_date` surfaces in the
    // edit-mode banner so source=job edits show "Editing Appointment:
    // Jane Doe — Sat, May 16" (the canonical edit target is the linked
    // appointment, so reading scheduled_date from there matches the
    // appointment-source endpoint's banner UX).
    let scheduled_date: string | null = null;
    if (job.appointment_id) {
      const { data: appt } = await supabase
        .from('appointments')
        .select(
          'payment_type, deposit_amount, is_mobile, mobile_surcharge, mobile_zone_name_snapshot, coupon_code, coupon_discount, loyalty_points_redeemed, loyalty_discount, manual_discount_value, manual_discount_label, scheduled_date'
        )
        .eq('id', job.appointment_id)
        .single();
      scheduled_date = appt?.scheduled_date ?? null;

      // Coupon fallback: if no quote-side coupon was found (no quote_id, or
      // quote had no coupon_code), inherit from the appointment row. The
      // client re-validates the code via /api/pos/coupons/validate, so the
      // discount value is re-derived at hydration time.
      if (!coupon_code && appt?.coupon_code) {
        coupon_code = appt.coupon_code;
      }

      // Item 15g Layer 15g-ii — surface all modifier snapshots regardless of
      // whether the coupon came from the quote-side or appointment-side. The
      // appointment row is authoritative for the snapshot; the quote bridge
      // is only used for code re-validation.
      if (appt) {
        coupon_discount =
          appt.coupon_discount != null ? Number(appt.coupon_discount) : null;
        loyalty_points_redeemed =
          appt.loyalty_points_redeemed != null
            ? Number(appt.loyalty_points_redeemed)
            : null;
        loyalty_discount =
          appt.loyalty_discount != null ? Number(appt.loyalty_discount) : null;
        manual_discount_value =
          appt.manual_discount_value != null
            ? Number(appt.manual_discount_value)
            : null;
        manual_discount_label = appt.manual_discount_label ?? null;
      }

      // Synthesize mobile_fee line when appointment is mobile and the line
      // hasn't already been materialized through job.services (defense in
      // depth: jobs created post-fix already include it via populate/POST,
      // but pre-fix jobs and any future divergence get covered here too).
      if (appt?.is_mobile && Number(appt.mobile_surcharge ?? 0) > 0) {
        const surcharge = Number(appt.mobile_surcharge);
        const alreadyInItems = items.some(
          (it) => it.item_type === 'mobile_fee'
            || ((it as { is_mobile_fee?: boolean }).is_mobile_fee === true)
        );
        if (!alreadyInItems) {
          items.push({
            item_type: 'mobile_fee',
            item_name: appt.mobile_zone_name_snapshot || 'Mobile Service Fee',
            quantity: 1,
            unit_price: surcharge,
            is_addon: false,
            is_taxable: false,
          });
        }
      }

      if (appt?.payment_type === 'deposit' && appt.deposit_amount != null && Number(appt.deposit_amount) > 0) {
        deposit_amount = Number(appt.deposit_amount);

        // Fetch the original deposit transaction date
        const { data: depositTxn } = await supabase
          .from('transactions')
          .select('transaction_date')
          .eq('appointment_id', job.appointment_id)
          .eq('status', 'completed')
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();

        if (depositTxn?.transaction_date) {
          deposit_date = depositTxn.transaction_date;
        }
      }
    }

    // Prior payments — additive to deposit_amount above. Surfaces every
    // payment that hit this appointment via the payments table, regardless
    // of source (pay-link webhook, booking deposit, prior in-store POS).
    // Lets the ticket panel show an itemized "Payments Received" block and
    // lets the totals computation deduct the correct remaining balance,
    // which closes the pay-link double-charge gap (was: only deposit_amount
    // surfaced, so pay-link payments invisible to checkout).
    const prior_payments: PriorPayment[] = [];
    let prior_payments_total_cents = 0;
    if (job.appointment_id) {
      const { data: appPayments, error: payErr } = await supabase
        .from('payments')
        .select(
          'amount, method, created_at, stripe_payment_intent_id, transaction:transactions!inner(id, appointment_id, status, notes)'
        )
        .eq('transaction.appointment_id', job.appointment_id)
        .eq('transaction.status', 'completed')
        .order('created_at', { ascending: true });

      if (payErr) {
        console.error('Checkout items - prior payments fetch error:', payErr);
        // Non-fatal: empty prior_payments is the safe fallback (no double-charge
        // protection on this load, but no crash either).
      } else if (appPayments) {
        // Phase 0b.1: composer takes over chronological sort + source detection
        // + cents conversion. Output here preserves the pre-0b.1 client contract:
        //   - prior_payments[] in chronological order
        //   - amount_cents per row (already cents, no conversion at consumer)
        //   - source_label string ('Cash' | 'Online (pay link)' | 'Booking deposit' | etc.)
        //   - paid_at = created_at ISO string
        //   - stripe_payment_intent_id passthrough
        const composerInput: ComposerPaymentInput[] = appPayments.map((row) => {
          const tx = row.transaction as unknown as { notes: string | null } | null;
          return {
            method: row.method,
            amount: Number(row.amount),
            created_at: row.created_at,
            source_notes: tx?.notes ?? null,
            stripe_payment_intent_id: row.stripe_payment_intent_id ?? null,
          };
        });
        const block = composeReceiptPaymentLines(composerInput, null);
        // Re-merge composer output with original rows in the same chronological
        // order to preserve fields the composer doesn't surface here (the POS
        // ticket panel only needs the five fields above).
        const sortedRaw = [...appPayments].sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
        for (let i = 0; i < block.lines.length; i++) {
          const line = block.lines[i];
          const row = sortedRaw[i];
          prior_payments.push({
            amount_cents: line.amount_cents,
            method: line.method as PriorPayment['method'],
            paid_at: row.created_at,
            source_label: sourceToLabel(line.source, line.method as PaymentMethodLike),
            stripe_payment_intent_id: row.stripe_payment_intent_id ?? null,
          });
        }
        prior_payments_total_cents = block.total_paid_cents;
      }
    }

    return NextResponse.json({
      data: {
        job_id: job.id,
        customer_id: job.customer_id,
        vehicle_id: job.vehicle_id,
        customer: job.customer,
        vehicle: job.vehicle,
        items,
        coupon_code,
        // Item 15g Layer 15g-ii — modifier snapshot from the linked
        // appointment. Layer 15g-iii will wire the client to dispatch
        // SET_LOYALTY_REDEEM + APPLY_MANUAL_DISCOUNT off these fields.
        coupon_discount,
        loyalty_points_redeemed,
        loyalty_discount,
        manual_discount_value,
        manual_discount_label,
        deposit_amount,
        deposit_date,
        // Item 15f Phase 1 Layer 8d — edit-mode banner reads scheduled_date
        // alongside customer to render "Editing Appointment: Jane Doe —
        // Sat, May 16". Null when job has no linked appointment.
        scheduled_date,
        prior_payments,
        prior_payments_total_cents,
        status: job.status,
      },
    });
  } catch (err) {
    console.error('Checkout items route error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
