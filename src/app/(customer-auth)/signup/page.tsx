'use client';

import { useState, useEffect } from 'react';
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
import { formatPhoneInput, normalizePhone } from '@/lib/utils/format';
import { BUSINESS } from '@/lib/utils/constants';
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
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<SignupMode>('full');
  const [otpPhone, setOtpPhone] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [checkingAuth, setCheckingAuth] = useState(!!phoneParam);

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
        setOtpPhone(phoneParam);
        setMode('otp-profile');
      } else {
        // Phone param but not authenticated — start fresh OTP signup
        setMode('phone-otp');
      }
      setCheckingAuth(false);
    });
  }, [phoneParam]);

  // Cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

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

  // Full registration: create auth user + link customer
  const onFullSubmit = async (data: CustomerSignupInput) => {
    setLoading(true);
    setError(null);

    const supabase = createClient();

    const { error: signUpError } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
    });

    if (signUpError) {
      setError(signUpError.message);
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
      setError(linkData.error || 'Failed to create account');
      setLoading(false);
      return;
    }

    router.push('/account');
    router.refresh();
  };

  // Phone OTP signup: send OTP
  const sendOtp = async (data: PhoneOtpSendInput) => {
    setLoading(true);
    setError(null);

    const e164 = normalizePhone(data.phone);
    if (!e164) {
      setError('Invalid phone number');
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const { error: otpError } = await supabase.auth.signInWithOtp({ phone: e164 });

    if (otpError) {
      setError(otpError.message);
      setLoading(false);
      return;
    }

    setOtpPhone(data.phone);
    otpVerifyForm.setValue('phone', data.phone);
    setResendCooldown(60);
    setMode('phone-verify');
    setLoading(false);
  };

  // Verify OTP during signup
  const verifyOtp = async (data: PhoneOtpVerifyInput) => {
    setLoading(true);
    setError(null);

    const e164 = normalizePhone(data.phone);
    if (!e164) {
      setError('Invalid phone number');
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
      setError(verifyError.message);
      setLoading(false);
      return;
    }

    // OTP verified — switch to profile completion
    setMode('otp-profile');
    setLoading(false);
  };

  const resendOtp = async () => {
    if (resendCooldown > 0) return;
    setError(null);

    const e164 = normalizePhone(otpPhone);
    if (!e164) return;

    const supabase = createClient();
    const { error: otpError } = await supabase.auth.signInWithOtp({ phone: e164 });

    if (otpError) {
      setError(otpError.message);
      return;
    }

    setResendCooldown(60);
  };

  // Post-OTP profile completion: link customer
  const onOtpProfileSubmit = async (data: OtpProfileInput) => {
    setLoading(true);
    setError(null);

    const linkRes = await fetch('/api/customer/link-account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        first_name: data.first_name,
        last_name: data.last_name,
        email: data.email,
        phone: otpPhone || phoneParam,
      }),
    });

    const linkData = await linkRes.json();

    if (!linkRes.ok) {
      setError(linkData.error || 'Failed to create account');
      setLoading(false);
      return;
    }

    router.push('/account');
    router.refresh();
  };

  if (checkingAuth) {
    return (
      <section className="flex items-center justify-center py-12 sm:py-16">
        <Spinner size="lg" />
      </section>
    );
  }

  return (
    <section className="flex items-center justify-center py-12 sm:py-16">
      <div className="w-full max-w-md space-y-6">
        {/* Business Icon + Heading */}
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-gray-900 text-xl font-bold text-white">
            SD
          </div>
          <h1 className="mt-4 text-2xl font-bold text-gray-900">
            {mode === 'otp-profile' ? 'Complete Your Profile' : 'Create Account'}
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            {mode === 'otp-profile'
              ? `Sign up to manage your appointments at ${BUSINESS.NAME.split(' & ')[0]}`
              : `Join ${BUSINESS.NAME.split(' & ')[0]} to book and manage appointments`}
          </p>
        </div>

        {/* Card Container */}
        <div className="rounded-2xl bg-white p-8 shadow-lg">
          {error && (
            <div className="mb-5 rounded-md bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Post-OTP Simplified Profile Form */}
          {mode === 'otp-profile' && (
            <form onSubmit={otpProfileForm.handleSubmit(onOtpProfileSubmit)} className="space-y-5">
              {/* Phone read-only */}
              <FormField label="Mobile" htmlFor="otp-phone">
                <Input
                  id="otp-phone"
                  value={otpPhone || phoneParam || ''}
                  readOnly
                  className="bg-gray-50 text-gray-500"
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
                className="w-full rounded-full bg-gray-900 text-white hover:bg-gray-800"
              >
                {loading ? <Spinner size="sm" /> : 'Complete Sign Up'}
              </Button>
            </form>
          )}

          {/* Phone OTP Send */}
          {mode === 'phone-otp' && (
            <form onSubmit={phoneForm.handleSubmit(sendOtp)} className="space-y-5">
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
                disabled={loading}
                className="w-full rounded-full bg-gray-900 text-white hover:bg-gray-800"
              >
                {loading ? <Spinner size="sm" /> : 'Continue'}
              </Button>

              {/* Divider */}
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-gray-200" />
                <span className="text-xs font-medium text-gray-400">OR</span>
                <div className="h-px flex-1 bg-gray-200" />
              </div>

              <button
                type="button"
                onClick={() => {
                  setMode('full');
                  setError(null);
                }}
                className="w-full rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                Sign up with email
              </button>
            </form>
          )}

          {/* Phone OTP Verify */}
          {mode === 'phone-verify' && (
            <form onSubmit={otpVerifyForm.handleSubmit(verifyOtp)} className="space-y-5">
              <div className="text-center">
                <p className="text-sm text-gray-600">
                  We sent a 6-digit code to <span className="font-medium text-gray-900">{otpPhone}</span>
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
                disabled={loading}
                className="w-full rounded-full bg-gray-900 text-white hover:bg-gray-800"
              >
                {loading ? <Spinner size="sm" /> : 'Verify'}
              </Button>

              <div className="flex items-center justify-between text-sm">
                <button
                  type="button"
                  onClick={() => {
                    setMode('phone-otp');
                    setError(null);
                    otpVerifyForm.reset();
                  }}
                  className="text-gray-600 hover:text-gray-900"
                >
                  Change number
                </button>
                <button
                  type="button"
                  onClick={resendOtp}
                  disabled={resendCooldown > 0}
                  className="text-gray-600 hover:text-gray-900 disabled:text-gray-400"
                >
                  {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
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
                className="w-full rounded-full bg-gray-900 text-white hover:bg-gray-800"
              >
                {loading ? <Spinner size="sm" /> : 'Create Account'}
              </Button>

              {/* Divider */}
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-gray-200" />
                <span className="text-xs font-medium text-gray-400">OR</span>
                <div className="h-px flex-1 bg-gray-200" />
              </div>

              <button
                type="button"
                onClick={() => {
                  setMode('phone-otp');
                  setError(null);
                }}
                className="w-full rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                Sign up with phone
              </button>
            </form>
          )}
        </div>

        {/* Sign in link */}
        <p className="text-center text-sm text-gray-600">
          Already have an account?{' '}
          <Link
            href="/signin"
            className="font-medium text-gray-900 hover:text-gray-700"
          >
            Sign In
          </Link>
        </p>
      </div>
    </section>
  );
}
