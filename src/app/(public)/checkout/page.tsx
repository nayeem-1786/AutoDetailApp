'use client';

import { Suspense, useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
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
  ArrowLeft,
  Check,
  Pencil,
} from 'lucide-react';
import { useCart } from '@/lib/contexts/cart-context';
import { formatCurrency } from '@/lib/utils/format';
import { TAX_RATE } from '@/lib/utils/constants';
import { toast } from 'sonner';

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!
);

// ---------------------------------------------------------------------------
// Session storage key
// ---------------------------------------------------------------------------

const CHECKOUT_SESSION_KEY = 'smart-details-checkout';

interface CheckoutSessionData {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  customerNotes: string;
  fulfillmentMethod: 'pickup' | 'shipping';
  shipStreet1: string;
  shipStreet2: string;
  shipCity: string;
  shipState: string;
  shipZip: string;
  selectedRateId: string | null;
  couponCode: string | undefined;
}

function saveCheckoutSession(data: CheckoutSessionData) {
  try {
    sessionStorage.setItem(CHECKOUT_SESSION_KEY, JSON.stringify(data));
  } catch {
    // Quota exceeded
  }
}

function loadCheckoutSession(): CheckoutSessionData | null {
  try {
    const raw = sessionStorage.getItem(CHECKOUT_SESSION_KEY);
    if (raw) return JSON.parse(raw) as CheckoutSessionData;
  } catch {
    // Parse error
  }
  return null;
}

function clearCheckoutSession() {
  try {
    sessionStorage.removeItem(CHECKOUT_SESSION_KEY);
  } catch {
    // Ignore
  }
}

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
// Step indicator
// ---------------------------------------------------------------------------

const STEPS = [
  { num: 1, label: 'Information' },
  { num: 2, label: 'Fulfillment' },
  { num: 3, label: 'Payment' },
] as const;

