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

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to send');
      }

      const sentVia = data.sent_via?.join(' & ') || method;
      toast.success(`Confirmation sent via ${sentVia}`);

      if (data.errors?.length) {
        data.errors.forEach((err: string) => toast.warning(err));
      }

      setSuccess(true);
      setTimeout(() => {
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
