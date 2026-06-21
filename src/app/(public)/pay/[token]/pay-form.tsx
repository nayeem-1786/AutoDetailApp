'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { loadStripe } from '@stripe/stripe-js';
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from '@stripe/react-stripe-js';
import { Loader2, Lock, ShieldCheck } from 'lucide-react';
import { formatCurrency } from '@/lib/utils/format';
import { TIP_PRESETS } from '@/lib/utils/constants';
import { cn } from '@/lib/utils/cn';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

interface PayFormProps {
  token: string;
  amountDueCents: number;
  /**
   * Item 2 (2026-06-20) — when true, the tip chip selector renders above
   * the Stripe Elements card form (two-step UX: pick tip → Continue →
   * card form). When false (partial-payment / deposit link), the original
   * auto-mount behavior is preserved — tip never shown.
   *
   * Mirrors the server-side gate in
   * `src/app/api/pay/[token]/intent/route.ts` (the route additionally
   * rejects `tipCents > 0` on a partial link as defense-in-depth).
   */
  isFullPayment: boolean;
}

interface IntentResponse {
  clientSecret?: string;
  amountCents?: number;
  tipCents?: number;
  totalCents?: number;
  alreadyPaid?: boolean;
  error?: string;
}

type TipChoice =
  | { kind: 'preset'; percent: number }
  | { kind: 'custom'; cents: number }
  | { kind: 'none' };

function computeTipCents(choice: TipChoice, subtotalCents: number): number {
  if (choice.kind === 'none') return 0;
  if (choice.kind === 'preset') {
    return Math.round((subtotalCents * choice.percent) / 100);
  }
  return Math.max(0, choice.cents);
}

export function PayForm({ token, amountDueCents, isFullPayment }: PayFormProps) {
  // On partial-payment links we preserve the legacy auto-mount UX (Stripe
  // Elements appears on page load, tip step skipped). On full-payment links
  // we show the tip selector first; the customer's "Continue" click is what
  // creates the PaymentIntent with the chosen tip and mounts Elements.
  if (!isFullPayment) {
    return <AutoMountPayForm token={token} amountDueCents={amountDueCents} />;
  }
  return <DeferredMountPayForm token={token} amountDueCents={amountDueCents} />;
}

// ---------------------------------------------------------------------------
// Auto-mount variant — partial/deposit links. Identical to the pre-Item-2
// behavior except for the constructor split.
// ---------------------------------------------------------------------------

function AutoMountPayForm({
  token,
  amountDueCents,
}: {
  token: string;
  amountDueCents: number;
}) {
  const router = useRouter();
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [serverAmountCents, setServerAmountCents] = useState<number>(amountDueCents);
  const [loading, setLoading] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setInitError(null);

    fetch(`/api/pay/${encodeURIComponent(token)}/intent`, { method: 'POST' })
      .then(async (res) => {
        const data: IntentResponse = await res.json().catch(() => ({}));
        if (cancelled) return;

        if (!res.ok) {
          setInitError(data.error ?? 'Could not start payment.');
          setLoading(false);
          return;
        }

        if (data.alreadyPaid) {
          // Server has up-to-date state — re-render the page to show paid view.
          router.refresh();
          return;
        }

        if (!data.clientSecret) {
          setInitError('Could not start payment.');
          setLoading(false);
          return;
        }

        setClientSecret(data.clientSecret);
        if (typeof data.amountCents === 'number') {
          setServerAmountCents(data.amountCents);
        }
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setInitError('Network error. Please try again.');
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token, router]);

  if (loading) return <PreparingPanel />;
  if (initError || !clientSecret) return <InitErrorPanel message={initError} />;

  return (
    <ElementsHost clientSecret={clientSecret}>
      <InnerForm token={token} amountCents={serverAmountCents} tipCents={0} />
    </ElementsHost>
  );
}

// ---------------------------------------------------------------------------
// Deferred-mount variant — full-payment links. Tip selector + Continue
// button. PI is created lazily on Continue click with the chosen tipCents.
// ---------------------------------------------------------------------------

