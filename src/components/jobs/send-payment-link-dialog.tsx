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
  /** Remaining balance in dollars, displayed in the dialog description. */
  amountDue: number;
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
  onSent,
}: SendPaymentLinkDialogProps) {
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSend(method: SendMethod) {
    setSending(true);
    try {
      const res = await posFetch(
        `/api/pos/appointments/${appointmentId}/send-payment-link`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ method }),
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
      description={`Send a secure payment link for $${amountDue.toFixed(2)} to the customer.`}
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
