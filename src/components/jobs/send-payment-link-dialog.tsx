'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { SendMethodDialog, type SendMethod } from '@/components/ui/send-method-dialog';
import { posFetch } from '@/app/pos/lib/pos-fetch';

interface SendPaymentLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointmentId: string;
  customerEmail: string | null;
  customerPhone: string | null;
  /** Remaining balance in dollars — used as the *display* fallback when no
   * custom amount has been chosen yet (legacy callers). When `amountCents` is
   * provided, the description renders that instead. */
  amountDue: number;
  /** Custom-amount selection from PaymentLinkAmountModal (Pay-Link Session 5).
   * When non-null, this is the amount the link will charge for and the value
   * forwarded to the server. NULL means "let the server pick remaining"
   * (legacy/full-balance behavior). */
  amountCents?: number | null;
  /** Fired after a successful send so the parent can refresh / toast. */
  onSent?: (result: { paymentLinkToken: string; payUrl: string }) => void;
}

/**
 * Wrapper around SendMethodDialog that POSTs to the Session 3a send route.
 * Mirrors the NotifyCustomerDialog pattern (one-shot dialog, success state
 * auto-closes, errors surface as toasts) but uses posFetch since this is a
 * POS-only surface.
 */
export function SendPaymentLinkDialog({
  open,
  onOpenChange,
  appointmentId,
  customerEmail,
  customerPhone,
  amountDue,
  amountCents,
  onSent,
}: SendPaymentLinkDialogProps) {
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSend(method: SendMethod) {
    setSending(true);
    try {
      const body: { method: SendMethod; amount_cents?: number } = { method };
      if (typeof amountCents === 'number') body.amount_cents = amountCents;

      const res = await posFetch(
        `/api/pos/appointments/${appointmentId}/send-payment-link`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      );

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to send payment link');
      }

      const channels = data?.channels ?? {};
      const sentVia = (Object.keys(channels) as Array<keyof typeof channels>)
        .filter((k) => channels[k] === 'sent')
        .join(' & ');
      toast.success(sentVia ? `Payment link sent via ${sentVia}` : 'Payment link sent');

      if (Array.isArray(data?.partial_errors)) {
        for (const err of data.partial_errors) {
          toast.warning(err);
        }
      }

      onSent?.({
        paymentLinkToken: data.payment_link_token,
        payUrl: data.pay_url,
      });

      setSuccess(true);
      // 3s setTimeout captures dialog state at send-time. Parent (job-detail.tsx)
      // uses a paymentLinkSentRef to short-circuit the reopen branch when this
      // closure fires with stale state. If parent logic is refactored, revisit
      // this internal closure.
      setTimeout(() => {
        setSuccess(false);
        onOpenChange(false);
      }, 3000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send payment link');
    } finally {
      setSending(false);
    }
  }

  return (
    <SendMethodDialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen && !success) onOpenChange(false);
      }}
      title="Send Payment Link"
      description={`Send a secure payment link for $${(typeof amountCents === 'number' ? amountCents / 100 : amountDue).toFixed(2)} to the customer.`}
      customerEmail={customerEmail}
      customerPhone={customerPhone}
      onSend={handleSend}
      sending={sending}
      success={success}
      sendLabel="Send Link"
      cancelLabel="Cancel"
    />
  );
}