function DeferredMountPayForm({
  token,
  amountDueCents,
}: {
  token: string;
  amountDueCents: number;
}) {
  const router = useRouter();
  const [stage, setStage] = useState<'tip' | 'pay'>('tip');
  const [choice, setChoice] = useState<TipChoice>({ kind: 'none' });
  const [customInput, setCustomInput] = useState('');
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [serverAmountCents, setServerAmountCents] = useState<number>(amountDueCents);
  const [serverTipCents, setServerTipCents] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  // Derived: tip cents under current selection. Recomputed every render so
  // selecting / unselecting / changing the custom input reflects live.
  const tipCents = computeTipCents(
    choice.kind === 'custom'
      ? { kind: 'custom', cents: parseCustomCents(customInput) }
      : choice,
    amountDueCents
  );
  const totalCents = amountDueCents + tipCents;

  // "Continue" disabled until the customer makes an explicit choice. We
  // require a click for No Tip too (operator wants the explicit decision
  // captured rather than defaulting silently).
  const continueDisabled =
    choice.kind === 'custom'
      ? parseCustomCents(customInput) <= 0 || tipCents > amountDueCents
      : false;

  async function handleContinue() {
    setSubmitting(true);
    setInitError(null);
    try {
      const res = await fetch(`/api/pay/${encodeURIComponent(token)}/intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipCents }),
      });
      const data: IntentResponse = await res.json().catch(() => ({}));

      if (!res.ok) {
        setInitError(data.error ?? 'Could not start payment.');
        setSubmitting(false);
        return;
      }

      if (data.alreadyPaid) {
        router.refresh();
        return;
      }

      if (!data.clientSecret) {
        setInitError('Could not start payment.');
        setSubmitting(false);
        return;
      }

      setClientSecret(data.clientSecret);
      if (typeof data.amountCents === 'number') {
        setServerAmountCents(data.amountCents);
      }
      if (typeof data.tipCents === 'number') {
        setServerTipCents(data.tipCents);
      }
      setStage('pay');
      setSubmitting(false);
    } catch {
      setInitError('Network error. Please try again.');
      setSubmitting(false);
    }
  }

  if (stage === 'pay' && clientSecret) {
    return (
      <ElementsHost clientSecret={clientSecret}>
        <InnerForm
          token={token}
          amountCents={serverAmountCents}
          tipCents={serverTipCents}
        />
      </ElementsHost>
    );
  }

  return (
    <div className="rounded-2xl bg-brand-surface border border-site-border p-6">
      <h3 className="text-lg font-semibold text-site-text">Add a tip?</h3>
      <p className="mt-1 text-xs text-site-text-muted">
        100% of tips go to your detailer.
      </p>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {TIP_PRESETS.map((pct) => {
          const presetCents = Math.round((amountDueCents * pct) / 100);
          const isSelected = choice.kind === 'preset' && choice.percent === pct;
          return (
            <button
              key={pct}
              type="button"
              onClick={() => {
                setChoice({ kind: 'preset', percent: pct });
                setCustomInput('');
              }}
              className={cn(
                'flex flex-col items-center justify-center rounded-xl border-2 px-3 py-4 transition-all',
                isSelected
                  ? 'border-accent-brand bg-accent-brand/10 text-site-text'
                  : 'border-site-border text-site-text-muted hover:border-site-text-muted'
              )}
            >
              <span className="text-xl font-bold">{pct}%</span>
              <span className="text-xs text-site-text-muted">
                {formatCurrency(presetCents / 100)}
              </span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setChoice({ kind: 'custom', cents: 0 })}
          className={cn(
            'flex flex-col items-center justify-center rounded-xl border-2 px-3 py-4 transition-all',
            choice.kind === 'custom'
              ? 'border-accent-brand bg-accent-brand/10 text-site-text'
              : 'border-site-border text-site-text-muted hover:border-site-text-muted'
          )}
        >
          <span className="text-xl font-bold">$</span>
          <span className="text-xs text-site-text-muted">Custom</span>
        </button>
      </div>

      {choice.kind === 'custom' && (
        <div className="mt-4 flex items-center justify-center gap-2">
          <span className="text-lg text-site-text-muted">$</span>
          <input
            type="text"
            inputMode="decimal"
            pattern="[0-9]*\.?[0-9]*"
            autoFocus
            value={customInput}
            onChange={(e) => {
              const v = e.target.value.replace(/[^0-9.]/g, '');
              setCustomInput(v);
            }}
            placeholder="0.00"
            className="h-12 w-32 rounded-lg border border-site-border bg-brand-surface text-center text-base sm:text-sm text-site-text focus:border-accent-brand focus:outline-none focus:ring-2 focus:ring-accent-brand/30"
          />
        </div>
      )}

      <div className="mt-6 space-y-2 border-t border-site-border pt-4 text-sm">
        <div className="flex justify-between">
          <span className="text-site-text-muted">Amount due</span>
          <span className="text-site-text tabular-nums">
            {formatCurrency(amountDueCents / 100)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-site-text-muted">Tip</span>
          <span className="text-site-text tabular-nums">
            {formatCurrency(tipCents / 100)}
          </span>
        </div>
        <div className="flex justify-between border-t border-site-border pt-2 text-base font-semibold">
          <span className="text-site-text">Total</span>
          <span className="text-site-text tabular-nums">
            {formatCurrency(totalCents / 100)}
          </span>
        </div>
      </div>

      {initError && <p className="mt-4 text-sm text-red-400">{initError}</p>}

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => {
            setChoice({ kind: 'none' });
            setCustomInput('');
            // Skip directly past the "Continue" → mint a tip=0 PI inline.
            void handleContinueNoTip();
          }}
          disabled={submitting}
          className="rounded-xl border border-site-border bg-brand-surface px-6 py-4 text-base font-semibold text-site-text-muted hover:border-site-text-muted disabled:opacity-50 disabled:cursor-not-allowed"
        >
          No Tip
        </button>
        <button
          type="button"
          onClick={() => void handleContinue()}
          disabled={submitting || continueDisabled}
          className="flex items-center justify-center gap-2 rounded-xl bg-accent-brand px-6 py-4 text-base font-bold text-site-text-on-primary hover:bg-accent-brand-hover transition-colors shadow-lg shadow-accent-brand/20 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading…
            </>
          ) : (
            'Continue to Payment'
          )}
        </button>
      </div>
    </div>
  );

  // "No Tip" is a one-click commit — different from the preset/custom flow
  // which requires a separate Continue confirmation. Both paths converge on
  // the same intent-route call, but No Tip skips the in-between review step
  // for a faster customer journey.
  async function handleContinueNoTip() {
    setSubmitting(true);
    setInitError(null);
    try {
      const res = await fetch(`/api/pay/${encodeURIComponent(token)}/intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipCents: 0 }),
      });
      const data: IntentResponse = await res.json().catch(() => ({}));

      if (!res.ok) {
        setInitError(data.error ?? 'Could not start payment.');
        setSubmitting(false);
        return;
      }

      if (data.alreadyPaid) {
        router.refresh();
        return;
      }

      if (!data.clientSecret) {
        setInitError('Could not start payment.');
        setSubmitting(false);
        return;
      }

      setClientSecret(data.clientSecret);
      if (typeof data.amountCents === 'number') {
        setServerAmountCents(data.amountCents);
      }
      setServerTipCents(0);
      setStage('pay');
      setSubmitting(false);
    } catch {
      setInitError('Network error. Please try again.');
      setSubmitting(false);
    }
  }
}

