import { NextRequest, NextResponse } from 'next/server';
import { logAudit } from '@/lib/services/audit';
import { sendSms } from '@/lib/utils/sms';
import { renderSmsTemplate } from '@/lib/sms/render-sms-template';
import { getBusinessInfo } from '@/lib/data/business';

/**
 * POST /api/public/specialty-callback
 *
 * Receives "talk to staff before booking" requests from the public
 * booking surface. Two request shapes share this endpoint via the
 * `request_type` discriminator:
 *
 *   - `'specialty_vehicle'`  (Session 29, original) — exotic/classic
 *     vehicles from Step 1 of public booking. Driven by
 *     `<SpecialtyVehicleBlock>` (`src/components/booking/specialty-vehicle-block.tsx`).
 *     Uses the `booking_staff_notify_specialty` SMS sub-slug whose chip
 *     contract carries vehicle fields (vehicle_description, size_class,
 *     etc.).
 *
 *   - `'staff_assessed_service'`  (Session U-B.3, W3 fix, 2026-06-01) —
 *     services flagged `staff_assessed=true` from Step 2 of public
 *     booking. Driven by `<RequestQuoteCard>` rendered inline when the
 *     selected service requires staff evaluation for pricing. There is
 *     no per-slug SMS template for this request type yet — the staff
 *     SMS uses the endpoint's existing raw-prose fallback path. An
 *     operator-customizable template can be added in a follow-up
 *     migration by seeding a `booking_staff_notify_quote_request`
 *     sub-slug (mirroring `20260427000006_seed_specialty_sub_slugs.sql`)
 *     without changing this route's logic — the `renderSmsTemplate /
 *     staffMessage` fallback dance already handles a templated path the
 *     moment the slug exists.
 *
 * Session 29: vehicle payload switched from boolean flags to size_class
 * (canonical taxonomy).
 * Session U-B.3 (2026-06-01): generalized to handle staff_assessed
 * service quote requests via `request_type` discriminator. Existing
 * specialty-vehicle clients default to `'specialty_vehicle'` for
 * backward compatibility.
 */

type RequestType = 'specialty_vehicle' | 'staff_assessed_service';

interface QuoteRequestBody {
  /**
   * Discriminator. Defaults to 'specialty_vehicle' when absent so a
   * pre-Session-U-B.3 client (e.g., older browser cache hitting the new
   * endpoint) continues to work without explicit migration. New callers
   * pass this explicitly — the existing `<SpecialtyVehicleBlock>` was
   * updated in U-B.3 to pass `request_type: 'specialty_vehicle'` so
   * every modern code path is self-documenting at the call site.
   */
  request_type?: RequestType;

  // Shared fields — required for every request_type.
  name: string;
  phone: string;
  email?: string | null;
  preferred_time?: string | null;

  // 'specialty_vehicle'-specific (optional on type, required by shape
  // when request_type='specialty_vehicle').
  vehicle_year?: number | null;
  vehicle_make?: string | null;
  vehicle_model?: string | null;
  size_class?: string | null;

  // 'staff_assessed_service'-specific. `service_name` is required when
  // request_type='staff_assessed_service'; vehicle fields above remain
  // optional and carry Step 1 context when the customer supplied it.
  service_name?: string | null;
  service_id?: string | null;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as QuoteRequestBody;
    const {
      request_type = 'specialty_vehicle',
      name,
      phone,
      email,
      preferred_time,
      vehicle_year,
      vehicle_make,
      vehicle_model,
      size_class,
      service_name,
      service_id,
    } = body;

    // Shared validation
    if (!name || !phone) {
      return NextResponse.json({ error: 'Name and phone are required' }, { status: 400 });
    }

    // Discriminator validation — surface a clear 400 if the client sent
    // an unknown request_type rather than silently degrading.
    if (request_type !== 'specialty_vehicle' && request_type !== 'staff_assessed_service') {
      return NextResponse.json({ error: 'Invalid request_type' }, { status: 400 });
    }

    // Per-type required-field validation
    if (request_type === 'staff_assessed_service' && !service_name) {
      return NextResponse.json(
        { error: 'service_name is required for staff_assessed_service requests' },
        { status: 400 }
      );
    }

    const vehicleDesc = [vehicle_year, vehicle_make, vehicle_model].filter(Boolean).join(' ') || 'Unknown vehicle';
    const vehicleWord = size_class === 'classic' ? 'classic' : 'exotic';

