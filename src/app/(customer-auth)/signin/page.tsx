'use client';

import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
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
import { formatPhoneInput, normalizePhone } from '@/lib/utils/format';
import { useBusinessInfo } from '@/lib/hooks/use-business-info';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import { Spinner } from '@/components/ui/spinner';

type AuthMode = 'phone' | 'otp' | 'email';

/** Check if phone/email already exists in the customers table */
async function checkExists(params: { phone?: string; email?: string }): Promise<{
  exists: boolean;
  hasAuthAccount: boolean;
}> {
  try {
    const qs = new URLSearchParams();
    if (params.phone) qs.set('phone', params.phone);
    if (params.email) qs.set('email', params.email);
    const res = await fetch(`/api/customer/check-exists?${qs.toString()}`);
    if (!res.ok) return { exists: false, hasAuthAccount: false };
    return await res.json();
  } catch {
    return { exists: false, hasAuthAccount: false };
  }
}

export default function CustomerSignInPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect') || '/account';
  const reason = searchParams.get('reason');
  const sessionExpired = reason === 'session_expired';
  const prefillPhone = searchParams.get('phone') || '';
  const { info: businessInfo } = useBusinessInfo();
  const [mode, setMode] = useState<AuthMode>('phone');
  const [error, setError] = useState<ReactNode | null>(null);
  const [loading, setLoading] = useState(false);
  const [otpPhone, setOtpPhone] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [forgotMode, setForgotMode] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetSent, setResetSent] = useState(false);
  const signedOutRef = useRef(false);
  const otpInputRef = useRef<HTMLInputElement>(null);

  // Clear any stale session on mount — prevents cross-surface cookie
  // conflicts (e.g. admin session blocking customer OTP verification).
  useEffect(() => {
    if (signedOutRef.current) return;
    signedOutRef.current = true;
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }: { data: { session: unknown } }) => {
      if (session) supabase.auth.signOut();
    }).catch(() => {});
  }, []);

  // Auto-focus OTP input when entering verification mode
  useEffect(() => {
    if (mode === 'otp') {
      // Small delay to ensure the input is rendered
      requestAnimationFrame(() => otpInputRef.current?.focus());
    }
  }, [mode]);

  // Cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

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

  const sendOtp = async (data: PhoneOtpSendInput) => {
    setLoading(true);
    setError(null);

    const e164 = normalizePhone(data.phone);
    if (!e164) {
      setError('Please enter a valid 10-digit phone number.');
      setLoading(false);
      return;
    }

    // Pre-check: verify the phone exists before sending OTP
    const phoneCheck = await checkExists({ phone: data.phone });
    if (!phoneCheck.exists) {
      setError(
        <>
          We couldn&apos;t find an account with that phone number.{' '}
          <Link href="/signup" className="font-medium text-accent-brand hover:text-accent-ui underline">
            Create a new account
          </Link>{' '}
          to get started.
        </>
      );
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const { error: otpError } = await supabase.auth.signInWithOtp({ phone: e164 });

    if (otpError) {
      if (otpError.message.includes('rate') || otpError.message.includes('too many')) {
        setError('Too many attempts. Please wait a few minutes and try again.');
      } else {
        setError('Something went wrong sending your code. Please try again.');
      }
      setLoading(false);
      return;
    }

    setOtpPhone(data.phone);
    otpForm.setValue('phone', data.phone);
    setResendCooldown(60);
    setMode('otp');
    setLoading(false);
  };

  const verifyOtp = useCallback(async (data: PhoneOtpVerifyInput) => {
    setLoading(true);
    setError(null);

    // Fallback timeout — if anything hangs, clear spinner after 15s
    const fallbackTimer = setTimeout(() => {
      setLoading(false);
      setError('Something went wrong. Please try again.');
    }, 15000);

    try {
      const e164 = normalizePhone(data.phone);
      if (!e164) {
        setError('Please enter a valid 10-digit phone number.');
        return;
      }

      const supabase = createClient();
      const { error: verifyError } = await supabase.auth.verifyOtp({
        phone: e164,
        token: data.code,
        type: 'sms',
      });

      if (verifyError) {
        if (verifyError.message.includes('expired')) {
          setError('Your verification code has expired. Please request a new one.');
        } else if (verifyError.message.includes('invalid') || verifyError.message.includes('incorrect')) {
          setError('That code didn\u2019t work. Please check and try again, or request a new code.');
        } else if (verifyError.message.includes('rate') || verifyError.message.includes('too many')) {
          setError('Too many attempts. Please wait a few minutes and try again.');
        } else {
          setError('Something went wrong verifying your code. Please try again.');
        }
        return;
      }

      // Staff guard check
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const { data: emp } = await supabase
          .from('employees')
          .select('id')
          .eq('auth_user_id', user.id)
          .single();

        if (emp) {
          await supabase.auth.signOut();
          setError(
            <>
              This phone number is linked to a staff account.{' '}
              <Link href="/login" className="font-medium text-accent-brand hover:text-accent-ui underline">
                Sign in as staff
              </Link>{' '}
              instead, or use a different number.
            </>
          );
          return;
        }

        // Check for customer record by auth_user_id first
        const { data: cust } = await supabase
          .from('customers')
          .select('id')
          .eq('auth_user_id', user.id)
          .single();

        if (!cust) {
          // No linked customer — try to link via API (bypasses RLS)
          const linkRes = await fetch('/api/customer/link-by-phone', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: e164 }),
          });

          const linkData = await linkRes.json();

          if (linkData.success) {
            // Successfully linked or already linked — continue to account
            router.push(redirectTo);
            router.refresh();
            return;
          }

          if (linkData.error === 'This phone number is already linked to another account') {
            await supabase.auth.signOut();
            setError(
              <>
                This phone number is already linked to another account.
                <span className="mt-1 block text-xs text-site-text-dim">
                  Not your account? Call or text us for help.
                </span>
              </>
            );
            return;
          }

          if (!linkData.found) {
            // No customer record — redirect to signup with phone pre-filled
            const phoneParam = encodeURIComponent(data.phone);
            router.push(`/signup?phone=${phoneParam}`);
            return;
          }

          // Other error
          setError('Something went wrong linking your account. Please try again. If the problem continues, contact us.');
          return;
        }
      }

      router.push(redirectTo);
      router.refresh();
    } catch (err) {
      console.error('OTP verification error:', err);
      setError('Something went wrong. Please try again.');
    } finally {
      clearTimeout(fallbackTimer);
      setLoading(false);
    }
  }, [redirectTo, router]);

  const resendOtp = async () => {
    if (resendCooldown > 0) return;
    setError(null);

    const e164 = normalizePhone(otpPhone);
    if (!e164) return;

    const supabase = createClient();
    const { error: otpError } = await supabase.auth.signInWithOtp({ phone: e164 });

    if (otpError) {
      if (otpError.message.includes('rate') || otpError.message.includes('too many')) {
        setError('Too many attempts. Please wait a few minutes and try again.');
      } else {
        setError('Something went wrong sending your code. Please try again.');
      }
      return;
    }

    setResendCooldown(60);
  };

  const onEmailSubmit = async (data: LoginInput) => {
    setLoading(true);
    setError(null);

    const fallbackTimer = setTimeout(() => {
      setLoading(false);
      setError('Something went wrong. Please try again.');
    }, 15000);

    try {
      const supabase = createClient();

      const { error: authError } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });

      if (authError) {
        if (authError.message.includes('Invalid login') || authError.message.includes('invalid')) {
          setError(
            <>
              Incorrect email or password. Please try again, or{' '}
              <Link href="/signup" className="font-medium text-accent-brand hover:text-accent-ui underline">
                create a new account
              </Link>
              .
            </>
          );
        } else if (authError.message.includes('rate') || authError.message.includes('too many')) {
          setError('Too many attempts. Please wait a few minutes and try again.');
        } else {
          setError('Something went wrong signing you in. Please try again.');
        }
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const { data: emp } = await supabase
          .from('employees')
          .select('id')
          .eq('auth_user_id', user.id)
          .single();

        if (emp) {
          await supabase.auth.signOut();
          setError(
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

        const { data: cust } = await supabase
          .from('customers')
          .select('id')
          .eq('auth_user_id', user.id)
          .single();

        if (!cust) {
          await supabase.auth.signOut();
          setError(
            <>
              We couldn&apos;t find a customer account with that email.{' '}
              <Link href="/signup" className="font-medium text-accent-brand hover:text-accent-ui underline">
                Create a new account
              </Link>{' '}
              to get started.
            </>
          );
          return;
        }
      }

      router.push(redirectTo);
      router.refresh();
    } catch (err) {
      console.error('Email sign-in error:', err);
      setError('Something went wrong. Please try again.');
    } finally {
      clearTimeout(fallbackTimer);
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!resetEmail.trim()) {
      setError('Please enter your email address.');
      return;
    }

    setLoading(true);

    const supabase = createClient();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(resetEmail, {
      redirectTo: `${window.location.origin}/auth/callback?next=/signin/reset-password`,
    });

    if (resetError) {
      if (resetError.message.includes('rate') || resetError.message.includes('too many')) {
        setError('Too many attempts. Please wait a few minutes and try again.');
      } else {
        setError('Something went wrong. Please check your email address and try again.');
      }
      setLoading(false);
      return;
    }

    setResetSent(true);
    setLoading(false);
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
          {error && (
            <div className="mb-5 rounded-md bg-red-950 p-3 text-sm text-red-300">
              {error}
            </div>
          )}

          {/* Phone Input Mode */}
          {mode === 'phone' && (
            <form onSubmit={phoneForm.handleSubmit(sendOtp)} className="space-y-5">
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
                disabled={loading}
                autoFocus={!!prefillPhone}
                className="site-btn-primary w-full py-3 text-sm font-semibold transition-all duration-200 hover:shadow-lg"
              >
                {loading ? <Spinner size="sm" /> : 'Continue'}
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
                  setError(null);
                }}
                className="w-full rounded-full border border-site-border bg-brand-dark px-4 py-2 text-sm font-medium text-site-text-secondary transition-colors hover:bg-site-border-light"
              >
                Sign in with email
              </button>
            </form>
          )}

          {/* OTP Verification Mode */}
          {mode === 'otp' && (
            <form onSubmit={otpForm.handleSubmit(verifyOtp)} className="space-y-5">
              <div className="text-center">
                <p className="text-sm text-site-text-muted">
                  We sent a 6-digit code to <span className="font-medium text-site-text">{otpPhone}</span>
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
                disabled={loading}
                className="site-btn-primary w-full py-3 text-sm font-semibold transition-all duration-200 hover:shadow-lg"
              >
                {loading ? <Spinner size="sm" /> : 'Verify'}
              </Button>

              <div className="flex items-center justify-between text-sm">
                <button
                  type="button"
                  onClick={() => {
                    setMode('phone');
                    setError(null);
                    otpForm.reset();
                  }}
                  className="text-site-text-muted hover:text-site-text"
                >
                  Change number
                </button>
                <button
                  type="button"
                  onClick={resendOtp}
                  disabled={resendCooldown > 0}
                  className="text-site-text-muted hover:text-site-text disabled:text-site-text-faint"
                >
                  {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
                </button>
              </div>
            </form>
          )}

          {/* Email Sign-in Mode */}
          {mode === 'email' && !forgotMode && (
            <form onSubmit={emailForm.handleSubmit(onEmailSubmit)} className="space-y-5">
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
                disabled={loading}
                className="site-btn-primary w-full py-3 text-sm font-semibold transition-all duration-200 hover:shadow-lg"
              >
                {loading ? <Spinner size="sm" /> : 'Sign In'}
              </Button>

              <button
                type="button"
                onClick={() => {
                  setForgotMode(true);
                  setError(null);
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
                  setError(null);
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
                      setError(null);
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
                    disabled={loading}
                    className="site-btn-primary w-full py-3 text-sm font-semibold transition-all duration-200 hover:shadow-lg"
                  >
                    {loading ? <Spinner size="sm" /> : 'Send Reset Link'}
                  </Button>

                  <button
                    type="button"
                    onClick={() => {
                      setForgotMode(false);
                      setResetEmail('');
                      setError(null);
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
