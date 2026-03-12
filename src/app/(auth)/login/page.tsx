'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useForm } from 'react-hook-form';
import { formResolver } from '@/lib/utils/form';
import { loginSchema, type LoginInput } from '@/lib/utils/validation';
import { useBusinessInfo } from '@/lib/hooks/use-business-info';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect') || '/admin';
  const reason = searchParams.get('reason');
  const { info: businessInfo } = useBusinessInfo();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetSent, setResetSent] = useState(false);
  const signedOutRef = useRef(false);

  const sessionExpired = reason === 'session_expired';
  const notAuthorized = reason === 'not_authorized';

  // Clear any stale session on mount — prevents cross-surface cookie
  // conflicts (e.g. customer session interfering with admin login).
  useEffect(() => {
    if (signedOutRef.current) return;
    signedOutRef.current = true;
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }: { data: { session: unknown } }) => {
      if (session) supabase.auth.signOut();
    }).catch(() => {});
  }, []);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: formResolver(loginSchema),
  });

  const onSubmit = async (data: LoginInput) => {
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
        setError(authError.message);
        return;
      }

      router.push(redirectTo);
      router.refresh();
    } catch (err) {
      console.error('Admin sign-in error:', err);
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
      setError('Please enter your email address');
      return;
    }

    setLoading(true);

    const supabase = createClient();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(resetEmail, {
      redirectTo: `${window.location.origin}/auth/callback?next=/login/reset-password`,
    });

    if (resetError) {
      setError(resetError.message);
      setLoading(false);
      return;
    }

    setResetSent(true);
    setLoading(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">{businessInfo?.name || '\u00A0'}</CardTitle>
          <CardDescription>Sign in to your staff account</CardDescription>
        </CardHeader>
        <CardContent>
          {forgotMode ? (
            <div className="space-y-6">
              {error && (
                <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              {resetSent ? (
                <div className="space-y-4">
                  <div className="rounded-md bg-green-50 border border-green-200 p-3 text-sm text-green-800">
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
                    className="text-sm text-gray-600 hover:text-gray-900"
                  >
                    &larr; Back to sign in
                  </button>
                </div>
              ) : (
                <form onSubmit={handleForgotPassword} className="space-y-6">
                  <p className="text-sm text-gray-600">
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

                  <Button type="submit" disabled={loading} className="w-full">
                    {loading ? 'Sending...' : 'Send Reset Link'}
                  </Button>

                  <button
                    type="button"
                    onClick={() => {
                      setForgotMode(false);
                      setResetEmail('');
                      setError(null);
                    }}
                    className="block text-sm text-gray-600 hover:text-gray-900"
                  >
                    &larr; Back to sign in
                  </button>
                </form>
              )}
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              {sessionExpired && (
                <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
                  Your session has expired. Please sign in again.
                </div>
              )}

              {notAuthorized && (
                <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                  Your account does not have staff access.
                </div>
              )}

              {error && (
                <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <FormField
                label="Email"
                error={errors.email?.message}
                required
                htmlFor="email"
              >
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  {...register('email')}
                  placeholder="you@example.com"
                />
              </FormField>

              <FormField
                label="Password"
                error={errors.password?.message}
                required
                htmlFor="password"
              >
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  {...register('password')}
                  placeholder="Enter your password"
                />
              </FormField>

              <Button
                type="submit"
                disabled={loading}
                className="w-full"
              >
                {loading ? 'Signing in...' : 'Sign In'}
              </Button>

              <button
                type="button"
                onClick={() => {
                  setForgotMode(true);
                  setError(null);
                }}
                className="block w-full text-center text-sm text-gray-600 hover:text-gray-900"
              >
                Forgot password?
              </button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
