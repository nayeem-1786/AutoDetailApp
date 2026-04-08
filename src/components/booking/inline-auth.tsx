'use client';

import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
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
import { formatPhoneInput, formatPhone } from '@/lib/utils/format';
import { usePhoneOtp } from '@/lib/hooks/usePhoneOtp';
import { useEmailAuth } from '@/lib/hooks/useEmailAuth';
import { useCustomerLink } from '@/lib/hooks/useCustomerLink';
import { AUTH_ERRORS } from '@/lib/auth/auth-errors';
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

// Post-OTP profile completion schema — email is optional for phone-first signup
const otpProfileSchema = z.object({
  first_name: z.string().min(1, 'Required'),
  last_name: z.string().min(1, 'Required'),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
});

type OtpProfileInput = z.infer<typeof otpProfileSchema>;

// --- Shared input class ---
const inputCls = 'border-site-border bg-brand-surface text-site-text placeholder:text-site-text-dim focus-visible:ring-accent-ui text-base sm:text-sm';

// --- Sign In Flow ---

type SignInMode = 'phone' | 'otp' | 'email';

function SignInFlow({
  initialPhone,
  onSuccess,
  onSwitchToSignUp,
}: {
  initialPhone?: string;
  onSuccess: () => void;
  onSwitchToSignUp: () => void;
  businessName: string;
}) {
  const [mode, setMode] = useState<SignInMode>('phone');
  const [jsxError, setJsxError] = useState<ReactNode | null>(null);
  const [forgotMode, setForgotMode] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetSent, setResetSent] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
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
    onVerified: async () => {
      await onSuccess();
    },
    onNoCustomerFound: () => {
      onSwitchToSignUp();
    },
  });

  // --- Email auth hook ---
  const emailAuth = useEmailAuth({
    onSuccess: async () => {
      await onSuccess();
    },
    onNoCustomer: () => {
      onSwitchToSignUp();
    },
  });

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

  // Sync OTP phase → mode
  useEffect(() => {
    if (otp.phase === 'otp' && mode !== 'otp') setMode('otp');
  }, [otp.phase, mode]);

  // Map hook error strings → JSX
  const renderError = (): ReactNode => {
    if (jsxError) return jsxError;

    const err = mode === 'email' ? emailAuth.error : otp.error;
    if (!err) return null;

    switch (err) {
      case AUTH_ERRORS.PHONE_NOT_FOUND:
        return (
          <>
            We couldn&apos;t find an account with that phone number.{' '}
            <button
              type="button"
              onClick={onSwitchToSignUp}
              className="font-medium text-accent-brand hover:text-accent-brand-hover underline"
            >
              Create a new account
            </button>{' '}
            to get started.
          </>
        );
      case AUTH_ERRORS.STAFF_PHONE:
        return 'This phone number is linked to a staff account. Please use a different number.';
      case AUTH_ERRORS.PHONE_ALREADY_LINKED:
        return 'This phone number is already linked to another account.';
      case AUTH_ERRORS.INVALID_CREDENTIALS:
        return (
          <>
            Incorrect email or password. Please try again, or{' '}
            <button
              type="button"
              onClick={onSwitchToSignUp}
              className="font-medium text-accent-brand hover:text-accent-brand-hover underline"
            >
              create a new account
            </button>
            .
          </>
        );
      case AUTH_ERRORS.STAFF_EMAIL:
        return 'This email is linked to a staff account. Please use a different email.';
      case AUTH_ERRORS.NO_CUSTOMER:
        return (
          <>
            We couldn&apos;t find a customer account with that email.{' '}
            <button
              type="button"
              onClick={onSwitchToSignUp}
              className="font-medium text-accent-brand hover:text-accent-brand-hover underline"
            >
              Create a new account
            </button>{' '}
            to get started.
          </>
        );
      default:
        return err;
    }
  };

  const isLoading = mode === 'email' ? emailAuth.loading : otp.loading;
  const currentError = renderError();

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

  const { ref: otpCodeRef, ...otpCodeField } = otpForm.register('code');

  return (
    <div className="space-y-5">
      {currentError && (
        <div className="rounded-md bg-red-950 p-3 text-sm text-red-300">
          {currentError}
        </div>
      )}

      {/* Phone Input */}
      {mode === 'phone' && (
        <form
          autoComplete="off"
          data-form-type="other"
          onSubmit={(e) => { e.preventDefault(); phoneForm.handleSubmit(handleSendOtp)(); }}
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
            disabled={isLoading}
            className="site-btn-primary w-full py-3 text-sm font-semibold"
          >
            {isLoading ? <Spinner size="sm" /> : 'Continue'}
          </Button>

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-site-border" />
            <span className="text-xs font-medium text-site-text-dim">OR</span>
            <div className="h-px flex-1 bg-site-border" />
          </div>

          <button
            type="button"
            onClick={() => { setMode('email'); setJsxError(null); otp.resetError(); }}
            className="w-full rounded-full border border-site-border bg-brand-dark px-4 py-2 text-sm font-medium text-site-text-secondary transition-colors hover:bg-site-border-light"
          >
            Use email instead
          </button>
        </form>
      )}

      {/* OTP Verification */}
      {mode === 'otp' && (
        <form onSubmit={otpForm.handleSubmit(handleVerifyOtp)} className="space-y-5">
          <div className="text-center">
            <p className="text-sm text-site-text-muted">
              We sent a 6-digit code to <span className="font-medium text-site-text">{formatPhone(otp.otpPhone)}</span>
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
            disabled={isLoading}
            className="site-btn-primary w-full py-3 text-sm font-semibold"
          >
            {isLoading ? <Spinner size="sm" /> : 'Verify'}
          </Button>

          <div className="flex items-center justify-between text-sm">
            <button
              type="button"
              onClick={() => { setMode('phone'); setJsxError(null); otp.resetToPhone(); otpForm.reset(); }}
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

      {/* Email Sign-in */}
      {mode === 'email' && !forgotMode && (
        <form onSubmit={emailForm.handleSubmit(handleEmailSubmit)} className="space-y-5">
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
            disabled={isLoading}
            className="site-btn-primary w-full py-3 text-sm font-semibold"
          >
            {isLoading ? <Spinner size="sm" /> : 'Sign In'}
          </Button>

          <button
            type="button"
            onClick={() => { setForgotMode(true); setJsxError(null); emailAuth.resetError(); }}
            className="block w-full text-center text-sm text-site-text-muted hover:text-accent-ui transition-colors"
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
            onClick={() => { setMode('phone'); setJsxError(null); emailAuth.resetError(); }}
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
                onClick={() => { setForgotMode(false); setResetSent(false); setResetEmail(''); setJsxError(null); }}
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
                disabled={resetLoading}
                className="site-btn-primary w-full py-3 text-sm font-semibold"
              >
                {resetLoading ? <Spinner size="sm" /> : 'Send Reset Link'}
              </Button>

              <button
                type="button"
                onClick={() => { setForgotMode(false); setResetEmail(''); setJsxError(null); }}
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

type SignUpMode = 'phone' | 'otp' | 'profile';

function SignUpFlow({
  onSuccess,
  onSwitchToSignIn,
}: {
  onSuccess: () => void;
  onSwitchToSignIn: (phone?: string) => void;
  businessName: string;
}) {
  const [mode, setMode] = useState<SignUpMode>('phone');
  const [jsxError, setJsxError] = useState<ReactNode | null>(null);
  const [loading, setLoading] = useState(false);
  const [phoneExists, setPhoneExists] = useState(false);
  const otpInputRef = useRef<HTMLInputElement>(null);

  const { checkExists, linkAccount } = useCustomerLink();

  // --- Phone OTP hook ---
  const otp = usePhoneOtp({
    mode: 'sign-up',
    onBeforeSend: async (phone) => {
      const phoneCheck = await checkExists({ phone });
      if (phoneCheck.exists) {
        if (phoneCheck.hasAuthAccount) {
          setPhoneExists(true);
          return { abort: true, error: AUTH_ERRORS.PHONE_ALREADY_LINKED };
        }
        // Voice-agent customer (exists without auth) — proceed to OTP
        return { abort: false };
      }
      return { abort: false };
    },
    onVerified: async (result) => {
      // Sign-in-instead path: existing account was verified
      if (phoneExists) {
        await onSuccess();
        return;
      }
      // New signup: show profile form
      if (result.isNewOtpSignup) {
        setMode('profile');
      } else {
        // Customer already linked (rare but possible)
        await onSuccess();
      }
    },
  });

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

  // Sync OTP phase → mode
  useEffect(() => {
    if (otp.phase === 'otp' && mode === 'phone') setMode('otp');
  }, [otp.phase, mode]);

  // Map hook errors → JSX
  const renderError = (): ReactNode => {
    if (jsxError) return jsxError;

    const err = otp.error;
    if (!err) return null;

    // PHONE_ALREADY_LINKED is shown as inline text (button changes to "Sign In Instead")
    if (err === AUTH_ERRORS.PHONE_ALREADY_LINKED && phoneExists) {
      return 'This phone number is already linked to an account.';
    }

    return err;
  };

  const currentError = renderError();
  const isOtpLoading = otp.loading;

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

  const handleSendOtp = async (data: PhoneOtpSendInput) => {
    setJsxError(null);
    await otp.sendOtp(data.phone);
    otpVerifyForm.setValue('phone', data.phone);
  };

  const handleVerifyOtp = async (data: PhoneOtpVerifyInput) => {
    setJsxError(null);
    await otp.verifyOtp(data.phone, data.code);
  };

  const handleResendOtp = async () => {
    setJsxError(null);
    otpVerifyForm.setValue('code', '');
    await otp.resendOtp();
  };

  // Sign In Instead: send OTP directly and skip to verification
  const handleSignInInstead = async () => {
    const phone = phoneForm.getValues('phone');
    setJsxError(null);
    await otp.sendOtp(phone);
    otpVerifyForm.setValue('phone', phone);
  };

  // Post-OTP profile completion
  const onOtpProfileSubmit = async (data: OtpProfileInput) => {
    setLoading(true);
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
        } else if (result.error === 'STAFF_ACCOUNT') {
          setJsxError('This email is used for a staff account. Please use a different email.');
        } else {
          setJsxError('Something went wrong creating your account. Please try again.');
        }
        return;
      }

      await onSuccess();
    } catch {
      setJsxError('Something went wrong creating your account. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const { ref: signupOtpCodeRef, ...signupOtpCodeField } = otpVerifyForm.register('code');

  return (
    <div className="space-y-5">
      {currentError && (
        <div className="rounded-md bg-red-950 p-3 text-sm text-red-300">
          {currentError}
        </div>
      )}

      {/* Phone Entry */}
      {mode === 'phone' && (
        <form onSubmit={phoneForm.handleSubmit(handleSendOtp)} className="space-y-5">
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
                    setJsxError(null);
                    otp.resetError();
                  }
                },
              })}
            />
          </FormField>

          <Button
            type={phoneExists ? 'button' : 'submit'}
            onClick={phoneExists ? handleSignInInstead : undefined}
            disabled={isOtpLoading}
            className="site-btn-primary w-full py-3 text-sm font-semibold"
          >
            {isOtpLoading ? <Spinner size="sm" /> : phoneExists ? 'Sign In Instead' : 'Continue'}
          </Button>

          {phoneExists && (
            <>
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-site-border" />
                <span className="text-xs font-medium text-site-text-dim">OR</span>
                <div className="h-px flex-1 bg-site-border" />
              </div>

              <button
                type="button"
                onClick={() => onSwitchToSignIn()}
                className="w-full rounded-full border border-site-border bg-brand-dark px-4 py-2 text-sm font-medium text-site-text-secondary transition-colors hover:bg-site-border-light"
              >
                Sign in with email
              </button>
            </>
          )}
        </form>
      )}

      {/* OTP Verification */}
      {mode === 'otp' && (
        <form onSubmit={otpVerifyForm.handleSubmit(handleVerifyOtp)} className="space-y-5">
          <div className="text-center">
            <p className="text-sm text-site-text-muted">
              We sent a 6-digit code to <span className="font-medium text-site-text">{formatPhone(otp.otpPhone)}</span>
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
            disabled={isOtpLoading}
            className="site-btn-primary w-full py-3 text-sm font-semibold"
          >
            {isOtpLoading ? <Spinner size="sm" /> : 'Verify'}
          </Button>

          <div className="flex items-center justify-between text-sm">
            <button
              type="button"
              onClick={() => { setMode('phone'); setJsxError(null); setPhoneExists(false); otp.resetToPhone(); otpVerifyForm.reset(); }}
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

      {/* Post-OTP Profile Completion */}
      {mode === 'profile' && (
        <form onSubmit={otpProfileForm.handleSubmit(onOtpProfileSubmit)} className="space-y-5">
          <p className="text-sm text-site-text-muted">
            Phone verified! Complete your profile to finish signing up.
          </p>

          <FormField label="Mobile" htmlFor="inline-otp-phone">
            <Input
              id="inline-otp-phone"
              value={formatPhone(otp.otpPhone)}
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
            <p className="mt-1 text-xs text-site-text-dim">
              Optional — for booking confirmations &amp; receipts
            </p>
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
    </div>
  );
}

// --- Main InlineAuth Component ---

type AuthView = 'buttons' | 'sign-in' | 'sign-up' | 'complete-profile';

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

  // Profile completion state (for existing customers with incomplete data)
  const [pendingAuthData, setPendingAuthData] = useState<AuthCustomerData | null>(null);
  const [completeFirstName, setCompleteFirstName] = useState('');
  const [completeLastName, setCompleteLastName] = useState('');
  const [completeEmail, setCompleteEmail] = useState('');
  const [completeError, setCompleteError] = useState<string | null>(null);
  const [completeSaving, setCompleteSaving] = useState(false);

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
      setView('buttons');
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
            className="w-full rounded-lg border border-site-border bg-brand-surface p-4 text-left transition-colors hover:border-accent-ui/50 hover:bg-accent-ui/5"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-brand/10 text-accent-brand">
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
            className="w-full rounded-lg border border-site-border bg-brand-surface p-4 text-left transition-colors hover:border-accent-ui/50 hover:bg-accent-ui/5"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-brand/10 text-accent-brand">
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

      {/* STATE 3: Profile Completion — existing customer with incomplete data */}
      {view === 'complete-profile' && pendingAuthData && (
        <div className="rounded-xl border border-site-border p-5 sm:p-6">
          <h3 className="text-lg font-semibold text-site-text mb-2">Complete Your Profile</h3>
          <p className="text-sm text-site-text-muted mb-5">
            Phone verified! We just need a couple more details to complete your booking.
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
              <p className="mt-1 text-xs text-site-text-dim">Optional — for booking confirmation &amp; receipts</p>
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
        </div>
      )}
    </div>
  );
}
