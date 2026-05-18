import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticatePosRequest } from '@/lib/pos/api-auth';
import { checkPosPermission } from '@/lib/pos/check-permission';

/**
 * GET /api/pos/appointments/[id]/load — Item 15f Phase 1 Layer 8b
 *
 * Sibling of `GET /api/pos/jobs/[id]/checkout-items` for appointments that
 * don't yet have a linked job (booked online, scheduled-not-yet-intake, etc.).
 * Returns a TicketState-shaped payload so the POS deep-link drain
 * (`/pos?source=appointment&id=...&returnTo=...`) can hydrate the cart with
 * the appointment's services + modifiers + customer + vehicle in edit mode.
 *
 * Response shape mirrors `checkout-items` for the fields the drain consumes —
 * `items`, `customer`, `vehicle`, `coupon_code`, the 4 modifier columns,
 * `deposit_amount`, `deposit_date`. Notable differences from `checkout-items`:
 *   - No `prior_payments` block (the cart will surface them on save through
 *     the cascade endpoint; pre-fetching them here is out of Layer 8b's scope).
 *   - Items come from `appointment_services` (NOT `jobs.services` JSONB).
 *   - Status guard: refuses `completed` / `cancelled` (matches the PUT
 *     cascade endpoint's guard so the operator can't drain into a state the
 *     save would reject anyway).
 *
 * Permission: `pos.jobs.manage` — same gate as the PUT cascade. Read access
 * is intentionally as restrictive as write access so a user without
 * `pos.jobs.manage` can't drain into an edit-mode UI they can't save from.
 * Defense in depth — UI suppress + API gate.
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

    const canManage = await checkPosPermission(
      supabase,
      posEmployee.role,
      posEmployee.employee_id,
      'pos.jobs.manage'
    );
    if (!canManage) {
      return NextResponse.json(
        { error: "You don't have permission to edit appointments" },
        { status: 403 }
      );
    }

    const { data: appt, error: apptErr } = await supabase
      .from('appointments')
      .select(
        `id, status, customer_id, vehicle_id, is_mobile, mobile_surcharge, mobile_zone_name_snapshot,
         payment_type, deposit_amount, coupon_code, coupon_discount,
         loyalty_points_redeemed, loyalty_discount,
         manual_discount_value, manual_discount_label,
         scheduled_date,
         customer:customers!appointments_customer_id_fkey(id, first_name, last_name, phone, email, customer_type, tags),
         vehicle:vehicles!appointments_vehicle_id_fkey(id, year, make, model, color, size_class),
         appointment_services(id, service_id, price_at_booking, tier_name)`
      )
      .eq('id', id)
      .single();

    if (apptErr || !appt) {
      return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
    }

    // Item 15f Phase 1 Layer 8d-bis (Audit Finding #5): refuse terminal
    // statuses — `completed` / `cancelled` / `no_show`. Per the appointment
    // + job status flow audit (2026-05-17) §6.4, `no_show` is a terminal
    // state with no semantic meaning for service editing (customer didn't
    // arrive, no service is being delivered). The cascade endpoint
    // (`src/lib/appointments/service-edit.ts`) refuses the same set in
    // lockstep so load-success implies save-success on status.
    if (
      appt.status === 'completed' ||
      appt.status === 'cancelled' ||
      appt.status === 'no_show'
    ) {
      return NextResponse.json(
        { error: `Cannot edit services on an appointment with status "${appt.status}"` },
        { status: 400 }
      );
    }

    // Resolve service metadata (name, is_taxable, category_id) for the picked
    // services. `appointment_services` only carries `service_id`, `tier_name`,
    // and `price_at_booking`; the drain needs `item_name` + `is_taxable` +
    // `category_id` to build a TicketItem.
    const apptServices = (appt.appointment_services ?? []) as Array<{
      id: string;
      service_id: string;
      price_at_booking: number | string;
      tier_name: string | null;
    }>;

    const serviceIds = Array.from(new Set(apptServices.map((s) => s.service_id)));
    const svcMetaMap = new Map<
      string,
      { name: string; is_taxable: boolean; category_id: string | null }
    >();
    if (serviceIds.length > 0) {
      const { data: svcMeta } = await supabase
        .from('services')
        .select('id, name, is_taxable, category_id')
        .in('id', serviceIds);
      if (svcMeta) {
        for (const s of svcMeta) {
          svcMetaMap.set(s.id, {
            name: s.name,
            is_taxable: s.is_taxable,
            category_id: s.category_id,
          });
        }
      }
    }

    const items: Array<{
      item_type: 'service' | 'product' | 'custom' | 'mobile_fee';
      service_id?: string;
      product_id?: string;
      item_name: string;
      quantity: number;
      unit_price: number;
      is_addon?: boolean;
      tier_name?: string;
      is_taxable: boolean;
      category_id?: string;
    }> = apptServices.map((s) => {
      const meta = svcMetaMap.get(s.service_id);
      return {
        item_type: 'service' as const,
        service_id: s.service_id,
        item_name: meta?.name ?? 'Service',
        quantity: 1,
        unit_price: Number(s.price_at_booking),
        tier_name: s.tier_name ?? undefined,
        is_taxable: meta?.is_taxable ?? false,
        category_id: meta?.category_id ?? undefined,
      };
    });

    // Synthesize mobile_fee line when appointment is mobile — same pattern as
    // `checkout-items` so the drain handles both endpoints identically.
    if (appt.is_mobile && Number(appt.mobile_surcharge ?? 0) > 0) {
      items.push({
        item_type: 'mobile_fee',
        item_name: appt.mobile_zone_name_snapshot || 'Mobile Service Fee',
        quantity: 1,
        unit_price: Number(appt.mobile_surcharge),
        is_addon: false,
        is_taxable: false,
      });
    }

    // Deposit credit (paid online via booking deposit flow) — lookup the
    // original transaction date so the cart can show "Pre-paid on Jan 15".
    let deposit_amount = 0;
    let deposit_date: string | null = null;
    if (
      appt.payment_type === 'deposit' &&
      appt.deposit_amount != null &&
      Number(appt.deposit_amount) > 0
    ) {
      deposit_amount = Number(appt.deposit_amount);
      const { data: depositTxn } = await supabase
        .from('transactions')
        .select('transaction_date')
        .eq('appointment_id', id)
        .eq('status', 'completed')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (depositTxn?.transaction_date) {
        deposit_date = depositTxn.transaction_date;
      }
    }

    return NextResponse.json({
      data: {
        appointment_id: appt.id,
        customer_id: appt.customer_id,
        vehicle_id: appt.vehicle_id,
        customer: appt.customer,
        vehicle: appt.vehicle,
        // Item 15f Phase 1 Layer 8d — scheduled_date surfaces in the
        // edit-mode banner so operators see "Editing Appointment:
        // Jane Doe — Sat, May 16" instead of a UUID prefix. Date-only
        // column (YYYY-MM-DD), the banner formats for display in PST.
        scheduled_date: appt.scheduled_date ?? null,
        items,
        coupon_code: appt.coupon_code ?? null,
        coupon_discount:
          appt.coupon_discount != null ? Number(appt.coupon_discount) : null,
        loyalty_points_redeemed:
          appt.loyalty_points_redeemed != null
            ? Number(appt.loyalty_points_redeemed)
            : null,
        loyalty_discount:
          appt.loyalty_discount != null ? Number(appt.loyalty_discount) : null,
        manual_discount_value:
          appt.manual_discount_value != null
            ? Number(appt.manual_discount_value)
            : null,
        manual_discount_label: appt.manual_discount_label ?? null,
        deposit_amount,
        deposit_date,
        status: appt.status,
      },
    });
  } catch (err) {
    console.error('POS appointment load route error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
