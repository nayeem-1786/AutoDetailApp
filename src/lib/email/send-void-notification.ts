import { createAdminClient } from '@/lib/supabase/admin';
import { getBusinessInfo } from '@/lib/data/business';
import { sendEmail } from '@/lib/utils/email';
import { sendSms } from '@/lib/utils/sms';

interface VoidNotificationResult {
  emailSent: boolean;
  smsSent: boolean;
}

interface NotifyTransactionVoidedInput {
  customerId: string;
  transactionId: string;
  /** Set when the void cascade also cancelled a linked job. */
  jobCancelled: boolean;
  /** Optional reason text the operator entered with the void. */
  reason?: string | null;
}

/**
 * Send transaction void notifications (email + SMS) to a customer.
 *
 * Co-located with send-cancellation-email.ts but operates on customer_id
 * directly — voids may not have an appointment context (walk-in jobs,
 * product-only sales). Uses hardcoded copy rather than DB templates because
 * void notifications don't justify the template-management overhead.
 *
 * Independent skip rules: no email → still tries SMS, no phone → still
 * tries email. Errors are caught locally and logged; the helper never
 * throws so callers can fire-and-forget.
 */
export async function notifyTransactionVoided(
  input: NotifyTransactionVoidedInput
): Promise<VoidNotificationResult> {
  const result: VoidNotificationResult = { emailSent: false, smsSent: false };

  const supabase = createAdminClient();
  const business = await getBusinessInfo();

  const { data: customer } = await supabase
    .from('customers')
    .select('id, first_name, last_name, email, phone')
    .eq('id', input.customerId)
    .single();

  if (!customer) return result;

  const { data: transaction } = await supabase
    .from('transactions')
    .select('receipt_number, total_amount')
    .eq('id', input.transactionId)
    .single();

  const receiptNumber = transaction?.receipt_number ?? input.transactionId.slice(0, 8);
  const reasonSuffix = input.reason ? ` Reason: ${input.reason}.` : '';

  // --- Email ---
  if (customer.email) {
    try {
      const subject = `Transaction Voided — ${business.name}`;

      const jobLine = input.jobCancelled
        ? 'Your scheduled service has been cancelled and will not take place.\n\n'
        : '';

      const textBody =
        `Transaction Void Notification from ${business.name}\n\n` +
        `Hi ${customer.first_name},\n\n` +
        `Your transaction (#${receiptNumber}) has been voided.${reasonSuffix}\n\n` +
        jobLine +
        `If you have any questions, please call us at ${business.phone}.\n\n` +
        `${business.name}\n${business.address}`;

      const jobBlock = input.jobCancelled
        ? `<p class="email-text" style="margin: 0 0 16px; font-size: 14px;">Your scheduled service has been cancelled and will not take place.</p>`
        : '';

      const reasonBlock = input.reason
        ? `<p class="email-text" style="margin: 0 0 8px; font-size: 14px;"><strong>Reason:</strong> ${input.reason}</p>`
        : '';

      const htmlBody = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light dark">
  <style>
    @media (prefers-color-scheme: dark) {
      .email-body { background-color: #1a1a2e !important; }
      .email-card { background-color: #16213e !important; }
      .email-info-box { background-color: #1a1a2e !important; }
      .email-text { color: #e2e8f0 !important; }
      .email-text-muted { color: #94a3b8 !important; }
      .email-footer { background-color: #1a1a2e !important; }
      .email-footer-text { color: #64748b !important; }
    }
  </style>
</head>
<body class="email-body" style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6; color-scheme: light dark;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <div class="email-card" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); overflow: hidden;">
      <div style="background-color: #6b7280; padding: 24px 32px;">
        <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">${business.name}</h1>
        <p style="margin: 8px 0 0; color: #e5e7eb; font-size: 14px;">Transaction Voided</p>
      </div>
      <div style="padding: 32px;">
        <div style="margin-bottom: 24px;">
          <h2 class="email-text" style="margin: 0 0 8px; color: #1e3a5f; font-size: 20px;">Your Transaction Has Been Voided</h2>
          <p class="email-text-muted" style="margin: 0; color: #6b7280; font-size: 14px;">Hi ${customer.first_name}, this is to confirm that transaction #${receiptNumber} has been voided.</p>
        </div>
        <div class="email-info-box" style="background-color: #f9fafb; border-radius: 6px; padding: 16px; margin-bottom: 24px; border-left: 4px solid #6b7280;">
          <p class="email-text" style="margin: 0 0 8px; font-size: 14px;"><strong>Receipt:</strong> #${receiptNumber}</p>
          ${reasonBlock}
          ${jobBlock}
        </div>
        <p class="email-text-muted" style="margin: 0; color: #6b7280; font-size: 14px; text-align: center;">
          Questions? Call us at <a href="tel:${business.phone}" style="color: #1e3a5f;">${business.phone}</a>
        </p>
      </div>
      <div class="email-footer" style="background-color: #f9fafb; padding: 24px 32px; text-align: center;">
        <p class="email-footer-text" style="margin: 0; color: #9ca3af; font-size: 12px;">${business.name}</p>
      </div>
    </div>
  </div>
</body>
</html>`;

      const emailResult = await sendEmail(customer.email, subject, textBody, htmlBody);
      if (emailResult.success) result.emailSent = true;
    } catch (e) {
      console.error('Void notification email failed:', e);
    }
  }

  // --- SMS ---
  if (customer.phone) {
    try {
      const jobLine = input.jobCancelled
        ? ' Your scheduled service has been cancelled.'
        : '';
      const smsBody =
        `Hi ${customer.first_name}, transaction #${receiptNumber} at ${business.name} has been voided.${jobLine}` +
        ` Questions? Call ${business.phone}.`;

      const smsResult = await sendSms(customer.phone, smsBody, {
        logToConversation: true,
        customerId: customer.id,
        notificationType: 'transaction_voided',
        contextId: input.transactionId,
      });
      if (smsResult.success) result.smsSent = true;
    } catch (e) {
      console.error('Void notification SMS failed:', e);
    }
  }

  return result;
}
