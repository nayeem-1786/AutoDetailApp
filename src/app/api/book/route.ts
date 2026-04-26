import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { bookingSubmitSchema } from '@/lib/utils/validation';
import { normalizePhone } from '@/lib/utils/format';
import { APPOINTMENT, FEATURE_FLAGS, CUSTOMER_SELF_SERVICE_SIZE_CLASSES } from '@/lib/utils/constants';
import { isFeatureEnabled } from '@/lib/utils/feature-flags';
import { fireWebhook } from '@/lib/utils/webhook';
import { addMinutesToTime, findAvailableDetailer } from '@/lib/utils/assign-detailer';
import { updateSmsConsent } from '@/lib/utils/sms-consent';
import { logAudit, getRequestIp } from '@/lib/services/audit';
import { getSaleStatus } from '@/lib/utils/sale-pricing';
import { sendWelcomeEmail } from '@/lib/email/send-welcome-email';
import { sendSms } from '@/lib/utils/sms';
import { sendEmail } from '@/lib/utils/email';
import { sendTemplatedEmail } from '@/lib/email/send-templated-email';
import { cleanVehicleDescription } from '@/lib/utils/vehicle-helpers';
import { categoryToCompatibilityKey } from '@/lib/utils/vehicle-categories';
import { getBusinessInfo } from '@/lib/data/business';
import { formatCurrency } from '@/lib/utils/format';
import { renderSmsTemplate } from '@/lib/sms/render-sms-template';
import { buildPaymentInfo, buildDepositInfo } from '@/lib/sms/composites';

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
    let isNewCustomer = false;

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
        isNewCustomer = true;

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

    const mobileSurcharge = data.is_mobile ? (data.mobile_surcharge || 0) : 0;
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

    const { data: appointment, error: apptErr } = await supabase
      .from('appointments')
      .insert({
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
        // Note: loyalty_points_used and loyalty_discount could be stored in internal_notes or a new column
        internal_notes: data.loyalty_points_used
          ? `Loyalty points used: ${data.loyalty_points_used} (${loyaltyDiscount.toFixed(2)} discount)`
          : null,
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

      // Record deposit as a transaction so it appears in Admin > Transactions
      // receipt_number is auto-generated by DB trigger (SD-XXXXXX format)
      if (depositAmount > 0) {
        const balanceDue = totalAfterDiscount - depositAmount;
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
        }).select('id').single();

        if (txErr || !depositTx) {
          console.error('[Booking] Deposit transaction insert failed:', txErr?.message);
        } else {
          console.log(`[Booking] Deposit transaction recorded: $${depositAmount} for appointment ${appointment.id}`);

          // Insert transaction_items matching POS format for receipt compatibility
          const sizeClass = data.vehicle?.size_class && (CUSTOMER_SELF_SERVICE_SIZE_CLASSES as readonly string[]).includes(data.vehicle.size_class)
            ? data.vehicle.size_class
            : null;

          const lineItems = [
            {
              transaction_id: depositTx.id,
              item_type: 'service' as const,
              product_id: null,
              service_id: data.service_id,
              package_id: null,
              item_name: serviceRow.name as string,
              quantity: 1,
              unit_price: data.price,
              total_price: data.price,
              tax_amount: 0,
              is_taxable: false,
              tier_name: data.tier_name || null,
              vehicle_size_class: sizeClass,
              notes: null,
              standard_price: data.price,
              pricing_type: 'standard',
              is_addon: false,
              prerequisite_note: null,
            },
            ...data.addons.map((addon) => ({
              transaction_id: depositTx.id,
              item_type: 'service' as const,
              product_id: null,
              service_id: addon.service_id,
              package_id: null,
              item_name: addon.name,
              quantity: 1,
              unit_price: addon.price,
              total_price: addon.price,
              tax_amount: 0,
              is_taxable: false,
              tier_name: addon.tier_name || null,
              vehicle_size_class: sizeClass,
              notes: null,
              standard_price: addon.price,
              pricing_type: 'standard',
              is_addon: true,
              prerequisite_note: null,
            })),
          ];

          const { error: itemsErr } = await supabase
            .from('transaction_items')
            .insert(lineItems);

          if (itemsErr) {
            console.error('[Booking] Deposit transaction items insert failed:', itemsErr.message);
          }

          // Insert payment row so receipt shows payment method
          const { error: payErr } = await supabase.from('payments').insert({
            transaction_id: depositTx.id,
            method: 'card',
            amount: depositAmount,
            tip_amount: 0,
            tip_net: 0,
            stripe_payment_intent_id: data.payment_intent_id,
          });

          if (payErr) {
            console.error('[Booking] Deposit payment insert failed:', payErr.message);
          }
        }
      }
    }

    // 9. Fire n8n webhook (non-blocking)
    const webhookPayload = {
      event: 'booking.created',
      timestamp: new Date().toISOString(),
      appointment: {
        id: appointment.id,
        scheduled_date: appointment.scheduled_date,
        scheduled_start_time: appointment.scheduled_start_time,
        scheduled_end_time: appointment.scheduled_end_time,
        status: appointment.status,
        channel: appointment.channel,
        is_mobile: appointment.is_mobile,
        mobile_address: appointment.mobile_address,
        mobile_surcharge: Number(appointment.mobile_surcharge),
        subtotal: Number(appointment.subtotal),
        total_amount: Number(appointment.total_amount),
      },
      customer: {
        id: customerId,
        first_name: data.customer.first_name,
        last_name: data.customer.last_name,
        phone: e164Phone,
        email: data.customer.email,
        is_new: isNewCustomer,
      },
      services: [
        {
          id: data.service_id,
          name: serviceRow.name as string,
          price: data.price,
          tier_name: data.tier_name || null,
          is_primary: true,
        },
        ...data.addons.map((addon) => ({
          id: addon.service_id,
          name: addon.name,
          price: addon.price,
          tier_name: addon.tier_name || null,
          is_primary: false,
        })),
      ],
      vehicle: data.vehicle
        ? {
            type: data.vehicle.vehicle_type || 'standard',
            size_class: data.vehicle.size_class || null,
            year: data.vehicle.year || null,
            make: data.vehicle.make || null,
            model: data.vehicle.model || null,
            color: data.vehicle.color || null,
          }
        : null,
    };

    // Fire-and-forget: don't await, don't block the response
    fireWebhook('booking_created', webhookPayload, supabase).catch((err) =>
      console.error('Webhook fire failed:', err)
    );

    // If auto-confirmed (paid online), also fire appointment_confirmed webhook
    if (initialStatus === 'confirmed') {
      fireWebhook('appointment_confirmed', {
        ...webhookPayload,
        event: 'appointment.confirmed',
      }, supabase).catch((err) =>
        console.error('Confirmed webhook fire failed:', err)
      );
    }

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

