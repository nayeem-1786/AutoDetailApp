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
import { formatCurrency, formatMoney } from '@/lib/utils/format';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

interface PayFormProps {
  token: string;
  amountDueCents: number;
}

interface IntentResponse {
  clientSecret?: string;
  amountCents?: number;
  alreadyPaid?: boolean;
  error?: string;
}

export function PayForm({ token, amountDueCents }: PayFormProps) {
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

  if (loading) {
    return (
      <div className="rounded-2xl bg-brand-surface border border-site-border p-8">
        <div className="flex items-center justify-center gap-3 text-site-text-muted">
          <Loader2 className="h-5 w-5 animate-spin text-accent-ui" />
          <span className="text-sm">Preparing secure payment…</span>
        </div>
      </div>
    );
  }

  if (initError || !clientSecret) {
    return (
      <div className="rounded-2xl bg-brand-surface border border-site-border p-6">
        <p className="text-sm text-red-400">{initError ?? 'Payment unavailable.'}</p>
        <p className="mt-2 text-xs text-site-text-muted">
          Refresh the page to try again, or reach out to us if the issue persists.
        </p>
      </div>
    );
  }

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
      <InnerForm token={token} amountCents={serverAmountCents} />
    </Elements>
  );
}

function InnerForm({ token, amountCents }: { token: string; amountCents: number }) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
            {formatCurrency(amountCents / 100)}
          </span>
        </div>

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
          `Pay ${formatCurrency(amountCents / 100)}`
        )}
      </button>
    </form>
  );
}
