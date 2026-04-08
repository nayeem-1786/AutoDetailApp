'use client';

import { useState, useEffect, useRef, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useForm } from 'react-hook-form';
import { formResolver } from '@/lib/utils/form';
import {
  loginSchema,
  phoneOtpSendSchema,
  phoneOtpVerifySchema,
  type LoginInput,
  type PhoneOtpSendInput,
  type PhoneOtpVerifyInput,
} from '@/lib/utils/validation';
import { formatPhoneInput } from '@/lib/utils/format';
import { useBusinessInfo } from '@/lib/hooks/use-business-info';
import { usePhoneOtp } from '@/lib/hooks/usePhoneOtp';
import { useEmailAuth } from '@/lib/hooks/useEmailAuth';
import { useCustomerLink } from '@/lib/hooks/useCustomerLink';
import { AUTH_ERRORS } from '@/lib/auth/auth-errors';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import { Spinner } from '@/components/ui/spinner';

type AuthMode = 'phone' | 'otp' | 'email';

export default function CustomerSignInPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect') || '/account';
  const reason = searchParams.get('reason');
  const sessionExpired = reason === 'session_expired';
  const prefillPhone = searchParams.get('phone') || '';
  const { info: businessInfo } = useBusinessInfo();
  const [mode, setMode] = useState<AuthMode>('phone');
  const [jsxError, setJsxError] = useState<ReactNode | null>(null);
  const [forgotMode, setForgotMode] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetSent, setResetSent] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const signedOutRef = useRef(false);
  const otpInputRef = useRef<HTMLInputElement>(null);

  const { checkExists } = useCustomerLink();

  // --- Phone OTP hook ---
  const otp = usePhoneOtp({
    mode: 'sign-in',
    onBeforeSend: async (phone) => {
      const check = await checkExists({ phone });
      if (!check.exists) return { abort: true, error: AUTH_ERRORS.PHONE_NOT_FOUND };
      return { abort: false };
    },
    onVerified: async (result) => {
      if (!result.customerLinked) {
        router.push(`/signup?phone=${encodeURIComponent(result.phone)}`);
        return;
      }
      // Check for incomplete profile (voice-agent customers)
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
    onNoCustomerFound: (phone) => {
      router.push(`/signup?phone=${encodeURIComponent(phone)}`);
    },
  });

  // --- Email auth hook ---
  const emailAuth = useEmailAuth({
    onSuccess: async () => {
      router.push(redirectTo);
      router.refresh();
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

  // Sync OTP phase → mode
  useEffect(() => {
    if (otp.phase === 'otp' && mode !== 'otp') setMode('otp');
  }, [otp.phase, mode]);

  // Auto-focus OTP input
  useEffect(() => {
    if (mode === 'otp') {
      requestAnimationFrame(() => otpInputRef.current?.focus());
    }
  }, [mode]);

  // Map hook error strings → JSX with links
  const renderError = (): ReactNode => {
    // Check JSX error first (for forgot password errors)
    if (jsxError) return jsxError;

    const err = mode === 'email' ? emailAuth.error : otp.error;
    if (!err) return null;

    switch (err) {
      case AUTH_ERRORS.PHONE_NOT_FOUND:
        return (
          <>
            We couldn&apos;t find an account with that phone number.{' '}
            <Link href="/signup" className="font-medium text-accent-brand hover:text-accent-ui underline">
              Create a new account
            </Link>{' '}
            to get started.
          </>
        );
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
      case AUTH_ERRORS.INVALID_CREDENTIALS:
        return (
          <>
            Incorrect email or password. Please try again, or{' '}
            <Link href="/signup" className="font-medium text-accent-brand hover:text-accent-ui underline">
              create a new account
            </Link>
            .
          </>
        );
      case AUTH_ERRORS.STAFF_EMAIL:
        return (
          <>
            This email is linked to a staff account.{' '}
            <Link href="/login" className="font-medium text-accent-brand hover:text-accent-ui underline">
              Sign in as staff
            </Link>{' '}
            instead, or use a different email.
          </>
        );
      case AUTH_ERRORS.NO_CUSTOMER:
        return (
          <>
            We couldn&apos;t find a customer account with that email.{' '}
            <Link href="/signup" className="font-medium text-accent-brand hover:text-accent-ui underline">
              Create a new account
            </Link>{' '}
            to get started.
          </>
        );
      default:
        return err;
    }
  };

  const isLoading = mode === 'email' ? emailAuth.loading : otp.loading;
  const currentError = renderError();

  // Phone form
  const phoneForm = useForm<PhoneOtpSendInput>({
    resolver: formResolver(phoneOtpSendSchema),
    defaultValues: { phone: prefillPhone },
  });

  // OTP form
  const otpForm = useForm<PhoneOtpVerifyInput>({
    resolver: formResolver(phoneOtpVerifySchema),
    defaultValues: { phone: '', code: '' },
  });

  // Email form
  const emailForm = useForm<LoginInput>({
    resolver: formResolver(loginSchema),
  });

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

  const handleEmailSubmit = async (data: LoginInput) => {
    setJsxError(null);
    await emailAuth.signIn(data.email, data.password);
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setJsxError(null);

    if (!resetEmail.trim()) {
      setJsxError('Please enter your email address.');
      return;
    }

    setResetLoading(true);

    const supabase = createClient();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(resetEmail, {
      redirectTo: `${window.location.origin}/auth/callback?next=/signin/reset-password`,
    });

    if (resetError) {
      if (resetError.message.includes('rate') || resetError.message.includes('too many')) {
        setJsxError('Too many attempts. Please wait a few minutes and try again.');
      } else {
        setJsxError('Something went wrong. Please check your email address and try again.');
      }
      setResetLoading(false);
      return;
    }

    setResetSent(true);
    setResetLoading(false);
  };

  // Destructure register to merge refs for auto-focus
  const { ref: otpCodeRef, ...otpCodeField } = otpForm.register('code');

  return (
    <section className="flex items-center justify-center py-12 sm:py-16">
      <div className="w-full max-w-md space-y-6 px-4">
        {/* Business Logo/Icon + Heading */}
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent-brand/10 border border-accent-brand/30 text-xl font-bold text-accent-brand">
            SD
          </div>
          <h1 className="mt-4 text-2xl font-bold text-site-text">
            Welcome to {businessInfo?.name || 'Our Portal'}
          </h1>
        </div>

        {/* Card Container */}
        <div className="rounded-2xl bg-brand-surface border border-site-border p-8">
          {sessionExpired && (
            <div className="mb-5 rounded-md border border-amber-800 bg-amber-950 p-3 text-sm text-amber-200">
              Your session has expired. Please sign in again.
            </div>
          )}
          {currentError && (
            <div className="mb-5 rounded-md bg-red-950 p-3 text-sm text-red-300">
              {currentError}
            </div>
          )}

          {/* Phone Input Mode */}
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

              {/* Divider */}
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-site-border" />
                <span className="text-xs font-medium text-site-text-dim">OR</span>
                <div className="h-px flex-1 bg-site-border" />
              </div>

              <button
                type="button"
                onClick={() => {
                  setMode('email');
                  setJsxError(null);
                  otp.resetError();
                }}
                className="w-full rounded-full border border-site-border bg-brand-dark px-4 py-2 text-sm font-medium text-site-text-secondary transition-colors hover:bg-site-border-light"
              >
                Sign in with email
              </button>
            </form>
          )}

          {/* OTP Verification Mode */}
          {mode === 'otp' && (
            <form onSubmit={otpForm.handleSubmit(handleVerifyOtp)} className="space-y-5">
              <div className="text-center">
                <p className="text-sm text-site-text-muted">
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
                  className="text-center text-lg tracking-[0.3em]"
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

          {/* Email Sign-in Mode */}
          {mode === 'email' && !forgotMode && (
            <form onSubmit={emailForm.handleSubmit(handleEmailSubmit)} className="space-y-5">
              <FormField
                label="Email"
                required
                error={emailForm.formState.errors.email?.message}
                htmlFor="email"
              >
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  {...emailForm.register('email')}
                />
              </FormField>

              <FormField
                label="Password"
                required
                error={emailForm.formState.errors.password?.message}
                htmlFor="password"
              >
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  {...emailForm.register('password')}
                />
              </FormField>

              <Button
                type="submit"
                disabled={isLoading}
                className="site-btn-primary w-full py-3 text-sm font-semibold transition-all duration-200 hover:shadow-lg"
              >
                {isLoading ? <Spinner size="sm" /> : 'Sign In'}
              </Button>

              <button
                type="button"
                onClick={() => {
                  setForgotMode(true);
                  setJsxError(null);
                  emailAuth.resetError();
                }}
                className="block w-full text-center text-sm text-site-text-muted hover:text-accent-ui transition-colors"
              >
                Forgot password?
              </button>

              {/* Divider */}
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-site-border" />
                <span className="text-xs font-medium text-site-text-dim">OR</span>
                <div className="h-px flex-1 bg-site-border" />
              </div>

              <button
                type="button"
                onClick={() => {
                  setMode('phone');
                  setJsxError(null);
                  emailAuth.resetError();
                }}
                className="w-full rounded-full border border-site-border bg-brand-dark px-4 py-2 text-sm font-medium text-site-text-secondary transition-colors hover:bg-site-border-light"
              >
                Sign in with phone
              </button>
            </form>
          )}

          {/* Forgot Password Mode */}
          {mode === 'email' && forgotMode && (
            <div className="space-y-5">
              {resetSent ? (
                <div className="space-y-4">
                  <div className="rounded-md bg-green-950 border border-green-800 p-3 text-sm text-green-200">
                    Check your email for a reset link. It may take a minute to arrive.
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setForgotMode(false);
                      setResetSent(false);
                      setResetEmail('');
                      setJsxError(null);
                    }}
                    className="text-sm text-site-text-muted hover:text-site-text"
                  >
                    &larr; Back to sign in
                  </button>
                </div>
              ) : (
                <form onSubmit={handleForgotPassword} className="space-y-5">
                  <p className="text-sm text-site-text-muted">
                    Enter your email address and we&apos;ll send you a link to reset your password.
                  </p>

                  <FormField label="Email" required htmlFor="reset-email">
                    <Input
                      id="reset-email"
                      type="email"
                      autoComplete="email"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      placeholder="you@example.com"
                    />
                  </FormField>

                  <Button
                    type="submit"
                    disabled={resetLoading}
                    className="site-btn-primary w-full py-3 text-sm font-semibold transition-all duration-200 hover:shadow-lg"
                  >
                    {resetLoading ? <Spinner size="sm" /> : 'Send Reset Link'}
                  </Button>

                  <button
                    type="button"
                    onClick={() => {
                      setForgotMode(false);
                      setResetEmail('');
                      setJsxError(null);
                    }}
                    className="block text-sm text-site-text-muted hover:text-site-text"
                  >
                    &larr; Back to sign in
                  </button>
                </form>
              )}
            </div>
          )}
        </div>

        {/* Sign up link */}
        <p className="text-center text-sm text-site-text-muted">
          Don&apos;t have an account?{' '}
          <Link
            href="/signup"
            className="font-medium text-accent-brand hover:text-accent-ui transition-colors"
          >
            Sign up
          </Link>
        </p>
      </div>
    </section>
  );
}
