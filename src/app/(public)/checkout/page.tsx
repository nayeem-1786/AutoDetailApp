'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { loadStripe } from '@stripe/stripe-js';
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import {
  Lock,
  ShieldCheck,
  Package,
  MapPin,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useCart } from '@/lib/contexts/cart-context';
import { formatCurrency } from '@/lib/utils/format';
import { toast } from 'sonner';

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!
);

// ---------------------------------------------------------------------------
// Payment Form (rendered inside <Elements>)
// ---------------------------------------------------------------------------

interface PaymentFormProps {
  totalCents: number;
  orderId: string;
  orderNumber: string;
  onSuccess: () => void;
}

function PaymentForm({
  totalCents,
  orderId,
  orderNumber,
  onSuccess,
}: PaymentFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setProcessing(true);
    setError(null);

    const { error: submitError, paymentIntent } =
      await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/checkout/confirmation?order=${orderNumber}`,
        },
        redirect: 'if_required',
      });

    if (submitError) {
      setError(submitError.message || 'Payment failed');
      setProcessing(false);
    } else if (paymentIntent && paymentIntent.status === 'succeeded') {
      onSuccess();
    } else {
      setError('Payment was not completed');
      setProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="rounded-2xl bg-brand-surface border border-site-border p-6">
        <h2 className="font-display text-lg font-bold text-site-text mb-1">
          3. Payment
        </h2>
        <p className="text-xs text-site-text-muted mb-4">
          ZIP code refers to your billing address ZIP code.
        </p>
        <PaymentElement />
        {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

        {/* Trust badges */}
        <div className="mt-6 space-y-3">
          <div className="flex items-center justify-center gap-2 text-sm text-site-text-secondary">
            <Lock className="h-4 w-4 text-green-600" />
            <span>256-bit SSL Encrypted</span>
            <span className="text-site-text-dim">|</span>
            <ShieldCheck className="h-4 w-4 text-blue-600" />
            <span>PCI DSS Compliant</span>
          </div>
          <div className="border-t border-site-border pt-3 flex items-center justify-center">
            <img
              src="/images/powered-by-stripe.svg"
              alt="Powered by Stripe"
              className="h-9 w-auto opacity-60"
            />
          </div>
        </div>
      </div>

      <button
        type="submit"
        disabled={!stripe || processing}
        className="mt-6 w-full flex items-center justify-center gap-2 rounded-xl bg-lime px-6 py-4 text-base font-bold text-site-text-on-primary hover:bg-lime-200 transition-colors shadow-lg shadow-lime/20 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {processing ? (
          <span className="flex items-center gap-2">
            <svg
              className="h-5 w-5 animate-spin"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            Processing...
          </span>
        ) : (
          `Place Order — ${formatCurrency(totalCents / 100)}`
        )}
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Main Checkout Page
// ---------------------------------------------------------------------------

export default function CheckoutPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { items, subtotal, clearCart } = useCart();

  // Contact form state
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [customerNotes, setCustomerNotes] = useState('');
  const [fulfillmentMethod] = useState<'pickup'>('pickup');

  // Checkout state
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [orderNumber, setOrderNumber] = useState<string | null>(null);
  const [totals, setTotals] = useState<{
    subtotal: number;
    discount: number;
    tax: number;
    shipping: number;
    total: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contactValid, setContactValid] = useState(false);
  const [showItems, setShowItems] = useState(false);

  const couponCode = searchParams.get('coupon') || undefined;

  // Validate contact
  useEffect(() => {
    const valid =
      email.includes('@') &&
      email.includes('.') &&
      firstName.trim().length > 0 &&
      lastName.trim().length > 0;
    setContactValid(valid);
  }, [email, firstName, lastName]);

  // Redirect if cart is empty (and we haven't started checkout)
  useEffect(() => {
    if (items.length === 0 && !clientSecret) {
      router.replace('/cart');
    }
  }, [items.length, clientSecret, router]);

  const handleCreatePaymentIntent = useCallback(async () => {
    if (!contactValid || items.length === 0) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/checkout/create-payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items.map((i) => ({ id: i.id, quantity: i.quantity })),
          couponCode,
          contact: {
            email,
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            phone: phone || undefined,
          },
          fulfillmentMethod,
          customerNotes: customerNotes || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.stockErrors) {
          setError(
            `Stock issues: ${(data.stockErrors as string[]).join(', ')}`
          );
        } else {
          setError(data.error || 'Checkout failed');
        }
        return;
      }

      setClientSecret(data.clientSecret);
      setOrderId(data.orderId);
      setOrderNumber(data.orderNumber);
      setTotals(data.totals);
    } catch {
      setError('Failed to initialize checkout');
    } finally {
      setLoading(false);
    }
  }, [
    contactValid,
    items,
    couponCode,
    email,
    firstName,
    lastName,
    phone,
    fulfillmentMethod,
    customerNotes,
  ]);

  const handlePaymentSuccess = () => {
    clearCart();
    router.push(`/checkout/confirmation?order=${orderNumber}`);
  };

  if (items.length === 0 && !clientSecret) {
    return null; // Will redirect
  }

  return (
    <section className="bg-brand-dark py-8 sm:py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h1 className="font-display text-2xl font-bold text-site-text sm:text-3xl">
          Checkout
        </h1>

        <div className="mt-8 grid gap-8 lg:grid-cols-3">
          {/* Left column — form */}
          <div className="lg:col-span-2 space-y-6">
            {/* 1. Contact Information */}
            <div className="rounded-2xl bg-brand-surface border border-site-border p-6">
              <h2 className="font-display text-lg font-bold text-site-text mb-4">
                1. Contact Information
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-site-text-muted mb-1.5">
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    disabled={!!clientSecret}
                    className="w-full rounded-xl border border-site-border bg-brand-dark px-4 py-2.5 text-sm text-site-text placeholder:text-site-text-faint focus:border-lime focus:outline-none focus:ring-1 focus:ring-lime disabled:opacity-60"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-site-text-muted mb-1.5">
                      First Name
                    </label>
                    <input
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      required
                      disabled={!!clientSecret}
                      className="w-full rounded-xl border border-site-border bg-brand-dark px-4 py-2.5 text-sm text-site-text placeholder:text-site-text-faint focus:border-lime focus:outline-none focus:ring-1 focus:ring-lime disabled:opacity-60"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-site-text-muted mb-1.5">
                      Last Name
                    </label>
                    <input
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      required
                      disabled={!!clientSecret}
                      className="w-full rounded-xl border border-site-border bg-brand-dark px-4 py-2.5 text-sm text-site-text placeholder:text-site-text-faint focus:border-lime focus:outline-none focus:ring-1 focus:ring-lime disabled:opacity-60"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-site-text-muted mb-1.5">
                    Phone{' '}
                    <span className="text-site-text-faint">(optional)</span>
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(310) 555-0100"
                    disabled={!!clientSecret}
                    className="w-full rounded-xl border border-site-border bg-brand-dark px-4 py-2.5 text-sm text-site-text placeholder:text-site-text-faint focus:border-lime focus:outline-none focus:ring-1 focus:ring-lime disabled:opacity-60"
                  />
                </div>
              </div>
            </div>

            {/* 2. Fulfillment */}
            <div className="rounded-2xl bg-brand-surface border border-site-border p-6">
              <h2 className="font-display text-lg font-bold text-site-text mb-4">
                2. Fulfillment Method
              </h2>
              <label className="flex items-start gap-3 cursor-pointer rounded-xl border border-lime/30 bg-lime/5 p-4">
                <input
                  type="radio"
                  name="fulfillment"
                  value="pickup"
                  checked
                  readOnly
                  className="mt-0.5 accent-lime"
                />
                <div>
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-lime" />
                    <span className="font-medium text-site-text">
                      Local Pickup
                    </span>
                    <span className="text-xs font-bold text-lime">FREE</span>
                  </div>
                  <p className="mt-1 text-sm text-site-text-muted">
                    Pick up at our location. We&apos;ll notify you when your
                    order is ready.
                  </p>
                </div>
              </label>

              {/* Order notes */}
              <div className="mt-4">
                <label className="block text-sm font-medium text-site-text-muted mb-1.5">
                  Order Notes{' '}
                  <span className="text-site-text-faint">(optional)</span>
                </label>
                <textarea
                  value={customerNotes}
                  onChange={(e) => setCustomerNotes(e.target.value)}
                  rows={2}
                  placeholder="Any special instructions..."
                  disabled={!!clientSecret}
                  className="w-full rounded-xl border border-site-border bg-brand-dark px-4 py-2.5 text-sm text-site-text placeholder:text-site-text-faint focus:border-lime focus:outline-none focus:ring-1 focus:ring-lime resize-none disabled:opacity-60"
                />
              </div>
            </div>

            {/* 3. Payment — only after contact submitted */}
            {!clientSecret ? (
              <div>
                {error && (
                  <div className="mb-4 rounded-xl bg-red-950 border border-red-800 p-4 text-sm text-red-300">
                    {error}
                  </div>
                )}
                <button
                  type="button"
                  onClick={handleCreatePaymentIntent}
                  disabled={!contactValid || loading}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-lime px-6 py-4 text-base font-bold text-site-text-on-primary hover:bg-lime-200 transition-colors shadow-lg shadow-lime/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <svg
                        className="h-5 w-5 animate-spin"
                        viewBox="0 0 24 24"
                        fill="none"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                        />
                      </svg>
                      Preparing Checkout...
                    </span>
                  ) : (
                    'Continue to Payment'
                  )}
                </button>
              </div>
            ) : (
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
                <PaymentForm
                  totalCents={totals?.total ?? 0}
                  orderId={orderId ?? ''}
                  orderNumber={orderNumber ?? ''}
                  onSuccess={handlePaymentSuccess}
                />
              </Elements>
            )}
          </div>

          {/* Right column — order summary */}
          <div className="lg:col-span-1">
            <div className="sticky top-24 rounded-2xl bg-brand-surface border border-site-border p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-lg font-bold text-site-text">
                  Order Summary
                </h2>
                <button
                  type="button"
                  onClick={() => setShowItems(!showItems)}
                  className="text-site-text-muted hover:text-site-text transition-colors lg:hidden"
                >
                  {showItems ? (
                    <ChevronUp className="h-5 w-5" />
                  ) : (
                    <ChevronDown className="h-5 w-5" />
                  )}
                </button>
              </div>

              {/* Items (collapsible on mobile, always visible on desktop) */}
              <div
                className={`space-y-3 ${showItems ? 'block' : 'hidden lg:block'}`}
              >
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3"
                  >
                    <div className="h-10 w-10 rounded-lg bg-brand-dark overflow-hidden border border-site-border shrink-0">
                      {item.imageUrl ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={item.imageUrl}
                          alt={item.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <Package className="h-4 w-4 text-site-text-faint" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-site-text truncate">
                        {item.name}
                      </p>
                      <p className="text-xs text-site-text-muted">
                        Qty: {item.quantity}
                      </p>
                    </div>
                    <span className="text-sm font-medium text-site-text tabular-nums shrink-0">
                      {formatCurrency(item.price * item.quantity)}
                    </span>
                  </div>
                ))}
              </div>

              {/* Totals */}
              <div className="border-t border-site-border pt-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-site-text-muted">Subtotal</span>
                  <span className="text-site-text tabular-nums">
                    {formatCurrency(
                      totals ? totals.subtotal / 100 : subtotal
                    )}
                  </span>
                </div>
                {totals && totals.discount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-lime">Discount</span>
                    <span className="text-lime tabular-nums">
                      -{formatCurrency(totals.discount / 100)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-site-text-muted">Tax</span>
                  <span className="text-site-text tabular-nums">
                    {totals
                      ? formatCurrency(totals.tax / 100)
                      : 'Calculated next'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-site-text-muted">Shipping</span>
                  <span className="text-lime font-medium">FREE</span>
                </div>
                <div className="border-t border-site-border pt-3 flex justify-between">
                  <span className="text-base font-bold text-site-text">
                    Total
                  </span>
                  <span className="text-base font-bold text-site-text tabular-nums">
                    {totals
                      ? formatCurrency(totals.total / 100)
                      : formatCurrency(subtotal)}
                  </span>
                </div>
              </div>

              {couponCode && !totals && (
                <div className="flex items-center gap-2 rounded-xl bg-lime/10 border border-lime/20 px-3 py-2 text-sm text-lime">
                  <span>Coupon: {couponCode}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
