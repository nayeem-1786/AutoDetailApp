'use client';

import { useState, useCallback, useRef } from 'react';
import { Lock } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useBusinessInfo } from '@/lib/hooks/use-business-info';
import type { PosSessionEmployee } from '../context/pos-auth-context';
import { PinPad } from './pin-pad';

interface PinScreenProps {
  /** Last employee name shown as subtitle context (lock screen) */
  lastSessionName?: string | null;
  /** Called with API response data on successful PIN entry */
  onSuccess: (data: { token: string; employee: PosSessionEmployee; idle_timeout_minutes: number }) => void;
  /** Render as fixed overlay (lock) vs full page (login) */
  overlay?: boolean;
}

export function PinScreen({ lastSessionName, onSuccess, overlay }: PinScreenProps) {
  const { info: businessInfo } = useBusinessInfo();
  const [digits, setDigits] = useState('');
  const digitsRef = useRef('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [shake, setShake] = useState(false);

  const handleSubmit = useCallback(
    async (pin: string) => {
      submittingRef.current = true;
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

        onSuccess(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Invalid PIN');
        digitsRef.current = '';
        setDigits('');
        setShake(true);
        setTimeout(() => setShake(false), 500);
      } finally {
        submittingRef.current = false;
        setSubmitting(false);
      }
    },
    [onSuccess]
  );

  const handleDigit = useCallback((d: string) => {
    if (d === '.' || submittingRef.current) return;

    const current = digitsRef.current;
    if (current.length >= 4) return;

    const next = current + d;
    digitsRef.current = next;
    setDigits(next);
    setError(null);

    if (next.length === 4) {
      handleSubmit(next);
    }
  }, [handleSubmit]);

  const handleBackspace = useCallback(() => {
    if (submittingRef.current) return;
    const next = digitsRef.current.slice(0, -1);
    digitsRef.current = next;
    setDigits(next);
    setError(null);
  }, []);

  const content = (
    <div className="w-full max-w-sm px-4">
      {/* Logo / Header */}
      <div className="mb-8 flex flex-col items-center gap-3">
        {businessInfo?.logo_url && (
          <img
            src={businessInfo.logo_url}
            alt={businessInfo.name || 'Business logo'}
            className="h-32 w-auto object-contain"
          />
        )}
        <h2 className="flex items-center gap-2 text-2xl font-bold text-white">
          <Lock className="h-6 w-6 text-gray-400" />
          Enter PIN
          <Lock className="h-6 w-6 text-gray-400" />
        </h2>
        {lastSessionName && (
          <p className="text-sm text-gray-500">
            Last session: {lastSessionName}
          </p>
        )}
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
              'h-4 w-4 rounded-full border-2 transition-colors duration-100',
              i < digits.length
                ? 'border-white bg-white'
                : 'border-gray-600 bg-transparent'
            )}
          />
        ))}
      </div>

      {error && (
        <p className="mb-4 text-center text-sm text-red-400">{error}</p>
      )}

      {submitting && (
        <p className="mb-4 text-center text-sm text-gray-400">Verifying...</p>
      )}

      <PinPad
        onDigit={handleDigit}
        onBackspace={handleBackspace}
        size="lg"
        variant="dark"
      />

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

  if (overlay) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-900/95 touch-manipulation">
        {content}
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-900 px-4 touch-manipulation">
      {content}
    </div>
  );
}
