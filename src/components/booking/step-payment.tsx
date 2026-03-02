'use client';

import { useState, useEffect } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { formatCurrency } from '@/lib/utils/format';
import { Lock, ShieldCheck } from 'lucide-react';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

function TrustBadges() {
  return (
    <div className="mt-6 space-y-4">
      {/* Security Badge */}
      <div className="flex items-center justify-center gap-2 text-sm text-site-text-secondary">
        <Lock className="h-4 w-4 text-green-600" />
        <span>256-bit SSL Encrypted</span>
        <span className="text-site-text-dim">|</span>
        <ShieldCheck className="h-4 w-4 text-blue-600" />
        <span>PCI DSS Compliant</span>
      </div>

      {/* Powered by Stripe */}
      <div className="border-t border-site-border pt-4 flex items-center justify-center">
        <img
          src="/images/powered-by-stripe.svg"
          alt="Powered by Stripe"
          className="h-9 w-auto opacity-60"
        />
      </div>
    </div>
  );
}

interface StepPaymentProps {
  amount: number;
  totalAmount?: number;
  remainingAmount?: number;
  isDeposit?: boolean;
  onPaymentSuccess: (paymentIntentId: string) => void;
  onBack: () => void;
}

function PaymentForm({ amount, totalAmount, remainingAmount, isDeposit, onPaymentSuccess, onBack }: StepPaymentProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setProcessing(true);
    setError(null);

    const { error: submitError, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/book/confirmation`,
      },
      redirect: 'if_required',
    });

    if (submitError) {
      setError(submitError.message || 'Payment failed');
      setProcessing(false);
    } else if (paymentIntent && paymentIntent.status === 'succeeded') {
      onPaymentSuccess(paymentIntent.id);
    } else {
      setError('Payment was not completed');
      setProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card className="p-6 border-site-border bg-brand-surface dark:border-site-border dark:bg-brand-surface">
        {/* Header row with title and total */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-site-text">
            {isDeposit ? 'Deposit Payment' : 'Payment Details'}
          </h3>
          {!isDeposit && (
            <span className="text-lg font-semibold text-site-text">Amount Due: {formatCurrency(amount)}</span>
          )}
        </div>

        {isDeposit && totalAmount && remainingAmount !== undefined && (
          <div className="booking-summary-dark mb-4 rounded-lg bg-brand-surface p-4 text-sm">
            <div className="flex justify-between text-site-text-secondary">
              <span>Service Total</span>
              <span className="font-medium text-site-text">{formatCurrency(totalAmount)}</span>
            </div>
            <div className="flex justify-between mt-1 text-accent-brand font-medium">
              <span>Deposit Now</span>
              <span>{formatCurrency(amount)}</span>
            </div>
            <div className="flex justify-between mt-1 text-site-text-muted">
              <span>Due at Service</span>
              <span>{formatCurrency(remainingAmount)}</span>
            </div>
            <p className="mt-3 text-xs text-site-text-secondary">
              Your deposit secures your appointment. The remaining balance will be collected when the service is completed.
            </p>
          </div>
        )}

        <p className="text-xs text-site-text-muted mb-2">ZIP code refers to your billing address ZIP code.</p>
        <PaymentElement />
        {error && (
          <p className="mt-4 text-sm text-red-600">{error}</p>
        )}

        <TrustBadges />
      </Card>
      <div className="flex justify-between">
        <Button type="button" variant="outline" onClick={onBack} disabled={processing} className="border-site-border bg-transparent text-site-text-secondary hover:bg-brand-surface dark:border-site-border dark:bg-transparent dark:text-site-text-secondary dark:hover:bg-brand-surface">
          Back
        </Button>
        <Button type="submit" disabled={!stripe || processing} className="bg-accent-brand text-site-text-on-primary hover:bg-accent-brand-hover dark:bg-accent-brand dark:text-site-text-on-primary dark:hover:bg-accent-brand-hover">
          {processing ? (
            <Spinner className="h-4 w-4" />
          ) : isDeposit ? (
            `Pay ${formatCurrency(amount)} Deposit`
          ) : (
            `Pay ${formatCurrency(amount)}`
          )}
        </Button>
      </div>
    </form>
  );
}

export function StepPayment({ amount, totalAmount, remainingAmount, isDeposit, onPaymentSuccess, onBack }: StepPaymentProps) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create payment intent on mount
  useEffect(() => {
    // If amount is 0 or less, no payment needed
    if (amount <= 0) {
      setError('No payment required - total is covered by discounts');
      setLoading(false);
      return;
    }

    fetch('/api/book/payment-intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.clientSecret) {
          setClientSecret(data.clientSecret);
        } else {
          setError(data.error || 'Failed to initialize payment');
        }
      })
      .catch(() => setError('Failed to initialize payment'))
      .finally(() => setLoading(false));
  }, [amount]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (error || !clientSecret) {
    return (
      <Card className="p-6 border-site-border bg-brand-surface dark:border-site-border dark:bg-brand-surface">
        <p className="text-red-400">{error || 'Payment initialization failed'}</p>
        <Button variant="outline" onClick={onBack} className="mt-4 border-site-border bg-transparent text-site-text-secondary hover:bg-brand-surface dark:border-site-border dark:bg-transparent dark:text-site-text-secondary dark:hover:bg-brand-surface">Back</Button>
      </Card>
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
            '.Label': {
              fontWeight: '500',
            },
          },
        },
      }}
    >
      <PaymentForm
        amount={amount}
        totalAmount={totalAmount}
        remainingAmount={remainingAmount}
        isDeposit={isDeposit}
        onPaymentSuccess={onPaymentSuccess}
        onBack={onBack}
      />
    </Elements>
  );
}
