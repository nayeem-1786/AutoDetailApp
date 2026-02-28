'use client';

import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useForm } from 'react-hook-form';
import { formResolver } from '@/lib/utils/form';
import {
  loginSchema,
  phoneOtpSendSchema,
  phoneOtpVerifySchema,
  customerSignupSchema,
  type LoginInput,
  type PhoneOtpSendInput,
  type PhoneOtpVerifyInput,
  type CustomerSignupInput,
} from '@/lib/utils/validation';
import { formatPhoneInput, normalizePhone, formatPhone } from '@/lib/utils/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import { Spinner } from '@/components/ui/spinner';
import { LogIn, UserPlus, ArrowLeft } from 'lucide-react';
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
  businessName: string;
}

// Simplified schema for post-OTP profile completion
const otpProfileSchema = z.object({
  first_name: z.string().min(1, 'Required'),
  last_name: z.string().min(1, 'Required'),
  email: z.string().email('Invalid email address'),
});

type OtpProfileInput = z.infer<typeof otpProfileSchema>;

// --- Helpers ---

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

// --- Shared input class ---
const inputCls = 'border-site-border bg-brand-surface text-site-text placeholder:text-site-text-dim focus-visible:ring-lime text-base sm:text-sm';

// --- Sign In Flow ---

type SignInMode = 'phone' | 'otp' | 'email';