function StepIndicator({
  currentStep,
  onStepClick,
}: {
  currentStep: number;
  onStepClick: (step: number) => void;
}) {
  return (
    <nav className="flex items-center gap-1 sm:gap-2 mb-8">
      <Link
        href="/cart"
        className="text-xs sm:text-sm text-site-text-faint hover:text-lime transition-colors"
      >
        Cart
      </Link>
      {STEPS.map((step) => {
        const isActive = step.num === currentStep;
        const isComplete = step.num < currentStep;
        const isFuture = step.num > currentStep;

        return (
          <div key={step.num} className="flex items-center gap-1 sm:gap-2">
            <span className="text-site-text-faint">/</span>
            <button
              type="button"
              disabled={isFuture}
              onClick={() => !isFuture && onStepClick(step.num)}
              className={`flex items-center gap-1.5 text-xs sm:text-sm font-medium transition-colors ${
                isActive
                  ? 'text-lime'
                  : isComplete
                    ? 'text-site-text hover:text-lime cursor-pointer'
                    : 'text-site-text-faint cursor-not-allowed'
              }`}
            >
              {isComplete ? (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-lime/20 text-lime">
                  <Check className="h-3 w-3" />
                </span>
              ) : (
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold ${
                    isActive
                      ? 'bg-lime text-site-text-on-primary'
                      : 'bg-site-border text-site-text-faint'
                  }`}
                >
                  {step.num}
                </span>
              )}
              <span className="hidden sm:inline">{step.label}</span>
            </button>
          </div>
        );
      })}
    </nav>
  );
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

  // Steps: 1 = Contact/Fulfillment, 2 = Fulfillment details/Rates, 3 = Payment
  const [currentStep, setCurrentStep] = useState(1);

  // Contact form state
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [customerNotes, setCustomerNotes] = useState('');
  const [autoPopulated, setAutoPopulated] = useState(false);

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
  const [showItems, setShowItems] = useState(false);

  // Track if session has been restored
  const sessionRestored = useRef(false);
  const autoFetchDebounce = useRef<NodeJS.Timeout | null>(null);

  const couponCode = searchParams.get('coupon') || undefined;

  // Validate contact
  const contactValid =
    email.includes('@') &&
    email.includes('.') &&
    firstName.trim().length > 0 &&
    lastName.trim().length > 0;

  // Is address valid?
  const shippingAddressValid =
    shipStreet1.trim().length > 0 &&
    shipCity.trim().length > 0 &&
    shipState.trim().length >= 2 &&
    shipZip.trim().length >= 5;

  const selectedRate = shippingRates.find((r) => r.id === selectedRateId);

  const fulfillmentValid =
    fulfillmentMethod === 'pickup' ||
    (shippingAddressValid && !!selectedRateId);

  // Compute client-side tax estimate for display
  const displayTaxState =
    fulfillmentMethod === 'shipping'
      ? shipState.trim().toUpperCase()
      : 'CA'; // pickup = business state (CA)

  const showTax =
    (fulfillmentMethod === 'pickup') ||
    (fulfillmentMethod === 'shipping' && shippingAddressValid);

  const estimatedTaxCents =
    showTax && displayTaxState === 'CA'
      ? Math.max(0, Math.round(subtotal * 100 * TAX_RATE))
      : 0;

  // Shipping amount for display
  const displayShippingCents =
    totals?.shipping ??
    (fulfillmentMethod === 'shipping' && selectedRate
      ? selectedRate.totalAmount
      : 0);

  // ----- Auto-populate for logged-in users (Bug 4) -----
  useEffect(() => {
    // Only auto-populate if fields are empty (no session restore)
    if (sessionRestored.current) return;

    fetch('/api/checkout/customer-info')
      .then((res) => res.json())
      .then((data) => {
        if (data.customer) {
          const c = data.customer;
          if (!email && c.email) setEmail(c.email);
          if (!firstName && c.first_name) setFirstName(c.first_name);
          if (!lastName && c.last_name) setLastName(c.last_name);
          if (!phone && c.phone) {
            // Format E.164 phone for display
            const digits = c.phone.replace(/\D/g, '');
            const national = digits.startsWith('1') ? digits.slice(1) : digits;
            if (national.length === 10) {
              setPhone(
                `(${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6)}`
              );
            } else {
              setPhone(c.phone);
            }
          }
          // Pre-fill address
          if (!shipStreet1 && c.address_line_1) setShipStreet1(c.address_line_1);
          if (!shipStreet2 && c.address_line_2) setShipStreet2(c.address_line_2);
          if (!shipCity && c.city) setShipCity(c.city);
          if (!shipState && c.state) setShipState(c.state);
          if (!shipZip && c.zip) setShipZip(c.zip);
          setAutoPopulated(true);
        }
      })
      .catch(() => {
        // Not logged in — guest checkout
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ----- Restore session from sessionStorage (Bug 10) -----
  useEffect(() => {
    const saved = loadCheckoutSession();
    if (saved) {
      sessionRestored.current = true;
      if (saved.email) setEmail(saved.email);
      if (saved.firstName) setFirstName(saved.firstName);
      if (saved.lastName) setLastName(saved.lastName);
      if (saved.phone) setPhone(saved.phone);
      if (saved.customerNotes) setCustomerNotes(saved.customerNotes);
      if (saved.fulfillmentMethod) setFulfillmentMethod(saved.fulfillmentMethod);
      if (saved.shipStreet1) setShipStreet1(saved.shipStreet1);
      if (saved.shipStreet2) setShipStreet2(saved.shipStreet2);
      if (saved.shipCity) setShipCity(saved.shipCity);
      if (saved.shipState) setShipState(saved.shipState);
      if (saved.shipZip) setShipZip(saved.shipZip);
    }
  }, []);

  // ----- Save to sessionStorage on state changes -----
  useEffect(() => {
    // Don't save until we have at least email
    if (!email) return;
    saveCheckoutSession({
      email,
      firstName,
      lastName,
      phone,
      customerNotes,
      fulfillmentMethod,
      shipStreet1,
      shipStreet2,
      shipCity,
      shipState,
      shipZip,
      selectedRateId,
      couponCode,
    });
  }, [
    email,
    firstName,
    lastName,
    phone,
    customerNotes,
    fulfillmentMethod,
    shipStreet1,
    shipStreet2,
    shipCity,
    shipState,
    shipZip,
    selectedRateId,
    couponCode,
  ]);

  // Redirect if cart is empty (and we haven't started checkout)
  useEffect(() => {
    if (items.length === 0 && !clientSecret) {
      router.replace('/cart');
    }
  }, [items.length, clientSecret, router]);

  // Clear shipping state when fulfillment method changes (Bug 1 — prevents flash)
  useEffect(() => {
    setShippingRates([]);
    setSelectedRateId(null);
    setRatesFetched(false);
    setRatesError(null);
    setAddressWarning(null);
  }, [fulfillmentMethod]);

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

  // ----- Auto-fetch shipping rates when address becomes complete (Bug 6 & 7) -----
  useEffect(() => {
    if (fulfillmentMethod !== 'shipping' || !shippingAddressValid) return;

    // Debounce 500ms
    if (autoFetchDebounce.current) clearTimeout(autoFetchDebounce.current);
    autoFetchDebounce.current = setTimeout(() => {
      handleFetchRates();
    }, 500);

    return () => {
      if (autoFetchDebounce.current) clearTimeout(autoFetchDebounce.current);
    };
  }, [fulfillmentMethod, shippingAddressValid, shipStreet1, shipCity, shipState, shipZip, handleFetchRates]);

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
      setCurrentStep(3);
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
    clearCheckoutSession();
    router.push(`/checkout/confirmation?order=${orderNumber}`);
  };

  if (items.length === 0 && !clientSecret) {
    return null; // Will redirect
  }

  // ----- Button state helpers (Bug 7) -----
  const getButtonState = (): { disabled: boolean; label: string } => {
    if (!contactValid) {
      return { disabled: true, label: 'Complete contact information' };
    }
    if (fulfillmentMethod === 'shipping') {
      if (!shippingAddressValid) {
        return { disabled: true, label: 'Complete your shipping address' };
      }
      if (ratesLoading) {
        return { disabled: true, label: 'Calculating shipping...' };
      }
      if (!selectedRateId) {
        return { disabled: true, label: 'Select a shipping option' };
      }
    }
    return { disabled: false, label: 'Continue to Payment' };
  };

  const buttonState = getButtonState();

  // ----- Step navigation handler -----
  const handleStepClick = (step: number) => {
    if (step < currentStep && !clientSecret) {
      setCurrentStep(step);
    }
  };

  // Go back from step 3 (payment) - reset payment intent
  const handleBackFromPayment = () => {
    setClientSecret(null);
    setOrderId(null);
    setOrderNumber(null);
    setTotals(null);
    setCurrentStep(2);
    setError(null);
  };

  return (
    <section className="bg-brand-dark py-8 sm:py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Step Indicator */}
        <StepIndicator
          currentStep={currentStep}
          onStepClick={handleStepClick}
        />

        <div className="grid gap-8 lg:grid-cols-3">
          {/* Left column — form */}
          <div className="lg:col-span-2 space-y-6">
            {/* Step 1: Contact Information */}
            {currentStep === 1 && (
              <>
                <div className="rounded-2xl bg-brand-surface border border-site-border p-6">
                  <h2 className="font-display text-lg font-bold text-site-text mb-4">
                    Contact Information
                  </h2>
                  {autoPopulated && (
                    <p className="text-xs text-lime mb-4">
                      Using your saved information — feel free to edit
                    </p>
                  )}
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-site-text-muted mb-1.5">
                        Email <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        required
                        className={inputClass}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-site-text-muted mb-1.5">
                          First Name <span className="text-red-400">*</span>
                        </label>
                        <input
                          type="text"
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                          required
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-site-text-muted mb-1.5">
                          Last Name <span className="text-red-400">*</span>
                        </label>
                        <input
                          type="text"
                          value={lastName}
                          onChange={(e) => setLastName(e.target.value)}
                          required
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
                        className={inputClass}
                      />
                    </div>
                  </div>
                </div>

                {/* Fulfillment method selection */}
                <div className="rounded-2xl bg-brand-surface border border-site-border p-6">
                  <h2 className="font-display text-lg font-bold text-site-text mb-4">
                    Fulfillment Method
                  </h2>

                  <div className="space-y-3">
                    {/* Pickup option */}
                    <label
                      className={`flex items-start gap-3 cursor-pointer rounded-xl border p-4 transition-colors ${
                        fulfillmentMethod === 'pickup'
                          ? 'border-lime/30 bg-lime/5'
                          : 'border-site-border hover:border-site-border-light'
                      }`}
                    >
                      <input
                        type="radio"
                        name="fulfillment"
                        value="pickup"
                        checked={fulfillmentMethod === 'pickup'}
                        onChange={() => setFulfillmentMethod('pickup')}
                        className="mt-0.5 accent-lime"
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-lime" />
                          <span className="font-medium text-site-text">
                            Local Pickup
                          </span>
                          <span className="text-xs font-bold text-lime">
                            FREE
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-site-text-muted">
                          Pick up at our location. We&apos;ll notify you when
                          your order is ready.
                        </p>
                      </div>
                    </label>

                    {/* Shipping option */}
                    <label
                      className={`flex items-start gap-3 cursor-pointer rounded-xl border p-4 transition-colors ${
                        fulfillmentMethod === 'shipping'
                          ? 'border-lime/30 bg-lime/5'
                          : 'border-site-border hover:border-site-border-light'
                      }`}
                    >
                      <input
                        type="radio"
                        name="fulfillment"
                        value="shipping"
                        checked={fulfillmentMethod === 'shipping'}
                        onChange={() => setFulfillmentMethod('shipping')}
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
                </div>

                {/* Continue button */}
                <div className="flex items-center justify-between">
                  <Link
                    href="/cart"
                    className="flex items-center gap-1.5 text-sm text-site-text-muted hover:text-lime transition-colors"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Back to Cart
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      if (!contactValid) {
                        toast.error('Please fill in your email, first name, and last name');
                        return;
                      }
                      setCurrentStep(2);
                    }}
                    disabled={!contactValid}
                    className="rounded-xl bg-lime px-6 py-3 text-sm font-bold text-site-text-on-primary hover:bg-lime-200 transition-colors shadow-lg shadow-lime/20 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Continue
                  </button>
                </div>
              </>
            )}

            {/* Step 2: Shipping Address & Rates (or confirm pickup) */}
            {currentStep === 2 && (
              <>
                {fulfillmentMethod === 'shipping' ? (
                  <div className="rounded-2xl bg-brand-surface border border-site-border p-6">
                    <h2 className="font-display text-lg font-bold text-site-text mb-4">
                      Shipping Address
                    </h2>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-medium text-site-text-muted mb-1">
                          Street Address <span className="text-red-400">*</span>
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
                          <span className="text-site-text-faint">
                            (optional)
                          </span>
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
                            City <span className="text-red-400">*</span>
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
                            State <span className="text-red-400">*</span>
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
                            ZIP Code <span className="text-red-400">*</span>
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

                      {/* Loading state for auto-fetch */}
                      {ratesLoading && (
                        <div className="flex items-center gap-2 text-sm text-site-text-muted py-2">
                          <Loader2 className="h-4 w-4 animate-spin text-lime" />
                          Calculating shipping options...
                        </div>
                      )}

                      {ratesError && (
                        <div className="flex items-center justify-between rounded-xl bg-red-950 border border-red-800 p-3">
                          <p className="text-sm text-red-300">{ratesError}</p>
                          <button
                            type="button"
                            onClick={handleFetchRates}
                            className="text-sm font-medium text-red-300 hover:text-red-200 underline"
                          >
                            Retry
                          </button>
                        </div>
                      )}

                      {/* Address validation warning */}
                      {addressWarning && !addressValidating && (
                        <div className="rounded-xl bg-yellow-950/50 border border-yellow-700/40 p-3 text-sm text-yellow-300">
                          <p className="font-medium">
                            Address may have issues
                          </p>
                          <p className="text-yellow-400 mt-0.5">
                            {addressWarning}
                          </p>
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

                      {ratesFetched &&
                        shippingRates.length === 0 &&
                        !ratesError && (
                          <p className="text-sm text-site-text-muted">
                            No shipping rates available for this address. Please
                            try Local Pickup instead.
                          </p>
                        )}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl bg-brand-surface border border-site-border p-6">
                    <h2 className="font-display text-lg font-bold text-site-text mb-2">
                      Local Pickup
                    </h2>
                    <p className="text-sm text-site-text-muted">
                      We&apos;ll notify you at{' '}
                      <span className="text-site-text">{email}</span> when your
                      order is ready for pickup.
                    </p>
                  </div>
                )}

                {/* Order notes */}
                <div className="rounded-2xl bg-brand-surface border border-site-border p-6">
                  <label className="block text-sm font-medium text-site-text-muted mb-1.5">
                    Order Notes{' '}
                    <span className="text-site-text-faint">(optional)</span>
                  </label>
                  <textarea
                    value={customerNotes}
                    onChange={(e) => setCustomerNotes(e.target.value)}
                    rows={2}
                    placeholder="Any special instructions..."
                    className={`${inputClass} resize-none`}
                  />
                </div>

                {/* Navigation */}
                {error && (
                  <div className="rounded-xl bg-red-950 border border-red-800 p-4 text-sm text-red-300">
                    {error}
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setCurrentStep(1)}
                    className="flex items-center gap-1.5 text-sm text-site-text-muted hover:text-lime transition-colors"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={handleCreatePaymentIntent}
                    disabled={buttonState.disabled || loading}
                    className="flex items-center justify-center gap-2 rounded-xl bg-lime px-6 py-3 text-sm font-bold text-site-text-on-primary hover:bg-lime-200 transition-colors shadow-lg shadow-lime/20 disabled:opacity-50 disabled:cursor-not-allowed"
                    title={buttonState.disabled ? buttonState.label : undefined}
                  >
                    {loading ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Preparing Checkout...
                      </span>
                    ) : (
                      buttonState.label
                    )}
                  </button>
                </div>
              </>
            )}

            {/* Step 3: Review & Payment (Bug 11) */}
            {currentStep === 3 && clientSecret && (
              <>
                {/* Review section */}
                <div className="rounded-2xl bg-brand-surface border border-site-border p-6 space-y-4">
                  <h2 className="font-display text-lg font-bold text-site-text">
                    Review Your Order
                  </h2>

                  {/* Contact */}
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-medium text-site-text-muted uppercase tracking-wide">
                        Contact
                      </p>
                      <p className="text-sm text-site-text mt-0.5">
                        {firstName} {lastName}
                      </p>
                      <p className="text-sm text-site-text-muted">{email}</p>
                      {phone && (
                        <p className="text-sm text-site-text-muted">{phone}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={handleBackFromPayment}
                      className="flex items-center gap-1 text-xs text-site-text-faint hover:text-lime transition-colors"
                    >
                      <Pencil className="h-3 w-3" />
                      Edit
                    </button>
                  </div>

                  {/* Fulfillment */}
                  <div className="border-t border-site-border pt-4 flex items-start justify-between">
                    <div>
                      <p className="text-xs font-medium text-site-text-muted uppercase tracking-wide">
                        {fulfillmentMethod === 'pickup'
                          ? 'Local Pickup'
                          : 'Ship to'}
                      </p>
                      {fulfillmentMethod === 'shipping' ? (
                        <div className="mt-0.5">
                          <p className="text-sm text-site-text">
                            {shipStreet1}
                            {shipStreet2 ? `, ${shipStreet2}` : ''}
                          </p>
                          <p className="text-sm text-site-text">
                            {shipCity}, {shipState.toUpperCase()} {shipZip}
                          </p>
                          {selectedRate && (
                            <p className="text-sm text-site-text-muted mt-1">
                              {selectedRate.carrierName} —{' '}
                              {selectedRate.serviceName}
                              {selectedRate.totalAmount > 0
                                ? ` (${formatCurrency(selectedRate.totalAmount / 100)})`
                                : ' (FREE)'}
                              {selectedRate.estimatedDays
                                ? ` · Est. ${selectedRate.estimatedDays} business days`
                                : ''}
                            </p>
                          )}
                        </div>
                      ) : (
                        <p className="text-sm text-site-text-muted mt-0.5">
                          We&apos;ll notify you when ready
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={handleBackFromPayment}
                      className="flex items-center gap-1 text-xs text-site-text-faint hover:text-lime transition-colors"
                    >
                      <Pencil className="h-3 w-3" />
                      Edit
                    </button>
                  </div>

                  {/* Billing note */}
                  <div className="border-t border-site-border pt-4">
                    <p className="text-xs text-site-text-muted">
                      ZIP code in the payment form refers to your billing
                      address ZIP code.
                    </p>
                  </div>
                </div>

                {/* Payment Form */}
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

                {/* Back button */}
                <button
                  type="button"
                  onClick={handleBackFromPayment}
                  className="flex items-center gap-1.5 text-sm text-site-text-muted hover:text-lime transition-colors"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to Shipping
                </button>
              </>
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

              {/* Items (collapsible on mobile) */}
              <div
                className={`space-y-3 ${showItems ? 'block' : 'hidden lg:block'}`}
              >
                {items.map((item) => (
                  <div key={item.id} className="flex items-center gap-3">
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

              {/* Totals — reactive based on checkout state (Bug 5) */}
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

                {/* Shipping */}
                <div className="flex justify-between">
                  <span className="text-site-text-muted">Shipping</span>
                  {totals ? (
                    <span
                      className={`tabular-nums ${
                        totals.shipping > 0
                          ? 'text-site-text'
                          : 'text-lime font-medium'
                      }`}
                    >
                      {totals.shipping > 0
                        ? formatCurrency(totals.shipping / 100)
                        : 'FREE'}
                    </span>
                  ) : fulfillmentMethod === 'pickup' ? (
                    <span className="text-lime font-medium">
                      FREE (Local Pickup)
                    </span>
                  ) : selectedRate ? (
                    <span className="text-site-text tabular-nums">
                      {selectedRate.totalAmount > 0
                        ? formatCurrency(selectedRate.totalAmount / 100)
                        : 'FREE'}
                    </span>
                  ) : (
                    <span className="text-site-text-faint">—</span>
                  )}
                </div>

                {/* Tax */}
                <div className="flex justify-between">
                  <span className="text-site-text-muted">Tax</span>
                  {totals ? (
                    <span className="text-site-text tabular-nums">
                      {totals.tax > 0
                        ? formatCurrency(totals.tax / 100)
                        : '$0.00'}
                    </span>
                  ) : showTax ? (
                    <span className="text-site-text tabular-nums">
                      {displayTaxState === 'CA'
                        ? formatCurrency(estimatedTaxCents / 100)
                        : '$0.00'}
                    </span>
                  ) : (
                    <span className="text-site-text-faint">—</span>
                  )}
                </div>

                <div className="border-t border-site-border pt-3 flex justify-between">
                  <span className="text-base font-bold text-site-text">
                    Total
                  </span>
                  <span className="text-base font-bold text-site-text tabular-nums">
                    {totals
                      ? formatCurrency(totals.total / 100)
                      : formatCurrency(
                          subtotal +
                            displayShippingCents / 100 +
                            estimatedTaxCents / 100
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
