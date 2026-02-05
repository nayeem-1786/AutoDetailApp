'use client';

import { useState, useEffect, useCallback } from 'react';
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
import { BUSINESS } from '@/lib/utils/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import { Spinner } from '@/components/ui/spinner';

type AuthMode = 'phone' | 'otp' | 'email';

export default function CustomerSignInPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect') || '/account';
  const [mode, setMode] = useState<AuthMode>('phone');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [otpPhone, setOtpPhone] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);

  // Cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  // Phone form
  const phoneForm = useForm<PhoneOtpSendInput>({
    resolver: formResolver(phoneOtpSendSchema),
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
        setError('This account is a staff account. Please use the staff login.');
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
        // No customer record — redirect to signup with phone pre-filled
        const phoneParam = encodeURIComponent(data.phone);
        router.push(`/signup?phone=${phoneParam}`);
        return;
      }
    }

    router.push(redirectTo);
    router.refresh();
  }, [redirectTo, router]);

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

  const onEmailSubmit = async (data: LoginInput) => {
    setLoading(true);
    setError(null);

    const supabase = createClient();

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });

    if (authError) {
      setError(authError.message);
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
        setError('This account is a staff account. Please use the staff login.');
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
        setError('No customer account found. Please sign up first.');
        setLoading(false);
        return;
      }
    }

    router.push(redirectTo);
    router.refresh();
  };

  return (
    <section className="flex items-center justify-center py-12 sm:py-16">
      <div className="w-full max-w-md space-y-6">
        {/* Business Logo/Icon + Heading */}
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-gray-900 text-xl font-bold text-white">
            SD
          </div>
          <h1 className="mt-4 text-2xl font-bold text-gray-900">
            Welcome to {BUSINESS.NAME.split(' & ')[0]}
          </h1>
        </div>

        {/* Card Container */}
        <div className="rounded-2xl bg-white p-8 shadow-lg">
          {error && (
            <div className="mb-5 rounded-md bg-red-50 p-3 text-sm text-red-700">
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
                  setMode('email');
                  setError(null);
                }}
                className="w-full rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                Sign in with email
              </button>
            </form>
          )}

          {/* OTP Verification Mode */}
          {mode === 'otp' && (
            <form onSubmit={otpForm.handleSubmit(verifyOtp)} className="space-y-5">
              <div className="text-center">
                <p className="text-sm text-gray-600">
                  We sent a 6-digit code to <span className="font-medium text-gray-900">{otpPhone}</span>
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
                  {...otpForm.register('code')}
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
                    setMode('phone');
                    setError(null);
                    otpForm.reset();
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

          {/* Email Sign-in Mode */}
          {mode === 'email' && (
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
                className="w-full rounded-full bg-gray-900 text-white hover:bg-gray-800"
              >
                {loading ? <Spinner size="sm" /> : 'Sign In'}
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
                  setMode('phone');
                  setError(null);
                }}
                className="w-full rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                Sign in with phone
              </button>
            </form>
          )}
        </div>

        {/* Sign up link */}
        <p className="text-center text-sm text-gray-600">
          Don&apos;t have an account?{' '}
          <Link
            href="/signup"
            className="font-medium text-gray-900 hover:text-gray-700"
          >
            Sign up
          </Link>
        </p>
      </div>
    </section>
  );
}
