'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogContent,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Mail, MessageSquare, Send, CheckCircle } from 'lucide-react';

export type SendMethod = 'email' | 'sms' | 'both';

interface SendMethodDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** e.g. "How would you like to send this estimate to John Doe?" */
  description?: string;
  customerEmail: string | null;
  customerPhone: string | null;
  /** Called when user clicks Send. Parent handles API call. */
  onSend: (method: SendMethod) => void;
  sending?: boolean;
  success?: boolean;
  sendLabel?: string;
  cancelLabel?: string;
}

export function SendMethodDialog({
  open,
  onOpenChange,
  title,
  description,
  customerEmail,
  customerPhone,
  onSend,
  sending = false,
  success = false,
  sendLabel = 'Send',
  cancelLabel = 'Cancel',
}: SendMethodDialogProps) {
  const [method, setMethod] = useState<SendMethod>('email');

  // Reset method when dialog opens
  useEffect(() => {
    if (open) setMethod('email');
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen && !success) onOpenChange(false); }}>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
      </DialogHeader>
      <DialogContent className="space-y-4">
        {description && (
          <p className="text-sm text-gray-600">{description}</p>
        )}
        <div className="space-y-2">
          <label className={`flex items-center gap-3 rounded-md border border-gray-200 p-3 ${success ? 'pointer-events-none opacity-50' : 'cursor-pointer hover:bg-gray-50'}`}>
            <input
              type="radio"
              name="sendMethod"
              value="email"
              checked={method === 'email'}
              onChange={() => setMethod('email')}
              disabled={success}
            />
            <Mail className="h-5 w-5 text-gray-500" />
            <div>
              <div className="text-sm font-medium">Email</div>
              <div className="text-xs text-gray-500">
                {customerEmail || 'No email on file'}
              </div>
            </div>
          </label>
          <label className={`flex items-center gap-3 rounded-md border border-gray-200 p-3 ${success ? 'pointer-events-none opacity-50' : 'cursor-pointer hover:bg-gray-50'}`}>
            <input
              type="radio"
              name="sendMethod"
              value="sms"
              checked={method === 'sms'}
              onChange={() => setMethod('sms')}
              disabled={success}
            />
            <MessageSquare className="h-5 w-5 text-gray-500" />
            <div>
              <div className="text-sm font-medium">SMS (with PDF)</div>
              <div className="text-xs text-gray-500">
                {customerPhone || 'No phone on file'}
              </div>
            </div>
          </label>
          <label className={`flex items-center gap-3 rounded-md border border-gray-200 p-3 ${success ? 'pointer-events-none opacity-50' : 'cursor-pointer hover:bg-gray-50'}`}>
            <input
              type="radio"
              name="sendMethod"
              value="both"
              checked={method === 'both'}
              onChange={() => setMethod('both')}
              disabled={success}
            />
            <Send className="h-5 w-5 text-gray-500" />
            <div>
              <div className="text-sm font-medium">Both Email & SMS</div>
              <div className="text-xs text-gray-500">Send via all available channels</div>
            </div>
          </label>
        </div>
      </DialogContent>
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending || success}>
          {cancelLabel}
        </Button>
        {success ? (
          <Button className="bg-green-600 hover:bg-green-600 text-white cursor-default" disabled>
            <CheckCircle className="h-4 w-4" />
            Sent
          </Button>
        ) : (
          <Button onClick={() => onSend(method)} disabled={sending}>
            {sending ? <Spinner size="sm" /> : <Send className="h-4 w-4" />}
            {sendLabel}
          </Button>
        )}
      </DialogFooter>
    </Dialog>
  );
}
