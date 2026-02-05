'use client';

import { useState } from 'react';
import { Printer, Mail, MessageSquare, Receipt, Loader2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { posFetch } from '../lib/pos-fetch';
import { formatPhone, formatPhoneInput } from '@/lib/utils/format';
import { generateReceiptLines, generateReceiptHtml } from '../lib/receipt-template';
import type { MergedReceiptConfig } from '@/lib/data/receipt-config';
import { printReceipt } from '../lib/star-printer';

interface ReceiptOptionsProps {
  transactionId: string;
  customerEmail: string | null;
  customerPhone: string | null;
}

export function ReceiptOptions({
  transactionId,
  customerEmail,
  customerPhone,
}: ReceiptOptionsProps) {
  const [printing, setPrinting] = useState(false);
  const [printed, setPrinted] = useState(false);
  const [emailing, setEmailing] = useState(false);
  const [emailed, setEmailed] = useState(false);
  const [smsing, setSmsing] = useState(false);
  const [smsed, setSmsed] = useState(false);
  const [copierPrinting, setCopierPrinting] = useState(false);

  const [showEmailInput, setShowEmailInput] = useState(false);
  const [emailInput, setEmailInput] = useState(customerEmail ?? '');
  const [showSmsInput, setShowSmsInput] = useState(false);
  const [smsInput, setSmsInput] = useState(customerPhone ? formatPhone(customerPhone) : '');

  async function handleReceiptPrint() {
    setPrinting(true);
    try {
      const res = await posFetch('/api/pos/receipts/print', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transaction_id: transactionId }),
      });

      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || 'Print failed');
        return;
      }

      const rcfg: MergedReceiptConfig | undefined = json.data.receipt_config ?? undefined;
      const lines = generateReceiptLines(json.data.transaction, rcfg);
      await printReceipt(json.data.printer_ip, lines);
      setPrinted(true);
      toast.success('Receipt printed');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Print failed');
    } finally {
      setPrinting(false);
    }
  }

  async function handleCopierPrint() {
    // Open window immediately in the click handler so Safari/iPad doesn't block it
    const printWindow = window.open('', '_blank', 'width=450,height=700');
    if (!printWindow) {
      toast.error('Pop-up blocked — allow pop-ups and try again');
      return;
    }
    printWindow.document.write('<html><body><p>Loading receipt…</p></body></html>');

    setCopierPrinting(true);
    try {
      const res = await posFetch(`/api/pos/transactions/${transactionId}`);
      const json = await res.json();
      if (!res.ok) {
        printWindow.close();
        toast.error(json.error || 'Failed to load receipt');
        return;
      }

      const tx = json.data;
      const rcfg: MergedReceiptConfig | undefined = json.receipt_config ?? undefined;
      const html = generateReceiptHtml(tx, rcfg);
      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.focus();
      printWindow.print();
    } catch (err) {
      printWindow.close();
      toast.error(err instanceof Error ? err.message : 'Print failed');
    } finally {
      setCopierPrinting(false);
    }
  }

  async function handleEmail(email: string) {
    if (!email) return;
    setEmailing(true);
    try {
      const res = await posFetch('/api/pos/receipts/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transaction_id: transactionId, email }),
      });

      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || 'Email failed');
        return;
      }

      setEmailed(true);
      setShowEmailInput(false);
      toast.success(`Receipt emailed to ${email}`);
    } catch {
      toast.error('Failed to send email');
    } finally {
      setEmailing(false);
    }
  }

  async function handleSms(phone: string) {
    if (!phone) return;
    setSmsing(true);
    try {
      const res = await posFetch('/api/pos/receipts/sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transaction_id: transactionId, phone }),
      });

      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || 'SMS failed');
        return;
      }

      setSmsed(true);
      setShowSmsInput(false);
      toast.success('Receipt sent via SMS');
    } catch {
      toast.error('Failed to send SMS');
    } finally {
      setSmsing(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="grid grid-cols-4 gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleCopierPrint}
          disabled={copierPrinting}
        >
          {copierPrinting ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Printer className="mr-1.5 h-4 w-4" />
          )}
          Print
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            if (customerEmail) {
              handleEmail(customerEmail);
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
            if (customerPhone) {
              handleSms(customerPhone);
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
            className="h-8 w-48 text-xs"
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
            onChange={(e) => setSmsInput(formatPhoneInput(e.target.value))}
            placeholder="(310) 555-0123"
            className="h-8 w-48 text-xs"
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
    </div>
  );
}
