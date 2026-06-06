// Single source-of-truth for the SMS chip palette + per-slug contracts.
//
// HAND-EDITED. Both src/lib/sms/palette.ts and src/lib/sms/generated-contracts.ts
// are auto-generated from this file. After editing this file (or after any
// migration that touches sms_templates.required_variables / optional_variables),
// run:
//
//   npx tsx scripts/regen-sms-contracts.ts
//
// to refresh the generated outputs. The codegen exits non-zero if any slug
// references a chip not declared here, so contract/palette drift is impossible
// once both generated files are in sync with this source.
//
// ──────────────────────────────────────────────────────────────────────────────
// Conventions (mirrored into generated palette)
//   - `format` is a display hint for the admin UI preview. The engine itself
//     does no formatting — caller is responsible for passing the correctly
//     formatted string.
//   - `composite: true` flags chips built by helpers in src/lib/sms/composites.ts.
//     The caller invokes the builder and passes the resulting string as a chip
//     value; the engine has no special handling for composites. Composite-ness
//     is palette metadata only — it does not change the generated TS type.
//   - `autoInject: true` flags chips the engine fills from getBusinessInfo()
//     before the hard-skip pre-check (see src/lib/sms/render-sms-template.ts).
//     Auto-injected chips are always typed as OPTIONAL in the generated render
//     vars type, regardless of whether a slug's contract lists them as required
//     — the engine fills them, so callers never need to plumb the value through.
//     Currently 3 chips: business_name, business_phone, business_address
//     (matches actual runtime behavior; business_email and business_website are
//     plain chips, not auto-injected).
//
// Slugs section
//   The `slugs` object is the byte-exact mirror of sms_templates.required_variables
//   and sms_templates.optional_variables for every row in the DB. Adding a chip to
//   a template body requires adding it to the corresponding slug's required or
//   optional array AND adding a matching corrective migration that updates the DB
//   row, then regenerating with the codegen script.

