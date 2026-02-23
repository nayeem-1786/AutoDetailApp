'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { formatPhone } from '@/lib/utils/format';
import { generateReceiptLines, generateReceiptHtml } from '@/app/pos/lib/receipt-template';
import type { MergedReceiptConfig } from '@/lib/data/receipt-config';
import { printReceipt } from '@/app/pos/lib/star-printer';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogContent,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Printer, Mail, MessageSquare, Loader2, Check, Receipt } from 'lucide-react';

interface ReceiptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transactionId: string | null;
  customerEmail?: string;
  customerPhone?: string;
}

export function ReceiptDialog({
  open,
  onOpenChange,
  transactionId,
  customerEmail,
  customerPhone,
}: ReceiptDialogProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [transaction, setTransaction] = useState<any>(null);
  const [receiptHtml, setReceiptHtml] = useState('');
  const [receiptConfig, setReceiptConfig] = useState<MergedReceiptConfig | undefined>(undefined);
  const [loading, setLoading] = useState(false);

  const [printing, setPrinting] = useState(false);
  const [printed, setPrinted] = useState(false);
  const [emailing, setEmailing] = useState(false);
  const [emailed, setEmailed] = useState(false);
  const [smsing, setSmsing] = useState(false);
  const [smsed, setSmsed] = useState(false);

  const [showEmailInput, setShowEmailInput] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [showSmsInput, setShowSmsInput] = useState(false);
  const [smsInput, setSmsInput] = useState('');

  // Load transaction data when dialog opens
  useEffect(() => {
    if (!open || !transactionId) return;

    // Reset state
    setPrinted(false);
    setEmailed(false);
    setSmsed(false);
    setShowEmailInput(false);
    setShowSmsInput(false);

    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/pos/transactions/${transactionId}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to load transaction');

        const tx = json.data;
        const rcfg: MergedReceiptConfig | undefined = json.receipt_config ?? undefined;
        setTransaction(tx);
        setReceiptConfig(rcfg);
        setEmailInput(tx.customer?.email || customerEmail || '');
        setSmsInput(
          tx.customer?.phone
            ? formatPhone(tx.customer.phone)
            : customerPhone
              ? formatPhone(customerPhone)
              : ''
        );

        const html = generateReceiptHtml(
          {
            receipt_number: tx.receipt_number,
            transaction_date: tx.transaction_date,
            subtotal: tx.subtotal,
            tax_amount: tx.tax_amount,
            discount_amount: tx.discount_amount,
            coupon_code: tx.coupon_code,
            loyalty_discount: tx.loyalty_discount,
            loyalty_points_redeemed: tx.loyalty_points_redeemed,
            tip_amount: tx.tip_amount,
            total_amount: tx.total_amount,
            customer: tx.customer,
            employee: tx.employee,
            vehicle: tx.vehicle,
            items: tx.items ?? [],
            payments: tx.payments ?? [],
          },
          rcfg
        );
        setReceiptHtml(html);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to load receipt');
        onOpenChange(false);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [open, transactionId]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleCopierPrint() {
    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) {
      toast.error('Pop-up blocked — allow pop-ups and try again');
      return;
    }
    printWindow.document.write(receiptHtml);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }

  async function handleReceiptPrint() {
    if (!transaction) return;
    setPrinting(true);
    try {
      const res = await fetch('/api/pos/receipts/print', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transaction_id: transaction.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Print failed');
      const printConfig: MergedReceiptConfig | undefined =
        json.data.receipt_config ?? receiptConfig;
      const lines = generateReceiptLines(json.data.transaction, printConfig);
      await printReceipt(json.data.printer_ip, lines);
      setPrinted(true);
      toast.success('Receipt printed');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Print failed');
    } finally {
      setPrinting(false);
    }
  }

  async function handleEmail(email: string) {
    if (!email || !transaction) return;
    setEmailing(true);
    try {
      const res = await fetch('/api/pos/receipts/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transaction_id: transaction.id, email }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Email failed');
      setEmailed(true);
      setShowEmailInput(false);
      toast.success(`Receipt emailed to ${email}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send email');
    } finally {
      setEmailing(false);
    }
  }

  async function handleSms(phone: string) {
    if (!phone || !transaction) return;
    setSmsing(true);
    try {
      const res = await fetch('/api/pos/receipts/sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transaction_id: transaction.id, phone }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'SMS failed');
      setSmsed(true);
      setShowSmsInput(false);
      toast.success('Receipt sent via SMS');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send SMS');
    } finally {
      setSmsing(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogClose onClose={() => onOpenChange(false)} />
      <DialogHeader>
        <DialogTitle>
          Receipt {transaction?.receipt_number ? `#${transaction.receipt_number}` : ''}
        </DialogTitle>
      </DialogHeader>
      <DialogContent className="max-h-[60vh] overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Spinner size="lg" />
          </div>
        ) : (
          <div
            className="rounded border border-gray-200 bg-gray-50 p-2"
            dangerouslySetInnerHTML={{ __html: receiptHtml }}
          />
        )}
      </DialogContent>
      {!loading && transaction && (
        <DialogFooter className="flex-col items-stretch gap-3">
          <div className="grid grid-cols-4 gap-2">
            <Button variant="outline" size="sm" onClick={handleCopierPrint}>
              <Printer className="mr-1.5 h-4 w-4" />
              Print
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const email = transaction.customer?.email || customerEmail;
                if (email) {
                  handleEmail(email);
                } else {
                  setShowEmailInput(true);
                }
              }}
              disabled={emailing || emailed}
            >
              {emailing ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : emailed ? (
                <Check className="mr-1.5 h-4 w-4 text-green-500" />
              ) : (
                <Mail className="mr-1.5 h-4 w-4" />
              )}
              Email
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const phone = transaction.customer?.phone || customerPhone;
                if (phone) {
                  handleSms(phone);
                } else {
                  setShowSmsInput(true);
                }
              }}
              disabled={smsing || smsed}
            >
              {smsing ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : smsed ? (
                <Check className="mr-1.5 h-4 w-4 text-green-500" />
              ) : (
                <MessageSquare className="mr-1.5 h-4 w-4" />
              )}
              SMS
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleReceiptPrint}
              disabled={printing || printed}
            >
              {printing ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : printed ? (
                <Check className="mr-1.5 h-4 w-4 text-green-500" />
              ) : (
                <Receipt className="mr-1.5 h-4 w-4" />
              )}
              Receipt
            </Button>
          </div>

          {/* Email input */}
          {showEmailInput && (
            <div className="flex gap-2">
              <Input
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="customer@email.com"
                className="h-8 text-xs"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleEmail(emailInput);
                }}
              />
              <Button
                size="sm"
                className="h-8"
                onClick={() => handleEmail(emailInput)}
                disabled={!emailInput || emailing}
              >
                Send
              </Button>
            </div>
          )}

          {/* SMS input */}
          {showSmsInput && (
            <div className="flex gap-2">
              <Input
                type="tel"
                value={smsInput}
                onChange={(e) => setSmsInput(e.target.value)}
                placeholder="(310) 555-0123"
                className="h-8 text-xs"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSms(smsInput);
                }}
              />
              <Button
                size="sm"
                className="h-8"
                onClick={() => handleSms(smsInput)}
                disabled={!smsInput || smsing}
              >
                Send
              </Button>
            </div>
          )}
        </DialogFooter>
      )}
    </Dialog>
  );
}
