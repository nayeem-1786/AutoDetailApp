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

// Card brand logos
function VisaLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 750 471" xmlns="http://www.w3.org/2000/svg">
      <path d="M278.198 334.228l33.36-195.763h53.358l-33.384 195.763H278.198zm246.11-191.54c-10.57-3.966-27.135-8.222-47.822-8.222-52.725 0-89.863 26.551-90.18 64.604-.297 28.129 26.514 43.821 46.754 53.185 20.77 9.597 27.752 15.716 27.652 24.283-.133 13.123-16.586 19.116-31.924 19.116-21.355 0-32.701-2.967-50.225-10.274l-6.878-3.112-7.487 43.822c12.463 5.467 35.508 10.199 59.438 10.445 56.09 0 92.502-26.248 92.916-66.885.199-22.27-14.016-39.215-44.801-53.188-18.65-9.056-30.072-15.099-29.951-24.269 0-8.137 9.668-16.838 30.559-16.838 17.447-.271 30.088 3.534 39.936 7.5l4.781 2.26 7.232-42.427m137.308-4.223h-41.23c-12.773 0-22.332 3.486-27.941 16.234l-79.244 179.402h56.031s9.16-24.121 11.232-29.418c6.123 0 60.555.084 68.336.084 1.596 6.854 6.492 29.334 6.492 29.334h49.512l-43.188-195.636zm-65.417 126.408c4.414-11.279 21.26-54.724 21.26-54.724-.314.521 4.381-11.334 7.074-18.684l3.607 16.878s10.217 46.729 12.352 56.527h-44.293v.003zM51.939 267.122l-5.535-28.107L4.626 138.688H69.842l19.07 89.47c4.107 2.029 8.285 4.315 12.465 6.809l33.595-100.503h56.48l-83.942 199.764H51.939" fill="#1A1F71"/>
    </svg>
  );
}

function MastercardLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 152.407 108" xmlns="http://www.w3.org/2000/svg">
      <path fill="#ff5f00" d="M60.412 25.697h31.5v56.606h-31.5z"/>
      <path d="M62.412 54a35.938 35.938 0 0 1 13.75-28.303 36 36 0 1 0 0 56.606A35.938 35.938 0 0 1 62.412 54z" fill="#eb001b"/>
      <path d="M134.407 54a35.999 35.999 0 0 1-58.245 28.303 36.005 36.005 0 0 0 0-56.606A35.999 35.999 0 0 1 134.407 54z" fill="#f79e1b"/>
    </svg>
  );
}

function AmexLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 750 471" xmlns="http://www.w3.org/2000/svg">
      <path fill="#2557D6" d="M0 40C0 17.9 17.9 0 40 0h670c22.1 0 40 17.9 40 40v391c0 22.1-17.9 40-40 40H40c-22.1 0-40-17.9-40-40V40z"/>
      <path fill="#fff" d="M.002 235.6h41.7l9.4-22.8h21l9.4 22.8h81.8v-17.4l7.3 17.5h42.4l7.3-17.8v17.7h203.3l-.1-37.6h4c2.8.1 3.6.4 3.6 5v32.7h105.2v-8.8c8.5 4.6 21.7 8.8 39.1 8.8h44.4l9.5-22.8h21l9.3 22.8h85.3v-21.7l12.9 21.7h68.4V115.4h-67.7v16.8l-9.5-16.8h-69.5v16.8l-8.7-16.8h-93.8c-15.5 0-29.2 2.2-40.2 8.2v-8.2h-64.7v8.2c-7-6.2-16.5-8.2-27.1-8.2H228.1l-15.9 36.8-16.3-36.8H121.2v16.8l-8.4-16.8H51.2L.002 173.6v62zm227-19.5h-24.7l-.1-66.2-35 66.2h-21.2l-35.1-66.3v66.3H66.2l-9.4-22.9H13.5l-9.5 22.8H.002l43.8-101.3h36l41.7 95.9v-95.9h39.5l31.5 57.3 28.9-57.3h40.5v101.4z"/>
    </svg>
  );
}

function DiscoverLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 750 471" xmlns="http://www.w3.org/2000/svg">
      <path fill="#4D4D4D" d="M52 0C23.7 0 0 18 0 40v391c0 22 23.7 40 52 40h648c28.3 0 50-18 50-40V40c0-22-21.7-40-50-40H52z"/>
      <path fill="#FFF" d="M52 1h648c27.1 0 49 17.6 49 39v391c0 21.4-21.9 39-49 39H52c-27.1 0-51-17.6-51-39V40C1 18.6 24.9 1 52 1z"/>
      <path fill="#F47216" d="M699 470c27.6 0 50-17.9 50-40v-196c-261 0-405.8 156.6-494 236h444z"/>
      <circle fill="#F47216" r="44" cy="197" cx="417"/>
    </svg>
  );
}

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

      {/* Accepted Payment Methods - Card brands */}
      <div className="border-t pt-4">
        <p className="text-xs text-gray-500 text-center mb-3">Accepted Payment Methods</p>
        <div className="flex items-center justify-center gap-3">
          <VisaLogo className="h-8 w-auto" />
          <MastercardLogo className="h-8 w-auto" />
          <AmexLogo className="h-8 w-auto" />
          <DiscoverLogo className="h-8 w-auto" />
        </div>
      </div>

      {/* Powered by Stripe */}
      <div className="flex items-center justify-center gap-2 text-xs text-gray-400">
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
