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
// email → email-otp → (profile for new users) → done
type AuthMode = 'phone' | 'otp' | 'profile' | 'email' | 'email-otp';

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

  // Email OTP state
  const [emailInput, setEmailInput] = useState('');
  const [emailOtpCode, setEmailOtpCode] = useState('');
  const [emailOtpLoading, setEmailOtpLoading] = useState(false);
  const [emailOtpCooldown, setEmailOtpCooldown] = useState(0);
  const [emailOtpSentTo, setEmailOtpSentTo] = useState('');

  const signedOutRef = useRef(false);
  const otpInputRef = useRef<HTMLInputElement>(null);
  const emailOtpInputRef = useRef<HTMLInputElement>(null);

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

  // Auto-focus OTP inputs
  useEffect(() => {
    if (mode === 'otp') {
      requestAnimationFrame(() => otpInputRef.current?.focus());
    }
    if (mode === 'email-otp') {
      requestAnimationFrame(() => emailOtpInputRef.current?.focus());
    }
  }, [mode]);

  // Email OTP cooldown timer
  useEffect(() => {
    if (emailOtpCooldown <= 0) return;
    const t = setTimeout(() => setEmailOtpCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [emailOtpCooldown]);

  // --- Email OTP handlers ---
  const handleEmailOtpSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setJsxError(null);

    const trimmed = emailInput.trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setJsxError('Please enter a valid email address.');
      return;
    }

    setEmailOtpLoading(true);

    // Check if this email belongs to an existing customer
    const check = await checkExists({ email: trimmed });
    setIsNewUser(!check.exists);

    const supabase = createClient();
    const { error: otpError } = await supabase.auth.signInWithOtp({ email: trimmed });

    if (otpError) {
      if (otpError.message.includes('rate') || otpError.message.includes('too many')) {
        setJsxError(AUTH_ERRORS.OTP_RATE_LIMITED);
      } else {
        setJsxError(AUTH_ERRORS.OTP_SEND_FAILED);
      }
      setEmailOtpLoading(false);
      return;
    }

    setEmailOtpSentTo(trimmed);
    setEmailOtpCooldown(60);
    setMode('email-otp');
    setEmailOtpLoading(false);
  };

  const handleEmailOtpVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setJsxError(null);

    if (!emailOtpCode || emailOtpCode.length !== 6) {
      setJsxError('Please enter the 6-digit code.');
      return;
    }

    setEmailOtpLoading(true);

    try {
      const supabase = createClient();
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: emailOtpSentTo,
        token: emailOtpCode,
        type: 'email',
      });

      if (verifyError) {
        if (verifyError.message.includes('expired')) {
          setJsxError(AUTH_ERRORS.OTP_EXPIRED);
        } else if (verifyError.message.includes('invalid') || verifyError.message.includes('incorrect')) {
          setJsxError(AUTH_ERRORS.OTP_INVALID);
        } else if (verifyError.message.includes('rate') || verifyError.message.includes('too many')) {
          setJsxError(AUTH_ERRORS.OTP_RATE_LIMITED);
        } else {
          setJsxError(AUTH_ERRORS.OTP_VERIFY_FAILED);
        }
        return;
      }

      // Post-verify: staff guard + customer check (same as phone OTP)
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setJsxError(AUTH_ERRORS.OTP_VERIFY_FAILED);
        return;
      }

      // Staff guard
      const { data: emp } = await supabase
        .from('employees')
        .select('id')
        .eq('auth_user_id', user.id)
        .single();

      if (emp) {
        await supabase.auth.signOut();
        setJsxError(
          <>
            This email is linked to a staff account.{' '}
            <Link href="/login" className="font-medium text-accent-brand hover:text-accent-ui underline">
              Sign in as staff
            </Link>{' '}
            instead, or use a different email.
          </>
        );
        return;
      }

      // Customer check
      const { data: cust } = await supabase
        .from('customers')
        .select('id, first_name, last_name')
        .eq('auth_user_id', user.id)
        .single();

      if (cust) {
        // Existing customer — check profile completeness
        if (!cust.first_name?.trim() || !cust.last_name?.trim()) {
          router.push('/account');
          router.refresh();
          return;
        }
        router.push(redirectTo);
        router.refresh();
        return;
      }

      // No customer record — show profile form
      setIsNewUser(true);
      setMode('profile');
    } catch {
      setJsxError(AUTH_ERRORS.OTP_VERIFY_FAILED);
    } finally {
      setEmailOtpLoading(false);
    }
  };

  const handleEmailOtpResend = async () => {
    if (emailOtpCooldown > 0) return;
    setJsxError(null);
    setEmailOtpCode('');

    const supabase = createClient();
    const { error: otpError } = await supabase.auth.signInWithOtp({ email: emailOtpSentTo });

    if (otpError) {
      if (otpError.message.includes('rate') || otpError.message.includes('too many')) {
        setJsxError(AUTH_ERRORS.OTP_RATE_LIMITED);
      } else {
        setJsxError(AUTH_ERRORS.OTP_SEND_FAILED);
      }
      return;
    }

    setEmailOtpCooldown(60);
  };

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
        email: data.email || emailOtpSentTo || undefined,
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

              {/* Email OTP link (secondary) */}
              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setMode('email');
                    setJsxError(null);
                    otp.resetError();
                  }}
                  className="text-xs text-site-text-dim hover:text-site-text-muted transition-colors"
                >
                  Use email instead
                </button>
              </div>
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

          {/* ===== EMAIL ENTRY ===== */}
          {mode === 'email' && (
            <form onSubmit={handleEmailOtpSend} className="space-y-5">
              <FormField
                label="Email"
                required
                htmlFor="email-otp-input"
              >
                <Input
                  id="email-otp-input"
                  type="email"
                  autoComplete="email"
                  autoFocus
                  placeholder="you@example.com"
                  className="text-base sm:text-sm"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                />
              </FormField>

              <Button
                type="submit"
                disabled={emailOtpLoading}
                className="site-btn-primary w-full py-3 text-sm font-semibold transition-all duration-200 hover:shadow-lg"
              >
                {emailOtpLoading ? <Spinner size="sm" /> : 'Continue'}
              </Button>

              {/* Back to phone */}
              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setMode('phone');
                    setJsxError(null);
                  }}
                  className="text-xs text-site-text-dim hover:text-site-text-muted transition-colors"
                >
                  Use phone number instead
                </button>
              </div>
            </form>
          )}

          {/* ===== EMAIL OTP VERIFICATION ===== */}
          {mode === 'email-otp' && (
            <form onSubmit={handleEmailOtpVerify} className="space-y-5">
              <div className="text-center">
                <p className="text-sm font-medium text-accent-brand">
                  {isNewUser ? 'Let\u2019s create your account!' : 'Welcome back!'}
                </p>
                <p className="mt-1 text-sm text-site-text-muted">
                  We sent a 6-digit code to <span className="font-medium text-site-text">{emailOtpSentTo}</span>
                </p>
              </div>

              <FormField
                label="Verification code"
                required
                htmlFor="email-otp-code"
              >
                <Input
                  id="email-otp-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="000000"
                  className="text-center text-lg tracking-[0.3em] text-base sm:text-sm"
                  value={emailOtpCode}
                  onChange={(e) => setEmailOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  ref={emailOtpInputRef}
                />
              </FormField>

              <Button
                type="submit"
                disabled={emailOtpLoading}
                className="site-btn-primary w-full py-3 text-sm font-semibold transition-all duration-200 hover:shadow-lg"
              >
                {emailOtpLoading ? <Spinner size="sm" /> : 'Verify'}
              </Button>

              <div className="flex items-center justify-between text-sm">
                <button
                  type="button"
                  onClick={() => {
                    setMode('email');
                    setJsxError(null);
                    setEmailOtpCode('');
                  }}
                  className="text-site-text-muted hover:text-site-text"
                >
                  Change email
                </button>
                <button
                  type="button"
                  onClick={handleEmailOtpResend}
                  disabled={emailOtpCooldown > 0}
                  className="text-site-text-muted hover:text-site-text disabled:text-site-text-faint"
                >
                  {emailOtpCooldown > 0 ? `Resend in ${emailOtpCooldown}s` : 'Resend code'}
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

              {/* Email read-only (only show if we came via email OTP) */}
              {emailOtpSentTo && !otp.otpPhone && !prefillPhone && (
                <FormField label="Email" htmlFor="profile-email-readonly">
                  <Input
                    id="profile-email-readonly"
                    value={emailOtpSentTo}
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

              {/* Only show email input if user didn't come via email OTP (they already have it) */}
              {!emailOtpSentTo && (
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
              )}

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
