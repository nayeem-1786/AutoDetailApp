'use client';

import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { formResolver } from '@/lib/utils/form';
import {
  phoneOtpSendSchema,
  phoneOtpVerifySchema,
  type PhoneOtpSendInput,
  type PhoneOtpVerifyInput,
} from '@/lib/utils/validation';
import { formatPhoneInput, formatPhone } from '@/lib/utils/format';
import { usePhoneOtp } from '@/lib/hooks/usePhoneOtp';
import { useCustomerLink } from '@/lib/hooks/useCustomerLink';
import { AUTH_ERRORS } from '@/lib/auth/auth-errors';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import { Spinner } from '@/components/ui/spinner';
import { z } from 'zod';

// --- Types ---

interface SavedVehicle {
  id: string;
  vehicle_type: string;
  vehicle_category?: string;
  size_class: string | null;
  specialty_tier?: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
  color: string | null;
}

export interface AuthCustomerData {
  customer: {
    first_name: string;
    last_name: string;
    phone: string;
    email: string;
  };
  vehicles: SavedVehicle[];
}

export interface InlineAuthProps {
  onAuthComplete: (data: AuthCustomerData) => void;
  isAuthenticated: boolean;
  customerData: AuthCustomerData | null;
  onSignOut: () => void | Promise<void>;
}

// Post-OTP profile completion schema — email is optional for phone-first signup
const otpProfileSchema = z.object({
  first_name: z.string().min(1, 'Required'),
  last_name: z.string().min(1, 'Required'),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
});

type OtpProfileInput = z.infer<typeof otpProfileSchema>;

// --- Shared input class ---
const inputCls = 'border-site-border bg-brand-surface text-site-text placeholder:text-site-text-dim focus-visible:ring-accent-ui text-base sm:text-sm';

// --- Main InlineAuth Component ---

type AuthView = 'phone' | 'otp' | 'profile' | 'complete-profile';

