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

// Digital wallet logos
function ApplePayLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 165.521 105.965" xmlns="http://www.w3.org/2000/svg">
      <path d="M150.698 0H14.823c-.566 0-1.133 0-1.698.003-.477.004-.953.009-1.43.022-1.039.028-2.087.09-3.113.274a10.51 10.51 0 0 0-2.958.975 9.932 9.932 0 0 0-4.35 4.35 10.463 10.463 0 0 0-.975 2.96C.113 9.611.052 10.658.024 11.696a70.22 70.22 0 0 0-.022 1.43C0 13.69 0 14.256 0 14.823v76.318c0 .567 0 1.132.002 1.699.003.476.009.953.022 1.43.028 1.036.09 2.084.275 3.11a10.46 10.46 0 0 0 .974 2.96 9.897 9.897 0 0 0 1.83 2.52 9.874 9.874 0 0 0 2.52 1.83c.947.483 1.917.79 2.96.977 1.025.183 2.073.245 3.112.273.477.011.953.017 1.43.02.565.004 1.132.004 1.698.004h135.875c.565 0 1.132 0 1.697-.004.476-.002.952-.009 1.431-.02 1.037-.028 2.085-.09 3.113-.273a10.478 10.478 0 0 0 2.958-.977 9.955 9.955 0 0 0 4.35-4.35c.483-.947.789-1.917.974-2.96.186-1.026.246-2.074.274-3.11.013-.477.02-.954.022-1.43.004-.567.004-1.132.004-1.699V14.824c0-.567 0-1.133-.004-1.699a63.067 63.067 0 0 0-.022-1.429c-.028-1.038-.088-2.085-.274-3.112a10.4 10.4 0 0 0-.974-2.96 9.94 9.94 0 0 0-4.35-4.35A10.52 10.52 0 0 0 156.939.3c-1.028-.185-2.076-.246-3.113-.274a71.362 71.362 0 0 0-1.431-.022C151.83 0 151.263 0 150.698 0z"/>
      <path fill="#FFF" d="M150.698 3.532l1.672.003c.452.003.905.008 1.36.02.793.022 1.719.065 2.583.22.75.135 1.38.34 1.984.648a6.392 6.392 0 0 1 2.804 2.807c.306.6.51 1.226.645 1.983.154.854.197 1.783.218 2.58.013.45.019.9.02 1.36.005.557.005 1.113.005 1.671v76.318c0 .558 0 1.114-.004 1.682-.002.45-.008.9-.02 1.35-.022.796-.065 1.725-.221 2.589a6.855 6.855 0 0 1-.645 1.975 6.397 6.397 0 0 1-2.808 2.807c-.6.306-1.228.511-1.971.645-.881.157-1.847.2-2.574.22-.457.01-.912.017-1.379.019-.555.004-1.113.004-1.669.004H14.801c-.55 0-1.1 0-1.66-.004a74.993 74.993 0 0 1-1.35-.018c-.744-.02-1.71-.064-2.584-.22a6.938 6.938 0 0 1-1.986-.65 6.337 6.337 0 0 1-1.622-1.18 6.355 6.355 0 0 1-1.178-1.623 6.935 6.935 0 0 1-.646-1.985c-.156-.863-.2-1.788-.22-2.578a66.088 66.088 0 0 1-.02-1.355l-.003-1.327V14.474l.002-1.325a66.7 66.7 0 0 1 .02-1.357c.022-.792.065-1.717.222-2.587a6.924 6.924 0 0 1 .646-1.981c.304-.598.7-1.144 1.18-1.623a6.386 6.386 0 0 1 1.624-1.18 6.96 6.96 0 0 1 1.98-.646c.865-.155 1.792-.198 2.586-.22.452-.012.905-.017 1.354-.02l1.677-.003h135.875"/>
      <path d="M43.508 35.77c1.404-1.755 2.356-4.112 2.105-6.52-2.054.102-4.56 1.355-6.012 3.112-1.303 1.504-2.456 3.959-2.156 6.266 2.306.2 4.61-1.152 6.063-2.858"/>
      <path d="M45.587 39.079c-3.35-.2-6.196 1.9-7.795 1.9-1.6 0-4.049-1.8-6.698-1.751-3.447.05-6.645 2-8.395 5.1-3.598 6.2-.95 15.4 2.549 20.45 1.699 2.5 3.747 5.25 6.445 5.151 2.55-.1 3.549-1.65 6.647-1.65 3.097 0 3.997 1.65 6.696 1.6 2.798-.05 4.548-2.5 6.247-5 1.95-2.85 2.747-5.6 2.797-5.75-.05-.05-5.396-2.101-5.446-8.251-.05-5.15 4.198-7.6 4.398-7.751-2.399-3.548-6.147-3.948-7.445-4.048"/>
      <path d="M78.473 32.443c7.413 0 12.58 5.108 12.58 12.541 0 7.471-5.283 12.599-12.812 12.599h-8.205v13.055h-5.86V32.443h14.297zm-8.437 20.2h6.8c5.166 0 8.107-2.785 8.107-7.64 0-4.856-2.94-7.622-8.088-7.622h-6.82v15.262z"/>
      <path d="M92.52 60.191c0-4.836 3.71-7.813 10.277-8.157l7.568-.442v-2.127c0-3.075-2.074-4.914-5.514-4.914-3.266 0-5.34 1.587-5.842 4.063h-5.34c.29-5.051 4.623-8.779 11.395-8.779 6.676 0 10.943 3.536 10.943 9.073v19.03h-5.418v-4.548h-.135c-1.588 3.075-5.069 4.973-8.702 4.973-5.418 0-9.232-3.363-9.232-8.172zm17.845-2.476v-2.148l-6.811.424c-3.4.23-5.32 1.721-5.32 4.102 0 2.438 1.994 4.025 5.05 4.025 3.979 0 7.081-2.726 7.081-6.403z"/>
      <path d="M121.813 79.836v-4.625c.405.096 1.318.096 1.779.096 2.552 0 3.94-1.07 4.787-3.825l.52-1.721-9.656-27.1h6.121l6.715 22.241h.096l6.714-22.24h5.976l-10 28.462c-2.285 6.56-4.921 8.684-10.461 8.684-.461 0-2.092-.039-2.59-.097z"/>
    </svg>
  );
}

function GooglePayLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 435.97 173.13" xmlns="http://www.w3.org/2000/svg">
      <path fill="#5F6368" d="M206.2,84.58v50.75H190.1V10h42.7a38.61,38.61,0,0,1,27.65,10.85A34.88,34.88,0,0,1,272,47.3a34.72,34.72,0,0,1-11.55,26.6q-11.2,10.68-27.65,10.67H206.2Zm0-59.15V69.18h27a21.28,21.28,0,0,0,15.93-6.48,21.36,21.36,0,0,0,0-30.63,21,21,0,0,0-15.93-6.65h-27Z"/>
      <path fill="#5F6368" d="M309.1,46.78q17.85,0,28.18,9.54T347.6,82.48v52.85H332.2V120.93h-.7q-10,17.33-26.6,17.33-14.17,0-23.71-8.4a26.82,26.82,0,0,1-9.54-21q0-13.31,10.06-21.17t26.86-7.88q14.34,0,23.62,5.25V81.43A18.33,18.33,0,0,0,325.54,67,22.8,22.8,0,0,0,310,61.13q-13.49,0-21.35,11.38l-14.18-8.93Q286,46.78,309.1,46.78Zm-20.83,62.3a12.86,12.86,0,0,0,5.34,10.5,19.64,19.64,0,0,0,12.51,4.2,25.67,25.67,0,0,0,18.11-7.52,24,24,0,0,0,7.87-18q-7.35-6-21-6-9.89,0-16.37,4.73C290.08,100.52,288.27,104.41,288.27,109.08Z"/>
      <path fill="#5F6368" d="M436,49.58,382.24,173.13H365.62l19.95-43.23L350.22,49.58h17.5l25.55,61.6h.35l24.85-61.6Z"/>
      <path fill="#4285F4" d="M141.14,73.64A85.79,85.79,0,0,0,139.9,59H72v27.73h38.89a33.33,33.33,0,0,1-14.38,21.88v18h23.21C133.31,114.08,141.14,95.55,141.14,73.64Z"/>
      <path fill="#34A853" d="M72,144c19.43,0,35.79-6.38,47.72-17.38l-23.21-18C90.05,113,81.73,115.5,72,115.5c-18.78,0-34.72-12.66-40.42-29.72H7.67v18.55A72,72,0,0,0,72,144Z"/>
      <path fill="#FBBC04" d="M31.58,85.78a43.14,43.14,0,0,1,0-27.56V39.67H7.67a72,72,0,0,0,0,64.66Z"/>
      <path fill="#EA4335" d="M72,28.5a39.09,39.09,0,0,1,27.62,10.8l20.55-20.55A69.18,69.18,0,0,0,72,0,72,72,0,0,0,7.67,39.67l23.91,18.55C37.28,41.16,53.22,28.5,72,28.5Z"/>
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

      {/* Accepted Payment Methods - Apple Pay and Google Pay only */}
      <div className="border-t pt-4">
        <p className="text-xs text-gray-500 text-center mb-3">Accepted Payment Methods</p>
        <div className="flex items-center justify-center gap-4">
          <ApplePayLogo className="h-8 w-auto" />
          <GooglePayLogo className="h-8 w-auto" />
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
