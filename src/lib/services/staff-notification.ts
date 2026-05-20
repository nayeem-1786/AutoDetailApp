/**
 * notifyStaff — canonical staff-alert dispatcher.
 *
 * Single source of truth for "send an SMS to staff because the agent (voice
 * or SMS AI v2) hit something it can't handle." Extracted from the body of
 * `/api/voice-agent/notify-staff` so that endpoint AND the SMS AI v2 tool
 * runner can call the same path — no HTTP indirection, one set of
 * recipient-phone semantics, one audit log shape.
 *
 * Recipient resolution chain:
 *   1. sms_templates.recipient_phones for the 'staff_notification' row
 *      (per-template override, configured in Admin > SMS Templates)
 *   2. business_settings.business_phone (via getBusinessInfo())
 *   3. BUSINESS_DEFAULTS.phone (compile-time fallback)
 *
 * The chain matches the existing voice-agent endpoint behavior verbatim so
 * the voice-agent refactor is byte-identical for working installs.
 *
 * Per audit §3 (docs/dev/SMS_AI_V2_AUDIT_2026-05-19.md): the most common
 * production failure mode here is recipient_phones=NULL falling back to a
 * storefront business_phone that doesn't receive SMS. This helper does NOT
 * paper over that — it returns a per-recipient errors array so the caller
 * can surface failures explicitly instead of swallowing them.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { sendSms } from '@/lib/utils/sms';
import { renderSmsTemplate } from '@/lib/sms/render-sms-template';
import { getBusinessInfo } from '@/lib/data/business';
import { normalizePhone, formatPhone } from '@/lib/utils/format';

export type StaffNotificationReason =
  | 'appointment_change'
  | 'custom_quote'
  | 'beyond_scope'
  | 'transfer_request'
  | 'mobile_distance'
  | 'human_handoff'
  | 'other';

export const STAFF_NOTIFICATION_REASONS: readonly StaffNotificationReason[] = [
  'appointment_change',
  'custom_quote',
  'beyond_scope',
  'transfer_request',
  'mobile_distance',
  'human_handoff',
  'other',
] as const;

export const REASON_LABELS: Record<StaffNotificationReason, string> = {
  appointment_change: 'Appointment Change/Cancel',
  custom_quote: 'Custom Quote Needed',
  beyond_scope: 'Question Beyond Agent Scope',
  transfer_request: 'Requested Human Callback',
  mobile_distance: 'Mobile Service - Distance Check',
  human_handoff: '\u{1F91A} Human Handoff Requested',
  other: 'Other - See Details',
};

export interface NotifyStaffParams {
  reason: StaffNotificationReason;
  customerId?: string;
  customerName: string;
  customerPhone: string;
  details: string;
  source: 'voice_agent' | 'sms_ai_v2';
}

export interface NotifyStaffResult {
  success: boolean;
  recipientsNotified: number;
  errors: string[];
  /** True when the template is admin-toggled inactive — no SMS attempted. */
  templateInactive?: boolean;
  /** True when no recipient phone could be resolved — no SMS attempted. */
  noRecipients?: boolean;
}

export function isStaffNotificationReason(
  value: unknown,
): value is StaffNotificationReason {
  return typeof value === 'string'
    && (STAFF_NOTIFICATION_REASONS as readonly string[]).includes(value);
}

/**
 * Map the caller's agent-runtime `source` to the delivery-medium channel
 * value. Audit-log rows (`messages.channel`, `conversations.last_channel`)
 * are CHECK-constrained to ('sms', 'voice') per migration
 * `20260324000003_cross_channel_bridge.sql`. Storing `'sms_ai'` literally
 * would silently violate both constraints — supabase-js does NOT throw on
 * PG-side errors, so the audit row would be dropped without surfacing.
 *
 * Agent-runtime identity is captured via `sender_type` (and the structured
 * `source` field on this function's caller); the `channel` column is just
 * the medium. Future widening of the CHECK to include `'sms_ai'` is
 * deferred to Layer 5+ (see roadmap session ledger #42 / #43).
 */
function channelForSource(source: NotifyStaffParams['source']): 'sms' | 'voice' {
  return source === 'voice_agent' ? 'voice' : 'sms';
}

