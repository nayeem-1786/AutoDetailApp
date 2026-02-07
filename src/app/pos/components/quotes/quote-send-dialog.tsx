'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogContent,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Mail, MessageSquare, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils/cn';
import { posFetch } from '../../lib/pos-fetch';

type SendMethod = 'email' | 'sms' | 'both';

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
  const [method, setMethod] = useState<SendMethod>('both');
  const [sending, setSending] = useState(false);

  const canEmail = !!customerEmail;
  const canSms = !!customerPhone;

  async function handleSend() {
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

      onSent();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send quote');
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogClose onClose={onClose} />
      <DialogHeader>
        <DialogTitle>Send Quote</DialogTitle>
      </DialogHeader>
      <DialogContent>
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Choose how to send this quote to the customer.
          </p>

          {/* Method selection */}
          <div className="space-y-2">
            {[
              { key: 'email' as SendMethod, icon: Mail, label: 'Email', contact: customerEmail, available: canEmail },
              { key: 'sms' as SendMethod, icon: MessageSquare, label: 'SMS', contact: customerPhone, available: canSms },
              { key: 'both' as SendMethod, icon: Mail, label: 'Both', contact: null, available: canEmail || canSms },
            ].map(({ key, icon: Icon, label, contact, available }) => (
              <button
                key={key}
                onClick={() => setMethod(key)}
                disabled={!available}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-all',
                  method === key
                    ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500'
                    : available
                    ? 'border-gray-200 hover:border-gray-300'
                    : 'cursor-not-allowed border-gray-100 opacity-50'
                )}
              >
                <div
                  className={cn(
                    'flex h-5 w-5 items-center justify-center rounded-full border-2',
                    method === key ? 'border-blue-500' : 'border-gray-300'
                  )}
                >
                  {method === key && (
                    <div className="h-2.5 w-2.5 rounded-full bg-blue-500" />
                  )}
                </div>
                <Icon className="h-4 w-4 text-gray-500" />
                <div className="flex-1">
                  <span className="text-sm font-medium text-gray-900">{label}</span>
                  {contact && (
                    <p className="text-xs text-gray-500">{contact}</p>
                  )}
                </div>
              </button>
            ))}
          </div>

          {/* Warnings */}
          {method === 'email' && !canEmail && (
            <div className="flex items-start gap-2 rounded-md bg-amber-50 p-3 text-sm text-amber-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              Customer has no email address on file.
            </div>
          )}
          {method === 'sms' && !canSms && (
            <div className="flex items-start gap-2 rounded-md bg-amber-50 p-3 text-sm text-amber-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              Customer has no phone number on file.
            </div>
          )}
          {method === 'both' && (!canEmail || !canSms) && (
            <div className="flex items-start gap-2 rounded-md bg-amber-50 p-3 text-sm text-amber-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {!canEmail && !canSms
                ? 'Customer has no email or phone on file.'
                : !canEmail
                ? 'Customer has no email — will send via SMS only.'
                : 'Customer has no phone — will send via email only.'}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={sending} className="flex-1">
              Cancel
            </Button>
            <Button
              onClick={handleSend}
              disabled={sending || (!canEmail && !canSms)}
              className="flex-1"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Send'
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
