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

// Post-OTP profile completion schema — email is optional for phone-first signup
const profileSchema = z.object({
  first_name: z.string().min(1, 'Required'),
  last_name: z.string().min(1, 'Required'),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
});

type ProfileInput = z.infer<typeof profileSchema>;

type SignupMode = 'phone' | 'otp' | 'profile';

export default function CustomerSignUpPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const phoneParam = searchParams.get('phone');
  const { info: businessInfo } = useBusinessInfo();
  const [jsxError, setJsxError] = useState<ReactNode | null>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<SignupMode>('phone');
  const [checkingAuth, setCheckingAuth] = useState(!!phoneParam);
  const signedOutRef = useRef(false);

  const { checkExists, linkAccount } = useCustomerLink();

  // --- Phone OTP hook ---
  const otp = usePhoneOtp({
    mode: 'sign-up',
    onBeforeSend: async (phone) => {
      const phoneCheck = await checkExists({ phone });
      if (phoneCheck.exists && phoneCheck.hasAuthAccount) {
        return { abort: true, error: AUTH_ERRORS.PHONE_ALREADY_LINKED };
      }
      // Voice-agent customer (exists without auth) or brand new — proceed to OTP
      return { abort: false };
    },
    onVerified: () => {
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

  // Determine initial mode based on params and auth state
  useEffect(() => {
    if (!phoneParam) {
      setCheckingAuth(false);
      return;
    }

    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }: { data: { user: unknown } }) => {
      if (user) {
        // Post-OTP flow: user authenticated, phone pre-filled, show profile form
        setMode('profile');
      } else {
        // Phone param but not authenticated — start fresh OTP signup
        setMode('phone');
      }
      setCheckingAuth(false);
    }).catch(() => {
      setCheckingAuth(false);
      setMode('phone');
    });
  }, [phoneParam]);

  // Sync OTP phase → mode
  useEffect(() => {
    if (otp.phase === 'otp' && mode === 'phone') setMode('otp');
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
          </>
        );
      default:
        return err;
    }
  };

  const currentError = renderError();

  // Phone OTP send form
  const phoneForm = useForm<PhoneOtpSendInput>({
    resolver: formResolver(phoneOtpSendSchema),
  });

  // OTP verify form
  const otpVerifyForm = useForm<PhoneOtpVerifyInput>({
    resolver: formResolver(phoneOtpVerifySchema),
    defaultValues: { phone: '', code: '' },
  });

  // Post-OTP profile form
  const profileForm = useForm<ProfileInput>({
    resolver: formResolver(profileSchema),
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

  // Post-OTP profile completion: link customer
  const onProfileSubmit = async (data: ProfileInput) => {
    setLoading(true);
    setJsxError(null);

    const fallbackTimer = setTimeout(() => {
      setLoading(false);
      setJsxError('Something went wrong. Please try again.');
    }, 15000);

    try {
      const result = await linkAccount({
        first_name: data.first_name,
        last_name: data.last_name,
        email: data.email || undefined,
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
            {mode === 'profile' ? 'Complete Your Profile' : 'Create Account'}
          </h1>
          <p className="mt-1 text-sm text-site-text-muted">
            {mode === 'profile'
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

          {/* Phone Entry */}
          {mode === 'phone' && (
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
                  autoFocus
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
                disabled={isOtpLoading}
                className="site-btn-primary w-full py-3 text-sm font-semibold transition-all duration-200 hover:shadow-lg"
              >
                {isOtpLoading ? <Spinner size="sm" /> : 'Continue'}
              </Button>
            </form>
          )}

          {/* OTP Verification */}
          {mode === 'otp' && (
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
                  autoFocus
                  maxLength={6}
                  placeholder="000000"
                  className="text-center text-lg tracking-[0.3em] text-base sm:text-sm"
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
                    setMode('phone');
                    setJsxError(null);
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

          {/* Profile Completion */}
          {mode === 'profile' && (
            <form onSubmit={profileForm.handleSubmit(onProfileSubmit)} className="space-y-5">
              {/* Phone read-only */}
              <FormField label="Mobile" htmlFor="profile-phone">
                <Input
                  id="profile-phone"
                  value={otp.otpPhone || phoneParam || ''}
                  readOnly
                  className="bg-brand-dark text-site-text-muted text-base sm:text-sm"
                />
              </FormField>

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
                <p className="mt-1 text-xs text-site-text-dim">
                  Optional — for booking confirmations &amp; receipts
                </p>
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