function computeExpectedPrice(
  service: {
    pricing_model: string;
    flat_price: number | null;
    sale_price: number | null;
    sale_starts_at: string | null;
    sale_ends_at: string | null;
    per_unit_price: number | null;
    service_pricing: { tier_name: string; price: number; sale_price: number | null; is_vehicle_size_aware: boolean; vehicle_size_sedan_price: number | null; vehicle_size_truck_suv_price: number | null; vehicle_size_suv_van_price: number | null }[];
  },
  tierName: string | null | undefined,
  sizeClass: string | null | undefined
): number | null {
  const { isOnSale } = getSaleStatus({
    sale_starts_at: service.sale_starts_at,
    sale_ends_at: service.sale_ends_at,
  });

  switch (service.pricing_model) {
    case 'flat':
      if (isOnSale && service.sale_price != null && service.flat_price != null && service.sale_price < service.flat_price) {
        return service.sale_price;
      }
      return service.flat_price;

    case 'vehicle_size':
    case 'scope':
    case 'specialty': {
      if (!tierName) return null;
      const tier = service.service_pricing.find((t) => t.tier_name === tierName);
      if (!tier) return null;
      if (tier.is_vehicle_size_aware && sizeClass) {
        if (sizeClass === 'sedan') return tier.vehicle_size_sedan_price;
        if (sizeClass === 'truck_suv_2row') return tier.vehicle_size_truck_suv_price;
        if (sizeClass === 'suv_3row_van') return tier.vehicle_size_suv_van_price;
      }
      if (isOnSale && tier.sale_price != null && tier.sale_price < tier.price) {
        return tier.sale_price;
      }
      return tier.price;
    }

    case 'per_unit':
      return null;

    default:
      return null;
  }
}
