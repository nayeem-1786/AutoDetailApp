import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createAdminClient } from '@/lib/supabase/admin';
import { bookingSubmitSchema } from '@/lib/utils/validation';
import { normalizePhone } from '@/lib/utils/format';
import { extractCardDetailsFromCharge } from '@/lib/utils/stripe-card-details';
import { APPOINTMENT, FEATURE_FLAGS, CUSTOMER_SELF_SERVICE_SIZE_CLASSES } from '@/lib/utils/constants';
import { computeExpectedPrice } from './_pricing';
import { checkMobileEligibility, mobileIneligibleErrorMessage } from './_mobile-eligibility';
import {
  checkPrimaryClassification,
  primaryClassificationErrorMessage,
} from './_classification';
import {
  checkNotStaffAssessed,
  staffAssessedQuoteRequiredErrorMessage,
} from './_staff-assessed';
import {
  assertPrereqsCompatible,
  prereqIncompatibleErrorMessage,
  type PrereqRow,
} from './_prereq-enforcement';
import {
  checkAddonsVehicleCompatible,
  addonVehicleIncompatibleErrorMessage,
} from './_addon-vehicle-compat';
import { isFeatureEnabled } from '@/lib/utils/feature-flags';
import { addMinutesToTime, findAvailableDetailer } from '@/lib/utils/assign-detailer';
import { updateSmsConsent } from '@/lib/utils/sms-consent';
import { logAudit, getRequestIp } from '@/lib/services/audit';
import { sendWelcomeEmail } from '@/lib/email/send-welcome-email';
import { sendSms } from '@/lib/utils/sms';
import { resolveMobileAddressAction } from '@/lib/utils/mobile-address-action';
import { resolveVehicleSaveAction } from '@/lib/utils/vehicle-save-action';
import { sendEmail } from '@/lib/utils/email';
import { sendTemplatedEmail } from '@/lib/email/send-templated-email';
import { cleanVehicleDescription } from '@/lib/utils/vehicle-helpers';
import { categoryToCompatibilityKey } from '@/lib/utils/vehicle-categories';
import { getBusinessInfo } from '@/lib/data/business';
import { generateReceiptNumber } from '@/lib/utils/receipt-number';
import { generateAppointmentNumber } from '@/lib/utils/appointment-number';
import { formatCurrency } from '@/lib/utils/format';
import { renderSmsTemplate } from '@/lib/sms/render-sms-template';
import { buildPaymentInfo, buildDepositInfo } from '@/lib/sms/composites';
import { applyCombosToQuoteItems } from '@/lib/services/combo-resolver';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = bookingSubmitSchema.safeParse(body);

    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors;
      const missingFields = Object.entries(fieldErrors)
        .map(([field, msgs]) => `${field}: ${(msgs as string[]).join(', ')}`)
        .join('; ');
      return NextResponse.json(
        {
          error: missingFields
            ? `Validation failed — ${missingFields}`
            : 'Invalid booking data',
          fieldErrors,
        },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const supabase = createAdminClient();

    // 1. Normalize phone to E.164
    const e164Phone = normalizePhone(data.customer.phone);
    if (!e164Phone) {
      return NextResponse.json(
        { error: 'Invalid phone number' },
        { status: 400 }
      );
    }

    // 2. Server-side price validation against actual service_pricing data
    const { data: serviceRow } = await supabase
      .from('services')
      .select('*, service_pricing(*)')
      .eq('id', data.service_id)
      .eq('is_active', true)
      .eq('online_bookable', true)
      .single();

    if (!serviceRow) {
      return NextResponse.json(
        { error: 'Service not found or not bookable' },
        { status: 400 }
      );
    }

    // W1 (Unit B audit, 2026-05-30) layer 2 — server classification check.
    // The data layer (`getBookableServices` / `getBookableServiceBySlug`)
    // applies the same rule via Supabase `.in('classification', …)` so
    // addon_only services never reach the Step 2 picker on a properly-
    // rendered page; this is the server's catch for tampered/replayed
    // requests + the operator-misconfiguration case (classification set
    // to addon_only but online_bookable left true). Pure rule lives in
    // `./_classification.ts` (see header for the two-layer rationale).
    // Validation order: existence → classification → pricing → slot
    // (each layer assumes the prior one passed).
    const classificationCheck = checkPrimaryClassification({
      name: serviceRow.name as string,
      classification: serviceRow.classification,
    });
    if (!classificationCheck.ok) {
      return NextResponse.json(
        { error: primaryClassificationErrorMessage(classificationCheck.serviceName) },
        { status: 400 }
      );
    }

    // Fetch addon service rows once for downstream validation checks
    // (W3 staff_assessed + W2 mobile_eligibility + W7 addon
    // vehicle_compatibility) AND for the W4 line-item is_taxable
    // persistence below. Selecting `staff_assessed`, `mobile_eligible`,
    // `is_taxable`, and `vehicle_compatibility` here means we issue ONE
    // query instead of four when an `is_mobile` booking carries addons,
    // and zero extra queries when no addons are present. Defining the
    // shared row type once also keeps each consumer honest about which
    // flags it reads.
    type AddonValidationRow = {
      id: string;
      name: string;
      mobile_eligible: boolean;
      staff_assessed: boolean;
      is_taxable: boolean;
      vehicle_compatibility: string[] | null;
    };
    let addonServiceRows: AddonValidationRow[] = [];
    if (data.addons.length > 0) {
      const addonIds = data.addons.map((a) => a.service_id);
      const { data: addonRows, error: addonErr } = await supabase
        .from('services')
        .select('id, name, mobile_eligible, staff_assessed, is_taxable, vehicle_compatibility')
        .in('id', addonIds);
      if (addonErr) {
        console.error('Addon row lookup failed:', addonErr.message);
        return NextResponse.json(
          { error: 'Failed to validate add-on services' },
          { status: 500 }
        );
      }
      addonServiceRows = (addonRows ?? []) as AddonValidationRow[];
    }

    // W3 (Unit B audit, 2026-05-30) layer 2 — server staff_assessed check.
    // Operator's Q-B rule (Session U-B.3): services with
    // `staff_assessed=true` require staff evaluation for pricing and are
    // not self-bookable online; customers are routed to a "Request a
    // Quote" CTA (RequestQuoteCard → /api/public/specialty-callback with
    // request_type='staff_assessed_service'). The client gates this on
    // `selectedService.staff_assessed` in step-service-select.tsx so the
    // rendered page never reaches the Continue button for these
    // services; this is the server's catch for tampered/replayed
    // requests + the operator-misconfiguration case (staff_assessed
    // toggled on but online_bookable left true). Pure rule lives in
    // `./_staff-assessed.ts`. Checked here BEFORE price validation
    // because staff_assessed services have no canonical price, so
    // surfacing this error first produces a more actionable message
    // than a downstream "price mismatch — please refresh" fallback.
    const staffAssessedCheck = checkNotStaffAssessed(
      { name: serviceRow.name as string, staff_assessed: serviceRow.staff_assessed },
      addonServiceRows.map((a) => ({ name: a.name, staff_assessed: a.staff_assessed }))
    );
    if (!staffAssessedCheck.ok) {
      return NextResponse.json(
        { error: staffAssessedQuoteRequiredErrorMessage(staffAssessedCheck.serviceName) },
        { status: 400 }
      );
    }

    // W5 (Unit B audit, 2026-05-30 — Session U-B.5 / Path B Session 1)
    // layer 2 — server prerequisite-vehicle-compatibility check.
    //
    // Q-W5-UX LOCKED rule (Session U-B.5): when a primary service has
    // prerequisites configured AND at least one of those prerequisite
    // services is NOT compatible with the customer's vehicle category,
    // the customer can never self-service the dependent service —
    // they need staff assistance via the `<RequestQuoteCard>` CTA
    // (Q-W5-UX Option 1: show with "Custom Quote" badge, reuse
    // `request_type='staff_assessed_service'`). Pure rule lives in
    // `./_prereq-enforcement.ts`. The client renders the badge +
    // suppresses the Continue button for these services on Step 2;
    // this is the server's catch for tampered/replayed requests + the
    // operator-misconfiguration case (prereq with
    // `vehicle_compatibility: ['standard']` on a service available
    // to non-automobile customers).
    //
    // Public-booking SUBSET semantics (Q-Arch-1 LOCKED): unlike POS —
    // which gates prereqs by SATISFACTION (history/same-ticket) and
    // offers a manager override — public booking checks ONE axis only:
    // prereq vehicle-compatibility. That's the axis the customer can
    // never resolve themselves; satisfaction is something staff will
    // work out via the quote request. No manager override on this
    // surface.
    //
    // Fetched as a separate query (rather than re-fetching the primary
    // with an embed) because the primary row was already retrieved
    // above; pulling prereqs once via the dedicated table mirrors how
    // POS does it in `check-prerequisites/route.ts`. When the primary
    // has no prereqs configured this is one round-trip that returns
    // zero rows — cheap.
    const { data: prereqRows, error: prereqErr } = await supabase
      .from('service_prerequisites')
      .select(
        `prerequisite_service:services!prerequisite_service_id(name, vehicle_compatibility)`
      )
      .eq('service_id', data.service_id);

    if (prereqErr) {
      console.error('Prerequisite row lookup failed:', prereqErr.message);
      return NextResponse.json(
        { error: 'Failed to validate service prerequisites' },
        { status: 500 }
      );
    }

    const prereqCheck = assertPrereqsCompatible(
      {
        name: serviceRow.name as string,
        service_prerequisites: (prereqRows ?? []) as unknown as PrereqRow[],
      },
      data.vehicle?.vehicle_category ?? null
    );
    if (!prereqCheck.ok) {
      return NextResponse.json(
        {
          error: prereqIncompatibleErrorMessage(
            prereqCheck.serviceName,
            prereqCheck.offendingPrereqs
          ),
        },
        { status: 400 }
      );
    }

    // W7 (Unit B audit, 2026-05-30 — Session U-B.5 / Path B Session 1)
    // layer 2 — server addon-vehicle-compatibility check.
    //
    // Each addon carries its own `vehicle_compatibility` (same shape
    // as the primary). The client filter at Step 2 hides incompatible
    // addons from the picker; this is the server's catch for
    // tampered/replayed requests + the case where the customer
    // selected addons for one vehicle then switched categories
    // mid-flow (the client filter runs at render time only).
    //
    // Reuses `addonServiceRows` fetched once above (extended in U-B.5
    // to include `vehicle_compatibility`). Pure rule lives in
    // `./_addon-vehicle-compat.ts`. The primary's own
    // vehicle_compatibility is checked separately at `:343` against
    // the find-or-create canonical row — this helper handles addons
    // only, by design.
    const addonCompatCheck = checkAddonsVehicleCompatible(
      addonServiceRows.map((a) => ({
        name: a.name,
        vehicle_compatibility: a.vehicle_compatibility,
      })),
      data.vehicle?.vehicle_category ?? null
    );
    if (!addonCompatCheck.ok) {
      return NextResponse.json(
        { error: addonVehicleIncompatibleErrorMessage(addonCompatCheck.serviceName) },
        { status: 400 }
      );
    }

    // Validate the primary service price
    const expectedPrice = computeExpectedPrice(serviceRow, data.tier_name, data.vehicle?.size_class);
    if (expectedPrice !== null && Math.abs(expectedPrice - data.price) > 0.01) {
      return NextResponse.json(
        { error: 'Price mismatch — please refresh and try again' },
        { status: 400 }
      );
    }

    // 3. Double-check slot availability
    const endTimeStr = addMinutesToTime(
      data.time,
      data.duration_minutes + APPOINTMENT.BUFFER_MINUTES
    );

    const { data: overlapping } = await supabase
      .from('appointments')
      .select('id')
      .eq('scheduled_date', data.date)
      .neq('status', 'cancelled')
      .lt('scheduled_start_time', endTimeStr)
      .gt('scheduled_end_time', data.time)
      .limit(1);

    if (overlapping && overlapping.length > 0) {
      return NextResponse.json(
        { error: 'This time slot is no longer available' },
        { status: 409 }
      );
    }

    // 4. Find-or-create customer (match by phone, fallback to email)
    let customerId: string;

    const { data: existingByPhone } = await supabase
      .from('customers')
      .select('id, first_name, last_name, email, customer_type')
      .eq('phone', e164Phone)
      .is('deleted_at', null)
      .limit(1)
      .single();

    const smsConsent = data.customer.sms_consent ?? false;
    const emailConsent = data.customer.email_consent ?? false;

    if (existingByPhone) {
      customerId = existingByPhone.id;
      // Update any missing fields + consent upgrades (never downgrade via booking)
      const updates: Record<string, unknown> = {};
      if (!existingByPhone.email && data.customer.email) {
        updates.email = data.customer.email;
      }
      if (!existingByPhone.customer_type) {
        updates.customer_type = 'enthusiast';
      }
      if (smsConsent) updates.sms_consent = true;
      if (emailConsent) updates.email_consent = true;
      if (Object.keys(updates).length > 0) {
        updates.updated_at = new Date().toISOString();
        await supabase.from('customers').update(updates).eq('id', customerId);
      }
      // Log SMS consent opt-in if customer checked the box
      if (smsConsent) {
        await updateSmsConsent({
          customerId,
          phone: e164Phone,
          action: 'opt_in',
          keyword: 'booking_form',
          source: 'booking_form',
        });
      }
    } else {
      // Try matching by email (only if email is non-empty — null/empty would match wrong records)
      const hasEmail = data.customer.email && data.customer.email.trim();
      const { data: existingByEmail } = hasEmail
        ? await supabase
            .from('customers')
            .select('id, phone, customer_type')
            .eq('email', data.customer.email)
            .is('phone', null)
            .is('deleted_at', null)
            .limit(1)
            .single()
        : { data: null };

      if (existingByEmail) {
        customerId = existingByEmail.id;
        const updates: Record<string, unknown> = {
          phone: e164Phone,
          updated_at: new Date().toISOString(),
        };
        if (!existingByEmail.customer_type) {
          updates.customer_type = 'enthusiast';
        }
        if (smsConsent) updates.sms_consent = true;
        if (emailConsent) updates.email_consent = true;
        await supabase.from('customers').update(updates).eq('id', customerId);
        if (smsConsent) {
          await updateSmsConsent({
            customerId,
            phone: e164Phone,
            action: 'opt_in',
            keyword: 'booking_form',
            source: 'booking_form',
          });
        }
      } else {
        // Create new customer - all online bookings are enthusiasts by default
        const { data: newCustomer, error: custErr } = await supabase
          .from('customers')
          .insert({
            first_name: data.customer.first_name,
            last_name: data.customer.last_name,
            phone: e164Phone,
            email: data.customer.email,
            customer_type: 'enthusiast',
            sms_consent: smsConsent,
            email_consent: emailConsent,
          })
          .select('id')
          .single();

        if (custErr || !newCustomer) {
          console.error('Customer creation failed:', custErr?.message);
          return NextResponse.json(
            { error: 'Failed to create customer record' },
            { status: 500 }
          );
        }
        customerId = newCustomer.id;

        // Send welcome email for new customers (non-blocking)
        if (data.customer?.email) {
          sendWelcomeEmail({
            email: data.customer.email,
            first_name: data.customer.first_name,
            last_name: data.customer.last_name,
          }).catch(err => console.error('Welcome email failed (non-blocking):', err));
        }

        // Log SMS consent for new customer if opted in
        if (smsConsent) {
          await updateSmsConsent({
            customerId,
            phone: e164Phone,
            action: 'opt_in',
            keyword: 'booking_form',
            source: 'booking_form',
          });
        }
      }
    }

    // 5. Find existing or create vehicle linked to customer — shared dedup
    let vehicleId: string | null = null;
    // Path B Session 2 / Concern 2 (Session #141): track whether the
    // vehicle was a fresh insert vs. matched an existing row. Mirrors
    // `findOrCreateVehicle`'s own `created` discriminant — we propagate
    // it down to `resolveVehicleSaveAction` at response-build time so
    // the booking-confirmation page can fire a "We've saved your
    // vehicle to your account" toast ONLY when there's something new
    // to announce (matched existing → customer already knew about it).
    // Default false: the `data.vehicle?.id` branch is by definition
    // "existing vehicle picked from saved list," so no announcement.
    let vehicleCreated = false;
    if (data.vehicle?.id) {
      // Existing vehicle selected from Step 1 — use directly
      vehicleId = data.vehicle.id;
    } else if (data.vehicle && data.vehicle.make) {
      // New vehicle entered — find or create
      const { findOrCreateVehicle } = await import('@/lib/utils/vehicle-helpers');
      const vehicleResult = await findOrCreateVehicle(supabase, {
        customerId,
        make: data.vehicle.make,
        model: data.vehicle.model,
        year: data.vehicle.year,
        color: data.vehicle.color,
        vehicle_category: data.vehicle.vehicle_category,
        vehicle_type: data.vehicle.vehicle_type,
        size_class: data.vehicle.size_class,
        specialty_tier: data.vehicle.specialty_tier,
      });
      if (vehicleResult) {
        vehicleId = vehicleResult.id;
        vehicleCreated = vehicleResult.created;

        // Vehicle/service compatibility check
        const compatKey = categoryToCompatibilityKey(vehicleResult.vehicle_category as 'automobile' | 'motorcycle' | 'rv' | 'boat' | 'aircraft');
        const compatibility = Array.isArray(serviceRow.vehicle_compatibility) ? serviceRow.vehicle_compatibility as string[] : [];
        if (compatibility.length > 0 && !compatibility.includes(compatKey)) {
          const categoryLabel = vehicleResult.vehicle_category.charAt(0).toUpperCase() + vehicleResult.vehicle_category.slice(1);
          return NextResponse.json(
            { error: `This service is not available for ${categoryLabel} vehicles. Please select the appropriate service for your vehicle.` },
            { status: 400 }
          );
        }
      }
    }

    // 6. Calculate totals
    const addonTotal = data.addons.reduce((sum, a) => sum + a.price, 0);

    // Reject mobile bookings when mobile_service flag is off
    if (data.is_mobile && !await isFeatureEnabled(FEATURE_FLAGS.MOBILE_SERVICE)) {
      return NextResponse.json(
        { error: 'Mobile service is not currently available' },
        { status: 400 }
      );
    }

    // W2 (Unit B audit, 2026-05-30): server-side defense for
    // `services.mobile_eligible`. The Step 2 client already gates the
    // "Add mobile service" UI on `selectedService.mobile_eligible`
    // (step-service-select.tsx:475) and the addon cards on
    // `service.mobile_eligible` (`:870`), but a tampered or replayed
    // request could submit `is_mobile=true` with a non-eligible
    // service or addon. Pure rule lives in `./_mobile-eligibility.ts`
    // (see header for rationale + unit tests). Validation order mirrors
    // existing pattern: feature flag → service eligibility → zone.
    if (data.is_mobile) {
      // Reuses `addonServiceRows` fetched once above (post-classification
      // check) so this branch no longer issues its own addon query when
      // both W2 and W3 checks need addon flags.
      const eligibilityCheck = checkMobileEligibility(
        { name: serviceRow.name as string, mobile_eligible: serviceRow.mobile_eligible },
        addonServiceRows.map((a) => ({ name: a.name, mobile_eligible: a.mobile_eligible }))
      );
      if (!eligibilityCheck.ok) {
        return NextResponse.json(
          { error: mobileIneligibleErrorMessage(eligibilityCheck.serviceName) },
          { status: 400 }
        );
      }
    }

    // Server-side mobile zone validation. Anonymous booking clients can't be
    // trusted with the surcharge value — re-fetch the zone and verify the
    // client-supplied surcharge matches. Closes the prior gap where a
    // tampered request could send is_mobile=true with mobile_surcharge=0.
    let mobileZoneNameSnapshot: string | null = null;
    let mobileSurcharge = 0;
    if (data.is_mobile) {
      if (!data.mobile_zone_id) {
        return NextResponse.json(
          { error: 'Please select a service area for the mobile fee' },
          { status: 400 }
        );
      }
      const { data: zone, error: zoneErr } = await supabase
        .from('mobile_zones')
        .select('id, name, surcharge, is_available')
        .eq('id', data.mobile_zone_id)
        .single();
      if (zoneErr || !zone) {
        return NextResponse.json({ error: 'Invalid mobile zone' }, { status: 400 });
      }
      if (!zone.is_available) {
        return NextResponse.json({ error: 'Mobile zone is not available' }, { status: 400 });
      }
      const clientSurcharge = Number(data.mobile_surcharge ?? 0);
      if (Math.abs(Number(zone.surcharge) - clientSurcharge) > 0.01) {
        return NextResponse.json(
          { error: 'Mobile surcharge mismatch — please refresh and try again' },
          { status: 400 }
        );
      }
      mobileSurcharge = Number(zone.surcharge);
      mobileZoneNameSnapshot = zone.name;
    }

    const subtotal = data.price + addonTotal + mobileSurcharge;
    const scheduledEndTime = addMinutesToTime(
      data.time,
      data.duration_minutes + APPOINTMENT.BUFFER_MINUTES
    );

    // 6b. Auto-assign detailer
    const assignedEmployeeId = await findAvailableDetailer(
      supabase,
      data.date,
      data.time,
      scheduledEndTime
    );

    // 7. Create appointment
    // Auto-confirm if paid online (deposit or full), otherwise pending for review
    const initialStatus = data.payment_intent_id ? 'confirmed' : 'pending';

    // Calculate total with all discounts
    const couponDiscount = data.coupon_discount ?? 0;
    const loyaltyDiscount = data.loyalty_discount ?? 0;
    const totalAfterDiscount = subtotal - couponDiscount - loyaltyDiscount;
    const loyaltyPoints = Number(data.loyalty_points_used ?? 0) || 0;

    // Phase 3 Theme A (AC-10 v1.4): appointment_number is NOT NULL — generate
    // it before the INSERT so the row can satisfy the constraint.
    const appointmentNumber = await generateAppointmentNumber(supabase);
    const { data: appointment, error: apptErr } = await supabase
      .from('appointments')
      .insert({
        appointment_number: appointmentNumber,
        customer_id: customerId,
        vehicle_id: vehicleId,
        employee_id: assignedEmployeeId,
        status: initialStatus,
        channel: data.channel || 'online',
        scheduled_date: data.date,
        scheduled_start_time: data.time,
        scheduled_end_time: scheduledEndTime,
        is_mobile: data.is_mobile,
        mobile_zone_id: data.is_mobile ? data.mobile_zone_id : null,
        mobile_address: data.is_mobile ? data.mobile_address : null,
        mobile_surcharge: mobileSurcharge,
        mobile_zone_name_snapshot: mobileZoneNameSnapshot,
        subtotal,
        tax_amount: 0,
        discount_amount: couponDiscount + loyaltyDiscount,
        total_amount: totalAfterDiscount,
        job_notes: data.notes || null,
        // New payment options fields
        payment_type: data.payment_option || (data.payment_intent_id ? 'deposit' : 'pay_on_site'),
        deposit_amount: data.deposit_amount || null,
        coupon_code: data.coupon_code || null,
        coupon_discount: couponDiscount || null,
        loyalty_points_redeemed: loyaltyPoints,
        loyalty_discount: loyaltyDiscount || 0,
      })
      .select('id, scheduled_date, scheduled_start_time, scheduled_end_time, total_amount, is_mobile, mobile_address, mobile_surcharge, status, channel, subtotal')
      .single();

    if (apptErr || !appointment) {
      console.error('Appointment creation failed:', apptErr?.message, apptErr?.details, apptErr?.hint);
      return NextResponse.json(
        { error: `Failed to create appointment: ${apptErr?.message || 'Unknown error'}` },
        { status: 500 }
      );
    }

    // 8. Create appointment_services rows (primary + addons)
    const serviceRows = [
      {
        appointment_id: appointment.id,
        service_id: data.service_id,
        price_at_booking: data.price,
        tier_name: data.tier_name || null,
      },
      ...data.addons.map((addon) => ({
        appointment_id: appointment.id,
        service_id: addon.service_id,
        price_at_booking: addon.price,
        tier_name: addon.tier_name || null,
      })),
    ];

    const { error: junctionErr } = await supabase
      .from('appointment_services')
      .insert(serviceRows);

    if (junctionErr) {
      console.error('Appointment services insertion failed:', junctionErr.message);
    }

    // 8b. If payment was made online (deposit), update payment status + record transaction
    if (data.payment_intent_id) {
      // For deposits, payment_status remains 'pending' since only partial payment was made
      // Only mark as 'paid' if full amount was charged (deposit === total)
      const depositAmount = data.deposit_amount ?? 0;
      const isPaidInFull = depositAmount >= totalAfterDiscount;

      await supabase
        .from('appointments')
        .update({
          stripe_payment_intent_id: data.payment_intent_id,
          payment_status: isPaidInFull ? 'paid' : 'pending',
        })
        .eq('id', appointment.id);

      // Record deposit as a transaction so it appears in Admin > Transactions.
      // Phase 3 Theme A (AC-10 v1.4): receipt_number generated explicitly via
      // next_identifier('receipt') (SD-XXXXX, 5-digit format). The pre-Theme-A
      // BEFORE INSERT trigger that auto-supplied this column is dropped.
      if (depositAmount > 0) {
        const balanceDue = totalAfterDiscount - depositAmount;
        const depositReceiptNumber = await generateReceiptNumber(supabase);
        const { data: depositTx, error: txErr } = await supabase.from('transactions').insert({
          appointment_id: appointment.id,
          customer_id: customerId,
          vehicle_id: vehicleId,
          employee_id: null,
          status: 'completed',
          subtotal: totalAfterDiscount,
          tax_amount: 0,
          tip_amount: 0,
          discount_amount: 0,
          total_amount: depositAmount,
          payment_method: 'card',
          notes: `Online booking deposit. Service total: $${totalAfterDiscount.toFixed(2)}. Balance due at service: $${balanceDue.toFixed(2)}.`,
          transaction_date: new Date().toISOString(),
          receipt_number: depositReceiptNumber,
        }).select('id').single();

        if (txErr || !depositTx) {
          console.error('[Booking] Deposit transaction insert failed:', txErr?.message);
        } else {
          console.log(`[Booking] Deposit transaction recorded: $${depositAmount} for appointment ${appointment.id}`);

          // Insert transaction_items matching POS format for receipt compatibility
          const sizeClass = data.vehicle?.size_class && (CUSTOMER_SELF_SERVICE_SIZE_CLASSES as readonly string[]).includes(data.vehicle.size_class)
            ? data.vehicle.size_class
            : null;

          // Issue 33 Layer 1: detect combos across primary + addons so the
          // audit trail (transaction_items.pricing_type + .standard_price)
          // reflects reality. The customer-facing addon.price already carries
          // combo_price from the booking client UI; the combo helper finds
          // the corresponding service_addon_suggestions row, rewrites the
          // addon line item with pricing_type='combo', and captures the
          // standalone standard_price for reporting. Boundary pin: the
          // booking schema (bookingVehicleSchema) restricts size_class to
          // CUSTOMER_SELF_SERVICE_SIZE_CLASSES (sedan / truck_suv_2row /
          // suv_3row_van) — exotic/classic are rejected upstream at the
          // Zod layer and never reach this code.
          const comboInputItems = [
            {
              service_id: data.service_id,
              item_name: serviceRow.name as string,
              quantity: 1,
              unit_price: data.price,
              tier_name: data.tier_name || null,
              standard_price: null,
              pricing_type: 'standard' as const,
            },
            ...data.addons.map((addon) => ({
              service_id: addon.service_id,
              item_name: addon.name,
              quantity: 1,
              unit_price: addon.price,
              tier_name: addon.tier_name || null,
              standard_price: null as number | null,
              pricing_type: 'standard' as const,
            })),
          ];
          const resolvedItems = await applyCombosToQuoteItems(supabase, comboInputItems);
          const resolvedPrimary = resolvedItems[0];
          const resolvedAddons = resolvedItems.slice(1);

          // W4 (Unit B audit, 2026-05-30 — Session #138, U-B.4 Phase 2):
          // mirror products' POS-side line-item persistence pattern for
          // services on the booking deposit. Each `transaction_items` row
          // now carries the SERVICE's own `is_taxable` flag instead of
          // hardcoded `false`. Q-C LOCKED Option A (line-item persistence
          // only — no Step 4 tax UI, no payment-intent tax computation):
          // the deposit is a partial pre-payment, not a completed sale;
          // CA CDTFA Pub 100 ties tax to service completion (which
          // /api/pos/appointments/[id]/load + POS finalization handle
          // correctly today via a live `services.is_taxable` lookup +
          // the canonical `calculateItemTax(price, isTaxable)` helper in
          // `src/app/pos/utils/tax.ts`). The persistence fix surfaces in
          // the admin Transaction Detail page (`transaction-detail.tsx:306`)
          // — taxable items now show `$0.00` (correctly typed) instead of
          // `---` (mistyped as non-taxable). `tax_amount: 0` stays on
          // both items + the deposit transaction because no tax is
          // collected at deposit time.
          //
          // Addons look up via `addonServiceRows` (fetched once above for
          // W2/W3 — extended in U-B.4 to include `is_taxable`). Defensive
          // `?? false` default per operator guidance: POS finalization
          // re-reads canonical `services.is_taxable` at drain time, so a
          // race where an addon row was deleted between fetch + insert
          // still resolves correctly downstream.
          const addonMetaById = new Map(addonServiceRows.map((a) => [a.id, a]));

          const lineItems = [
            {
              transaction_id: depositTx.id,
              item_type: 'service' as const,
              product_id: null,
              service_id: data.service_id,
              package_id: null,
              item_name: serviceRow.name as string,
              quantity: 1,
              unit_price: resolvedPrimary.unit_price,
              total_price: resolvedPrimary.unit_price,
              tax_amount: 0,
              is_taxable: serviceRow.is_taxable as boolean,
              tier_name: data.tier_name || null,
              vehicle_size_class: sizeClass,
              notes: null,
              standard_price: resolvedPrimary.standard_price ?? resolvedPrimary.unit_price,
              pricing_type: resolvedPrimary.pricing_type ?? 'standard',
              is_addon: false,
              prerequisite_note: null,
            },
            ...resolvedAddons.map((addon) => ({
              transaction_id: depositTx.id,
              item_type: 'service' as const,
              product_id: null,
              service_id: addon.service_id,
              package_id: null,
              item_name: addon.item_name,
              quantity: 1,
              unit_price: addon.unit_price,
              total_price: addon.unit_price,
              tax_amount: 0,
              is_taxable: addonMetaById.get(addon.service_id)?.is_taxable ?? false,
              tier_name: addon.tier_name,
              vehicle_size_class: sizeClass,
              notes: null,
              standard_price: addon.standard_price ?? addon.unit_price,
              pricing_type: addon.pricing_type ?? 'standard',
              is_addon: true,
              prerequisite_note: null,
            })),
            // Mobile fee materialization (Option D2). Visible line item on
            // the deposit transaction so receipts + ticket displays show
            // "<zone name> — $40.00" alongside the services. Non-taxable
            // per CDTFA Pub 100 (separately-stated delivery fee) — this
            // is the ONE line item that legitimately stays
            // `is_taxable: false` after W4 (Session #138) closed the
            // service+addon persistence gap. The CDTFA citation is the
            // justification; do not "fix" this to `serviceRow.is_taxable`.
            ...(data.is_mobile && mobileSurcharge > 0
              ? [{
                  transaction_id: depositTx.id,
                  item_type: 'mobile_fee' as const,
                  product_id: null,
                  service_id: null,
                  package_id: null,
                  item_name: mobileZoneNameSnapshot || 'Mobile Service Fee',
                  quantity: 1,
                  unit_price: mobileSurcharge,
                  total_price: mobileSurcharge,
                  tax_amount: 0,
                  is_taxable: false,
                  tier_name: null,
                  vehicle_size_class: null,
                  notes: null,
                  standard_price: mobileSurcharge,
                  pricing_type: 'standard',
                  is_addon: false,
                  prerequisite_note: null,
                }]
              : []),
          ];

          const { error: itemsErr } = await supabase
            .from('transaction_items')
            .insert(lineItems);

          if (itemsErr) {
            console.error('[Booking] Deposit transaction items insert failed:', itemsErr.message);
          }

          // Phase 1A.5 Part B: retrieve the PaymentIntent + latest_charge to
          // extract card brand + last4 so the deposit receipt renders
          // "Visa ****1074" instead of generic "Card". Going-forward only —
          // historical booking-deposit rows remain null per LOCKED-B1.
          // Helper returns nulls on any failure (missing latest_charge,
          // non-card method, Stripe API error); booking flow never blocks
          // on enrichment.
          let depositCardDetails: { card_brand: string | null; card_last_four: string | null } = {
            card_brand: null,
            card_last_four: null,
          };
          try {
            const stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY!);
            const pi = await stripeClient.paymentIntents.retrieve(data.payment_intent_id);
            depositCardDetails = await extractCardDetailsFromCharge(
              stripeClient,
              pi.latest_charge as string | null,
              `booking deposit PI ${data.payment_intent_id}`
            );
          } catch (piErr) {
            console.error(
              `[Booking] PI retrieve failed for ${data.payment_intent_id} — receipt will show generic Card label:`,
              piErr
            );
          }

          // Insert payment row so receipt shows payment method
          const { error: payErr } = await supabase.from('payments').insert({
            transaction_id: depositTx.id,
            method: 'card',
            amount: depositAmount,
            tip_amount: 0,
            tip_net: 0,
            stripe_payment_intent_id: data.payment_intent_id,
            card_brand: depositCardDetails.card_brand,
            card_last_four: depositCardDetails.card_last_four,
          });

          if (payErr) {
            console.error('[Booking] Deposit payment insert failed:', payErr.message);
          }
        }
      }
    }

    // Theme G — outbound `booking_created` + `appointment_confirmed` webhook
    // fires removed (no n8n receiver wired in Smart Details; audit f5e714a8).
    // Pre-Theme-G this block built a ~50-line `webhookPayload` for the n8n
    // POST; with no receiver wired the payload was never read. Customer +
    // staff confirmation dispatch is the inline SMS/email block below.

    // 10. Send booking confirmation + staff notification (fire-and-forget)
    try {
      const biz = await getBusinessInfo();
      const dateStr = new Date(data.date + 'T12:00:00').toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        timeZone: 'America/Los_Angeles',
      });
      const [tH, tM] = data.time.split(':').map(Number);
      const period = tH >= 12 ? 'PM' : 'AM';
      const displayHour = tH % 12 || 12;
      const timeStr = `${displayHour}:${String(tM).padStart(2, '0')} ${period}`;

      const allServices = [
        serviceRow.name as string,
        ...data.addons.map((a) => a.name),
      ];
      const serviceNames = allServices.join(', ');
      // Build vehicle description for SMS/email — use form data first, query DB if only ID
      let vehicleStr = '';
      const vehicleFormDesc = cleanVehicleDescription({ year: data.vehicle?.year, make: data.vehicle?.make, model: data.vehicle?.model });
      if (vehicleFormDesc) {
        vehicleStr = vehicleFormDesc;
      } else if (vehicleId) {
        const { data: vehRecord } = await supabase
          .from('vehicles')
          .select('year, make, model, color')
          .eq('id', vehicleId)
          .single();
        if (vehRecord) {
          vehicleStr = cleanVehicleDescription({ year: vehRecord.year, color: vehRecord.color, make: vehRecord.make, model: vehRecord.model });
        }
      }
      const customerName = `${data.customer.first_name} ${data.customer.last_name}`.trim();
      const total = formatCurrency(Number(appointment.total_amount));

      // Deposit-aware variables for SMS/email templates
      const hasDeposit = !!(data.payment_intent_id && data.deposit_amount && data.deposit_amount > 0);
      const depositAmountFormatted = hasDeposit ? formatCurrency(data.deposit_amount!) : '';
      const balanceDueFormatted = hasDeposit
        ? formatCurrency(Number(appointment.total_amount) - data.deposit_amount!)
        : '';
      const paymentInfo = buildPaymentInfo({
        hasDeposit,
        depositAmount: depositAmountFormatted,
        balanceDue: balanceDueFormatted,
      });

      // G2 — Customer confirmation SMS
      if (e164Phone) {
        const customerSmsFallback = [
          `${biz.name} — Booking Confirmed!`,
          '', `${dateStr}`, `${timeStr}`, serviceNames,
          vehicleStr ? `Vehicle: ${vehicleStr}` : '', `Total: ${total}`,
          hasDeposit ? `Deposit: ${depositAmountFormatted}. Balance: ${balanceDueFormatted}.` : '',
          '', `Questions? Call ${biz.phone}`,
        ].filter(Boolean).join('\n');

        renderSmsTemplate('booking_confirmed', {
          appointment_date: dateStr,
          appointment_time: timeStr,
          services: serviceNames,
          service_total: total,
          // Session 2D cheap-adds. NOTE: vehicle_description here resolves
          // a long-standing contract drift — the body has long included
          // {vehicle_description} but the chip wasn't in the contract, so
          // the engine REMOVE_LINE'd that line silently. Adding to the
          // contract + wiring here makes the operator-authored body line
          // render the customer's vehicle as intended (CHANGELOG bug-fix).
          first_name: data.customer.first_name || undefined,
          last_name: data.customer.last_name || undefined,
          vehicle_description: vehicleStr || undefined,
        }, customerSmsFallback).then((result) => {
          if (result.isActive) {
            sendSms(e164Phone, result.body, {
              logToConversation: true,
              customerId,
              notificationType: 'booking_confirmed',
              contextId: appointment.id,
            }).catch((err) =>
              console.error('[Booking] Customer SMS failed (non-blocking):', err)
            );
          }
        }).catch((err) => console.error('[Booking] Template render failed:', err));
      }

      // G2 — Customer confirmation email
      if (data.customer.email) {
        const serviceRowsHtml = allServices
          .map((name, i) => {
            const price = i === 0 ? data.price : data.addons[i - 1]?.price ?? 0;
            return `<tr><td style="padding:8px 16px;border-bottom:1px solid #e5e7eb;">${name}</td><td style="padding:8px 16px;border-bottom:1px solid #e5e7eb;text-align:right;">${formatCurrency(price)}</td></tr>`;
          })
          .join('');
        const servicesTableHtml = `<table style="width:100%;border-collapse:collapse;"><thead><tr style="background:#f3f4f6;"><th style="padding:8px 16px;text-align:left;font-size:12px;text-transform:uppercase;">Service</th><th style="padding:8px 16px;text-align:right;font-size:12px;text-transform:uppercase;">Price</th></tr></thead><tbody>${serviceRowsHtml}</tbody></table>`;

        sendTemplatedEmail(data.customer.email, 'appointment_confirmed', {
          first_name: data.customer.first_name,
          last_name: data.customer.last_name,
          customer_name: customerName,
          appointment_date: dateStr,
          appointment_time: timeStr,
          appointment_total: total,
          deposit_amount: depositAmountFormatted,
          balance_due: balanceDueFormatted,
          payment_info: paymentInfo,
          vehicle_info: vehicleStr || 'N/A',
          services_list: serviceNames,
          items_table: servicesTableHtml,
          business_name: biz.name,
          business_phone: biz.phone,
          business_email: biz.email || '',
          business_address: biz.address,
          business_website: biz.website || '',
        }).catch((err) =>
          console.error('[Booking] Customer email failed (non-blocking):', err)
        );
      }

      // G3 — Staff notification SMS
      {
        const depositInfo = buildDepositInfo({ hasPayment: !!data.payment_intent_id });
        const staffFallback = `New online booking! ${customerName} — ${serviceNames} on ${dateStr} at ${timeStr}. ${depositInfo}`;
        renderSmsTemplate('booking_staff_notify', {
          customer_name: customerName,
          services: serviceNames,
          appointment_date: dateStr,
          appointment_time: timeStr,
          deposit_info: depositInfo,
          // Session 2D cheap-adds: customer contact + last_name + vehicle for staff.
          customer_email: data.customer.email || undefined,
          customer_phone: e164Phone || undefined,
          last_name: data.customer.last_name || undefined,
          vehicle_description: vehicleStr || undefined,
        }, staffFallback).then((result) => {
          if (result.isActive) {
            const phones = result.recipientPhones?.length ? result.recipientPhones : (biz.phone ? [biz.phone] : []);
            for (const phone of phones) {
              sendSms(phone, result.body).catch((err) =>
                console.error('[Booking] Staff SMS failed (non-blocking):', err)
              );
            }
          }
        }).catch((err) => console.error('[Booking] Staff template render failed:', err));
      }

      // G3 — Staff notification email
      if (biz.email) {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || '';
        const subject = `New Booking — ${customerName} — ${dateStr}`;
        const textBody = [
          `New online booking received!`,
          '',
          `Customer: ${customerName}`,
          `Phone: ${e164Phone}`,
          data.customer.email ? `Email: ${data.customer.email}` : '',
          vehicleStr ? `Vehicle: ${vehicleStr}` : '',
          `Services: ${serviceNames}`,
          `Date: ${dateStr} at ${timeStr}`,
          `Total: ${total}`,
          data.payment_intent_id ? `Payment: Deposit paid` : `Payment: Pay on site`,
          data.notes ? `Notes: ${data.notes}` : '',
          '',
          `View appointments: ${appUrl}/admin/appointments`,
        ].filter(Boolean).join('\n');

        const htmlBody = `<div style="font-family:sans-serif;max-width:500px;">
<h2 style="color:#1e3a5f;">New Online Booking</h2>
<p><strong>Customer:</strong> ${customerName}</p>
<p><strong>Phone:</strong> ${e164Phone}</p>
${data.customer.email ? `<p><strong>Email:</strong> ${data.customer.email}</p>` : ''}
${vehicleStr ? `<p><strong>Vehicle:</strong> ${vehicleStr}</p>` : ''}
<p><strong>Services:</strong> ${serviceNames}</p>
<p><strong>Date:</strong> ${dateStr} at ${timeStr}</p>
<p><strong>Total:</strong> ${total}</p>
<p><strong>Payment:</strong> ${data.payment_intent_id ? 'Deposit paid' : 'Pay on site'}</p>
${data.notes ? `<p><strong>Notes:</strong> ${data.notes}</p>` : ''}
<br/>
<a href="${appUrl}/admin/appointments" style="display:inline-block;padding:12px 24px;background-color:#1e3a5f;color:#fff;text-decoration:none;border-radius:6px;">View Appointments</a>
</div>`;

        sendEmail(biz.email, subject, textBody, htmlBody).catch((err) =>
          console.error('[Booking] Staff email failed (non-blocking):', err)
        );
      }
    } catch (notifyErr) {
      console.error('[Booking] Notification failed (non-blocking):', notifyErr);
    }

    logAudit({
      userId: null,
      userEmail: data.customer.email,
      action: 'create',
      entityType: 'booking',
      entityId: appointment.id,
      entityLabel: `Booking for ${data.customer.first_name} ${data.customer.last_name}`,
      details: {
        service_name: serviceRow.name as string,
        scheduled_date: data.date,
      },
      ipAddress: getRequestIp(request),
      source: 'customer_portal',
    });

    // Phase Mobile-1.1: save-to-customer action. Returns null when mobile
    // is off / no customer / empty address. Performs silent-save UPDATE
    // atomically when the customer has no existing profile address — for
    // new customers, this captures their first address from the booking.
    const mobile_address_action = await resolveMobileAddressAction(supabase, {
      customerId,
      isMobile: data.is_mobile,
      enteredAddress: data.mobile_address ?? null,
    });

    // Path B Session 2 / Concern 2 (Session #141, 2026-06-02) —
    // save-to-customer action for the vehicle, mirroring the SHAPE of
    // `mobile_address_action`. Returns null when the booking used an
    // existing vehicle (no announcement needed — customer already
    // knew about it) OR when there's no customer/vehicle linkage.
    // Returns `{ silently_saved: true, vehicle_id, customer_id }` when
    // `findOrCreateVehicle` inserted a fresh row — the client uses
    // this signal to fire the "We've saved your vehicle to your
    // account" toast on the booking confirmation page with a "View →"
    // deep-link into `/account/vehicles`. Pure synth (no DB calls) —
    // unlike `resolveMobileAddressAction` which queries customers +
    // may run an UPDATE, the vehicle case's work is already done by
    // `findOrCreateVehicle` upstream; this helper just synthesizes
    // the response shape. Q-PB-S2 LOCKED Option 1 (transparency-only;
    // no opt-out toggle because `vehicles.customer_id NOT NULL`
    // makes a "vehicle without account linkage" data path impossible
    // without a schema migration — out of scope per session prompt).
    const vehicle_save_action = resolveVehicleSaveAction({
      customerId,
      vehicleId,
      vehicleCreated,
    });

    return NextResponse.json(
      {
        success: true,
        appointment: {
          id: appointment.id,
          date: appointment.scheduled_date,
          start_time: appointment.scheduled_start_time,
          end_time: appointment.scheduled_end_time,
          total: appointment.total_amount,
        },
        mobile_address_action,
        vehicle_save_action,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error('Booking API error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// computeExpectedPrice — booking-price validator — moved to `./_pricing.ts`
// (Item 15f Layer 4 extraction). The underscore prefix excludes the file
// from Next.js route resolution while keeping it co-located with the
// route that calls it. Imported above.
