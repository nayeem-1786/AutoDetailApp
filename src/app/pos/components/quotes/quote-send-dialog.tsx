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

      const data = await res.json().catch(() => ({}));

      // Phase Messaging-1+2: server returns 422 when no channel succeeded
      // (total failure / all-blocked). Treat it as a soft error so the modal
      // stays interactive and the user can retry or close.
      if (res.status === 422) {
        toast.error(data?.error || 'Quote could not be sent');
        return;
      }

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to send');
      }

      // Success path — at least one channel landed. `errors` may still carry
      // per-channel failures for a partial outcome.
      const sentVia: string[] = Array.isArray(data?.sent_via) ? data.sent_via : [];
      const sentLabel = sentVia.length > 0 ? sentVia.join(' & ') : method;
      toast.success(`Quote sent via ${sentLabel}`);

      const partialErrors: { channel: string; reason: string }[] = Array.isArray(data?.errors)
        ? data.errors
        : [];
      if (partialErrors.length > 0) {
        // Consolidated single warning toast (was: one per error).
        toast.warning(
          partialErrors
            .map((e) => `${e.channel}: ${e.reason}`)
            .join(' • ')
        );
      }

      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
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
