'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { SendMethodDialog, type SendMethod } from '@/components/ui/send-method-dialog';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogContent,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
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
 * Item 3 (Session #149) — server's structured 409 response shape for the
 * re-send-after-paid guard. The dialog parses this code, surfaces a
 * confirmation modal with the prior payment context, then re-POSTs with
 * `confirm_resend: true` if the operator clicks "Send anyway". The
 * confirmation is the load-bearing protection against same-amount
 * double-charge on partial-paid + previous-link-consumed appointments.
 *
 * Server contract: returned alongside `previous_payment: { amount_cents,
 * paid_at }`. `amount_cents` may be `null` when no payment row exists with
 * a numeric amount (degenerate — UI then shows date only).
 */
type PreviousLinkPaidResponse = {
  code: 'previous_link_paid';
  previous_payment: {
    amount_cents: number | null;
    paid_at: string;
  };
};

interface PendingConfirm {
  method: SendMethod;
  previousPayment: PreviousLinkPaidResponse['previous_payment'];
}

/**
 * Wrapper around SendMethodDialog that POSTs to the Session 3a send route.
 * Mirrors the NotifyCustomerDialog pattern (one-shot dialog, success state
 * auto-closes, errors surface as toasts) but uses posFetch since this is a
 * POS-only surface.
 *
 * Session #149 (Item 3) — gained a confirmation step for the
 * re-send-after-paid case. The server returns 409 + `code: 'previous_link_paid'`
 * when `appointments.payment_link_paid_at IS NOT NULL`; this component
 * renders a secondary Dialog over the SendMethodDialog with the prior
 * payment's amount + date, plus Cancel / Send anyway buttons. "Send anyway"
 * re-POSTs the same body with `confirm_resend: true` (the explicit operator
 * intent capture). The designed deposit+balance flow uses this path on
 * every cycle — by design; the friction is acceptable vs. the double-pay
 * risk it prevents.
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
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);

  /**
   * Perform the actual POST. Shared between the initial send and the
   * "Send anyway" retry — `confirmResend` is the only differentiator.
   *
   * On 409 + `code: 'previous_link_paid'`: stash `pendingConfirm` so the
   * confirmation modal renders; do NOT toast.error (the modal IS the
   * surfacing). On any other non-OK response: toast.error as before.
   */
  async function performSend(method: SendMethod, confirmResend: boolean) {
    setSending(true);
    try {
      const body: {
        method: SendMethod;
        amount_cents?: number;
        confirm_resend?: boolean;
      } = { method };
      if (typeof amountCents === 'number') body.amount_cents = amountCents;
      if (confirmResend) body.confirm_resend = true;

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
        // Item 3 (#149) — structured 409 path. The server returns
        // `code: 'previous_link_paid'` + previous_payment when the prior
        // link cycle was consumed. Branch BEFORE the generic toast so
        // the operator sees the confirmation modal, not a red error.
        if (
          res.status === 409 &&
          (data as { code?: string })?.code === 'previous_link_paid' &&
          (data as { previous_payment?: PreviousLinkPaidResponse['previous_payment'] })
            ?.previous_payment
        ) {
          setPendingConfirm({
            method,
            previousPayment: (data as PreviousLinkPaidResponse).previous_payment,
          });
          return;
        }
        throw new Error(
          (data as { error?: string })?.error || 'Failed to send payment link'
        );
      }

      const channels = (data as { channels?: Record<string, string> })?.channels ?? {};
      const sentVia = Object.keys(channels)
        .filter((k) => channels[k] === 'sent')
        .join(' & ');
      toast.success(sentVia ? `Payment link sent via ${sentVia}` : 'Payment link sent');

      const partialErrors = (data as { partial_errors?: unknown }).partial_errors;
      if (Array.isArray(partialErrors)) {
        for (const err of partialErrors) {
          toast.warning(String(err));
        }
      }

      onSent?.({
        paymentLinkToken: (data as { payment_link_token: string }).payment_link_token,
        payUrl: (data as { pay_url: string }).pay_url,
      });

      // Clear any prior pending-confirm state on a successful send (only
      // reachable when the retry succeeded; on first-pass success this is
      // already null).
      setPendingConfirm(null);
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

  async function handleSend(method: SendMethod) {
    await performSend(method, false);
  }

  async function handleConfirmResend() {
    if (!pendingConfirm) return;
    // Clear pending state first so the confirmation modal closes while the
    // POST runs; the underlying SendMethodDialog's `sending` indicator is
    // the in-flight surface during the retry.
    const { method } = pendingConfirm;
    setPendingConfirm(null);
    await performSend(method, true);
  }

  function handleCancelResend() {
    setPendingConfirm(null);
    // Leave the SendMethodDialog open so the operator can choose a different
    // method or close it themselves. No toast — the operator's choice to
    // cancel is the resolution.
  }

  // Item 3 (#149) — confirmation modal content. Renders the prior payment's
  // amount + paid_at in operator-friendly format; amount is suppressed when
  // the server's `amount_cents` is null (degenerate case where no payment
  // row carries a numeric amount).
  const priorAmountStr =
    pendingConfirm && typeof pendingConfirm.previousPayment.amount_cents === 'number'
      ? `$${(pendingConfirm.previousPayment.amount_cents / 100).toFixed(2)}`
      : null;
  const priorDateStr = pendingConfirm
    ? new Date(pendingConfirm.previousPayment.paid_at).toLocaleString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      })
    : null;

  return (
    <>
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

      {/* Item 3 (#149) — re-send confirmation modal. Renders over the
          SendMethodDialog when the server returns 409 + previous_link_paid.
          contentClassName narrower than the default so it visually reads as
          a focused confirmation vs. the wider parent. */}
      <Dialog
        open={pendingConfirm !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) handleCancelResend();
        }}
        contentClassName="max-w-md"
      >
        <DialogHeader>
          <DialogTitle>Previous link was already paid</DialogTitle>
        </DialogHeader>
        <DialogContent className="space-y-3 text-sm text-ui-text">
          <p>
            The previous payment link for this appointment was already paid
            {priorAmountStr ? (
              <>
                {' '}
                <span className="font-semibold tabular-nums">{priorAmountStr}</span>
              </>
            ) : null}{' '}
            on{' '}
            <span className="font-semibold tabular-nums">{priorDateStr}</span>.
          </p>
          <p className="text-ui-text-secondary">
            Sending a new link creates a fresh payment cycle. If the customer
            has already paid the prior link, only send a new link when you
            intend to collect an additional amount (e.g., a balance after a
            deposit).
          </p>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={handleCancelResend} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={handleConfirmResend} disabled={sending}>
            Send anyway
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}