export const SMS_CONTRACTS_SOURCE = {
  chips: {
    // ────────── Customer ──────────
    first_name: { description: 'Customer first name', sample: 'John', format: 'plain' },
    last_name: { description: 'Customer last name', sample: 'Smith', format: 'plain' },
    customer_name: { description: 'Customer full name', sample: 'John Smith', format: 'plain' },
    customer_phone: { description: 'Customer phone (formatted)', sample: '(310) 555-1234', format: 'phone' },
    customer_email: { description: 'Customer email address', sample: 'john@example.com', format: 'plain' },

    // ────────── Vehicle ──────────
    vehicle_description: { description: 'Cleaned vehicle description (year/make/model)', sample: '2024 Tesla Model 3', format: 'plain' },
    vehicle_year: { description: 'Vehicle year', sample: '2024', format: 'plain' },
    vehicle_make: { description: 'Vehicle make', sample: 'Tesla', format: 'plain' },
    vehicle_model: { description: 'Vehicle model', sample: 'Model 3', format: 'plain' },
    vehicle_color: { description: 'Vehicle color', sample: 'Black', format: 'plain' },
    size_class: { description: 'Vehicle size class', sample: 'sedan', format: 'plain' },
    license_plate: { description: 'Vehicle license plate', sample: 'ABC1234', format: 'plain' },

    // ────────── Business (3 auto-injected) ──────────
    business_name: { description: 'Business name', sample: '[From Settings]', format: 'plain', autoInject: true },
    business_phone: { description: 'Business phone number', sample: '[From Settings]', format: 'phone', autoInject: true },
    business_address: { description: 'Business address', sample: '[From Settings]', format: 'plain', autoInject: true },
    business_email: { description: 'Business email', sample: '[From Settings]', format: 'plain' },
    business_website: { description: 'Business website URL', sample: '[From Settings]', format: 'url' },
    business_hours: { description: 'Business hours (raw)', sample: 'Mon-Fri 9-6', format: 'plain' },

    // ────────── Transaction / Order ──────────
    receipt_number: { description: 'Transaction receipt number', sample: 'R-001234', format: 'plain' },
    service_total: { description: 'Service / appointment total amount', sample: '$299.00', format: 'currency' },
    total_amount: { description: 'Total amount (raw, may include tip+tax)', sample: '$329.45', format: 'currency' },
    amount_due: { description: 'Remaining balance to pay (total minus prior payments). Distinct from total_amount which is the full ticket figure.', sample: '$329.00', format: 'currency' },
    tax_total: { description: 'Tax portion of total', sample: '$26.91', format: 'currency' },
    subtotal: { description: 'Subtotal before tax/tip', sample: '$299.00', format: 'currency' },
    tip_amount: { description: 'Tip portion of total', sample: '$45.00', format: 'currency' },
    payment_method: { description: 'Payment method', sample: 'Card', format: 'plain' },
    discount_amount: { description: 'Discount applied to transaction', sample: '$25.00', format: 'currency' },
    loyalty_points_earned: { description: 'Loyalty points earned this transaction', sample: '299', format: 'plain' },
    loyalty_points_balance: { description: 'Customer loyalty points balance', sample: '500', format: 'plain' },
    loyalty_cash_value: { description: 'Cash equivalent of loyalty points', sample: '$25.00', format: 'currency' },

    // ────────── Appointment ──────────
    appointment_date: { description: 'Appointment date', sample: 'Monday, March 28, 2026', format: 'date' },
    appointment_time: { description: 'Appointment time', sample: '10:30 AM', format: 'time' },
    appointment_id: { description: 'Appointment UUID', sample: 'a1b2c3d4-…', format: 'plain' },
    estimated_duration: { description: 'Estimated appointment duration', sample: '90 minutes', format: 'plain' },
    scheduled_end_time: { description: 'Scheduled appointment end time', sample: '12:00 PM', format: 'time' },
    channel: { description: 'Booking channel (online, voice, walk-in)', sample: 'online', format: 'plain' },

    // ────────── Mobile-service Address (replaces deprecated `address` chip) ──────────
    mobile_service_address: { description: 'Mobile service address (where the detailer goes)', sample: '123 Main St, Torrance, CA', format: 'plain' },

    // ────────── Job ──────────
    job_id: { description: 'Job UUID', sample: 'j1b2c3d4-…', format: 'plain' },
    job_status: { description: 'Job status', sample: 'in_progress', format: 'plain' },
    detailer_first_name: { description: "Assigned detailer's first name", sample: 'Mike', format: 'plain' },
    detailer_name: { description: "Assigned detailer's full name", sample: 'Mike Johnson', format: 'plain' },
    gallery_link: { description: 'Photo gallery link for this job', sample: 'https://sdas.co/g5678', format: 'url' },
    job_duration: { description: 'Total job duration (from final timer)', sample: '2h 15m', format: 'plain' },

    // ────────── Quote ──────────
    quote_number: { description: 'Quote number', sample: 'Q-001234', format: 'plain' },
    quote_url: { description: 'Customer-facing quote URL', sample: 'https://sdas.co/q1234', format: 'url' },
    valid_until: { description: 'Quote expiration date', sample: 'April 30, 2026', format: 'date' },
    validity_days: { description: 'Number of days the quote is valid', sample: '30', format: 'plain' },
    item_name: { description: 'Single quote item name', sample: 'Ceramic Coating', format: 'plain' },
    services: { description: 'Comma-joined list of service names', sample: 'Ceramic Coating, Interior Detail', format: 'plain' },
    service_name: { description: 'Single service name', sample: 'Ceramic Coating', format: 'plain' },

    // ────────── URLs ──────────
    short_url: { description: 'Short link to a quote / page', sample: 'https://sdas.co/q1234', format: 'url' },
    receipt_link: { description: 'Customer-facing receipt URL', sample: 'https://sdas.co/r5678', format: 'url' },
    booking_link: { description: 'Booking page URL', sample: 'https://sdas.co/book', format: 'url' },
    authorize_url: { description: 'Add-on authorization URL (HMAC-token-bearing)', sample: 'https://sdas.co/auth/abc', format: 'url' },
    admin_url: { description: 'Admin-side URL for staff', sample: 'https://admin.sdas/q/123', format: 'url' },
    portal_url: { description: 'Customer portal URL', sample: 'https://sdas.co/account', format: 'url' },
    pay_url: { description: 'Customer-facing appointment payment URL', sample: 'https://sdas.co/pay/abc123', format: 'url' },

    // ────────── Caller-built composites (built in src/lib/sms/composites.ts) ──────────
    appointment_summary: { description: 'Composite: appointment scheduled block (greeting + service + date/time + total)', sample: 'Hi John, your appointment is scheduled:\nCeramic Coating\nMar 28 at 10:30 AM\nTotal: $299.00', format: 'plain', composite: true },
    job_summary: { description: 'Composite: services and optional vehicle, dash-joined', sample: 'Ceramic Coating – 2024 Tesla Model 3', format: 'plain', composite: true },
    transaction_greeting: { description: 'Composite: receipt prose for services-with-vehicle vs other', sample: 'Your 2024 Tesla Model 3 is looking great.', format: 'plain', composite: true },
    payment_info: { description: 'Composite: deposit-aware payment status for customer prose', sample: 'Deposit paid: $50.00. Balance due at service: $249.00.', format: 'plain', composite: true },
    deposit_info: { description: 'Composite: short deposit status for staff prose', sample: 'Deposit paid.', format: 'plain', composite: true },
    hours_line: { description: 'Composite: business hours prose (today-only OR full-week, varies by caller)', sample: 'Open today until 6:00 PM', format: 'plain', composite: true },
    summary_line: { description: 'Composite: length-aware single-line receipt summary (160-char budget)', sample: '2024 Tesla Model 3 — $329.45', format: 'plain', composite: true },
    first_name_greeting: { description: 'Composite: leading-comma name fragment (", John" or empty)', sample: ', John', format: 'plain', composite: true },
    job_cancelled_line: { description: 'Composite: cancellation note for void notifications (SMS shape)', sample: ' Your scheduled service has been cancelled.', format: 'plain', composite: true },
    reason_line: { description: 'Composite: void reason note', sample: ' Reason: Duplicate charge.', format: 'plain', composite: true },
    message_to_customer: { description: 'Operator-typed prose passed verbatim (addon-resend)', sample: 'Hey, your add-on photo is here', format: 'plain', composite: true },

    // ────────── Escalation / Operational / Add-on ──────────
    reason_label: { description: 'Escalation reason (humanized)', sample: 'Custom Quote Needed', format: 'plain' },
    reason_code: { description: 'Escalation reason code', sample: 'custom_quote', format: 'plain' },
    details: { description: 'Free-text details from agent', sample: 'Customer wants ceramic coating for fleet of 5 vehicles', format: 'plain' },
    cancellation_reason: { description: 'Reason for cancellation', sample: 'Schedule conflict', format: 'plain' },
    preferred_time: { description: 'Customer preferred callback time', sample: 'Tomorrow afternoon', format: 'plain' },
    request_subject: { description: 'Variant-specific subject for quote-request acknowledgments (e.g., a service name or "specialty vehicle")', sample: 'Ceramic Coating', format: 'plain' },
    customer_message_excerpt: { description: 'Excerpt of inbound customer message', sample: 'Hi, I need a ceramic…', format: 'plain' },
    transcript_summary: { description: 'Voice call transcript summary', sample: 'Customer asked about pricing for…', format: 'plain' },
    inferred_customer_type: { description: 'Inferred customer type (enthusiast / professional)', sample: 'enthusiast', format: 'plain' },
    expiration_minutes: { description: 'Add-on authorization expiration window', sample: '60', format: 'plain' },
    pickup_delay_minutes: { description: 'Add-on pickup-delay window', sample: '30', format: 'plain' },
    issue_text: { description: 'Add-on issue description (humanized)', sample: 'Heavy interior staining', format: 'plain' },
    issue_type: { description: 'Add-on issue type code', sample: 'staining', format: 'plain' },
    issue_description: { description: 'Free-text add-on issue description', sample: 'Multiple coffee stains in driver seat', format: 'plain' },
    friendly_name: { description: 'Humanized service name for add-on context', sample: 'Stain Removal', format: 'plain' },
    final_price: { description: 'Final add-on price', sample: '$65.00', format: 'currency' },

    // ────────── Product / Category / Service routing ──────────
    product_name: { description: 'Product display name', sample: 'Carnauba Paste Wax', format: 'plain' },
    product_slug: { description: 'Product URL slug', sample: 'carnauba-paste-wax', format: 'plain' },
    category_name: { description: 'Category display name', sample: 'Waxes & Sealants', format: 'plain' },
    category_slug: { description: 'Category URL slug', sample: 'waxes-sealants', format: 'plain' },
    service_filter: { description: 'Pre-selected service filter for booking link', sample: 'ceramic-coating', format: 'plain' },
  },

  // ──────────────────────────────────────────────────────────────────────────
  // Per-slug contracts. Byte-exact mirror of sms_templates.required_variables
  // and sms_templates.optional_variables for every row currently in the DB.
  // Slug ordering is alphabetical to match `SELECT … ORDER BY slug`.
  // ──────────────────────────────────────────────────────────────────────────
  slugs: {
    addon_approved: {
      required: ['service_name'],
      optional: ['first_name', 'last_name', 'vehicle_description'],
    },
    addon_authorization: {
      required: ['vehicle_description', 'issue_text', 'friendly_name', 'final_price', 'authorize_url'],
      optional: ['first_name', 'detailer_name'],
    },
    addon_authorization_expired: {
      required: [],
      optional: [],
    },
    addon_authorization_resend: {
      required: ['authorize_url'],
      optional: ['message_to_customer'],
    },
    addon_declined: {
      required: ['service_name'],
      optional: ['first_name', 'last_name', 'vehicle_description'],
    },
    appointment_cancelled: {
      required: [],
      optional: ['first_name', 'services', 'appointment_date', 'appointment_time', 'last_name', 'vehicle_description', 'business_name', 'business_phone'],
    },
    appointment_confirmed: {
      required: ['service_name', 'appointment_date', 'appointment_time'],
      optional: ['first_name', 'service_total', 'last_name', 'vehicle_description', 'business_name', 'business_phone'],
    },
    appointment_confirmed_postcall: {
      required: [],
      optional: ['first_name', 'last_name', 'business_name', 'business_phone'],
    },
    booking_confirmed: {
      required: ['services', 'appointment_date', 'appointment_time', 'service_total'],
      optional: ['first_name', 'last_name', 'vehicle_description', 'business_name', 'business_phone'],
    },
    booking_reminder: {
      required: ['service_name', 'appointment_time'],
      optional: ['first_name', 'last_name', 'vehicle_description', 'business_name', 'business_phone'],
    },
    booking_staff_notify: {
      required: ['customer_name', 'services', 'appointment_date', 'appointment_time', 'deposit_info'],
      optional: ['customer_email', 'customer_phone', 'last_name', 'vehicle_description'],
    },
    booking_staff_notify_quote_request: {
      required: ['customer_name', 'customer_phone', 'service_name'],
      optional: ['vehicle_description', 'customer_email', 'preferred_time'],
    },
    booking_staff_notify_specialty: {
      required: ['customer_name', 'customer_phone', 'vehicle_description'],
      optional: ['customer_email', 'size_class', 'preferred_time'],
    },
    detailer_job_assigned: {
      required: ['job_summary', 'appointment_date', 'appointment_time', 'service_total'],
      optional: ['mobile_service_address', 'detailer_first_name', 'customer_email', 'customer_phone', 'last_name'],
    },
    job_complete: {
      required: ['gallery_link', 'hours_line'],
      optional: ['first_name', 'vehicle_description', 'last_name', 'business_name', 'business_phone', 'business_address'],
    },
    loyalty_milestone: {
      required: ['loyalty_points_balance', 'loyalty_cash_value', 'booking_link'],
      optional: ['first_name', 'last_name', 'business_name'],
    },
    payment_link_sent: {
      required: ['amount_due', 'pay_url'],
      optional: ['first_name'],
    },
    payment_receipt: {
      required: ['transaction_greeting', 'receipt_link'],
      optional: ['first_name', 'last_name', 'business_name'],
    },
    quote_accepted_multi: {
      required: [],
      optional: ['first_name', 'last_name'],
    },
    quote_accepted_single: {
      required: ['item_name'],
      optional: ['first_name', 'last_name', 'vehicle_description'],
    },
    quote_accepted_staff_notify: {
      required: ['customer_name', 'quote_number', 'services', 'service_total'],
      optional: ['customer_phone', 'customer_email', 'last_name', 'vehicle_description'],
    },
    quote_reminder: {
      required: ['first_name', 'short_url'],
      optional: ['last_name', 'vehicle_description'],
    },
    quote_request_received_customer: {
      required: ['first_name', 'request_subject'],
      optional: ['business_name', 'business_phone'],
    },
    quote_sms_admin: {
      required: ['quote_number', 'total_amount', 'short_url'],
      optional: [],
    },
    quote_sms_midcall: {
      required: ['services', 'short_url'],
      optional: [],
    },
    quote_sms_postcall: {
      required: ['short_url'],
      optional: ['first_name', 'last_name', 'vehicle_description'],
    },
    quote_viewed_followup: {
      required: ['first_name', 'short_url'],
      optional: ['last_name', 'vehicle_description'],
    },
    receipt_sms: {
      required: ['summary_line', 'receipt_link'],
      optional: ['first_name', 'last_name', 'vehicle_description'],
    },
    staff_notification: {
      required: ['reason_label', 'customer_name', 'details', 'customer_phone'],
      optional: ['customer_email', 'last_name', 'vehicle_description'],
    },
    staff_notification_inbound_specialty: {
      required: ['customer_name', 'customer_phone', 'vehicle_description'],
      optional: ['customer_email', 'size_class', 'customer_message_excerpt'],
    },
    waitlist_slot_available: {
      required: ['service_name', 'appointment_date'],
      optional: ['first_name', 'last_name', 'business_name', 'business_phone'],
    },
  },
} as const;

// ──────────────────────────────────────────────────────────────────────────────
// Type exports — consumed by the codegen and (transitively, via the generated
// files) by the engine and all production callers.
// ──────────────────────────────────────────────────────────────────────────────

export type SmsChipKey = keyof typeof SMS_CONTRACTS_SOURCE.chips;
export type SmsSlug = keyof typeof SMS_CONTRACTS_SOURCE.slugs;
