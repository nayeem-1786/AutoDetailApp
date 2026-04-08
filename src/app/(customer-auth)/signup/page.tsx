'use client';

import { useState, useEffect, useRef, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useForm } from 'react-hook-form';
import { formResolver } from '@/lib/utils/form';
import {
  customerSignupSchema,
  phoneOtpSendSchema,
  phoneOtpVerifySchema,
  type CustomerSignupInput,
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

// Simplified schema for post-OTP profile completion (phone already verified, no password needed)
const otpProfileSchema = z.object({
  first_name: z.string().min(1, 'Required'),
  last_name: z.string().min(1, 'Required'),
  email: z.string().email('Invalid email address'),
});

type OtpProfileInput = z.infer<typeof otpProfileSchema>;

type SignupMode = 'full' | 'phone-otp' | 'phone-verify' | 'otp-profile';

export default function CustomerSignUpPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const phoneParam = searchParams.get('phone');
  const { info: businessInfo } = useBusinessInfo();
  const [jsxError, setJsxError] = useState<ReactNode | null>(null);
  const [hint, setHint] = useState<ReactNode | null>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<SignupMode>('full');
  const [checkingAuth, setCheckingAuth] = useState(!!phoneParam);
  const signedOutRef = useRef(false);

  const { checkExists, linkAccount } = useCustomerLink();

  // --- Phone OTP hook ---
  const otp = usePhoneOtp({
    mode: 'sign-up',
    onBeforeSend: async (phone) => {
      const phoneCheck = await checkExists({ phone });
      if (phoneCheck.exists) {
        if (phoneCheck.hasAuthAccount) {
          return { abort: true, error: AUTH_ERRORS.PHONE_ALREADY_LINKED };
        }
        // Has record but no auth — hint to sign in
        return { abort: true, error: 'PHONE_EXISTS_NO_AUTH' };
      }
      return { abort: false };
    },
    onVerified: () => {
      setMode('otp-profile');
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

  // Determine initial mode based on params and auth state
  useEffect(() => {
    if (!phoneParam) {
      setCheckingAuth(false);
      return;
    }

    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }: { data: { user: unknown } }) => {
      if (user) {
        // Post-OTP flow: user authenticated, phone pre-filled, show simplified form
        setMode('otp-profile');
      } else {
        // Phone param but not authenticated — start fresh OTP signup
        setMode('phone-otp');
      }
      setCheckingAuth(false);
    }).catch(() => {
      setCheckingAuth(false);
      setMode('phone-otp');
    });
  }, [phoneParam]);

  // Sync OTP phase → mode
  useEffect(() => {
    if (otp.phase === 'otp' && mode === 'phone-otp') setMode('phone-verify');
  }, [otp.phase, mode]);

  // Map hook errors → JSX
  const renderError = (): ReactNode => {
    if (jsxError) return jsxError;

    const err = otp.error;
    if (!err) return null;

    switch (err) {
      case AUTH_ERRORS.PHONE_ALREADY_LINKED:
        return (
          <>
            This phone number is already linked to an account.{' '}
            <Link href="/signin" className="font-medium text-accent-brand hover:text-accent-ui underline">
              Sign in here
            </Link>{' '}
            instead.
            <span className="mt-1 block text-xs text-site-text-dim">
              Not your account? Call or text us for help.
            </span>
          </>
        );
      case 'PHONE_EXISTS_NO_AUTH': {
        const phoneEnc = encodeURIComponent(phoneForm.getValues('phone'));
        setHint(
          <>
            Welcome back! We already have your info on file.{' '}
            <Link href={`/signin?phone=${phoneEnc}`} className="font-medium text-accent-brand hover:text-accent-ui underline">
              Sign in here
            </Link>{' '}
            to access your account.
          </>
        );
        return null;
      }
      default:
        return err;
    }
  };

  const currentError = renderError();

  // Full registration form (email/password)
  const fullForm = useForm<CustomerSignupInput>({
    resolver: formResolver(customerSignupSchema),
  });

  // Phone OTP send form
  const phoneForm = useForm<PhoneOtpSendInput>({
    resolver: formResolver(phoneOtpSendSchema),
  });

  // OTP verify form
  const otpVerifyForm = useForm<PhoneOtpVerifyInput>({
    resolver: formResolver(phoneOtpVerifySchema),
    defaultValues: { phone: '', code: '' },
  });

  // Simplified post-OTP profile form
  const otpProfileForm = useForm<OtpProfileInput>({
    resolver: formResolver(otpProfileSchema),
  });

  const handleSendOtp = async (data: PhoneOtpSendInput) => {
    setJsxError(null);
    setHint(null);
    await otp.sendOtp(data.phone);
    otpVerifyForm.setValue('phone', data.phone);
  };

  const handleVerifyOtp = async (data: PhoneOtpVerifyInput) => {
    setJsxError(null);
    setHint(null);
    await otp.verifyOtp(data.phone, data.code);
  };

  const handleResendOtp = async () => {
    setJsxError(null);
    setHint(null);
    otpVerifyForm.setValue('code', '');
    await otp.resendOtp();
  };

  // Full registration: create auth user + link customer
  const onFullSubmit = async (data: CustomerSignupInput) => {
    setLoading(true);
    setJsxError(null);
    setHint(null);

    // Pre-check: does email already exist?
    const emailCheck = await checkExists({ email: data.email });
    if (emailCheck.exists) {
      if (emailCheck.hasAuthAccount) {
        setJsxError(
          <>
            This email is already linked to an account.{' '}
            <Link href="/signin" className="font-medium text-accent-brand hover:text-accent-ui underline">
              Sign in here
            </Link>{' '}
            or use a different email.
          </>
        );
      } else {
        setHint(
          <>
            Welcome back! We already have your info on file.{' '}
            <Link href="/signin" className="font-medium text-accent-brand hover:text-accent-ui underline">
              Sign in here
            </Link>{' '}
            to access your account.
          </>
        );
      }
      setLoading(false);
      return;
    }

    // Pre-check: does phone already exist?
    if (data.phone) {
      const phoneCheck = await checkExists({ phone: data.phone });
      if (phoneCheck.exists) {
        if (phoneCheck.hasAuthAccount) {
          setJsxError(
            <>
              This phone number is already linked to an account.{' '}
              <Link href="/signin" className="font-medium text-accent-brand hover:text-accent-ui underline">
                Sign in here
              </Link>{' '}
              instead.
              <span className="mt-1 block text-xs text-site-text-dim">
                Not your account? Call or text us for help.
              </span>
            </>
          );
        } else {
          const phoneEnc = encodeURIComponent(data.phone);
          setHint(
            <>
              Welcome back! We already have your info on file.{' '}
              <Link href={`/signin?phone=${phoneEnc}`} className="font-medium text-accent-brand hover:text-accent-ui underline">
                Sign in here
              </Link>{' '}
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
        setJsxError(
          <>
            This email is already linked to an account.{' '}
            <Link href="/signin" className="font-medium text-accent-brand hover:text-accent-ui underline">
              Sign in here
            </Link>{' '}
            or use a different email.
          </>
        );
      } else if (signUpError.message.includes('rate') || signUpError.message.includes('too many')) {
        setJsxError('Too many attempts. Please wait a few minutes and try again.');
      } else {
        setJsxError('Something went wrong creating your account. Please try again.');
      }
      setLoading(false);
      return;
    }

    const result = await linkAccount({
      first_name: data.first_name,
      last_name: data.last_name,
      email: data.email,
      phone: data.phone,
    });

    if (!result.success) {
      if (result.error === 'SESSION_EXPIRED') {
        setJsxError(
          <>
            Your session has expired. Please{' '}
            <Link href="/signup" className="font-medium text-accent-brand hover:text-accent-ui underline">
              start over
            </Link>{' '}
            to try again.
          </>
        );
      } else if (result.error === 'STAFF_ACCOUNT') {
        setJsxError(
          <>
            This email is used for a staff account and can&apos;t be used for customer registration. Please use a different email, or{' '}
            <Link href="/login" className="font-medium text-accent-brand hover:text-accent-ui underline">
              sign in as staff
            </Link>
            .
          </>
        );
      } else {
        setJsxError('Something went wrong creating your account. Please try again. If the problem continues, contact us.');
      }
      setLoading(false);
      return;
    }

    router.push('/account');
    router.refresh();
  };

  // Post-OTP profile completion: link customer
  const onOtpProfileSubmit = async (data: OtpProfileInput) => {
    setLoading(true);
    setJsxError(null);
    setHint(null);

    const fallbackTimer = setTimeout(() => {
      setLoading(false);
      setJsxError('Something went wrong. Please try again.');
    }, 15000);

    try {
      const result = await linkAccount({
        first_name: data.first_name,
        last_name: data.last_name,
        email: data.email,
        phone: otp.otpPhone || phoneParam || '',
      });

      if (!result.success) {
        if (result.error === 'SESSION_EXPIRED') {
          setJsxError(
            <>
              Your session has expired. Please{' '}
              <Link href="/signup" className="font-medium text-accent-brand hover:text-accent-ui underline">
                start over
              </Link>{' '}
              to try again.
            </>
          );
        } else if (result.error === 'STAFF_ACCOUNT') {
          setJsxError(
            <>
              This email is used for a staff account and can&apos;t be used for customer registration. Please use a different email, or{' '}
              <Link href="/login" className="font-medium text-accent-brand hover:text-accent-ui underline">
                sign in as staff
              </Link>
              .
            </>
          );
        } else {
          setJsxError('Something went wrong creating your account. Please try again. If the problem continues, contact us.');
        }
        return;
      }

      router.push('/account');
      router.refresh();
    } catch {
      setJsxError('Something went wrong. Please try again.');
    } finally {
      clearTimeout(fallbackTimer);
      setLoading(false);
    }
  };

  if (checkingAuth) {
    return (
      <section className="flex items-center justify-center py-12 sm:py-16">
        <Spinner size="lg" />
      </section>
    );
  }

  const isOtpLoading = otp.loading;

  return (
    <section className="flex items-center justify-center py-12 sm:py-16">
      <div className="w-full max-w-md space-y-6 px-4">
        {/* Business Icon + Heading */}
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent-brand/10 border border-accent-brand/30 text-xl font-bold text-accent-brand">
            SD
          </div>
          <h1 className="mt-4 text-2xl font-bold text-site-text">
            {mode === 'otp-profile' ? 'Complete Your Profile' : 'Create Account'}
          </h1>
          <p className="mt-1 text-sm text-site-text-muted">
            {mode === 'otp-profile'
              ? `Sign up to manage your appointments at ${businessInfo?.name || 'our shop'}`
              : `Join ${businessInfo?.name || 'us'} to book and manage appointments`}
          </p>
        </div>

        {/* Card Container */}
        <div className="rounded-2xl bg-brand-surface border border-site-border p-8">
          {currentError && (
            <div className="mb-5 rounded-md bg-red-950 p-3 text-sm text-red-300">
              {currentError}
            </div>
          )}
          {hint && (
            <div className="mb-5 rounded-md border border-amber-800 bg-amber-950 p-3 text-sm text-amber-200">
              {hint}
            </div>
          )}

          {/* Post-OTP Simplified Profile Form */}
          {mode === 'otp-profile' && (
            <form onSubmit={otpProfileForm.handleSubmit(onOtpProfileSubmit)} className="space-y-5">
              {/* Phone read-only */}
              <FormField label="Mobile" htmlFor="otp-phone">
                <Input
                  id="otp-phone"
                  value={otp.otpPhone || phoneParam || ''}
                  readOnly
                  className="bg-brand-dark text-site-text-muted"
                />
              </FormField>

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  label="First Name"
                  required
                  error={otpProfileForm.formState.errors.first_name?.message}
                  htmlFor="otp-first-name"
                >
                  <Input
                    id="otp-first-name"
                    placeholder="John"
                    {...otpProfileForm.register('first_name')}
                  />
                </FormField>

                <FormField
                  label="Last Name"
                  required
                  error={otpProfileForm.formState.errors.last_name?.message}
                  htmlFor="otp-last-name"
                >
                  <Input
                    id="otp-last-name"
                    placeholder="Doe"
                    {...otpProfileForm.register('last_name')}
                  />
                </FormField>
              </div>

              <FormField
                label="Email"
                required
                error={otpProfileForm.formState.errors.email?.message}
                htmlFor="otp-email"
              >
                <Input
                  id="otp-email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  {...otpProfileForm.register('email')}
                />
              </FormField>

              <Button
                type="submit"
                disabled={loading}
                className="site-btn-primary w-full py-3 text-sm font-semibold transition-all duration-200 hover:shadow-lg"
              >
                {loading ? <Spinner size="sm" /> : 'Complete Sign Up'}
              </Button>
            </form>
          )}

          {/* Phone OTP Send */}
          {mode === 'phone-otp' && (
            <form onSubmit={phoneForm.handleSubmit(handleSendOtp)} className="space-y-5">
              <FormField
                label="Mobile"
                required
                error={phoneForm.formState.errors.phone?.message}
                htmlFor="signup-phone"
              >
                <Input
                  id="signup-phone"
                  type="tel"
                  autoComplete="tel"
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
                disabled={isOtpLoading}
                className="site-btn-primary w-full py-3 text-sm font-semibold transition-all duration-200 hover:shadow-lg"
              >
                {isOtpLoading ? <Spinner size="sm" /> : 'Continue'}
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
                  setMode('full');
                  setJsxError(null);
                  setHint(null);
                  otp.resetError();
                }}
                className="w-full rounded-full border border-site-border bg-brand-dark px-4 py-2 text-sm font-medium text-site-text-secondary transition-colors hover:bg-site-border-light"
              >
                Sign up with email
              </button>
            </form>
          )}

          {/* Phone OTP Verify */}
          {mode === 'phone-verify' && (
            <form onSubmit={otpVerifyForm.handleSubmit(handleVerifyOtp)} className="space-y-5">
              <div className="text-center">
                <p className="text-sm text-site-text-muted">
                  We sent a 6-digit code to <span className="font-medium text-site-text">{otp.otpPhone}</span>
                </p>
              </div>

              <FormField
                label="Verification code"
                required
                error={otpVerifyForm.formState.errors.code?.message}
                htmlFor="signup-otp-code"
              >
                <Input
                  id="signup-otp-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="000000"
                  className="text-center text-lg tracking-[0.3em]"
                  {...otpVerifyForm.register('code')}
                />
              </FormField>

              <Button
                type="submit"
                disabled={isOtpLoading}
                className="site-btn-primary w-full py-3 text-sm font-semibold transition-all duration-200 hover:shadow-lg"
              >
                {isOtpLoading ? <Spinner size="sm" /> : 'Verify'}
              </Button>

              <div className="flex items-center justify-between text-sm">
                <button
                  type="button"
                  onClick={() => {
                    setMode('phone-otp');
                    setJsxError(null);
                    setHint(null);
                    otp.resetToPhone();
                    otpVerifyForm.reset();
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

          {/* Full Registration (email/password) */}
          {mode === 'full' && (
            <form onSubmit={fullForm.handleSubmit(onFullSubmit)} className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  label="First Name"
                  required
                  error={fullForm.formState.errors.first_name?.message}
                  htmlFor="first_name"
                >
                  <Input
                    id="first_name"
                    placeholder="John"
                    {...fullForm.register('first_name')}
                  />
                </FormField>

                <FormField
                  label="Last Name"
                  required
                  error={fullForm.formState.errors.last_name?.message}
                  htmlFor="last_name"
                >
                  <Input
                    id="last_name"
                    placeholder="Doe"
                    {...fullForm.register('last_name')}
                  />
                </FormField>
              </div>

              <FormField label="Email" required error={fullForm.formState.errors.email?.message} htmlFor="email">
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  {...fullForm.register('email')}
                />
              </FormField>

              <FormField
                label="Mobile"
                required
                error={fullForm.formState.errors.phone?.message}
                htmlFor="phone"
              >
                <Input
                  id="phone"
                  placeholder="(310) 555-1234"
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

              <FormField label="Password" required error={fullForm.formState.errors.password?.message} htmlFor="password">
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  {...fullForm.register('password')}
                />
              </FormField>

              <FormField
                label="Confirm Password"
                required
                error={fullForm.formState.errors.confirm_password?.message}
                htmlFor="confirm_password"
              >
                <Input
                  id="confirm_password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Re-enter your password"
                  {...fullForm.register('confirm_password')}
                />
              </FormField>

              <Button
                type="submit"
                disabled={loading}
                className="site-btn-primary w-full py-3 text-sm font-semibold transition-all duration-200 hover:shadow-lg"
              >
                {loading ? <Spinner size="sm" /> : 'Create Account'}
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
                  setMode('phone-otp');
                  setJsxError(null);
                  setHint(null);
                }}
                className="w-full rounded-full border border-site-border bg-brand-dark px-4 py-2 text-sm font-medium text-site-text-secondary transition-colors hover:bg-site-border-light"
              >
                Sign up with phone
              </button>
            </form>
          )}
        </div>

        {/* Sign in link */}
        <p className="text-center text-sm text-site-text-muted">
          Already have an account?{' '}
          <Link
            href="/signin"
            className="font-medium text-accent-brand hover:text-accent-ui transition-colors"
          >
            Sign In
          </Link>
        </p>
      </div>
    </section>
  );
}
