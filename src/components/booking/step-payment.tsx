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

// Card brand SVG logos (official brand colors)
function VisaLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 50 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M19.5 1.5L16.4 14.5H13L16.1 1.5H19.5ZM35.6 9.6L37.3 4.6L38.3 9.6H35.6ZM39.3 14.5H42.4L39.7 1.5H36.8C36.1 1.5 35.5 1.9 35.2 2.5L29.5 14.5H33.2L33.9 12.5H38.5L39.3 14.5ZM30.2 10C30.2 6.5 25.4 6.3 25.4 4.7C25.4 4.2 25.9 3.6 26.9 3.5C27.4 3.4 28.8 3.4 30.4 4.1L31 1.8C30.1 1.5 29 1.2 27.6 1.2C24.1 1.2 21.6 3.1 21.6 5.8C21.6 7.8 23.3 8.9 24.6 9.6C26 10.3 26.4 10.8 26.4 11.4C26.4 12.3 25.3 12.7 24.3 12.7C22.5 12.7 21.4 12.2 20.6 11.8L20 14.2C20.9 14.6 22.4 14.9 24 14.9C27.7 14.9 30.2 13 30.2 10ZM11.8 1.5L6.2 14.5H2.4L0 3.8C0 3.3 0 3 0.3 2.7C0.6 2.4 1 2.1 1.5 1.9C2.5 1.5 4.5 1 6.1 0.7L6.5 1.5L10.6 1.5L11.8 1.5Z" fill="#1A1F71"/>
    </svg>
  );
}

function MastercardLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="10" r="9" fill="#EB001B"/>
      <circle cx="20" cy="10" r="9" fill="#F79E1B"/>
      <path d="M16 3.5C17.8 5 19 7.3 19 10C19 12.7 17.8 15 16 16.5C14.2 15 13 12.7 13 10C13 7.3 14.2 5 16 3.5Z" fill="#FF5F00"/>
    </svg>
  );
}

function AmexLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 40 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="40" height="16" rx="2" fill="#006FCF"/>
      <path d="M8.5 4L5 12H7.5L8 10.8H11L11.5 12H14L10.5 4H8.5ZM9.5 6.5L10.3 9H8.7L9.5 6.5ZM14.5 4V12H16.8L17 10.8L19 12H22V4H19.5V9.5L17.5 4H14.5ZM23 4V12H30V10H25.5V9H29.5V7H25.5V6H30V4H23ZM31 4L33.5 8L31 12H34L35.5 9.5L37 12H40L37.5 8L40 4H37L35.5 6.5L34 4H31Z" fill="white"/>
    </svg>
  );
}

function DiscoverLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="48" height="16" rx="2" fill="#FF6600"/>
      <ellipse cx="36" cy="8" rx="6" ry="5" fill="#FF6600"/>
      <path d="M3 5H5.5C7.4 5 8.5 6 8.5 8C8.5 10 7.4 11 5.5 11H3V5ZM5.3 9.5C6.3 9.5 6.8 9 6.8 8C6.8 7 6.3 6.5 5.3 6.5H4.7V9.5H5.3ZM9.5 5H11V11H9.5V5ZM15.5 7.5C15 7.3 14.5 7.2 14 7.2C13.3 7.2 13 7.5 13 7.8C13 8.2 13.4 8.4 14.2 8.7C15.4 9.1 16 9.6 16 10.5C16 11.5 15.1 11.2 13.8 11.2C13 11.2 12.3 11 11.8 10.8L12.1 9.4C12.7 9.7 13.4 9.9 14 9.9C14.7 9.9 15 9.6 15 9.2C15 8.8 14.6 8.6 13.7 8.3C12.5 7.9 12 7.3 12 6.5C12 5.4 12.9 4.8 14.2 4.8C15 4.8 15.6 4.9 16 5.1L15.5 6.4C15.1 6.2 14.6 6.1 14.1 6.1C13.5 6.1 13.2 6.3 13.2 6.6C13.2 6.9 13.5 7.1 14.3 7.4L15.5 7.5ZM21.3 9.5C20.7 10.6 19.6 11.2 18.3 11.2C16.5 11.2 15.3 10 15.3 8C15.3 6 16.6 4.8 18.5 4.8C19.7 4.8 20.7 5.3 21.3 6.3L20 7.3C19.6 6.7 19.1 6.4 18.4 6.4C17.4 6.4 16.8 7.1 16.8 8C16.8 9 17.4 9.6 18.4 9.6C19.1 9.6 19.6 9.3 20 8.7L21.3 9.5Z" fill="white"/>
    </svg>
  );
}

function ApplePayLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M9.2 5.8C8.7 6.4 7.9 6.9 7.1 6.8C7 6 7.4 5.1 7.9 4.6C8.4 4 9.3 3.5 10 3.5C10.1 4.3 9.7 5.2 9.2 5.8ZM10 7.1C8.8 7 7.8 7.8 7.2 7.8C6.6 7.8 5.7 7.1 4.7 7.1C3.4 7.2 2.2 7.9 1.5 9.1C0.1 11.4 1.1 14.9 2.5 16.8C3.1 17.7 3.9 18.8 5 18.8C6 18.7 6.4 18.1 7.5 18.1C8.7 18.1 9 18.8 10.1 18.7C11.2 18.7 11.9 17.7 12.5 16.8C13.2 15.7 13.5 14.7 13.5 14.7C13.5 14.6 11.4 13.8 11.4 11.4C11.4 9.3 13.1 8.4 13.2 8.3C12.2 6.8 10.6 6.7 10 6.6V7.1Z" fill="black"/>
      <path d="M18.9 4.5C21.6 4.5 23.5 6.4 23.5 9.1C23.5 11.9 21.5 13.8 18.8 13.8H15.9V18.6H13.5V4.5H18.9ZM15.9 11.7H18.3C20.2 11.7 21.1 10.8 21.1 9.1C21.1 7.4 20.2 6.5 18.3 6.5H15.9V11.7Z" fill="black"/>
      <path d="M24.5 15.2C24.5 13.2 26 11.9 28.8 11.8L32 11.6V10.8C32 9.5 31.2 8.8 29.7 8.8C28.5 8.8 27.6 9.4 27.4 10.3H25.2C25.3 8.2 27.2 6.7 29.8 6.7C32.5 6.7 34.3 8.2 34.3 10.6V18.6H32.1V16.7H32C31.4 17.9 30 18.8 28.4 18.8C26.2 18.8 24.5 17.4 24.5 15.2ZM32 14.2V13.4L29.1 13.6C27.7 13.7 27 14.3 27 15.2C27 16.1 27.8 16.7 28.9 16.7C30.4 16.7 32 15.6 32 14.2Z" fill="black"/>
      <path d="M36.3 22V20C36.5 20 36.9 20.1 37.2 20.1C38.3 20.1 38.9 19.6 39.3 18.4L39.5 17.9L35 4.5H37.6L40.7 15.1H40.8L43.9 4.5H46.4L41.7 18.6C40.7 21.4 39.5 22.2 37 22.2C36.7 22.1 36.5 22.1 36.3 22Z" fill="black"/>
    </svg>
  );
}

function GooglePayLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.8 10V13.8H21.4V4.5H25.1C25.9 4.5 26.7 4.8 27.3 5.4C27.9 6 28.2 6.7 28.2 7.6C28.2 8.4 27.9 9.2 27.3 9.8C26.7 10.4 25.9 10.7 25 10.7H22.8V10ZM22.8 5.9V9.3H25.1C25.6 9.3 26 9.1 26.3 8.8C26.9 8.2 26.9 7.3 26.3 6.7C26 6.4 25.6 6.2 25.1 6.2H22.8V5.9Z" fill="#3C4043"/>
      <path d="M31.9 7.4C32.8 7.4 33.5 7.7 34.1 8.2C34.6 8.7 34.9 9.4 34.9 10.3V13.8H33.5V12.8H33.4C32.9 13.6 32.2 14 31.3 14C30.5 14 29.8 13.8 29.3 13.3C28.8 12.8 28.5 12.2 28.5 11.5C28.5 10.7 28.8 10.1 29.4 9.6C30 9.2 30.7 8.9 31.7 8.9C32.5 8.9 33.2 9.1 33.6 9.4V9.2C33.6 8.7 33.4 8.3 33.1 8C32.7 7.7 32.3 7.5 31.8 7.5C31 7.5 30.5 7.9 30.1 8.5L28.8 7.8C29.5 6.9 30.5 7.4 31.9 7.4ZM30 11.5C30 11.9 30.2 12.2 30.5 12.4C30.8 12.7 31.2 12.8 31.6 12.8C32.2 12.8 32.7 12.5 33.1 12.1C33.5 11.7 33.7 11.2 33.7 10.6C33.3 10.3 32.7 10.1 32 10.1C31.4 10.1 30.9 10.2 30.6 10.5C30.2 10.7 30 11.1 30 11.5Z" fill="#3C4043"/>
      <path d="M42.5 7.6L38.3 17.3H36.8L38.3 14L35.6 7.6H37.2L39.1 12.4H39.2L41.1 7.6H42.5Z" fill="#3C4043"/>
      <path d="M14.1 9.5C14.1 9 14.1 8.5 14 8H8.3V10.8H11.6C11.5 11.6 11 12.3 10.3 12.8V14.5H12.3C13.5 13.4 14.1 11.6 14.1 9.5Z" fill="#4285F4"/>
      <path d="M8.3 16.1C10.1 16.1 11.6 15.5 12.3 14.5L10.3 12.8C9.7 13.2 9 13.5 8.3 13.5C6.5 13.5 5 12.2 4.5 10.5H2.4V12.3C3.5 14.5 5.7 16.1 8.3 16.1Z" fill="#34A853"/>
      <path d="M4.5 10.5C4.3 9.9 4.2 9.3 4.2 8.7C4.2 8.1 4.3 7.5 4.5 6.9V5.1H2.4C1.8 6.3 1.5 7.5 1.5 8.7C1.5 10 1.8 11.2 2.4 12.3L4.5 10.5Z" fill="#FBBC04"/>
      <path d="M8.3 3.9C9.3 3.9 10.1 4.2 10.8 4.9L12.4 3.3C11.3 2.3 9.9 1.7 8.3 1.7C5.7 1.7 3.5 3.3 2.4 5.5L4.5 7.3C5 5.6 6.5 3.9 8.3 3.9Z" fill="#EA4335"/>
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

      {/* Accepted Payment Methods */}
      <div className="border-t pt-4">
        <p className="text-xs text-gray-500 text-center mb-3">Accepted Payment Methods</p>
        <div className="flex items-center justify-center gap-3">
          <VisaLogo className="h-6 w-auto" />
          <MastercardLogo className="h-6 w-auto" />
          <AmexLogo className="h-5 w-auto" />
          <DiscoverLogo className="h-5 w-auto" />
        </div>
        <div className="flex items-center justify-center gap-3 mt-2">
          <ApplePayLogo className="h-5 w-auto" />
          <GooglePayLogo className="h-5 w-auto" />
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
            <span className="text-lg font-semibold">{formatCurrency(amount)}</span>
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
        appearance: { theme: 'stripe' },
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
