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
import { formatPhoneInput, normalizePhone } from '@/lib/utils/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import { Spinner } from '@/components/ui/spinner';
import { LogIn, UserPlus, X } from 'lucide-react';
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
  onSignOut: () => void;
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

// --- Sheet/Dialog Overlay ---

function AuthSheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  // Prevent body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Content: bottom sheet on mobile, centered dialog on desktop */}
      <div className="absolute inset-x-0 bottom-0 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-full sm:max-w-md">
        <div className="rounded-t-2xl sm:rounded-2xl bg-brand-dark border border-site-border max-h-[85vh] overflow-y-auto">
          {/* Header */}
          <div className="sticky top-0 flex items-center justify-between p-4 border-b border-site-border bg-brand-dark rounded-t-2xl sm:rounded-t-2xl z-10">
            <h3 className="text-lg font-semibold text-site-text">{title}</h3>
            <button
              type="button"
              onClick={onClose}
              className="text-site-text-muted hover:text-site-text transition-colors"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          {/* Body */}
          <div className="p-6">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Sign In Flow ---

type SignInMode = 'phone' | 'otp' | 'email';

function SignInFlow({
  onSuccess,
  onSwitchToSignUp,
  businessName,
}: {
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

  // Auto-focus OTP input
  useEffect(() => {
    if (mode === 'otp') {
      requestAnimationFrame(() => otpInputRef.current?.focus());
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

    onSuccess();
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

    onSuccess();
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
        <form onSubmit={phoneForm.handleSubmit(sendOtp)} className="space-y-5">
          <FormField
            label="Mobile"
            required
            error={phoneForm.formState.errors.phone?.message}
            htmlFor="inline-signin-phone"
          >
            <Input
              id="inline-signin-phone"
              type="tel"
              autoComplete="tel"
              autoFocus
              placeholder="(310) 555-1234"
              className="border-site-border bg-brand-surface text-site-text placeholder:text-site-text-dim focus-visible:ring-lime"
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
            Sign in with email
          </button>
        </form>
      )}

      {/* OTP Verification */}
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
            htmlFor="inline-signin-otp"
          >
            <Input
              id="inline-signin-otp"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000000"
              className="text-center text-lg tracking-[0.3em] border-site-border bg-brand-surface text-site-text placeholder:text-site-text-dim focus-visible:ring-lime"
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
              placeholder="you@example.com"
              className="border-site-border bg-brand-surface text-site-text placeholder:text-site-text-dim focus-visible:ring-lime"
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
              className="border-site-border bg-brand-surface text-site-text placeholder:text-site-text-dim focus-visible:ring-lime"
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
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="border-site-border bg-brand-surface text-site-text placeholder:text-site-text-dim focus-visible:ring-lime"
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
  onSwitchToSignIn: () => void;
  businessName: string;
}) {
  const [mode, setMode] = useState<SignUpMode>('phone-otp');
  const [error, setError] = useState<ReactNode | null>(null);
  const [hint, setHint] = useState<ReactNode | null>(null);
  const [loading, setLoading] = useState(false);
  const [otpPhone, setOtpPhone] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);

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
      if (phoneCheck.hasAuthAccount) {
        setError(
          <>
            This phone number is already linked to an account.{' '}
            <button
              type="button"
              onClick={onSwitchToSignIn}
              className="font-medium text-lime hover:text-lime-400 underline"
            >
              Sign in here
            </button>{' '}
            instead.
          </>
        );
      } else {
        setHint(
          <>
            Welcome back! We already have your info on file.{' '}
            <button
              type="button"
              onClick={onSwitchToSignIn}
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
              onClick={onSwitchToSignIn}
              className="font-medium text-lime hover:text-lime-400 underline"
            >
              Sign in here
            </button>{' '}
            instead.
          </>
        );
      } else {
        setHint(
          <>
            Welcome back! We already have your info on file.{' '}
            <button
              type="button"
              onClick={onSwitchToSignIn}
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
                onClick={onSwitchToSignIn}
                className="font-medium text-lime hover:text-lime-400 underline"
              >
                Sign in here
              </button>{' '}
              instead.
            </>
          );
        } else {
          setHint(
            <>
              Welcome back! We already have your info on file.{' '}
              <button
                type="button"
                onClick={onSwitchToSignIn}
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
              onClick={onSwitchToSignIn}
              className="font-medium text-lime hover:text-lime-400 underline"
            >
              Sign in here
            </button>{' '}
            instead.
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

  const inputCls = 'border-site-border bg-brand-surface text-site-text placeholder:text-site-text-dim focus-visible:ring-lime';

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
            onClick={() => { setMode('full'); setError(null); setHint(null); }}
            className="w-full rounded-full border border-site-border bg-brand-dark px-4 py-2 text-sm font-medium text-site-text-secondary transition-colors hover:bg-site-border-light"
          >
            Sign up with email
          </button>
        </form>
      )}

      {/* Phone OTP Verify */}
      {mode === 'phone-verify' && (
        <form onSubmit={otpVerifyForm.handleSubmit(verifyOtp)} className="space-y-5">
          <div className="text-center">
            <p className="text-sm text-site-text-muted">
              We sent a 6-digit code to <span className="font-medium text-site-text">{otpPhone}</span>
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
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000000"
              className={`text-center text-lg tracking-[0.3em] ${inputCls}`}
              {...otpVerifyForm.register('code')}
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
              onClick={() => { setMode('phone-otp'); setError(null); setHint(null); otpVerifyForm.reset(); }}
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
          <FormField label="Mobile" htmlFor="inline-otp-phone">
            <Input
              id="inline-otp-phone"
              value={otpPhone}
              readOnly
              className="bg-brand-dark text-site-text-muted border-site-border"
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

export function InlineAuth({
  onAuthComplete,
  isAuthenticated,
  customerData,
  onSignOut,
  businessName,
}: InlineAuthProps) {
  const [sheetOpen, setSheetOpen] = useState<'signin' | 'signup' | null>(null);
  const [fetchingProfile, setFetchingProfile] = useState(false);

  // After auth success: fetch customer profile + vehicles
  const handleAuthSuccess = useCallback(async () => {
    setFetchingProfile(true);
    try {
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

      setSheetOpen(null);
      onAuthComplete({ customer, vehicles });
    } catch {
      // Still close sheet, use whatever data we got
      setSheetOpen(null);
    } finally {
      setFetchingProfile(false);
    }
  }, [onAuthComplete]);

  // Already authenticated — show compact info line
  if (isAuthenticated && customerData) {
    const { first_name, last_name, phone, email } = customerData.customer;
    return (
      <div className="rounded-lg border border-lime/30 bg-lime/5 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-site-text">
              Booking as: {first_name} {last_name}
            </p>
            <p className="text-xs text-site-text-muted truncate" suppressHydrationWarning>
              {phone}{phone && email ? ' \u00b7 ' : ''}{email}
            </p>
          </div>
          <button
            type="button"
            onClick={onSignOut}
            className="flex-shrink-0 text-xs text-site-text-muted hover:text-site-text transition-colors"
          >
            Not you? Sign out
          </button>
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

  // Not authenticated — show sign in / sign up buttons
  return (
    <>
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => setSheetOpen('signin')}
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
          onClick={() => setSheetOpen('signup')}
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

      {/* Sign In Sheet */}
      <AuthSheet
        open={sheetOpen === 'signin'}
        onClose={() => setSheetOpen(null)}
        title="Sign In"
      >
        <SignInFlow
          onSuccess={handleAuthSuccess}
          onSwitchToSignUp={() => setSheetOpen('signup')}
          businessName={businessName}
        />
      </AuthSheet>

      {/* Sign Up Sheet */}
      <AuthSheet
        open={sheetOpen === 'signup'}
        onClose={() => setSheetOpen(null)}
        title="Create Account"
      >
        <SignUpFlow
          onSuccess={handleAuthSuccess}
          onSwitchToSignIn={() => setSheetOpen('signin')}
          businessName={businessName}
        />
      </AuthSheet>
    </>
  );
}