function parseCustomCents(raw: string): number {
  const v = parseFloat(raw);
  if (!Number.isFinite(v) || v <= 0) return 0;
  return Math.round(v * 100);
}

// ---------------------------------------------------------------------------
// Shared Elements host — wraps the Stripe Elements provider with the
// dark-night brand-lime theme that pre-Item-2 PayForm used.
// ---------------------------------------------------------------------------

function ElementsHost({
  clientSecret,
  children,
}: {
  clientSecret: string;
  children: React.ReactNode;
}) {
  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret,
        appearance: {
          theme: 'night',
          variables: {
            fontFamily: 'system-ui, sans-serif',
            borderRadius: '6px',
            colorPrimary: '#CCFF00',
            colorBackground: '#1A1A1A',
            colorText: '#FFFFFF',
            colorTextSecondary: '#9CA3AF',
            colorDanger: '#EF4444',
          },
          rules: {
            '.Label': { fontWeight: '500' },
          },
        },
      }}
    >
      {children}
    </Elements>
  );
}

// ---------------------------------------------------------------------------
// Loading / error panels — extracted so the deferred & auto-mount variants
// can share the visual treatment.
// ---------------------------------------------------------------------------

function PreparingPanel() {
  return (
    <div className="rounded-2xl bg-brand-surface border border-site-border p-8">
      <div className="flex items-center justify-center gap-3 text-site-text-muted">
        <Loader2 className="h-5 w-5 animate-spin text-accent-ui" />
        <span className="text-sm">Preparing secure payment…</span>
      </div>
    </div>
  );
}