function SignInFlow({
  initialPhone,
  onSuccess,
  onSwitchToSignUp,
  businessName,
}: {
  initialPhone?: string;
  onSuccess: () => void;
  onSwitchToSignUp: () => void;
  businessName: string;
}) {
  const [mode, setMode] = useState<SignInMode>('phone');
  const [error, setError] = useState<ReactNode | null>(null);
  const [loading, setLoading] = useState(false);
  const [otpPhone, setOtpPhone] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [forgotMode, setForgotMode] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetSent, setResetSent] = useState(false);
  const otpInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus OTP input — aggressive strategy for iOS Safari
  useEffect(() => {
    if (mode === 'otp') {
      const tryFocus = () => otpInputRef.current?.focus();

      requestAnimationFrame(() => {
        tryFocus();
        requestAnimationFrame(() => {
          tryFocus();
        });
      });

      // Final fallback with delay — catches edge cases on slow iOS devices
      const timer = setTimeout(tryFocus, 300);
      return () => clearTimeout(timer);
    }
  }, [mode]);

  // Cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  const phoneForm = useForm<PhoneOtpSendInput>({
    resolver: formResolver(phoneOtpSendSchema),
    defaultValues: { phone: initialPhone || '' },
  });

  const otpForm = useForm<PhoneOtpVerifyInput>({
    resolver: formResolver(phoneOtpVerifySchema),
    defaultValues: { phone: '', code: '' },
  });

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

    const phoneCheck = await checkExists({ phone: data.phone });
    if (!phoneCheck.exists) {
      setError(
        <>
          We couldn&apos;t find an account with that phone number.{' '}
          <button
            type="button"
            onClick={onSwitchToSignUp}
            className="font-medium text-lime hover:text-lime-400 underline"
          >
            Create a new account
          </button>{' '}
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

    const e164 = normalizePhone(data.phone);
    if (!e164) {
      setError('Please enter a valid 10-digit phone number.');
      setLoading(false);
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
      setLoading(false);
      return;
    }

    // Staff guard
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
        setError('This phone number is linked to a staff account. Please use a different number.');
        setLoading(false);
        return;
      }

      // Check for customer record
      const { data: cust } = await supabase
        .from('customers')
        .select('id')
        .eq('auth_user_id', user.id)
        .single();

      if (!cust) {
        // Try to link via API
        try {
          const linkRes = await fetch('/api/customer/link-by-phone', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: e164 }),
          });

          const linkData = await linkRes.json();

          if (linkData.success) {
            await onSuccess();
            setLoading(false);
            return;
          }

          if (linkData.error === 'This phone number is already linked to another account') {
            await supabase.auth.signOut();
            setError('This phone number is already linked to another account.');
            setLoading(false);
            return;
          }

          if (!linkData.found) {
            // No customer record — switch to signup
            onSwitchToSignUp();
            return;
          }

          setError('Something went wrong linking your account. Please try again.');
          setLoading(false);
          return;
        } catch {
          setError('Something went wrong linking your account. Please try again.');
          setLoading(false);
          return;
        }
      }
    }

    await onSuccess();
    setLoading(false);
  }, [onSuccess, onSwitchToSignUp]);

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
            <button
              type="button"
              onClick={onSwitchToSignUp}
              className="font-medium text-lime hover:text-lime-400 underline"
            >
              create a new account
            </button>
            .
          </>
        );
      } else if (authError.message.includes('rate') || authError.message.includes('too many')) {
        setError('Too many attempts. Please wait a few minutes and try again.');
      } else {
        setError('Something went wrong signing you in. Please try again.');
      }
      setLoading(false);
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
        setError('This email is linked to a staff account. Please use a different email.');
        setLoading(false);
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
            <button
              type="button"
              onClick={onSwitchToSignUp}
              className="font-medium text-lime hover:text-lime-400 underline"
            >
              Create a new account
            </button>{' '}
            to get started.
          </>
        );
        setLoading(false);
        return;
      }
    }

    await onSuccess();
    setLoading(false);
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

  const { ref: otpCodeRef, ...otpCodeField } = otpForm.register('code');

  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded-md bg-red-950 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Phone Input */}
      {mode === 'phone' && (
        <form
          autoComplete="off"
          data-form-type="other"
          onSubmit={(e) => { e.preventDefault(); phoneForm.handleSubmit(sendOtp)(); }}
          className="space-y-5"
        >
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
            disabled={loading}
            className="site-btn-primary w-full py-3 text-sm font-semibold"
          >
            {loading ? <Spinner size="sm" /> : 'Continue'}
          </Button>

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-site-border" />
            <span className="text-xs font-medium text-site-text-dim">OR</span>
            <div className="h-px flex-1 bg-site-border" />
          </div>

          <button
            type="button"
            onClick={() => { setMode('email'); setError(null); }}
            className="w-full rounded-full border border-site-border bg-brand-dark px-4 py-2 text-sm font-medium text-site-text-secondary transition-colors hover:bg-site-border-light"
          >
            Use email instead
          </button>
        </form>
      )}

      {/* OTP Verification */}
      {mode === 'otp' && (
        <form onSubmit={otpForm.handleSubmit(verifyOtp)} className="space-y-5">
          <div className="text-center">
            <p className="text-sm text-site-text-muted">
              We sent a 6-digit code to <span className="font-medium text-site-text">{formatPhone(otpPhone)}</span>
            </p>
          </div>

          <FormField
            label="Verification code"
            required
            error={otpForm.formState.errors.code?.message}
            htmlFor="inline-signin-otp"
          >
            <Input
              id="inline-signin-otp"
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
            disabled={loading}
            className="site-btn-primary w-full py-3 text-sm font-semibold"
          >
            {loading ? <Spinner size="sm" /> : 'Verify'}
          </Button>

          <div className="flex items-center justify-between text-sm">
            <button
              type="button"
              onClick={() => { setMode('phone'); setError(null); otpForm.reset(); }}
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

      {/* Email Sign-in */}
      {mode === 'email' && !forgotMode && (
        <form onSubmit={emailForm.handleSubmit(onEmailSubmit)} className="space-y-5">
          <FormField
            label="Email"
            required
            error={emailForm.formState.errors.email?.message}
            htmlFor="inline-signin-email"
          >
            <Input
              id="inline-signin-email"
              type="email"
              autoComplete="email"
              autoFocus
              placeholder="you@example.com"
              className={inputCls}
              {...emailForm.register('email')}
            />
          </FormField>

          <FormField
            label="Password"
            required
            error={emailForm.formState.errors.password?.message}
            htmlFor="inline-signin-password"
          >
            <Input
              id="inline-signin-password"
              type="password"
              autoComplete="current-password"
              placeholder="Enter your password"
              className={inputCls}
              {...emailForm.register('password')}
            />
          </FormField>

          <Button
            type="submit"
            disabled={loading}
            className="site-btn-primary w-full py-3 text-sm font-semibold"
          >
            {loading ? <Spinner size="sm" /> : 'Sign In'}
          </Button>

          <button
            type="button"
            onClick={() => { setForgotMode(true); setError(null); }}
            className="block w-full text-center text-sm text-site-text-muted hover:text-lime transition-colors"
          >
            Forgot password?
          </button>

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-site-border" />
            <span className="text-xs font-medium text-site-text-dim">OR</span>
            <div className="h-px flex-1 bg-site-border" />
          </div>

          <button
            type="button"
            onClick={() => { setMode('phone'); setError(null); }}
            className="w-full rounded-full border border-site-border bg-brand-dark px-4 py-2 text-sm font-medium text-site-text-secondary transition-colors hover:bg-site-border-light"
          >
            Sign in with phone
          </button>
        </form>
      )}

      {/* Forgot Password */}
      {mode === 'email' && forgotMode && (
        <div className="space-y-5">
          {resetSent ? (
            <div className="space-y-4">
              <div className="rounded-md bg-green-950 border border-green-800 p-3 text-sm text-green-200">
                Check your email for a reset link. It may take a minute to arrive.
              </div>
              <button
                type="button"
                onClick={() => { setForgotMode(false); setResetSent(false); setResetEmail(''); setError(null); }}
                className="text-sm text-site-text-muted hover:text-site-text"
              >
                &larr; Back to sign in
              </button>
            </div>
          ) : (
            <form onSubmit={handleForgotPassword} className="space-y-5">
              <p className="text-sm text-site-text-muted">
                Enter your email and we&apos;ll send you a reset link.
              </p>

              <FormField label="Email" required htmlFor="inline-reset-email">
                <Input
                  id="inline-reset-email"
                  type="email"
                  autoComplete="email"
                  autoFocus
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  placeholder="you@example.com"
                  className={inputCls}
                />
              </FormField>

              <Button
                type="submit"
                disabled={loading}
                className="site-btn-primary w-full py-3 text-sm font-semibold"
              >
                {loading ? <Spinner size="sm" /> : 'Send Reset Link'}
              </Button>

              <button
                type="button"
                onClick={() => { setForgotMode(false); setResetEmail(''); setError(null); }}
                className="block text-sm text-site-text-muted hover:text-site-text"
              >
                &larr; Back to sign in
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

// --- Sign Up Flow ---

type SignUpMode = 'phone-otp' | 'phone-verify' | 'otp-profile' | 'full';

function SignUpFlow({
  onSuccess,
  onSwitchToSignIn,
  businessName,
}: {
  onSuccess: () => void;
  onSwitchToSignIn: (phone?: string) => void;
  businessName: string;
}) {
  const [mode, setMode] = useState<SignUpMode>('phone-otp');
  const [error, setError] = useState<ReactNode | null>(null);
  const [hint, setHint] = useState<ReactNode | null>(null);
  const [loading, setLoading] = useState(false);
  const [otpPhone, setOtpPhone] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [phoneExists, setPhoneExists] = useState(false);
  const otpInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus OTP input — aggressive strategy for iOS Safari
  useEffect(() => {
    if (mode === 'phone-verify') {
      const tryFocus = () => otpInputRef.current?.focus();

      requestAnimationFrame(() => {
        tryFocus();
        requestAnimationFrame(() => {
          tryFocus();
        });
      });

      // Final fallback with delay — catches edge cases on slow iOS devices
      const timer = setTimeout(tryFocus, 300);
      return () => clearTimeout(timer);
    }
  }, [mode]);

  // Cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  const phoneForm = useForm<PhoneOtpSendInput>({
    resolver: formResolver(phoneOtpSendSchema),
  });

  const otpVerifyForm = useForm<PhoneOtpVerifyInput>({
    resolver: formResolver(phoneOtpVerifySchema),
    defaultValues: { phone: '', code: '' },
  });

  const otpProfileForm = useForm<OtpProfileInput>({
    resolver: formResolver(otpProfileSchema),
  });

  const fullForm = useForm<CustomerSignupInput>({
    resolver: formResolver(customerSignupSchema),
  });

  // Phone OTP: send code
  const sendOtp = async (data: PhoneOtpSendInput) => {
    setLoading(true);
    setError(null);
    setHint(null);

    const e164 = normalizePhone(data.phone);
    if (!e164) {
      setError('Please enter a valid 10-digit phone number.');
      setLoading(false);
      return;
    }

    const phoneCheck = await checkExists({ phone: data.phone });
    if (phoneCheck.exists) {
      setPhoneExists(true);
      setError('This phone number is already linked to an account.');
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
    otpVerifyForm.setValue('phone', data.phone);
    setResendCooldown(60);
    setMode('phone-verify');
    setLoading(false);
  };

  // Sign In Instead: send OTP directly and skip to verification
  const handleSignInInstead = async () => {
    const phone = phoneForm.getValues('phone');
    setLoading(true);
    setError(null);
    setHint(null);

    const e164 = normalizePhone(phone);
    if (!e164) {
      setError('Please enter a valid 10-digit phone number.');
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const { error: otpError } = await supabase.auth.signInWithOtp({ phone: e164 });

    if (otpError) {
      if (otpError.message.includes('rate') || otpError.message.includes('too many')) {
        setError('Too many attempts. Please wait a few minutes and try again.');
      } else {
        setError('Failed to send verification code. Please try again.');
      }
      setLoading(false);
      return;
    }

    setOtpPhone(phone);
    otpVerifyForm.setValue('phone', phone);
    setResendCooldown(60);
    setError(null);
    setMode('phone-verify');
    setLoading(false);
  };

  // Verify OTP
  const verifyOtp = async (data: PhoneOtpVerifyInput) => {
    setLoading(true);
    setError(null);
    setHint(null);

    const e164 = normalizePhone(data.phone);
    if (!e164) {
      setError('Please enter a valid 10-digit phone number.');
      setLoading(false);
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
      setLoading(false);
      return;
    }

    // Sign-in-instead path: do sign-in-style verification then call success
    if (phoneExists) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: emp } = await supabase
          .from('employees')
          .select('id')
          .eq('auth_user_id', user.id)
          .single();
        if (emp) {
          await supabase.auth.signOut();
          setError('This phone number is linked to a staff account. Please use a different number.');
          setLoading(false);
          return;
        }

        const { data: cust } = await supabase
          .from('customers')
          .select('id')
          .eq('auth_user_id', user.id)
          .single();
        if (!cust) {
          try {
            const linkRes = await fetch('/api/customer/link-by-phone', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ phone: normalizePhone(data.phone) }),
            });
            const linkData = await linkRes.json();
            if (linkData.success) {
              onSuccess();
              return;
            }
            if (linkData.error === 'This phone number is already linked to another account') {
              await supabase.auth.signOut();
              setError('This phone number is already linked to another account.');
              setLoading(false);
              return;
            }
            if (!linkData.found) {
              onSwitchToSignIn();
              return;
            }
            setError('Something went wrong linking your account. Please try again.');
            setLoading(false);
            return;
          } catch {
            setError('Something went wrong linking your account. Please try again.');
            setLoading(false);
            return;
          }
        }
      }
      onSuccess();
      return;
    }

    setMode('otp-profile');
    setLoading(false);
  };

  const resendOtp = async () => {
    if (resendCooldown > 0) return;
    setError(null);
    setHint(null);

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

  // Post-OTP profile completion
  const onOtpProfileSubmit = async (data: OtpProfileInput) => {
    setLoading(true);
    setError(null);
    setHint(null);

    const linkRes = await fetch('/api/customer/link-account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        first_name: data.first_name,
        last_name: data.last_name,
        email: data.email,
        phone: otpPhone,
      }),
    });

    const linkData = await linkRes.json();

    if (!linkRes.ok) {
      if (linkRes.status === 401) {
        setError('Your session has expired. Please try again.');
      } else if (linkData.error?.includes('staff account')) {
        setError('This email is used for a staff account. Please use a different email.');
      } else {
        setError('Something went wrong creating your account. Please try again.');
      }
      setLoading(false);
      return;
    }

    onSuccess();
  };

  // Full registration (email/password)
  const onFullSubmit = async (data: CustomerSignupInput) => {
    setLoading(true);
    setError(null);
    setHint(null);

    // Pre-check email
    const emailCheck = await checkExists({ email: data.email });
    if (emailCheck.exists) {
      if (emailCheck.hasAuthAccount) {
        setError(
          <>
            This email is already linked to an account.{' '}
            <button
              type="button"
              onClick={() => onSwitchToSignIn(data.phone)}
              className="font-medium text-lime hover:text-lime-400 underline"
            >
              Sign in instead &rarr;
            </button>
          </>
        );
      } else {
        setHint(
          <>
            Welcome back! We already have your info on file.{' '}
            <button
              type="button"
              onClick={() => onSwitchToSignIn(data.phone)}
              className="font-medium text-lime hover:text-lime-400 underline"
            >
              Sign in here
            </button>{' '}
            to access your account.
          </>
        );
      }
      setLoading(false);
      return;
    }

    // Pre-check phone
    if (data.phone) {
      const phoneCheck = await checkExists({ phone: data.phone });
      if (phoneCheck.exists) {
        if (phoneCheck.hasAuthAccount) {
          setError(
            <>
              This phone number is already linked to an account.{' '}
              <button
                type="button"
                onClick={() => onSwitchToSignIn(data.phone)}
                className="font-medium text-lime hover:text-lime-400 underline"
              >
                Sign in instead &rarr;
              </button>
            </>
          );
        } else {
          setHint(
            <>
              Welcome back! We already have your info on file.{' '}
              <button
                type="button"
                onClick={() => onSwitchToSignIn(data.phone)}
                className="font-medium text-lime hover:text-lime-400 underline"
              >
                Sign in here
              </button>{' '}
              to access your account.
            </>
          );
        }
        setLoading(false);
        return;
      }
    }

    const supabase = createClient();
    const { error: signUpError } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
    });

    if (signUpError) {
      if (signUpError.message.includes('already registered') || signUpError.message.includes('already been registered')) {
        setError(
          <>
            This email is already linked to an account.{' '}
            <button
              type="button"
              onClick={() => onSwitchToSignIn(data.phone)}
              className="font-medium text-lime hover:text-lime-400 underline"
            >
              Sign in instead &rarr;
            </button>
          </>
        );
      } else if (signUpError.message.includes('rate') || signUpError.message.includes('too many')) {
        setError('Too many attempts. Please wait a few minutes and try again.');
      } else {
        setError('Something went wrong creating your account. Please try again.');
      }
      setLoading(false);
      return;
    }

    const linkRes = await fetch('/api/customer/link-account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        first_name: data.first_name,
        last_name: data.last_name,
        email: data.email,
        phone: data.phone,
      }),
    });

    const linkData = await linkRes.json();

    if (!linkRes.ok) {
      if (linkRes.status === 401) {
        setError('Your session has expired. Please try again.');
      } else if (linkData.error?.includes('staff account')) {
        setError('This email is used for a staff account. Please use a different email.');
      } else {
        setError('Something went wrong creating your account. Please try again.');
      }
      setLoading(false);
      return;
    }

    onSuccess();
  };

  const { ref: signupOtpCodeRef, ...signupOtpCodeField } = otpVerifyForm.register('code');

  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded-md bg-red-950 p-3 text-sm text-red-300">
          {error}
        </div>
      )}
      {hint && (
        <div className="rounded-md border border-amber-800 bg-amber-950 p-3 text-sm text-amber-200">
          {hint}
        </div>
      )}

      {/* Phone OTP Send */}
      {mode === 'phone-otp' && (
        <form onSubmit={phoneForm.handleSubmit(sendOtp)} className="space-y-5">
          <FormField
            label="Mobile"
            required
            error={phoneForm.formState.errors.phone?.message}
            htmlFor="inline-signup-phone"
          >
            <Input
              id="inline-signup-phone"
              type="tel"
              autoComplete="tel"
              autoFocus
              placeholder="(310) 555-1234"
              className={inputCls}
              {...phoneForm.register('phone', {
                onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                  const formatted = formatPhoneInput(e.target.value);
                  phoneForm.setValue('phone', formatted, {
                    shouldDirty: true,
                    shouldValidate: false,
                  });
                  if (phoneExists) {
                    setPhoneExists(false);
                    setError(null);
                    setHint(null);
                  }
                },
              })}
            />
          </FormField>

          <Button
            type={phoneExists ? 'button' : 'submit'}
            onClick={phoneExists ? handleSignInInstead : undefined}
            disabled={loading}
            className="site-btn-primary w-full py-3 text-sm font-semibold"
          >
            {loading ? <Spinner size="sm" /> : phoneExists ? 'Sign In Instead' : 'Continue'}
          </Button>

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-site-border" />
            <span className="text-xs font-medium text-site-text-dim">OR</span>
            <div className="h-px flex-1 bg-site-border" />
          </div>

          <button
            type="button"
            onClick={() => {
              if (phoneExists) {
                onSwitchToSignIn();
              } else {
                setMode('full');
                setError(null);
                setHint(null);
              }
            }}
            className="w-full rounded-full border border-site-border bg-brand-dark px-4 py-2 text-sm font-medium text-site-text-secondary transition-colors hover:bg-site-border-light"
          >
            {phoneExists ? 'Sign in with email' : 'Sign up with email'}
          </button>
        </form>
      )}

      {/* Phone OTP Verify */}
      {mode === 'phone-verify' && (
        <form onSubmit={otpVerifyForm.handleSubmit(verifyOtp)} className="space-y-5">
          <div className="text-center">
            <p className="text-sm text-site-text-muted">
              We sent a 6-digit code to <span className="font-medium text-site-text">{formatPhone(otpPhone)}</span>
            </p>
          </div>

          <FormField
            label="Verification code"
            required
            error={otpVerifyForm.formState.errors.code?.message}
            htmlFor="inline-signup-otp"
          >
            <Input
              id="inline-signup-otp"
              autoFocus
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000000"
              className={`text-center text-lg tracking-[0.3em] ${inputCls}`}
              {...signupOtpCodeField}
              ref={(el) => {
                signupOtpCodeRef(el);
                otpInputRef.current = el;
              }}
            />
          </FormField>

          <Button
            type="submit"
            disabled={loading}
            className="site-btn-primary w-full py-3 text-sm font-semibold"
          >
            {loading ? <Spinner size="sm" /> : 'Verify'}
          </Button>

          <div className="flex items-center justify-between text-sm">
            <button
              type="button"
              onClick={() => { setMode('phone-otp'); setError(null); setHint(null); setPhoneExists(false); otpVerifyForm.reset(); }}
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

      {/* Post-OTP Profile Completion */}
      {mode === 'otp-profile' && (
        <form onSubmit={otpProfileForm.handleSubmit(onOtpProfileSubmit)} className="space-y-5">
          <p className="text-sm text-site-text-muted">
            Phone verified! Complete your profile to finish signing up.
          </p>

          <FormField label="Mobile" htmlFor="inline-otp-phone">
            <Input
              id="inline-otp-phone"
              value={formatPhone(otpPhone)}
              readOnly
              className="bg-brand-dark text-site-text-muted border-site-border text-base sm:text-sm"
            />
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="First Name"
              required
              error={otpProfileForm.formState.errors.first_name?.message}
              htmlFor="inline-otp-first-name"
            >
              <Input
                id="inline-otp-first-name"
                placeholder="John"
                autoFocus
                className={inputCls}
                {...otpProfileForm.register('first_name')}
              />
            </FormField>

            <FormField
              label="Last Name"
              required
              error={otpProfileForm.formState.errors.last_name?.message}
              htmlFor="inline-otp-last-name"
            >
              <Input
                id="inline-otp-last-name"
                placeholder="Doe"
                className={inputCls}
                {...otpProfileForm.register('last_name')}
              />
            </FormField>
          </div>

          <FormField
            label="Email"
            required
            error={otpProfileForm.formState.errors.email?.message}
            htmlFor="inline-otp-email"
          >
            <Input
              id="inline-otp-email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              className={inputCls}
              {...otpProfileForm.register('email')}
            />
          </FormField>

          <Button
            type="submit"
            disabled={loading}
            className="site-btn-primary w-full py-3 text-sm font-semibold"
          >
            {loading ? <Spinner size="sm" /> : 'Complete Sign Up'}
          </Button>
        </form>
      )}

      {/* Full Registration (email/password) */}
      {mode === 'full' && (
        <form onSubmit={fullForm.handleSubmit(onFullSubmit)} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="First Name"
              required
              error={fullForm.formState.errors.first_name?.message}
              htmlFor="inline-full-first-name"
            >
              <Input
                id="inline-full-first-name"
                placeholder="John"
                autoFocus
                className={inputCls}
                {...fullForm.register('first_name')}
              />
            </FormField>

            <FormField
              label="Last Name"
              required
              error={fullForm.formState.errors.last_name?.message}
              htmlFor="inline-full-last-name"
            >
              <Input
                id="inline-full-last-name"
                placeholder="Doe"
                className={inputCls}
                {...fullForm.register('last_name')}
              />
            </FormField>
          </div>

          <FormField label="Email" required error={fullForm.formState.errors.email?.message} htmlFor="inline-full-email">
            <Input
              id="inline-full-email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              className={inputCls}
              {...fullForm.register('email')}
            />
          </FormField>

          <FormField
            label="Mobile"
            required
            error={fullForm.formState.errors.phone?.message}
            htmlFor="inline-full-phone"
          >
            <Input
              id="inline-full-phone"
              placeholder="(310) 555-1234"
              className={inputCls}
              {...fullForm.register('phone', {
                onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                  const formatted = formatPhoneInput(e.target.value);
                  fullForm.setValue('phone', formatted, {
                    shouldDirty: true,
                    shouldValidate: true,
                  });
                },
              })}
            />
          </FormField>

          <FormField label="Password" required error={fullForm.formState.errors.password?.message} htmlFor="inline-full-password">
            <Input
              id="inline-full-password"
              type="password"
              autoComplete="new-password"
              placeholder="At least 8 characters"
              className={inputCls}
              {...fullForm.register('password')}
            />
          </FormField>

          <FormField
            label="Confirm Password"
            required
            error={fullForm.formState.errors.confirm_password?.message}
            htmlFor="inline-full-confirm-password"
          >
            <Input
              id="inline-full-confirm-password"
              type="password"
              autoComplete="new-password"
              placeholder="Re-enter your password"
              className={inputCls}
              {...fullForm.register('confirm_password')}
            />
          </FormField>

          <Button
            type="submit"
            disabled={loading}
            className="site-btn-primary w-full py-3 text-sm font-semibold"
          >
            {loading ? <Spinner size="sm" /> : 'Create Account'}
          </Button>

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-site-border" />
            <span className="text-xs font-medium text-site-text-dim">OR</span>
            <div className="h-px flex-1 bg-site-border" />
          </div>

          <button
            type="button"
            onClick={() => { setMode('phone-otp'); setError(null); setHint(null); }}
            className="w-full rounded-full border border-site-border bg-brand-dark px-4 py-2 text-sm font-medium text-site-text-secondary transition-colors hover:bg-site-border-light"
          >
            Sign up with phone
          </button>
        </form>
      )}
    </div>
  );
}

