import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { validateApiKey } from '@/lib/auth/api-key';
import { normalizePhone, formatPhone } from '@/lib/utils/format';
import { sendSms } from '@/lib/utils/sms';
import { renderSmsTemplate } from '@/lib/sms/render-sms-template';
import { getBusinessInfo } from '@/lib/data/business';
import { createPerfTimer } from '@/lib/utils/voice-perf';

const VALID_REASONS = [
  'appointment_change',
  'custom_quote',
  'beyond_scope',
  'transfer_request',
  'mobile_distance',
  'other',
] as const;

type EscalationReason = (typeof VALID_REASONS)[number];

const REASON_LABELS: Record<EscalationReason, string> = {
  appointment_change: 'Appointment Change/Cancel',
  custom_quote: 'Custom Quote Needed',
  beyond_scope: 'Question Beyond Agent Scope',
  transfer_request: 'Requested Human Callback',
  mobile_distance: 'Mobile Service - Distance Check',
  other: 'Other - See Details',
};

/**
 * POST /api/voice-agent/notify-staff
 * Mid-call escalation tool — sends an SMS alert to staff when the voice
 * agent hits a boundary it can't handle (cancellation, custom quote,
 * transfer request, etc.).
 *
 * Auth: Bearer token (voice_agent_api_key)
 */
export async function POST(request: NextRequest) {
  const perf = createPerfTimer('POST /voice-agent/notify-staff');
  try {
    const auth = await validateApiKey(request);
    if (!auth.valid) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const body = await request.json();
    const { customer_name, customer_phone, reason, details } = body as {
      customer_name: string;
      customer_phone: string;
      reason: string;
      details: string;
    };

    // Validate required fields
    if (!reason || !VALID_REASONS.includes(reason as EscalationReason)) {
      return NextResponse.json(
        { success: false },
        { status: 200 }
      );
    }
    if (!details?.trim()) {
      return NextResponse.json(
        { success: false },
        { status: 200 }
      );
    }

    const reasonLabel = REASON_LABELS[reason as EscalationReason];

    // Normalize customer phone (may be empty if agent doesn't have it yet)
    const normalizedPhone = customer_phone ? normalizePhone(customer_phone) : null;
    const displayPhone = normalizedPhone ? formatPhone(normalizedPhone) : 'Unknown';
    const displayName = customer_name?.trim() || 'Unknown';

    // Build hardcoded fallback (disaster-recovery if template is missing from DB)
    const fallbackBody = [
      `\u{1F514} Staff Action Needed`,
      `Customer: ${displayName}`,
      `Phone: ${displayPhone}`,
      `Reason: ${reasonLabel}`,
      `Details: ${details.trim()}`,
      normalizedPhone ? `Reply to customer: ${displayPhone}` : '',
    ].filter(Boolean).join('\n');

    // Render SMS from admin-editable template
    const supabase = createAdminClient();
    let t = perf.now();
    const [templateResult, biz] = await Promise.all([
      renderSmsTemplate('staff_notification', {
        customer_name: displayName,
        customer_phone: displayPhone,
        reason_label: reasonLabel,
        details: details.trim(),
      }, fallbackBody),
      getBusinessInfo(),
    ]);
    perf.mark('fetch:template+businessInfo', t);

    // If template is toggled off in admin, skip sending
    if (!templateResult.isActive) {
      console.log('[NotifyStaff] Template is inactive — skipping staff alert');
      const responseData = { success: true };
      perf.done(responseData);
      return NextResponse.json(responseData);
    }

    // Use template recipient_phones (configured in admin SMS template editor),
    // fall back to business phone if none configured
    const phones = templateResult.recipientPhones?.length
      ? templateResult.recipientPhones
      : (biz.phone ? [biz.phone] : []);

    if (phones.length === 0) {
      console.error('[NotifyStaff] No recipient phones configured — cannot send staff alert');
      return NextResponse.json(
        { success: false },
        { status: 200 }
      );
    }

    console.log('[NotifyStaff] Sending to:', phones.join(', '));

    // Send SMS to all staff recipients — NO conversation logging (this goes to staff, not customer)
    t = perf.now();
    const results = await Promise.all(
      phones.map((phone) => sendSms(phone, templateResult.body))
    );
    perf.mark('fetch:sendSms', t);

    const anyFailed = results.some((r) => !r.success);
    if (anyFailed) {
      console.error('[NotifyStaff] Some staff SMS failed:', results.filter((r) => !r.success).map((r) => r.error));
    }

    // Log to customer's conversation thread for admin visibility (separate from the staff SMS)
    if (normalizedPhone) {
      t = perf.now();
      const { data: conv } = await supabase
        .from('conversations')
        .select('id')
        .eq('phone_number', normalizedPhone)
        .maybeSingle();
      perf.mark('query:conversation_find', t);

      if (conv) {
        const logBody = `Staff notification sent: ${reasonLabel} — ${details.trim()}`;
        await supabase.from('messages').insert({
          conversation_id: conv.id,
          direction: 'outbound',
          body: logBody,
          sender_type: 'system',
          status: 'delivered',
          channel: 'voice',
        });

        await supabase
          .from('conversations')
          .update({
            last_message_at: new Date().toISOString(),
            last_message_preview: logBody.substring(0, 200),
            last_channel: 'voice',
          })
          .eq('id', conv.id);
      }
    }

    console.log(`[NotifyStaff] Sent alert to staff — reason: ${reason}, customer: ${displayName}, phone: ${displayPhone}`);

    const responseData = { success: true };
    perf.done(responseData);
    return NextResponse.json(responseData);
  } catch (err) {
    console.error('[NotifyStaff] Error:', err);
    return NextResponse.json(
      { success: false },
      { status: 200 }
    );
  }
}
