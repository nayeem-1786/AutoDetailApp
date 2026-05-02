'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface ProcessingRefreshProps {
  url: string;
  delaySeconds: number;
}

/**
 * Auto-advances the page after a short delay so the server component re-reads
 * the appointment and reflects whatever the webhook has written. Used by the
 * "Confirming payment…" state — the prompt's meta-refresh equivalent, kept as
 * a tiny client component so we don't fight Next's head hoisting rules.
 */
export function ProcessingRefresh({ url, delaySeconds }: ProcessingRefreshProps) {
  const router = useRouter();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      router.replace(url);
      router.refresh();
    }, delaySeconds * 1000);
    return () => window.clearTimeout(timer);
  }, [url, delaySeconds, router]);

  return null;
}