// --- Main InlineAuth Component ---

type AuthView = 'buttons' | 'sign-in' | 'sign-up';

export function InlineAuth({
  onAuthComplete,
  isAuthenticated,
  customerData,
  onSignOut,
  businessName,
}: InlineAuthProps) {
  const [view, setView] = useState<AuthView>('buttons');
  const [switchPhone, setSwitchPhone] = useState('');
  const [fetchingProfile, setFetchingProfile] = useState(false);
  const localAuthRef = useRef<AuthCustomerData | null>(null);
  const [localAuthData, setLocalAuthData] = useState<AuthCustomerData | null>(null);

  // After auth success: fetch customer profile + vehicles
  const handleAuthSuccess = useCallback(async () => {
    setView('buttons');
    setSwitchPhone('');
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
      if (!customer.first_name && !customer.phone && !profileRes.ok) {
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
      localAuthRef.current = data;
      setLocalAuthData(data);
      onAuthComplete(data);
    } catch {
      const fallback: AuthCustomerData = { customer: { first_name: '', last_name: '', phone: '', email: '' }, vehicles: [] };
      localAuthRef.current = fallback;
      setLocalAuthData(fallback);
      onAuthComplete(fallback);
    } finally {
      setFetchingProfile(false);
    }
  }, [onAuthComplete]);

  // "Not you?" — clear booking auth only, keep Supabase session alive
  const handleNotYouClick = useCallback(() => {
    localAuthRef.current = null;
    setLocalAuthData(null);
    setSwitchPhone('');
    setView('buttons');
    // Do NOT call onSignOut — user stays authenticated site-wide
  }, []);

  // "Sign out" — full sign-out: clear booking auth AND Supabase session
  const handleSignOutClick = useCallback(() => {
    // Clear local state immediately (synchronous — prevents iOS touch event cancellation)
    localAuthRef.current = null;
    setLocalAuthData(null);
    setSwitchPhone('');
    setView('buttons');

    // Fire sign-out asynchronously — don't block the UI
    Promise.resolve(onSignOut()).catch((err: unknown) => console.error('Sign out error:', err));
  }, [onSignOut]);

  // Switch to sign-in from sign-up (with optional phone pre-fill)
  const handleSwitchToSignIn = useCallback((phone?: string) => {
    setSwitchPhone(phone || '');
    setView('sign-in');
  }, []);

  // Switch to sign-up from sign-in
  const handleSwitchToSignUp = useCallback(() => {
    setSwitchPhone('');
    setView('sign-up');
  }, []);

  // Already authenticated — show compact info line
  const effectiveData = customerData || localAuthData || localAuthRef.current;
  if ((isAuthenticated || !!localAuthData || !!localAuthRef.current) && effectiveData) {
    const { first_name, last_name, phone, email } = effectiveData.customer;
    return (
      <div className="rounded-lg border border-lime/30 bg-lime/5 p-4">
        <div className="flex items-start justify-between gap-4">
          {/* Left: Customer info */}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-site-text">
              Booking as: {first_name} {last_name}
            </p>
            <p className="mt-0.5 text-xs text-site-text-muted truncate">
              {phone ? <span>{formatPhone(phone)}</span> : ''}{phone && email ? ' · ' : ''}{email}
            </p>
          </div>

          {/* Right: Actions stacked */}
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

  // Not authenticated — show inline auth based on view
  return (
    <div className="transition-all duration-200">
      {/* STATE 1: Two buttons — Returning Customer? / New Here? */}
      {view === 'buttons' && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setView('sign-in')}
            className="w-full rounded-lg border border-site-border bg-brand-surface p-4 text-left transition-colors hover:border-lime/50 hover:bg-lime/5"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-lime/10 text-lime">
                <LogIn className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-site-text">Returning Customer?</p>
                <p className="text-xs text-site-text-muted">Sign in with your phone or email</p>
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setView('sign-up')}
            className="w-full rounded-lg border border-site-border bg-brand-surface p-4 text-left transition-colors hover:border-lime/50 hover:bg-lime/5"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-lime/10 text-lime">
                <UserPlus className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-site-text">New here?</p>
                <p className="text-xs text-site-text-muted">Create an account to get started</p>
              </div>
            </div>
          </button>
        </div>
      )}

      {/* STATE 2A: Sign In — inline expanded section */}
      {view === 'sign-in' && (
        <div className="rounded-xl border border-site-border p-5 sm:p-6">
          <button
            type="button"
            onClick={() => { setView('buttons'); setSwitchPhone(''); }}
            className="flex items-center gap-1.5 text-sm text-site-text-dim hover:text-site-text transition-colors mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <h3 className="text-lg font-semibold text-site-text mb-5">Enter your details</h3>
          <SignInFlow
            key={`signin-${switchPhone}`}
            initialPhone={switchPhone}
            onSuccess={handleAuthSuccess}
            onSwitchToSignUp={handleSwitchToSignUp}
            businessName={businessName}
          />
        </div>
      )}

      {/* STATE 2B: Sign Up — inline expanded section */}
      {view === 'sign-up' && (
        <div className="rounded-xl border border-site-border p-5 sm:p-6">
          <button
            type="button"
            onClick={() => { setView('buttons'); setSwitchPhone(''); }}
            className="flex items-center gap-1.5 text-sm text-site-text-dim hover:text-site-text transition-colors mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <h3 className="text-lg font-semibold text-site-text mb-5">Create Account</h3>
          <SignUpFlow
            onSuccess={handleAuthSuccess}
            onSwitchToSignIn={handleSwitchToSignIn}
            businessName={businessName}
          />
        </div>
      )}
    </div>
  );
}
