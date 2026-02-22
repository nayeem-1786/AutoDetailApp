'use client';

import { useCallback, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { toast } from 'sonner';
import { PinScreen } from '../components/pin-screen';
import { storePosSession } from '../context/pos-auth-context';
import type { PosSessionEmployee } from '../context/pos-auth-context';

function PosLoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextUrl = searchParams.get('next');
  const reason = searchParams.get('reason');

  // Show session expired toast when redirected from auth failure
  useEffect(() => {
    if (reason === 'session_expired') {
      toast.info('Your session has expired. Please log in again.');
    }
  }, [reason]);

  const handleSuccess = useCallback(
    (data: { token: string; employee: PosSessionEmployee; idle_timeout_minutes: number }) => {
      storePosSession({
        token: data.token,
        employee: data.employee,
        idleTimeoutMinutes: data.idle_timeout_minutes,
      });

      const dest = nextUrl && nextUrl.startsWith('/pos') ? nextUrl : '/pos';
      router.replace(dest);
    },
    [router, nextUrl]
  );

  return <PinScreen onSuccess={handleSuccess} />;
}

export default function PosLoginPage() {
  return (
    <Suspense>
      <PosLoginInner />
    </Suspense>
  );
}
