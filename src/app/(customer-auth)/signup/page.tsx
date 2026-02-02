'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useForm } from 'react-hook-form';
import { formResolver } from '@/lib/utils/form';
import { customerSignupSchema, type CustomerSignupInput } from '@/lib/utils/validation';
import { formatPhoneInput } from '@/lib/utils/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';

export default function CustomerSignUpPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<CustomerSignupInput>({
    resolver: formResolver(customerSignupSchema),
  });

  const onSubmit = async (data: CustomerSignupInput) => {
    setLoading(true);
    setError(null);

    const supabase = createClient();

    // 1. Create auth user
    const { error: signUpError } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
    });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    // 2. Link auth user to customer record
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

  return (
    <section className="flex items-center justify-center py-12 sm:py-16">
      <div className="w-full max-w-md space-y-8 rounded-lg bg-white p-8 shadow-lg">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">Create Account</h1>
          <p className="mt-2 text-sm text-gray-600">
            Sign up to manage your appointments and vehicles
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {error && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="First Name" required error={errors.first_name?.message} htmlFor="first_name">
              <Input
                id="first_name"
                placeholder="John"
                {...register('first_name')}
              />
            </FormField>

            <FormField label="Last Name" required error={errors.last_name?.message} htmlFor="last_name">
              <Input
                id="last_name"
                placeholder="Doe"
                {...register('last_name')}
              />
            </FormField>
          </div>

          <FormField label="Email" required error={errors.email?.message} htmlFor="email">
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              {...register('email')}
            />
          </FormField>

          <FormField
            label="Phone"
            required
            error={errors.phone?.message}
            description="(XXX) XXX-XXXX"
            htmlFor="phone"
          >
            <Input
              id="phone"
              placeholder="(310) 555-1234"
              {...register('phone', {
                onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                  const formatted = formatPhoneInput(e.target.value);
                  setValue('phone', formatted, {
                    shouldDirty: true,
                    shouldValidate: true,
                  });
                },
              })}
            />
          </FormField>

          <FormField label="Password" required error={errors.password?.message} htmlFor="password">
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              placeholder="At least 8 characters"
              {...register('password')}
            />
          </FormField>

          <FormField
            label="Confirm Password"
            required
            error={errors.confirm_password?.message}
            htmlFor="confirm_password"
          >
            <Input
              id="confirm_password"
              type="password"
              autoComplete="new-password"
              placeholder="Re-enter your password"
              {...register('confirm_password')}
            />
          </FormField>

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Creating account...' : 'Create Account'}
          </Button>
        </form>

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
