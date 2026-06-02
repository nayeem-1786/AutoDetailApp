import { NextRequest, NextResponse } from 'next/server';
import { logAudit } from '@/lib/services/audit';
import { sendSms } from '@/lib/utils/sms';
import { renderSmsTemplate } from '@/lib/sms/render-sms-template';
import { getBusinessInfo } from '@/lib/data/business';
import type { SmsSlug } from '@/lib/sms/generated-contracts';

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
 *     Uses the `booking_staff_notify_specialty` SMS sub-slug.
 *
 *   - `'staff_assessed_service'`  (Session U-B.3, #137, 2026-06-01) —
 *     services flagged `staff_assessed=true` from Step 2 of public
 *     booking. Driven by `<RequestQuoteCard>` rendered inline when the
 *     selected service requires staff evaluation for pricing. Uses the
 *     `booking_staff_notify_quote_request` sub-slug (seeded in
 *     Session #139's migration alongside this route's refactor).
 *
 * STAFF SMS — per-request_type slug lookup (Session #139, Pattern B from
 * QUOTE_REQUEST_SMS_AUDIT). Each request_type maps to its own staff
 * template slug; the route reads `recipient_phones` from the matched
 * row. The pre-#139 fallback `recipients = [biz.phone]` was a footgun
 * that caused Twilio self-sends when biz.phone == TWILIO_PHONE_NUMBER —
 * BOTH fallback sites now drop to `[]` + warn-log instead (S2/S3 from
 * the audit). Concern 4 in the same session adds a defense-in-depth
 * guard in `sendSms` itself so any future caller is protected.
 *
 * CUSTOMER SMS — universal acknowledgment template
 * `quote_request_received_customer` (Session #139, Concern 3). Both
 * variants now send a customer ack after the audit_log row is written;
 * `request_subject` is resolved per-variant (service_name for
 * staff_assessed_service; "specialty vehicle" for specialty_vehicle).
 * EXPLICIT BEHAVIOR CHANGE for specialty_vehicle: pre-#139 sent NO
 * customer SMS; post-#139 it WILL. Documented in CHANGELOG #139.
 *
 * Session 29: vehicle payload switched from boolean flags to size_class.
 * Session U-B.3 (#137): generalized to handle staff_assessed service
 * quote requests via `request_type` discriminator.
 * Session #139: Pattern B + footgun hardening + universal customer SMS
 * + sendSms self-send chokepoint (see QUOTE_REQUEST_SMS_AUDIT.md).
 */

type RequestType = 'specialty_vehicle' | 'staff_assessed_service';

interface QuoteRequestBody {
  request_type?: RequestType;
  name: string;
  phone: string;
  email?: string | null;
  preferred_time?: string | null;

  // 'specialty_vehicle'-specific.
  vehicle_year?: number | null;
  vehicle_make?: string | null;
  vehicle_model?: string | null;
  size_class?: string | null;

  // 'staff_assessed_service'-specific.
  service_name?: string | null;
  service_id?: string | null;
}

// Per-request_type staff-template slug map. Single source of truth — both
// the staff-SMS dispatch and the audit-trail labels switch on this same
// discriminator. Adding a new request_type (e.g., F2 non-priced vehicle
// categories) requires adding the slug here AND seeding the corresponding
// sms_templates row via migration.
const STAFF_SLUG_BY_REQUEST_TYPE: Record<RequestType, SmsSlug> = {
  specialty_vehicle: 'booking_staff_notify_specialty',
  staff_assessed_service: 'booking_staff_notify_quote_request',
};

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

    if (!name || !phone) {
      return NextResponse.json({ error: 'Name and phone are required' }, { status: 400 });
    }

    if (request_type !== 'specialty_vehicle' && request_type !== 'staff_assessed_service') {
      return NextResponse.json({ error: 'Invalid request_type' }, { status: 400 });
    }

    if (request_type === 'staff_assessed_service' && !service_name) {
      return NextResponse.json(
        { error: 'service_name is required for staff_assessed_service requests' },
        { status: 400 }
      );
    }

    const vehicleDesc = [vehicle_year, vehicle_make, vehicle_model].filter(Boolean).join(' ') || 'Unknown vehicle';
    const vehicleWord = size_class === 'classic' ? 'classic' : 'exotic';

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
        vehicle_year: vehicle_year ?? null,
        vehicle_make: vehicle_make ?? null,
        vehicle_model: vehicle_model ?? null,
        size_class: size_class ?? null,
        service_name: service_name ?? null,
        service_id: service_id ?? null,
        vehicle_type: request_type === 'specialty_vehicle' ? vehicleWord : null,
      },
      source: 'api',
    });

    // ────────── Staff SMS dispatch ──────────
    // Per-request_type slug lookup (Pattern B). Recipients come from the
    // matched template's `recipient_phones` column; empty/null falls back
    // to dropping the send + warn-logging (Concern 2 footgun fix — used to
    // fall back to [biz.phone] which is the business's own Twilio number).
    try {
      const customerEmail = email || undefined;
      const staffSlug = STAFF_SLUG_BY_REQUEST_TYPE[request_type];

      // Raw-prose fallback used when the template is inactive or
      // unrendered. Different shape per request_type so the prose is
      // informative either way.
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

      // Per-slug template render — shapes the body AND yields the
      // recipient list. The renderer is the single point of contract
      // enforcement: each slug's required chips below must satisfy that
      // slug's contract in sms-contracts.source.ts.
      let templateResult;
      if (staffSlug === 'booking_staff_notify_specialty') {
        templateResult = await renderSmsTemplate(
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
      } else {
        // service_name is guaranteed non-null here — the early validation
        // at line 104 returns 400 for staff_assessed_service requests with
        // missing service_name. The non-null assertion makes that
        // invariant explicit to the typed renderSmsTemplate signature.
        templateResult = await renderSmsTemplate(
          'booking_staff_notify_quote_request',
          {
            customer_name: name,
            customer_phone: phone,
            service_name: service_name!,
            vehicle_description: vehicleDesc === 'Unknown vehicle' ? undefined : vehicleDesc,
            customer_email: customerEmail,
            preferred_time: preferred_time || undefined,
          },
          staffMessage
        );
      }

      const smsBody = templateResult?.body || staffMessage;
      const recipients: string[] = templateResult?.recipientPhones?.length
        ? templateResult.recipientPhones
        : [];

      if (recipients.length === 0) {
        // Concern 2 (audit S2/S3): the pre-#139 fallback here defaulted to
        // [biz.phone] which is the business's own Twilio number — that
        // routed to Twilio self-send. Now we drop instead and warn so the
        // empty-recipients config bug is surfaced to logs.
        console.warn(
          `[specialty-callback] Staff SMS dropped — no recipient_phones configured for slug "${staffSlug}" ` +
          `(request_type=${request_type}). Check sms_templates.recipient_phones for that slug in the admin UI.`
        );
      } else {
        for (const recipientPhone of recipients) {
          if (recipientPhone) {
            await sendSms(recipientPhone, smsBody);
          }
        }
      }
    } catch (smsErr) {
      console.error('[specialty-callback] Staff notification failed:', smsErr);
      // Best-effort — don't fail the response
    }

    // ────────── Customer acknowledgment SMS ──────────
    // Concern 3 (Session #139): universal customer-ack template usable
    // across all quote-request variants (specialty_vehicle,
    // staff_assessed_service, future F2). EXPLICIT BEHAVIOR CHANGE:
    // pre-#139 the specialty_vehicle flow sent NO customer SMS; post-#139
    // it WILL. Operator approved per QUOTE_REQUEST_SMS_AUDIT Target E.
    //
    // Dispatched in a separate try/catch so a staff-SMS failure can't
    // block the customer ack (and vice-versa). Both are best-effort —
    // the form's UI success state is the primary acknowledgment.
    try {
      const firstName = name.trim().split(/\s+/)[0] || name.trim();
      const requestSubject =
        request_type === 'staff_assessed_service'
          ? (service_name || 'service')
          : 'specialty vehicle';

      const biz = await getBusinessInfo();
      const customerFallback =
        `Hi ${firstName}, thanks for your ${requestSubject} request! ` +
        `We received your details and will reach out shortly. ` +
        `Questions? Call ${biz.phone}.`;

      const customerResult = await renderSmsTemplate(
        'quote_request_received_customer',
        {
          first_name: firstName,
          request_subject: requestSubject,
        },
        customerFallback
      );

      if (customerResult?.isActive && customerResult.body) {
        await sendSms(phone, customerResult.body);
      }
    } catch (custErr) {
      console.error('[specialty-callback] Customer ack SMS failed:', custErr);
      // Best-effort — never let customer-ack failure bubble up
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[specialty-callback] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
