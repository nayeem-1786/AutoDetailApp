'use client';

import { useState } from 'react';

interface AcceptQuoteButtonProps {
  quoteId: string;
  accessToken: string;
  totalAmount: string;
}

export function AcceptQuoteButton({ quoteId, accessToken, totalAmount }: AcceptQuoteButtonProps) {
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAccept() {
    setAccepting(true);
    setError(null);

    try {
      const res = await fetch(`/api/quotes/${quoteId}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: accessToken }),
      });

      if (res.ok) {
        setAccepted(true);
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to accept quote. Please try again.');
      }
    } catch {
      setError('An error occurred. Please try again.');
    } finally {
      setAccepting(false);
    }
  }

  if (accepted) {
    return (
      <div className="rounded-lg border border-green-800 bg-green-950 px-6 py-4">
        <p className="text-lg font-semibold text-green-200">Quote Accepted!</p>
        <p className="mt-1 text-sm text-green-400">
          Thank you! We will contact you shortly to schedule your appointment.
        </p>
      </div>
    );
  }

  if (confirming) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-amber-800 bg-amber-950 px-6 py-4">
          <p className="text-sm font-semibold text-amber-200">
            Confirm acceptance of this {totalAmount} estimate?
          </p>
          <p className="mt-1 text-sm text-amber-300">
            We&apos;ll reach out to schedule your appointment.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleAccept}
            disabled={accepting}
            className="inline-flex items-center justify-center rounded-lg bg-green-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-green-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2 disabled:opacity-50"
          >
            {accepting ? 'Accepting...' : 'Yes, Accept'}
          </button>
          <button
            onClick={() => setConfirming(false)}
            disabled={accepting}
            className="inline-flex items-center justify-center rounded-lg border border-white/20 bg-brand-surface px-6 py-2.5 text-sm font-medium text-gray-300 transition-colors hover:bg-white/5 disabled:opacity-50"
          >
            Go Back
          </button>
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <button
        onClick={() => setConfirming(true)}
        className="inline-flex items-center justify-center rounded-lg bg-green-600 px-8 py-3 text-base font-semibold text-white shadow-sm transition-colors hover:bg-green-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2"
      >
        Accept Quote
      </button>
      <p className="text-xs text-gray-500">
        By accepting this quote, you agree to the services and pricing listed above.
      </p>
    </div>
  );
}
