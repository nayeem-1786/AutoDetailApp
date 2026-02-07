'use client';

import { useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { cn } from '@/lib/utils/cn';
import { useBusinessInfo } from '@/lib/hooks/use-business-info';
import { PinPad } from '../components/pin-pad';
import { storePosSession } from '../context/pos-auth-context';

function PosLoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextUrl = searchParams.get('next');
  const { info: businessInfo } = useBusinessInfo();
  const [digits, setDigits] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [shake, setShake] = useState(false);

  const handleSubmit = useCallback(async (pin: string) => {
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/pos/auth/pin-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Invalid PIN');
      }

      // Store POS session in sessionStorage (no Supabase auth involved)
      storePosSession({
        token: data.token,
        employee: data.employee,
        idleTimeoutMinutes: data.idle_timeout_minutes,
      });

      // Redirect to intended destination or default POS home
      const dest = nextUrl && nextUrl.startsWith('/pos') ? nextUrl : '/pos';
      router.replace(dest);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid PIN');
      setDigits('');
      setShake(true);
      setTimeout(() => setShake(false), 500);
    } finally {
      setSubmitting(false);
    }
  }, [router]);

  function handleDigit(d: string) {
    if (d === '.' || submitting) return;
    const next = digits + d;
    if (next.length > 4) return;

    setDigits(next);
    setError(null);

    // Auto-submit on 4th digit
    if (next.length === 4) {
      handleSubmit(next);
    }
  }

  function handleBackspace() {
    if (submitting) return;
    setDigits(digits.slice(0, -1));
    setError(null);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-900 px-4">
      <div className="w-full max-w-sm">
        {/* Logo / Business Name */}
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-white">{businessInfo?.name ? `${businessInfo.name} POS` : 'POS'}</h1>
          <p className="mt-2 text-sm text-gray-400">Enter passcode</p>
        </div>

        {/* Dot indicators */}
        <div
          className={cn(
            'mb-8 flex items-center justify-center gap-4',
            shake && 'animate-shake'
          )}
        >
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={cn(
                'h-4 w-4 rounded-full border-2 transition-all duration-150',
                i < digits.length
                  ? 'border-white bg-white'
                  : 'border-gray-500 bg-transparent'
              )}
            />
          ))}
        </div>

        {/* Error message */}
        {error && (
          <p className="mb-4 text-center text-sm text-red-400">{error}</p>
        )}

        {/* Submitting indicator */}
        {submitting && (
          <p className="mb-4 text-center text-sm text-gray-400">Signing in...</p>
        )}

        {/* Pin pad */}
        <PinPad
          onDigit={handleDigit}
          onBackspace={handleBackspace}
          size="lg"
        />
      </div>

      <style jsx>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-8px); }
          20%, 40%, 60%, 80% { transform: translateX(8px); }
        }
        .animate-shake {
          animation: shake 0.5s ease-in-out;
        }
      `}</style>
    </div>
  );
}

export default function PosLoginPage() {
  return (
    <Suspense>
      <PosLoginInner />
    </Suspense>
  );
}
