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
      <div className="flex items-center justify-center gap-2 text-sm text-gray-600">
        <Lock className="h-4 w-4 text-green-600" />
        <span>256-bit SSL Encrypted</span>
        <span className="text-gray-300">|</span>
        <ShieldCheck className="h-4 w-4 text-blue-600" />
        <span>PCI DSS Compliant</span>
      </div>

      {/* Powered by Stripe */}
      <div className="border-t pt-4 flex items-center justify-center gap-2 text-xs text-gray-400">
        <span>Powered by</span>
        <svg className="h-5 w-auto" viewBox="0 0 60 25" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path fillRule="evenodd" clipRule="evenodd" d="M59.64 14.28C59.64 9.72 57.42 6.24 53.16 6.24C48.88 6.24 46.32 9.72 46.32 14.24C46.32 19.56 49.34 22.28 53.74 22.28C55.9 22.28 57.52 21.8 58.76 21.12V17.64C57.52 18.24 56.1 18.6 54.34 18.6C52.62 18.6 51.1 18 50.88 15.92H59.6C59.6 15.66 59.64 14.72 59.64 14.28ZM50.82 12.72C50.82 10.74 52 9.8 53.14 9.8C54.24 9.8 55.36 10.74 55.36 12.72H50.82ZM40.08 6.24C38.34 6.24 37.24 7.08 36.62 7.66L36.38 6.52H32.38V25L36.78 24.06L36.8 17.54C37.44 18 38.38 18.68 39.96 18.68C43.18 18.68 46.1 16.14 46.1 12.18C46.08 8.58 43.12 6.24 40.08 6.24ZM39.08 15.04C38.08 15.04 37.48 14.7 37.06 14.26L36.8 9.26C37.26 8.76 37.9 8.44 38.9 8.44C40.48 8.44 41.58 10.18 41.58 11.72C41.58 13.32 40.5 15.04 39.08 15.04ZM27.26 5.34L31.68 4.38V0.88L27.26 1.82V5.34ZM27.26 6.52H31.68V18.4H27.26V6.52ZM23.26 7.72L22.98 6.52H19.04V18.4H23.44V11.16C24.44 9.86 26.14 10.12 26.68 10.3V6.52C26.12 6.32 24.26 5.98 23.26 7.72ZM14.46 2.26L10.16 3.18L10.14 14.76C10.14 17.04 11.82 18.68 14.1 18.68C15.36 18.68 16.28 18.46 16.78 18.2V14.7C16.3 14.9 14.44 15.44 14.44 13.16V9.9H16.78V6.52H14.44L14.46 2.26ZM4.42 10.64C4.42 10.02 4.94 9.76 5.8 9.76C7.02 9.76 8.54 10.12 9.76 10.76V6.84C8.44 6.32 7.14 6.1 5.8 6.1C2.32 6.1 0 7.94 0 10.86C0 15.42 6.26 14.68 6.26 16.66C6.26 17.4 5.62 17.66 4.7 17.66C3.36 17.66 1.68 17.12 0.32 16.38V20.36C1.82 21 3.34 21.28 4.7 21.28C8.26 21.28 10.74 19.5 10.74 16.54C10.72 11.62 4.42 12.5 4.42 10.64Z" fill="#6772E5"/>
        </svg>
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
      <Card className="p-6">
        {/* Header row with title and total */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">
            {isDeposit ? 'Deposit Payment' : 'Payment Details'}
          </h3>
          {!isDeposit && (
            <span className="text-lg font-semibold">Amount Due: {formatCurrency(amount)}</span>
          )}
        </div>

        {isDeposit && totalAmount && remainingAmount !== undefined && (
          <div className="mb-4 rounded-lg bg-blue-50 p-4 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>Service Total</span>
              <span className="font-medium text-gray-900">{formatCurrency(totalAmount)}</span>
            </div>
            <div className="flex justify-between mt-1 text-blue-700 font-medium">
              <span>Deposit Now</span>
              <span>{formatCurrency(amount)}</span>
            </div>
            <div className="flex justify-between mt-1 text-gray-500">
              <span>Due at Service</span>
              <span>{formatCurrency(remainingAmount)}</span>
            </div>
            <p className="mt-3 text-xs text-gray-600">
              Your deposit secures your appointment. The remaining balance will be collected when the service is completed.
            </p>
          </div>
        )}

        <p className="text-xs text-gray-500 mb-2">ZIP code refers to your billing address ZIP code.</p>
        <PaymentElement />
        {error && (
          <p className="mt-4 text-sm text-red-600">{error}</p>
        )}

        <TrustBadges />
      </Card>
      <div className="flex justify-between">
        <Button type="button" variant="outline" onClick={onBack} disabled={processing}>
          Back
        </Button>
        <Button type="submit" disabled={!stripe || processing}>
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
        appearance: {
          theme: 'stripe',
          variables: {
            fontFamily: 'system-ui, sans-serif',
            borderRadius: '6px',
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
