'use client';

import { useState, useEffect } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { formatCurrency } from '@/lib/utils/format';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

interface StepPaymentProps {
  amount: number;
  onPaymentSuccess: (paymentIntentId: string) => void;
  onBack: () => void;
}

function PaymentForm({ amount, onPaymentSuccess, onBack }: StepPaymentProps) {
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
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Payment Details</h3>
        <p className="text-sm text-gray-600 mb-4">
          Total: <span className="font-bold text-gray-900">{formatCurrency(amount)}</span>
        </p>
        <PaymentElement />
        {error && (
          <p className="mt-4 text-sm text-red-600">{error}</p>
        )}
      </Card>
      <div className="flex justify-between">
        <Button type="button" variant="outline" onClick={onBack} disabled={processing}>
          Back
        </Button>
        <Button type="submit" disabled={!stripe || processing}>
          {processing ? <Spinner className="h-4 w-4" /> : `Pay ${formatCurrency(amount)}`}
        </Button>
      </div>
    </form>
  );
}

export function StepPayment({ amount, onPaymentSuccess, onBack }: StepPaymentProps) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create payment intent on mount
  useEffect(() => {
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
          setError('Failed to initialize payment');
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
      <Card className="p-6">
        <p className="text-red-600">{error || 'Payment initialization failed'}</p>
        <Button variant="outline" onClick={onBack} className="mt-4">Back</Button>
      </Card>
    );
  }

  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret,
        appearance: { theme: 'stripe' },
      }}
    >
      <PaymentForm amount={amount} onPaymentSuccess={onPaymentSuccess} onBack={onBack} />
    </Elements>
  );
}