    // Per-type audit-event label + entity label. Branching here keeps
    // the audit log readable and queryable per type without inventing a
    // generic catch-all event name.
    const auditEntityLabel =
      request_type === 'staff_assessed_service'
        ? `Quote request: ${name} — ${service_name}`
        : `Specialty callback: ${name} — ${vehicleDesc}`;

    const auditEvent =
      request_type === 'staff_assessed_service'
        ? 'staff_assessed_quote_requested'
        : 'specialty_callback_requested';

    logAudit({
      action: 'create',
      entityType: 'booking',
      entityLabel: auditEntityLabel,
      details: {
        event: auditEvent,
        request_type,
        customer_name: name,
        customer_phone: phone,
        customer_email: email || null,
        preferred_time: preferred_time || null,
        // Vehicle fields — populated for both types when the client
        // supplied them (a staff_assessed service request from Step 2
        // can include Step 1 vehicle context so staff have full
        // context when they call back).
        vehicle_year: vehicle_year ?? null,
        vehicle_make: vehicle_make ?? null,
        vehicle_model: vehicle_model ?? null,
        size_class: size_class ?? null,
        // Service fields — populated only for staff_assessed_service.
        service_name: service_name ?? null,
        service_id: service_id ?? null,
        vehicle_type: request_type === 'specialty_vehicle' ? vehicleWord : null,
      },
      source: 'api',
    });

    // Build the staff notification SMS. For 'specialty_vehicle' we keep
    // the existing chip-driven template path (sub-slug
    // `booking_staff_notify_specialty`) and let `staffMessage` serve as
    // its defense-in-depth raw-prose fallback. For
    // 'staff_assessed_service' there is no per-slug template yet, so
    // we skip the templated render entirely and send the raw-prose
    // staff message — the same fallback path the specialty branch
    // would use if its template were inactive or failed to render.
    try {
      const customerEmail = email || undefined;

      const staffMessage =
        request_type === 'staff_assessed_service'
          ? `Quote request from public booking!\n${name} (${phone}) wants a quote for ${service_name}${
              vehicleDesc !== 'Unknown vehicle' ? ` (vehicle: ${vehicleDesc})` : ''
            }.${preferred_time ? `\nBest time: ${preferred_time}` : ''}${
              email ? `\nEmail: ${email}` : ''
            }\n\nFrom online booking Step 2 (staff_assessed service).`
          : `Specialty vehicle callback request!\n${name} (${phone}) wants a quote for their ${vehicleWord} ${vehicleDesc}.${
              preferred_time ? `\nBest time: ${preferred_time}` : ''
            }\n\nFrom online booking.`;

      const biz = await getBusinessInfo();

      // Specialty vehicle path keeps the existing templated send.
      // staff_assessed_service path uses the raw-prose `staffMessage`
      // directly — a follow-up migration can introduce
      // `booking_staff_notify_quote_request` and this branch will pick
      // it up by mirroring the specialty branch's `renderSmsTemplate`
      // call.
      let smsBody = staffMessage;
      let recipients: (string | null | undefined)[] = [biz.phone];

      if (request_type === 'specialty_vehicle') {
        // Session 2F: chip-driven send via dedicated sub-slug whose
        // contract matches the callback-request data scope (no
        // appointment_date / appointment_time / deposit_info — those
        // don't apply to a callback request). Engine renders the body;
        // staffMessage above stays as defense-in-depth fallback when
        // template is inactive or unrendered.
        const templateResult = await renderSmsTemplate(
          'booking_staff_notify_specialty',
          {
            customer_name: name,
            customer_phone: phone,
            vehicle_description: vehicleDesc,
            customer_email: customerEmail,
            size_class: size_class || undefined,
            preferred_time: preferred_time || undefined,
          },
          staffMessage
        );
        smsBody = templateResult?.body || staffMessage;
        recipients = templateResult?.recipientPhones?.length
          ? templateResult.recipientPhones
          : [biz.phone];
      }

      for (const recipientPhone of recipients) {
        if (recipientPhone) {
          await sendSms(recipientPhone, smsBody);
        }
      }
    } catch (smsErr) {
      console.error('[specialty-callback] Staff notification failed:', smsErr);
      // Best-effort — don't fail the response
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[specialty-callback] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
