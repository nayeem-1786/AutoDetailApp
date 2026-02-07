'use client';

import { useState } from 'react';
import { SendMethodDialog, type SendMethod } from '@/components/ui/send-method-dialog';
import { toast } from 'sonner';
import { posFetch } from '../../lib/pos-fetch';

interface QuoteSendDialogProps {
  open: boolean;
  onClose: () => void;
  quoteId: string;
  customerEmail: string | null;
  customerPhone: string | null;
  onSent: () => void;
}

export function QuoteSendDialog({
  open,
  onClose,
  quoteId,
  customerEmail,
  customerPhone,
  onSent,
}: QuoteSendDialogProps) {
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSend(method: SendMethod) {
    setSending(true);
    try {
      const res = await posFetch(`/api/pos/quotes/${quoteId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to send');
      }

      const sentVia = data.sent_via?.join(' & ') || method;
      toast.success(`Quote sent via ${sentVia}`);

      if (data.errors?.length) {
        data.errors.forEach((err: string) => toast.warning(err));
      }

      setSuccess(true);
      setTimeout(() => {
        onSent();
      }, 3000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send quote');
    } finally {
      setSending(false);
    }
  }

  return (
    <SendMethodDialog
      open={open}
      onOpenChange={(isOpen) => { if (!isOpen && !success) onClose(); }}
      title="Send Quote"
      description="Choose how to send this quote to the customer."
      customerEmail={customerEmail}
      customerPhone={customerPhone}
      onSend={handleSend}
      sending={sending}
      success={success}
    />
  );
}
