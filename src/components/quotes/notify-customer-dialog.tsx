'use client';

import { useState } from 'react';
import { SendMethodDialog, type SendMethod } from '@/components/ui/send-method-dialog';
import { toast } from 'sonner';

interface NotifyCustomerDialogProps {
  open: boolean;
  onClose: () => void;
  appointmentId: string;
  customerEmail: string | null;
  customerPhone: string | null;
  fetchFn?: typeof fetch;
  apiBasePath: string;
}

export function NotifyCustomerDialog({
  open,
  onClose,
  appointmentId,
  customerEmail,
  customerPhone,
  fetchFn = fetch,
  apiBasePath,
}: NotifyCustomerDialogProps) {
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSend(method: SendMethod) {
    setSending(true);
    try {
      const res = await fetchFn(`${apiBasePath}/${appointmentId}/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method }),
      });

      const data = await res.json().catch(() => ({}));

      // Phase Messaging-1+2 parity: treat 422 as soft-error so the modal
      // stays interactive. (Appointment-notify server may not emit 422 today
      // — falls through to the !res.ok path which already does the right
      // thing.)
      if (res.status === 422) {
        toast.error(data?.error || 'Confirmation could not be sent');
        return;
      }

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to send');
      }

      const sentVia: string[] = Array.isArray(data?.sent_via) ? data.sent_via : [];
      const sentLabel = sentVia.length > 0 ? sentVia.join(' & ') : method;
      toast.success(`Confirmation sent via ${sentLabel}`);

      // Tolerate both shapes: legacy string[] and new {channel, reason}[].
      const rawErrors = Array.isArray(data?.errors) ? data.errors : [];
      if (rawErrors.length > 0) {
        const summary = rawErrors
          .map((e: unknown) =>
            typeof e === 'string'
              ? e
              : e && typeof e === 'object' && 'reason' in e
                ? `${(e as { channel?: string }).channel ?? 'channel'}: ${(e as { reason: string }).reason}`
                : String(e)
          )
          .join(' • ');
        toast.warning(summary);
      }

      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 3000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send confirmation');
    } finally {
      setSending(false);
    }
  }

  return (
    <SendMethodDialog
      open={open}
      onOpenChange={(isOpen) => { if (!isOpen && !success) onClose(); }}
      title="Send Appointment Confirmation"
      description="Send a confirmation to the customer about their scheduled appointment."
      customerEmail={customerEmail}
      customerPhone={customerPhone}
      onSend={handleSend}
      sending={sending}
      success={success}
      sendLabel="Send Confirmation"
      cancelLabel="Skip"
    />
  );
}