export async function notifyStaff(
  params: NotifyStaffParams,
): Promise<NotifyStaffResult> {
  const { reason, customerName, customerPhone, details, source } = params;

  const reasonLabel = REASON_LABELS[reason];

  const normalizedCustomerPhone = customerPhone ? normalizePhone(customerPhone) : null;
  const displayCustomerPhone = normalizedCustomerPhone
    ? formatPhone(normalizedCustomerPhone)
    : 'Unknown';
  const displayCustomerName = customerName?.trim() || 'Unknown';
  const cleanedDetails = details?.trim() || '';

  // Hardcoded disaster-recovery fallback. Mirrors voice-agent endpoint shape.
  const fallbackBody = [
    `\u{1F514} Staff Action Needed`,
    `Customer: ${displayCustomerName}`,
    `Phone: ${displayCustomerPhone}`,
    `Reason: ${reasonLabel}`,
    `Details: ${cleanedDetails}`,
    normalizedCustomerPhone ? `Reply to customer: ${displayCustomerPhone}` : '',
  ].filter(Boolean).join('\n');

  const [templateResult, biz] = await Promise.all([
    renderSmsTemplate(
      'staff_notification',
      {
        customer_name: displayCustomerName,
        customer_phone: displayCustomerPhone,
        reason_label: reasonLabel,
        details: cleanedDetails,
        // 2D cheap-add chips — left undefined; engine REMOVE_LINEs missing
        // values cleanly. Filled by callers that have a DB customer record
        // in scope (currently none — both call sites pass request-body data).
        customer_email: undefined,
        last_name: undefined,
        vehicle_description: undefined,
      },
      fallbackBody,
    ),
    getBusinessInfo(),
  ]);

  // Template admin-toggled off: skip, report success-with-no-op.
  if (!templateResult.isActive) {
    console.log(
      `[notifyStaff] reason=${reason} customer=${displayCustomerName} source=${source} — template inactive, skipped`,
    );
    return {
      success: true,
      recipientsNotified: 0,
      errors: [],
      templateInactive: true,
    };
  }

  const body = templateResult.body || fallbackBody;
  const recipients = templateResult.recipientPhones?.length
    ? templateResult.recipientPhones
    : (biz.phone ? [biz.phone] : []);

  if (recipients.length === 0) {
    console.error(
      `[notifyStaff] reason=${reason} customer=${displayCustomerName} source=${source} — no recipient phones configured`,
    );
    return {
      success: false,
      recipientsNotified: 0,
      errors: ['no_recipient_phones'],
      noRecipients: true,
    };
  }

  // Sequential sends so we can attribute per-recipient failures. The
  // recipient list is typically 1-3 staff phones, so latency is irrelevant.
  // Errors are collected, not thrown — partial success is a valid outcome.
  const errors: string[] = [];
  let notified = 0;
  for (const phone of recipients) {
    if (!phone) continue;
    const r = await sendSms(phone, body);
    if (r.success) {
      notified += 1;
    } else {
      errors.push(`${phone}: ${r.error}`);
    }
  }

  // Audit log to customer's conversation thread when we have a phone. The
  // entry renders as a notification banner (sender_type='system'). Channel is
  // derived from the caller's source so SMS AI v2 audit entries don't get
  // mis-attributed to the voice channel (legacy behavior pre-Layer-1+2 fixup
  // hardcoded 'voice' because the only caller was the voice agent).
  if (normalizedCustomerPhone) {
    try {
      const admin = createAdminClient();
      const { data: conv } = await admin
        .from('conversations')
        .select('id')
        .eq('phone_number', normalizedCustomerPhone)
        .maybeSingle();

      if (conv) {
        const logBody = `Staff notification sent: ${reasonLabel} — ${cleanedDetails}`;
        const auditChannel = channelForSource(source);
        // supabase-js does NOT throw on PG-side errors (CHECK violations,
        // constraint failures, etc.) — it resolves with `{ data, error }`.
        // Both writes below MUST destructure `error` and log loudly; a bare
        // `await admin.from(...).insert(...)` would silently drop the audit
        // row and only surface as "missing audit banner in admin UI." Same
        // hardening applied to background-dispatch.ts in roadmap #42.
        const { error: insertError } = await admin.from('messages').insert({
          conversation_id: conv.id,
          direction: 'outbound',
          body: logBody,
          sender_type: 'system',
          status: 'delivered',
          channel: auditChannel,
        });
        if (insertError) {
          console.error(
            `[notifyStaff] audit message INSERT failed source=${source} conv=${conv.id} ` +
              `code=${insertError.code ?? 'unknown'} ` +
              `message=${insertError.message} ` +
              `details=${insertError.details ?? 'n/a'}`,
          );
        }
        const { error: updateError } = await admin
          .from('conversations')
          .update({
            last_message_at: new Date().toISOString(),
            last_message_preview: logBody.substring(0, 200),
            last_channel: auditChannel,
          })
          .eq('id', conv.id);
        if (updateError) {
          console.error(
            `[notifyStaff] audit conversation UPDATE failed source=${source} conv=${conv.id} ` +
              `code=${updateError.code ?? 'unknown'} ` +
              `message=${updateError.message} ` +
              `details=${updateError.details ?? 'n/a'}`,
          );
        }
      }
    } catch (err) {
      console.error('[notifyStaff] audit log failed:', err);
    }
  }

  console.log(
    `[notifyStaff] reason=${reason} customer=${displayCustomerName} recipients=${notified}/${recipients.length} source=${source}`,
  );

  return {
    success: errors.length === 0,
    recipientsNotified: notified,
    errors,
  };
}