export function InlineAuth({
  onAuthComplete,
  isAuthenticated,
  customerData,
  onSignOut,
}: InlineAuthProps) {
  const [view, setView] = useState<AuthView>('phone');
  const [jsxError, setJsxError] = useState<ReactNode | null>(null);
  const [isNewUser, setIsNewUser] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [fetchingProfile, setFetchingProfile] = useState(false);
  const localAuthRef = useRef<AuthCustomerData | null>(null);
  const [localAuthData, setLocalAuthData] = useState<AuthCustomerData | null>(null);
  const otpInputRef = useRef<HTMLInputElement>(null);

  // Profile completion state (for existing customers with incomplete data)
  const [pendingAuthData, setPendingAuthData] = useState<AuthCustomerData | null>(null);
  const [completeFirstName, setCompleteFirstName] = useState('');
  const [completeLastName, setCompleteLastName] = useState('');
  const [completeEmail, setCompleteEmail] = useState('');
  const [completeError, setCompleteError] = useState<string | null>(null);
  const [completeSaving, setCompleteSaving] = useState(false);

  const { checkExists, linkAccount } = useCustomerLink();

  // --- Phone OTP hook (unified: handles both new and returning customers) ---
  const otp = usePhoneOtp({
    mode: 'sign-in',
    onBeforeSend: async (phone) => {
      const check = await checkExists({ phone });
      if (check.exists) {
        setIsNewUser(false);
      } else {
        setIsNewUser(true);
      }
      // Never abort — always send OTP regardless of whether customer exists
      return { abort: false };
    },
    onVerified: async () => {
      // Existing customer linked — fetch profile and proceed
      await handleAuthSuccess();
    },
    onNoCustomerFound: () => {
      // New customer — show profile form to collect name
      setIsNewUser(true);
      setView('profile');
    },
  });

  // Forms
  const phoneForm = useForm<PhoneOtpSendInput>({
    resolver: formResolver(phoneOtpSendSchema),
  });

  const otpForm = useForm<PhoneOtpVerifyInput>({
    resolver: formResolver(phoneOtpVerifySchema),
    defaultValues: { phone: '', code: '' },
  });

  const profileForm = useForm<OtpProfileInput>({
    resolver: formResolver(otpProfileSchema),
  });

  // Sync OTP phase → view
  useEffect(() => {
    if (otp.phase === 'otp' && view === 'phone') setView('otp');
  }, [otp.phase, view]);

  // Auto-focus OTP input — aggressive strategy for iOS Safari
  useEffect(() => {
    if (view === 'otp') {
      const tryFocus = () => otpInputRef.current?.focus();
      requestAnimationFrame(() => { tryFocus(); requestAnimationFrame(tryFocus); });
      const timer = setTimeout(tryFocus, 300);
      return () => clearTimeout(timer);
    }
  }, [view]);

  // Error rendering
  const renderError = (): ReactNode => {
    if (jsxError) return jsxError;

    const err = otp.error;
    if (!err) return null;

    switch (err) {
      case AUTH_ERRORS.STAFF_PHONE:
        return 'This phone number is linked to a staff account. Please use a different number.';
      case AUTH_ERRORS.PHONE_ALREADY_LINKED:
        return 'This phone number is already linked to another account.';
      default:
        return err;
    }
  };

  const currentError = renderError();

  // --- Handlers ---

  const handleSendOtp = async (data: PhoneOtpSendInput) => {
    setJsxError(null);
    await otp.sendOtp(data.phone);
    otpForm.setValue('phone', data.phone);
  };

  const handleVerifyOtp = async (data: PhoneOtpVerifyInput) => {
    setJsxError(null);
    await otp.verifyOtp(data.phone, data.code);
  };

  const handleResendOtp = async () => {
    setJsxError(null);
    otpForm.setValue('code', '');
    await otp.resendOtp();
  };

  const handleProfileSubmit = async (data: OtpProfileInput) => {
    setProfileLoading(true);
    setJsxError(null);

    try {
      const result = await linkAccount({
        first_name: data.first_name,
        last_name: data.last_name,
        email: data.email || undefined,
        phone: otp.otpPhone,
      });

      if (!result.success) {
        if (result.error === 'SESSION_EXPIRED') {
          setJsxError('Your session has expired. Please try again.');
          setView('phone');
          otp.resetToPhone();
        } else if (result.error === 'STAFF_ACCOUNT') {
          setJsxError('This email is used for a staff account. Please use a different email.');
        } else {
          setJsxError('Something went wrong creating your account. Please try again.');
        }
        return;
      }

      await handleAuthSuccess();
    } catch {
      setJsxError('Something went wrong creating your account. Please try again.');
    } finally {
      setProfileLoading(false);
    }
  };

  // After auth success: fetch customer profile + vehicles
  const handleAuthSuccess = useCallback(async () => {
    setView('phone');
    setFetchingProfile(true);
    try {
      // Small delay to ensure Supabase session cookie is fully set
      await new Promise(resolve => setTimeout(resolve, 100));

      const [profileRes, vehiclesRes] = await Promise.all([
        fetch('/api/customer/profile'),
        fetch('/api/customer/vehicles'),
      ]);

      let customer = { first_name: '', last_name: '', phone: '', email: '' };
      let vehicles: SavedVehicle[] = [];

      if (profileRes.ok) {
        const profileData = await profileRes.json();
        customer = {
          first_name: profileData.first_name || '',
          last_name: profileData.last_name || '',
          phone: profileData.phone || '',
          email: profileData.email || '',
        };
      }

      if (vehiclesRes.ok) {
        const vehicleData = await vehiclesRes.json();
        vehicles = vehicleData.data || vehicleData || [];
      }

      // If profile returned empty data, retry once after a longer delay (auth timing issue)
      if ((!customer.first_name && !customer.phone) || !profileRes.ok || profileRes.status === 401) {
        await new Promise(resolve => setTimeout(resolve, 500));
        const retryRes = await fetch('/api/customer/profile');
        if (retryRes.ok) {
          const retryData = await retryRes.json();
          customer = {
            first_name: retryData.first_name || '',
            last_name: retryData.last_name || '',
            phone: retryData.phone || '',
            email: retryData.email || '',
          };
        }
      }

      const data = { customer, vehicles };

      // Intercept: if profile is incomplete (missing first or last name),
      // show the profile completion form before proceeding to booking.
      // This handles voice-agent-created customers who only have a first name.
      if (!customer.first_name.trim() || !customer.last_name.trim()) {
        setPendingAuthData(data);
        setCompleteFirstName(customer.first_name || '');
        setCompleteLastName(customer.last_name || '');
        setCompleteEmail(customer.email || '');
        setCompleteError(null);
        setView('complete-profile');
        return;
      }

      localAuthRef.current = data;
      setLocalAuthData(data);
      onAuthComplete(data);
    } catch (err) {
      console.error('Profile fetch failed after auth:', err);
      // Don't pass empty data downstream — show profile completion form instead
      setPendingAuthData({ customer: { first_name: '', last_name: '', phone: '', email: '' }, vehicles: [] });
      setCompleteFirstName('');
      setCompleteLastName('');
      setCompleteEmail('');
      setCompleteError(null);
      setView('complete-profile');
    } finally {
      setFetchingProfile(false);
    }
  }, [onAuthComplete]);

  // "Not you?" — clear booking auth only, keep Supabase session alive
  const handleNotYouClick = useCallback(() => {
    localAuthRef.current = null;
    setLocalAuthData(null);
    setView('phone');
  }, []);

  // "Sign out" — full sign-out: clear booking auth AND Supabase session
  const handleSignOutClick = useCallback(() => {
    // Clear local state immediately (synchronous — prevents iOS touch event cancellation)
    localAuthRef.current = null;
    setLocalAuthData(null);
    setView('phone');

    // Fire sign-out asynchronously — don't block the UI
    Promise.resolve(onSignOut()).catch((err: unknown) => console.error('Sign out error:', err));
  }, [onSignOut]);

  // Handle profile completion submission for existing customers
  const handleCompleteProfile = useCallback(async () => {
    if (!pendingAuthData) return;
    if (!completeFirstName.trim()) {
      setCompleteError('First name is required');
      return;
    }
    if (!completeLastName.trim()) {
      setCompleteError('Last name is required');
      return;
    }

    setCompleteSaving(true);
    setCompleteError(null);

    try {
      const res = await fetch('/api/customer/complete-profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: completeFirstName.trim(),
          last_name: completeLastName.trim(),
          email: completeEmail.trim() || '',
        }),
      });

      if (!res.ok) {
        const json = await res.json();
        setCompleteError(json.error || 'Failed to update profile');
        return;
      }

      // Update the pending data with the completed fields
      const updatedData: AuthCustomerData = {
        ...pendingAuthData,
        customer: {
          ...pendingAuthData.customer,
          first_name: completeFirstName.trim(),
          last_name: completeLastName.trim(),
          email: completeEmail.trim() || pendingAuthData.customer.email,
        },
      };

      localAuthRef.current = updatedData;
      setLocalAuthData(updatedData);
      setPendingAuthData(null);
      setView('phone');
      onAuthComplete(updatedData);
    } catch {
      setCompleteError('Something went wrong. Please try again.');
    } finally {
      setCompleteSaving(false);
    }
  }, [pendingAuthData, completeFirstName, completeLastName, completeEmail, onAuthComplete]);

  // Journey E: If authenticated but profile incomplete (voice-agent customers),
  // trigger profile completion form via effect instead of showing compact card.
  const effectiveData = customerData || localAuthData || localAuthRef.current;
  const isEffectivelyAuthed = isAuthenticated || !!localAuthData || !!localAuthRef.current;
  const hasIncompleteProfile = isEffectivelyAuthed && effectiveData &&
    (!effectiveData.customer.first_name?.trim() || !effectiveData.customer.last_name?.trim());

  useEffect(() => {
    if (hasIncompleteProfile && effectiveData && view !== 'complete-profile') {
      setPendingAuthData(effectiveData);
      setCompleteFirstName(effectiveData.customer.first_name || '');
      setCompleteLastName(effectiveData.customer.last_name || '');
      setCompleteEmail(effectiveData.customer.email || '');
      setCompleteError(null);
      setView('complete-profile');
    }
  }, [hasIncompleteProfile, effectiveData, view]);

  // Already authenticated with complete profile — show compact info line
  if (isEffectivelyAuthed && effectiveData && !hasIncompleteProfile) {
    const { first_name, last_name, phone, email } = effectiveData.customer;
    return (
      <div className="rounded-lg border border-accent-brand/30 bg-accent-brand/5 p-4 booking-auth-card">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-site-text">
              Booking as: {first_name} {last_name}
            </p>
            <p className="mt-0.5 text-xs text-site-text-muted truncate">
              {phone ? <span>{formatPhone(phone)}</span> : ''}{phone && email ? ' · ' : ''}{email}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <button
              type="button"
              onClick={handleNotYouClick}
              className="text-xs text-site-text-muted hover:text-site-text transition-colors"
            >
              Not you?
            </button>
            <button
              type="button"
              onClick={handleSignOutClick}
              className="text-xs text-red-400 hover:text-red-300 transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Loading state after auth
  if (fetchingProfile) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner className="h-6 w-6" />
        <span className="ml-2 text-sm text-site-text-muted">Loading your account...</span>
      </div>
    );
  }

  // OTP code ref merge for auto-focus
  const { ref: otpCodeRef, ...otpCodeField } = otpForm.register('code');

  // Not authenticated — show unified phone auth flow
  return (
    <div className="transition-all duration-200">
      <div className="rounded-xl border border-site-border p-5 sm:p-6">
        {currentError && (
          <div className="mb-5 rounded-md bg-red-950 p-3 text-sm text-red-300">
            {currentError}
          </div>
        )}

        {/* ===== PHONE ENTRY ===== */}
        {view === 'phone' && (
          <form
            autoComplete="off"
            data-form-type="other"
            onSubmit={(e) => { e.preventDefault(); phoneForm.handleSubmit(handleSendOtp)(); }}
            className="space-y-5"
          >
            <p className="text-sm text-site-text-muted">Enter your phone number to continue</p>

            <FormField
              label="Mobile"
              required
              error={phoneForm.formState.errors.phone?.message}
              htmlFor="inline-phone"
            >
              <Input
                id="inline-phone"
                type="tel"
                autoComplete="tel"
                inputMode="tel"
                autoFocus
                placeholder="(310) 555-1234"
                className={inputCls}
                data-form-type="other"
                data-1p-ignore
                data-lpignore="true"
                {...phoneForm.register('phone', {
                  onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                    const formatted = formatPhoneInput(e.target.value);
                    phoneForm.setValue('phone', formatted, {
                      shouldDirty: true,
                      shouldValidate: false,
                    });
                  },
                })}
              />
            </FormField>

            <Button
              type="submit"
              disabled={otp.loading}
              className="site-btn-primary w-full py-3 text-sm font-semibold"
            >
              {otp.loading ? <Spinner size="sm" /> : 'Continue'}
            </Button>
          </form>
        )}

        {/* ===== OTP VERIFICATION ===== */}
        {view === 'otp' && (
          <form onSubmit={otpForm.handleSubmit(handleVerifyOtp)} className="space-y-5">
            <div className="text-center">
              <p className="text-sm font-medium text-accent-brand">
                {isNewUser ? 'Let\u2019s create your account!' : 'Welcome back!'}
              </p>
              <p className="mt-1 text-sm text-site-text-muted">
                We sent a 6-digit code to <span className="font-medium text-site-text">{formatPhone(otp.otpPhone)}</span>
              </p>
            </div>

            <FormField
              label="Verification code"
              required
              error={otpForm.formState.errors.code?.message}
              htmlFor="inline-otp"
            >
              <Input
                id="inline-otp"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                maxLength={6}
                placeholder="000000"
                className={`text-center text-lg tracking-[0.3em] ${inputCls}`}
                {...otpCodeField}
                ref={(el) => {
                  otpCodeRef(el);
                  otpInputRef.current = el;
                }}
              />
            </FormField>

            <Button
              type="submit"
              disabled={otp.loading}
              className="site-btn-primary w-full py-3 text-sm font-semibold"
            >
              {otp.loading ? <Spinner size="sm" /> : 'Verify'}
            </Button>

            <div className="flex items-center justify-between text-sm">
              <button
                type="button"
                onClick={() => { setView('phone'); setJsxError(null); otp.resetToPhone(); otpForm.reset(); }}
                className="text-site-text-muted hover:text-site-text"
              >
                Change number
              </button>
              <button
                type="button"
                onClick={handleResendOtp}
                disabled={otp.cooldown > 0}
                className="text-site-text-muted hover:text-site-text disabled:text-site-text-faint"
              >
                {otp.cooldown > 0 ? `Resend in ${otp.cooldown}s` : 'Resend code'}
              </button>
            </div>
          </form>
        )}

        {/* ===== PROFILE COMPLETION (new customers after OTP) ===== */}
        {view === 'profile' && (
          <form onSubmit={profileForm.handleSubmit(handleProfileSubmit)} className="space-y-5">
            <p className="text-sm text-site-text-muted">
              Phone verified! Complete your profile to finish signing up.
            </p>

            <FormField label="Mobile" htmlFor="inline-profile-phone">
              <Input
                id="inline-profile-phone"
                value={formatPhone(otp.otpPhone)}
                readOnly
                className="bg-brand-dark text-site-text-muted border-site-border text-base sm:text-sm"
              />
            </FormField>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                label="First Name"
                required
                error={profileForm.formState.errors.first_name?.message}
                htmlFor="inline-profile-first-name"
              >
                <Input
                  id="inline-profile-first-name"
                  placeholder="John"
                  autoFocus
                  className={inputCls}
                  {...profileForm.register('first_name')}
                />
              </FormField>

              <FormField
                label="Last Name"
                required
                error={profileForm.formState.errors.last_name?.message}
                htmlFor="inline-profile-last-name"
              >
                <Input
                  id="inline-profile-last-name"
                  placeholder="Doe"
                  className={inputCls}
                  {...profileForm.register('last_name')}
                />
              </FormField>
            </div>

            <FormField
              label="Email"
              error={profileForm.formState.errors.email?.message}
              htmlFor="inline-profile-email"
            >
              <Input
                id="inline-profile-email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                className={inputCls}
                {...profileForm.register('email')}
              />
            </FormField>

            <Button
              type="submit"
              disabled={profileLoading}
              className="site-btn-primary w-full py-3 text-sm font-semibold"
            >
              {profileLoading ? <Spinner size="sm" /> : 'Complete Sign Up'}
            </Button>
          </form>
        )}

        {/* ===== PROFILE COMPLETION (existing customer with incomplete data) ===== */}
        {view === 'complete-profile' && pendingAuthData && (
          <>
            <h3 className="text-lg font-semibold text-site-text mb-2">Complete Your Profile</h3>
            <p className="text-sm text-site-text-muted mb-5">
              We just need a couple more details to complete your booking.
            </p>

            <div className="space-y-4">
              {pendingAuthData.customer.phone && (
                <FormField label="Mobile" htmlFor="complete-phone">
                  <Input
                    id="complete-phone"
                    value={formatPhone(pendingAuthData.customer.phone)}
                    readOnly
                    className="bg-brand-dark text-site-text-muted border-site-border text-base sm:text-sm"
                  />
                </FormField>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="First Name" required htmlFor="complete-first-name">
                  <Input
                    id="complete-first-name"
                    placeholder="John"
                    autoFocus
                    value={completeFirstName}
                    onChange={(e) => { setCompleteFirstName(e.target.value); setCompleteError(null); }}
                    className={inputCls}
                  />
                </FormField>

                <FormField label="Last Name" required htmlFor="complete-last-name">
                  <Input
                    id="complete-last-name"
                    placeholder="Doe"
                    value={completeLastName}
                    onChange={(e) => { setCompleteLastName(e.target.value); setCompleteError(null); }}
                    className={inputCls}
                  />
                </FormField>
              </div>

              <FormField label="Email" htmlFor="complete-email">
                <Input
                  id="complete-email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={completeEmail}
                  onChange={(e) => { setCompleteEmail(e.target.value); setCompleteError(null); }}
                  className={inputCls}
                />
              </FormField>

              {completeError && (
                <p className="text-sm text-red-500">{completeError}</p>
              )}

              <Button
                type="button"
                disabled={completeSaving}
                onClick={handleCompleteProfile}
                className="site-btn-primary w-full py-3 text-sm font-semibold"
              >
                {completeSaving ? <Spinner size="sm" /> : 'Continue to Booking'}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
