'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useBusinessInfo } from '@/lib/hooks/use-business-info';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { toast } from 'sonner';

export default function CustomerResetPasswordPage() {
  const router = useRouter();
  const { info: businessInfo } = useBusinessInfo();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);

    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({
      password,
    });

    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }

    toast.success('Password updated successfully');
    router.push('/account');
  };

  return (
    <section className="flex items-center justify-center py-12 sm:py-16">
      <div className="w-full max-w-md space-y-6 px-4">
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-lime/10 border border-lime/30 text-xl font-bold text-lime">
            SD
          </div>
          <h1 className="mt-4 text-2xl font-bold text-site-text">
            Set New Password
          </h1>
          <p className="mt-1 text-sm text-site-text-muted">
            {businessInfo?.name || 'Our Portal'}
          </p>
        </div>

        <div className="rounded-2xl bg-brand-surface border border-site-border p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="rounded-md bg-red-950 p-3 text-sm text-red-300">
                {error}
              </div>
            )}

            <FormField label="New Password" required htmlFor="password">
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
              />
            </FormField>

            <FormField label="Confirm Password" required htmlFor="confirm-password">
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter your password"
              />
            </FormField>

            <Button
              type="submit"
              disabled={loading}
              className="w-full rounded-full bg-lime text-black font-bold hover:shadow-lg hover:shadow-lime/25 transition-all"
            >
              {loading ? 'Updating...' : 'Update Password'}
            </Button>
          </form>
        </div>
      </div>
    </section>
  );
}
