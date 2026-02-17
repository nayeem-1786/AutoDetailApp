'use client';

import { Suspense, useState, useEffect, useCallback } from 'react';
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
  Truck,
  ChevronDown,
  ChevronUp,
  Loader2,
} from 'lucide-react';
import { useCart } from '@/lib/contexts/cart-context';
import { formatCurrency } from '@/lib/utils/format';
import { toast } from 'sonner';

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ShippingRate {
  id: string;
  carrier: string;
  carrierName: string;
  carrierLogo?: string;
  service: string;
  serviceName: string;
  amount: number;
  totalAmount: number;
  estimatedDays: number | null;
  estimatedDeliveryDate?: string;
}

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
            {/* eslint-disable-next-line @next/next/no-img-element */}
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
            <Loader2 className="h-5 w-5 animate-spin" />
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
// Input classes (shared)
// ---------------------------------------------------------------------------

const inputClass =
  'w-full rounded-xl border border-site-border bg-brand-dark px-4 py-2.5 text-sm text-site-text placeholder:text-site-text-faint focus:border-lime focus:outline-none focus:ring-1 focus:ring-lime disabled:opacity-60';

// ---------------------------------------------------------------------------
// Main Checkout Page
// ---------------------------------------------------------------------------

function CheckoutContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { items, subtotal, clearCart } = useCart();

  // Contact form state
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [customerNotes, setCustomerNotes] = useState('');

  // Fulfillment state
  const [fulfillmentMethod, setFulfillmentMethod] = useState<
    'pickup' | 'shipping'
  >('pickup');

  // Shipping address
  const [shipStreet1, setShipStreet1] = useState('');
  const [shipStreet2, setShipStreet2] = useState('');
  const [shipCity, setShipCity] = useState('');
  const [shipState, setShipState] = useState('');
  const [shipZip, setShipZip] = useState('');

  // Shipping rates
  const [shippingRates, setShippingRates] = useState<ShippingRate[]>([]);
  const [selectedRateId, setSelectedRateId] = useState<string | null>(null);
  const [ratesLoading, setRatesLoading] = useState(false);
  const [ratesError, setRatesError] = useState<string | null>(null);
  const [ratesFetched, setRatesFetched] = useState(false);

  // Display preferences from settings
  const [showCarrierLogo, setShowCarrierLogo] = useState(true);

  // Address validation (non-blocking)
  const [addressWarning, setAddressWarning] = useState<string | null>(null);
  const [addressValidating, setAddressValidating] = useState(false);

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

  // Is fulfillment fully valid?
  const shippingAddressValid =
    shipStreet1.trim().length > 0 &&
    shipCity.trim().length > 0 &&
    shipState.trim().length >= 2 &&
    shipZip.trim().length >= 5;

  const selectedRate = shippingRates.find((r) => r.id === selectedRateId);

  const fulfillmentValid =
    fulfillmentMethod === 'pickup' ||
    (shippingAddressValid && !!selectedRateId);

  // Validate address via Shippo (non-blocking)
  const validateShippingAddress = useCallback(async () => {
    setAddressValidating(true);
    setAddressWarning(null);
    try {
      const res = await fetch('/api/checkout/validate-address', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          street1: shipStreet1.trim(),
          street2: shipStreet2.trim() || undefined,
          city: shipCity.trim(),
          state: shipState.trim().toUpperCase(),
          zip: shipZip.trim(),
          country: 'US',
        }),
      });
      if (res.ok) {
        const { data } = await res.json();
        if (data && !data.isValid && data.messages?.length > 0) {
          setAddressWarning(data.messages.join('. '));
        }
      }
    } catch {
      // Validation failure is non-blocking — silently ignore
    } finally {
      setAddressValidating(false);
    }
  }, [shipStreet1, shipStreet2, shipCity, shipState, shipZip]);

  // Fetch shipping rates
  const handleFetchRates = useCallback(async () => {
    if (!shippingAddressValid || items.length === 0) return;

    setRatesLoading(true);
    setRatesError(null);
    setShippingRates([]);
    setSelectedRateId(null);
    setRatesFetched(false);

    // Fire address validation in parallel (non-blocking)
    validateShippingAddress();

    try {
      const res = await fetch('/api/checkout/shipping-rates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shippingAddress: {
            name: `${firstName} ${lastName}`.trim(),
            street1: shipStreet1.trim(),
            street2: shipStreet2.trim() || undefined,
            city: shipCity.trim(),
            state: shipState.trim().toUpperCase(),
            zip: shipZip.trim(),
            country: 'US',
            phone: phone || undefined,
            email: email || undefined,
          },
          items: items.map((i) => ({
            productId: i.id,
            quantity: i.quantity,
          })),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setRatesError(data.error || 'Failed to get shipping rates');
        return;
      }

      // Read display preferences
      if (data.data?.showCarrierLogo !== undefined) {
        setShowCarrierLogo(data.data.showCarrierLogo);
      }

      const rates = (data.data?.rates || []) as ShippingRate[];
      setShippingRates(rates);
      setRatesFetched(true);

      // Auto-select cheapest rate
      if (rates.length > 0) {
        setSelectedRateId(rates[0].id);
      }
    } catch {
      setRatesError('Failed to fetch shipping rates');
    } finally {
      setRatesLoading(false);
    }
  }, [
    shippingAddressValid,
    items,
    firstName,
    lastName,
    shipStreet1,
    shipStreet2,
    shipCity,
    shipState,
    shipZip,
    phone,
    email,
    validateShippingAddress,
  ]);

  // Create payment intent
  const handleCreatePaymentIntent = useCallback(async () => {
    if (!contactValid || !fulfillmentValid || items.length === 0) return;

    setLoading(true);
    setError(null);

    try {
      const payload: Record<string, unknown> = {
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
      };

      if (fulfillmentMethod === 'shipping') {
        payload.shippingAddress = {
          line1: shipStreet1.trim(),
          line2: shipStreet2.trim() || undefined,
          city: shipCity.trim(),
          state: shipState.trim().toUpperCase(),
          zip: shipZip.trim(),
        };
        payload.shippoRateId = selectedRateId;
        payload.shippingAmountCents = selectedRate?.totalAmount ?? 0;
        payload.shippingCarrier = selectedRate?.carrier;
        payload.shippingService = selectedRate?.serviceName;
      }

      const res = await fetch('/api/checkout/create-payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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
    fulfillmentValid,
    items,
    couponCode,
    email,
    firstName,
    lastName,
    phone,
    fulfillmentMethod,
    customerNotes,
    shipStreet1,
    shipStreet2,
    shipCity,
    shipState,
    shipZip,
    selectedRateId,
    selectedRate,
  ]);

  const handlePaymentSuccess = () => {
    clearCart();
    router.push(`/checkout/confirmation?order=${orderNumber}`);
  };

  if (items.length === 0 && !clientSecret) {
    return null; // Will redirect
  }

  // Shipping amount for summary display
  const displayShippingCents =
    totals?.shipping ??
    (fulfillmentMethod === 'shipping' && selectedRate
      ? selectedRate.totalAmount
      : 0);

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
                    className={inputClass}
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
                      className={inputClass}
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
                      className={inputClass}
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
                    className={inputClass}
                  />
                </div>
              </div>
            </div>

            {/* 2. Fulfillment */}
            <div className="rounded-2xl bg-brand-surface border border-site-border p-6">
              <h2 className="font-display text-lg font-bold text-site-text mb-4">
                2. Fulfillment Method
              </h2>

              <div className="space-y-3">
                {/* Pickup option */}
                <label
                  className={`flex items-start gap-3 cursor-pointer rounded-xl border p-4 transition-colors ${
                    fulfillmentMethod === 'pickup'
                      ? 'border-lime/30 bg-lime/5'
                      : 'border-site-border hover:border-site-border-light'
                  } ${clientSecret ? 'opacity-60 pointer-events-none' : ''}`}
                >
                  <input
                    type="radio"
                    name="fulfillment"
                    value="pickup"
                    checked={fulfillmentMethod === 'pickup'}
                    onChange={() => setFulfillmentMethod('pickup')}
                    disabled={!!clientSecret}
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

                {/* Shipping option */}
                <label
                  className={`flex items-start gap-3 cursor-pointer rounded-xl border p-4 transition-colors ${
                    fulfillmentMethod === 'shipping'
                      ? 'border-lime/30 bg-lime/5'
                      : 'border-site-border hover:border-site-border-light'
                  } ${clientSecret ? 'opacity-60 pointer-events-none' : ''}`}
                >
                  <input
                    type="radio"
                    name="fulfillment"
                    value="shipping"
                    checked={fulfillmentMethod === 'shipping'}
                    onChange={() => setFulfillmentMethod('shipping')}
                    disabled={!!clientSecret}
                    className="mt-0.5 accent-lime"
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <Truck className="h-4 w-4 text-lime" />
                      <span className="font-medium text-site-text">
                        Ship to Address
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-site-text-muted">
                      Enter your shipping address for delivery options and
                      rates.
                    </p>
                  </div>
                </label>
              </div>

              {/* Shipping address form */}
              {fulfillmentMethod === 'shipping' && !clientSecret && (
                <div className="mt-4 space-y-4 border-t border-site-border pt-4">
                  <h3 className="text-sm font-medium text-site-text">
                    Shipping Address
                  </h3>
                  <div>
                    <label className="block text-xs font-medium text-site-text-muted mb-1">
                      Street Address
                    </label>
                    <input
                      type="text"
                      value={shipStreet1}
                      onChange={(e) => setShipStreet1(e.target.value)}
                      placeholder="123 Main St"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-site-text-muted mb-1">
                      Apt / Suite / Unit{' '}
                      <span className="text-site-text-faint">(optional)</span>
                    </label>
                    <input
                      type="text"
                      value={shipStreet2}
                      onChange={(e) => setShipStreet2(e.target.value)}
                      placeholder="Apt 4B"
                      className={inputClass}
                    />
                  </div>
                  <div className="grid grid-cols-6 gap-3">
                    <div className="col-span-3">
                      <label className="block text-xs font-medium text-site-text-muted mb-1">
                        City
                      </label>
                      <input
                        type="text"
                        value={shipCity}
                        onChange={(e) => setShipCity(e.target.value)}
                        className={inputClass}
                      />
                    </div>
                    <div className="col-span-1">
                      <label className="block text-xs font-medium text-site-text-muted mb-1">
                        State
                      </label>
                      <input
                        type="text"
                        value={shipState}
                        onChange={(e) => setShipState(e.target.value)}
                        placeholder="CA"
                        maxLength={2}
                        className={inputClass}
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-site-text-muted mb-1">
                        ZIP Code
                      </label>
                      <input
                        type="text"
                        value={shipZip}
                        onChange={(e) => setShipZip(e.target.value)}
                        placeholder="90717"
                        maxLength={10}
                        className={inputClass}
                      />
                    </div>
                  </div>

                  {/* Get Rates button */}
                  <button
                    type="button"
                    onClick={handleFetchRates}
                    disabled={!shippingAddressValid || ratesLoading}
                    className="w-full flex items-center justify-center gap-2 rounded-xl border border-site-border bg-brand-dark px-4 py-2.5 text-sm font-medium text-site-text hover:bg-site-border-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {ratesLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Calculating rates...
                      </>
                    ) : ratesFetched ? (
                      'Recalculate Rates'
                    ) : (
                      'Get Shipping Rates'
                    )}
                  </button>

                  {ratesError && (
                    <p className="text-sm text-red-400">{ratesError}</p>
                  )}

                  {/* Address validation warning (non-blocking) */}
                  {addressWarning && !addressValidating && (
                    <div className="rounded-xl bg-yellow-950/50 border border-yellow-700/40 p-3 text-sm text-yellow-300">
                      <p className="font-medium">Address may have issues</p>
                      <p className="text-yellow-400 mt-0.5">{addressWarning}</p>
                    </div>
                  )}

                  {/* Rate options */}
                  {shippingRates.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-medium text-site-text-muted uppercase tracking-wide">
                        Available Shipping Options
                      </h4>
                      {shippingRates.map((rate) => (
                        <label
                          key={rate.id}
                          className={`flex items-center justify-between cursor-pointer rounded-xl border p-3 transition-colors ${
                            selectedRateId === rate.id
                              ? 'border-lime/30 bg-lime/5'
                              : 'border-site-border hover:border-site-border-light'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <input
                              type="radio"
                              name="shipping_rate"
                              value={rate.id}
                              checked={selectedRateId === rate.id}
                              onChange={() => setSelectedRateId(rate.id)}
                              className="accent-lime"
                            />
                            {showCarrierLogo && rate.carrierLogo && (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img
                                src={rate.carrierLogo}
                                alt={rate.carrierName}
                                className="h-6 w-6 object-contain shrink-0"
                              />
                            )}
                            <div>
                              <span className="text-sm font-medium text-site-text">
                                {rate.carrierName} — {rate.serviceName}
                              </span>
                              {rate.estimatedDays != null &&
                                rate.estimatedDays > 0 && (
                                  <p className="text-xs text-site-text-muted">
                                    Est. {rate.estimatedDays} business day
                                    {rate.estimatedDays !== 1 ? 's' : ''}
                                  </p>
                                )}
                            </div>
                          </div>
                          <span
                            className={`text-sm font-semibold tabular-nums ${
                              rate.totalAmount === 0
                                ? 'text-lime'
                                : 'text-site-text'
                            }`}
                          >
                            {rate.totalAmount === 0
                              ? 'FREE'
                              : formatCurrency(rate.totalAmount / 100)}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}

                  {ratesFetched && shippingRates.length === 0 && !ratesError && (
                    <p className="text-sm text-site-text-muted">
                      No shipping rates available for this address. Please try
                      Local Pickup instead.
                    </p>
                  )}
                </div>
              )}

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
                  className={`${inputClass} resize-none`}
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
                  disabled={!contactValid || !fulfillmentValid || loading}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-lime px-6 py-4 text-base font-bold text-site-text-on-primary hover:bg-lime-200 transition-colors shadow-lg shadow-lime/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-5 w-5 animate-spin" />
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
                  <span
                    className={`tabular-nums ${displayShippingCents > 0 ? 'text-site-text' : 'text-lime font-medium'}`}
                  >
                    {displayShippingCents > 0
                      ? formatCurrency(displayShippingCents / 100)
                      : 'FREE'}
                  </span>
                </div>
                <div className="border-t border-site-border pt-3 flex justify-between">
                  <span className="text-base font-bold text-site-text">
                    Total
                  </span>
                  <span className="text-base font-bold text-site-text tabular-nums">
                    {totals
                      ? formatCurrency(totals.total / 100)
                      : formatCurrency(
                          subtotal + displayShippingCents / 100
                        )}
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

export default function CheckoutPage() {
  return (
    <Suspense
      fallback={
        <section className="bg-brand-dark py-16 sm:py-24">
          <div className="mx-auto max-w-3xl px-4 sm:px-6 text-center">
            <div className="flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-lime" />
            </div>
          </div>
        </section>
      }
    >
      <CheckoutContent />
    </Suspense>
  );
}
