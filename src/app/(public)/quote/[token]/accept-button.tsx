'use client';

import { useState } from 'react';

interface AcceptQuoteButtonProps {
  quoteId: string;
  accessToken: string;
}

export function AcceptQuoteButton({ quoteId, accessToken }: AcceptQuoteButtonProps) {
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);
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
      <div className="rounded-lg border border-green-200 bg-green-50 px-6 py-4">
        <p className="text-lg font-semibold text-green-800">Quote Accepted!</p>
        <p className="mt-1 text-sm text-green-600">
          Thank you! We will contact you shortly to schedule your appointment.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <button
        onClick={handleAccept}
        disabled={accepting}
        className="inline-flex items-center justify-center rounded-lg bg-green-600 px-8 py-3 text-base font-semibold text-white shadow-sm transition-colors hover:bg-green-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2 disabled:opacity-50"
      >
        {accepting ? 'Accepting...' : 'Accept Quote'}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <p className="text-xs text-gray-400">
        By accepting this quote, you agree to the services and pricing listed above.
      </p>
    </div>
  );
}
