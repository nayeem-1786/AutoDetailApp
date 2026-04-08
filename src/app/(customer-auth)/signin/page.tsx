'use client';

import { useState, useEffect, useRef, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useForm } from 'react-hook-form';
import { formResolver } from '@/lib/utils/form';
import {
  phoneOtpSendSchema,
  phoneOtpVerifySchema,
  type PhoneOtpSendInput,
  type PhoneOtpVerifyInput,
} from '@/lib/utils/validation';
import { formatPhoneInput } from '@/lib/utils/format';
import { useBusinessInfo } from '@/lib/hooks/use-business-info';
import { usePhoneOtp } from '@/lib/hooks/usePhoneOtp';
import { useCustomerLink } from '@/lib/hooks/useCustomerLink';
import { AUTH_ERRORS } from '@/lib/auth/auth-errors';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import { Spinner } from '@/components/ui/spinner';
import { z } from 'zod';

// Post-OTP profile completion schema — email is optional
const profileSchema = z.object({
  first_name: z.string().min(1, 'Required'),
  last_name: z.string().min(1, 'Required'),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
});

type ProfileInput = z.infer<typeof profileSchema>;

// phone → otp → (profile for new users) → done
type AuthMode = 'phone' | 'otp' | 'profile';

export default function UnifiedAuthPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect') || '/account';
  const reason = searchParams.get('reason');
  const sessionExpired = reason === 'session_expired';
  const prefillPhone = searchParams.get('phone') || '';
  const { info: businessInfo } = useBusinessInfo();

  const [mode, setMode] = useState<AuthMode>('phone');
  const [jsxError, setJsxError] = useState<ReactNode | null>(null);
  const [isNewUser, setIsNewUser] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);

  const signedOutRef = useRef(false);
  const otpInputRef = useRef<HTMLInputElement>(null);

  const { checkExists, linkAccount } = useCustomerLink();

  // --- Phone OTP hook (mode: sign-in) ---
  const otp = usePhoneOtp({
    mode: 'sign-in',
    onBeforeSend: async (phone) => {
      const check = await checkExists({ phone });
      if (check.exists && check.hasAuthAccount) {
        setIsNewUser(false);
        return { abort: false };
      }
      if (check.exists && !check.hasAuthAccount) {
        setIsNewUser(false);
        return { abort: false };
      }
      setIsNewUser(true);
      return { abort: false };
    },
    onVerified: async (result) => {
      if (!result.customerLinked) {
        setMode('profile');
        return;
      }
      const supabase = createClient();
      const { data: cust } = await supabase
        .from('customers')
        .select('first_name, last_name')
        .eq('auth_user_id', result.userId)
        .single();
      if (cust && (!cust.first_name?.trim() || !cust.last_name?.trim())) {
        router.push('/account');
        router.refresh();
        return;
      }
      router.push(redirectTo);
      router.refresh();
    },
    onNoCustomerFound: () => {
      setIsNewUser(true);
      setMode('profile');
    },
  });

  // Clear any stale session on mount
  useEffect(() => {
    if (signedOutRef.current) return;
    signedOutRef.current = true;
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }: { data: { user: unknown } }) => {
      if (user) supabase.auth.signOut();
    }).catch(() => {});
  }, []);

  // If ?phone= param + authenticated → show profile form directly
  const [checkingAuth, setCheckingAuth] = useState(!!prefillPhone);
  useEffect(() => {
    if (!prefillPhone) {
      setCheckingAuth(false);
      return;
    }
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }: { data: { user: unknown } }) => {
      if (user) {
        setIsNewUser(true);
        setMode('profile');
      }
      setCheckingAuth(false);
    }).catch(() => {
      setCheckingAuth(false);
    });
  }, [prefillPhone]);

  // Sync phone OTP phase → mode
  useEffect(() => {
    if (otp.phase === 'otp' && mode === 'phone') setMode('otp');
  }, [otp.phase, mode]);

  // Auto-focus OTP input
  useEffect(() => {
    if (mode === 'otp') {
      requestAnimationFrame(() => otpInputRef.current?.focus());
    }
  }, [mode]);

  // --- Error rendering ---
  const renderError = (): ReactNode => {
    if (jsxError) return jsxError;

    const err = otp.error;
    if (!err) return null;

    switch (err) {
      case AUTH_ERRORS.STAFF_PHONE:
        return (
          <>
            This phone number is linked to a staff account.{' '}
            <Link href="/login" className="font-medium text-accent-brand hover:text-accent-ui underline">
              Sign in as staff
            </Link>{' '}
            instead, or use a different number.
          </>
        );
      case AUTH_ERRORS.PHONE_ALREADY_LINKED:
        return (
          <>
            This phone number is already linked to another account.
            <span className="mt-1 block text-xs text-site-text-dim">
              Not your account? Call or text us for help.
            </span>
          </>
        );
      default:
        return err;
    }
  };

  const isLoading = otp.loading;
  const currentError = renderError();

  // --- Forms ---
  const phoneForm = useForm<PhoneOtpSendInput>({
    resolver: formResolver(phoneOtpSendSchema),
    defaultValues: { phone: prefillPhone },
  });

  const otpForm = useForm<PhoneOtpVerifyInput>({
    resolver: formResolver(phoneOtpVerifySchema),
    defaultValues: { phone: '', code: '' },
  });

  const profileForm = useForm<ProfileInput>({
    resolver: formResolver(profileSchema),
  });

  // --- Phone handlers ---
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

  const handleProfileSubmit = async (data: ProfileInput) => {
    setProfileLoading(true);
    setJsxError(null);

    const fallbackTimer = setTimeout(() => {
      setProfileLoading(false);
      setJsxError('Something went wrong. Please try again.');
    }, 15000);

    try {
      const result = await linkAccount({
        first_name: data.first_name,
        last_name: data.last_name,
        email: data.email || undefined,
        phone: otp.otpPhone || prefillPhone,
      });

      if (!result.success) {
        if (result.error === 'SESSION_EXPIRED') {
          setJsxError('Your session has expired. Please start over.');
          setMode('phone');
        } else if (result.error === 'STAFF_ACCOUNT') {
          setJsxError(
            <>
              This email is used for a staff account. Please use a different email, or{' '}
              <Link href="/login" className="font-medium text-accent-brand hover:text-accent-ui underline">
                sign in as staff
              </Link>
              .
            </>
          );
        } else {
          setJsxError('Something went wrong creating your account. Please try again.');
        }
        return;
      }

      router.push(redirectTo);
      router.refresh();
    } catch {
      setJsxError('Something went wrong. Please try again.');
    } finally {
      clearTimeout(fallbackTimer);
      setProfileLoading(false);
    }
  };

  // OTP code ref merge for auto-focus
  const { ref: otpCodeRef, ...otpCodeField } = otpForm.register('code');

  // --- Heading text ---
  const headingText = mode === 'profile'
    ? (isNewUser ? 'Create Your Account' : 'Complete Your Profile')
    : businessInfo?.name ? `Welcome to ${businessInfo.name}` : '';

  // Business name initials for logo (empty while loading — no flash)
  const businessInitials = businessInfo?.name
    ? businessInfo.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : '';

  if (checkingAuth) {
    return (
      <section className="flex items-center justify-center py-12 sm:py-16">
        <Spinner size="lg" />
      </section>
    );
  }

  return (
    <section className="flex items-center justify-center py-12 sm:py-16">
      <div className="w-full max-w-md space-y-6 px-4">
        {/* Business Logo/Icon + Heading */}
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent-brand/10 border border-accent-brand/30 text-xl font-bold text-accent-brand">
            {businessInitials}
          </div>
          <h1 className="mt-4 text-2xl font-bold text-site-text">
            {headingText}
          </h1>
        </div>

        {/* Card Container */}
        <div className="rounded-2xl bg-brand-surface border border-site-border p-8">
          {sessionExpired && mode === 'phone' && (
            <div className="mb-5 rounded-md border border-amber-800 bg-amber-950 p-3 text-sm text-amber-200">
              Your session has expired. Please sign in again.
            </div>
          )}
          {currentError && (
            <div className="mb-5 rounded-md bg-red-950 p-3 text-sm text-red-300">
              {currentError}
            </div>
          )}

          {/* ===== PHONE ENTRY ===== */}
          {mode === 'phone' && (
            <form onSubmit={phoneForm.handleSubmit(handleSendOtp)} className="space-y-5">
              <FormField
                label="Mobile"
                required
                error={phoneForm.formState.errors.phone?.message}
                htmlFor="phone"
              >
                <Input
                  id="phone"
                  type="tel"
                  autoComplete="tel"
                  autoFocus={!prefillPhone}
                  placeholder="(310) 555-1234"
                  className="text-base sm:text-sm"
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
                disabled={isLoading}
                autoFocus={!!prefillPhone}
                className="site-btn-primary w-full py-3 text-sm font-semibold transition-all duration-200 hover:shadow-lg"
              >
                {isLoading ? <Spinner size="sm" /> : 'Continue'}
              </Button>
            </form>
          )}

          {/* ===== PHONE OTP VERIFICATION ===== */}
          {mode === 'otp' && (
            <form onSubmit={otpForm.handleSubmit(handleVerifyOtp)} className="space-y-5">
              <div className="text-center">
                <p className="text-sm font-medium text-accent-brand">
                  {isNewUser ? 'Let\u2019s create your account!' : 'Welcome back!'}
                </p>
                <p className="mt-1 text-sm text-site-text-muted">
                  We sent a 6-digit code to <span className="font-medium text-site-text">{otp.otpPhone}</span>
                </p>
              </div>

              <FormField
                label="Verification code"
                required
                error={otpForm.formState.errors.code?.message}
                htmlFor="otp-code"
              >
                <Input
                  id="otp-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="000000"
                  className="text-center text-lg tracking-[0.3em] text-base sm:text-sm"
                  {...otpCodeField}
                  ref={(el) => {
                    otpCodeRef(el);
                    otpInputRef.current = el;
                  }}
                />
              </FormField>

              <Button
                type="submit"
                disabled={isLoading}
                className="site-btn-primary w-full py-3 text-sm font-semibold transition-all duration-200 hover:shadow-lg"
              >
                {isLoading ? <Spinner size="sm" /> : 'Verify'}
              </Button>

              <div className="flex items-center justify-between text-sm">
                <button
                  type="button"
                  onClick={() => {
                    setMode('phone');
                    setJsxError(null);
                    otp.resetToPhone();
                    otpForm.reset();
                  }}
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

          {/* ===== PROFILE COMPLETION (new customers / voice-agent customers) ===== */}
          {mode === 'profile' && (
            <form onSubmit={profileForm.handleSubmit(handleProfileSubmit)} className="space-y-5">
              {/* Phone read-only (only show if we have a phone) */}
              {(otp.otpPhone || prefillPhone) && (
                <FormField label="Mobile" htmlFor="profile-phone">
                  <Input
                    id="profile-phone"
                    value={otp.otpPhone || prefillPhone}
                    readOnly
                    className="bg-brand-dark text-site-text-muted text-base sm:text-sm"
                  />
                </FormField>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  label="First Name"
                  required
                  error={profileForm.formState.errors.first_name?.message}
                  htmlFor="profile-first-name"
                >
                  <Input
                    id="profile-first-name"
                    autoFocus
                    placeholder="John"
                    className="text-base sm:text-sm"
                    {...profileForm.register('first_name')}
                  />
                </FormField>

                <FormField
                  label="Last Name"
                  required
                  error={profileForm.formState.errors.last_name?.message}
                  htmlFor="profile-last-name"
                >
                  <Input
                    id="profile-last-name"
                    placeholder="Doe"
                    className="text-base sm:text-sm"
                    {...profileForm.register('last_name')}
                  />
                </FormField>
              </div>

              <FormField
                label="Email"
                error={profileForm.formState.errors.email?.message}
                htmlFor="profile-email"
              >
                <Input
                  id="profile-email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  className="text-base sm:text-sm"
                  {...profileForm.register('email')}
                />
              </FormField>

              <Button
                type="submit"
                disabled={profileLoading}
                className="site-btn-primary w-full py-3 text-sm font-semibold transition-all duration-200 hover:shadow-lg"
              >
                {profileLoading ? <Spinner size="sm" /> : 'Complete Sign Up'}
              </Button>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