function InitErrorPanel({ message }: { message: string | null }) {
  return (
    <div className="rounded-2xl bg-brand-surface border border-site-border p-6">
      <p className="text-sm text-red-400">{message ?? 'Payment unavailable.'}</p>
      <p className="mt-2 text-xs text-site-text-muted">
        Refresh the page to try again, or reach out to us if the issue persists.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inner Stripe Elements form — the actual card-entry surface. amountCents is
// the subtotal (service portion); tipCents is the tip layered on top by the
// deferred-mount flow. Auto-mount calls with tipCents=0.
// ---------------------------------------------------------------------------

function InnerForm({
  token,
  amountCents,
  tipCents,
}: {
  token: string;
  amountCents: number;
  tipCents: number;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalCents = amountCents + tipCents;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setSubmitting(true);
    setError(null);

    // Always redirect back to /pay/[token]?redirect_status=succeeded — the
    // server component re-reads the appointment and renders the paid (or
    // processing) state. The webhook is the sole writer of payment state.
    const returnUrl = `${window.location.origin}/pay/${encodeURIComponent(token)}?redirect_status=succeeded`;

    const { error: stripeError } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: returnUrl,
      },
    });

    // confirmPayment with default redirect: 'always' redirects on success.
    // If we reach this line, the confirmation failed or was canceled.
    if (stripeError) {
      setError(stripeError.message ?? 'Payment failed. Please try again.');
    } else {
      setError('Payment was not completed.');
    }
    setSubmitting(false);
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="rounded-2xl bg-brand-surface border border-site-border p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-site-text">Payment Details</h3>
          <span className="text-lg font-semibold text-site-text">
            {formatCurrency(totalCents / 100)}
          </span>
        </div>

        {tipCents > 0 && (
          <div className="mb-4 flex flex-col gap-1 rounded-lg border border-site-border bg-brand-dark/40 px-4 py-3 text-sm">
            <div className="flex justify-between">
              <span className="text-site-text-muted">Amount due</span>
              <span className="text-site-text tabular-nums">
                {formatCurrency(amountCents / 100)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-site-text-muted">Tip</span>
              <span className="text-site-text tabular-nums">
                {formatCurrency(tipCents / 100)}
              </span>
            </div>
          </div>
        )}

        <p className="text-xs text-site-text-muted mb-3">
          ZIP code refers to your billing address ZIP code.
        </p>

        <PaymentElement />

        {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

        <div className="mt-6 space-y-3">
          <div className="flex items-center justify-center gap-2 text-sm text-site-text-secondary">
            <Lock className="h-4 w-4 text-green-600" />
            <span>256-bit SSL Encrypted</span>
            <span className="text-site-text-dim">|</span>
            <ShieldCheck className="h-4 w-4 text-blue-600" />
            <span>PCI DSS Compliant</span>
          </div>
          <div className="border-t border-site-border pt-3 flex items-center justify-center">
            <Image
              src="/images/powered-by-stripe.svg"
              alt="Powered by Stripe"
              width={120}
              height={36}
              className="h-9 w-auto opacity-60"
            />
          </div>
        </div>
      </div>

      <button
        type="submit"
        disabled={!stripe || submitting}
        className="mt-6 w-full flex items-center justify-center gap-2 rounded-xl bg-accent-brand px-6 py-4 text-base font-bold text-site-text-on-primary hover:bg-accent-brand-hover transition-colors shadow-lg shadow-accent-brand/20 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {submitting ? (
          <span className="flex items-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            Processing…
          </span>
        ) : (
          `Pay ${formatCurrency(totalCents / 100)}`
        )}
      </button>
    </form>
  );
}
