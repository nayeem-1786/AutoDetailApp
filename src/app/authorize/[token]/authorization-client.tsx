'use client';

import { useState, useEffect } from 'react';

interface AuthorizationClientProps {
  token: string;
  initialAction?: string;
}

export function AuthorizationClient({ token, initialAction }: AuthorizationClientProps) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'approved' | 'declined' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  // Auto-submit if action query param was passed (from email CTA links)
  useEffect(() => {
    if (initialAction === 'approve' || initialAction === 'decline') {
      handleAction(initialAction);
    }
  }, [initialAction]);

  async function handleAction(action: 'approve' | 'decline') {
    setStatus('loading');
    setErrorMessage('');

    try {
      const res = await fetch(`/api/authorize/${token}/${action}`, {
        method: 'POST',
      });

      if (res.ok) {
        setStatus(action === 'approve' ? 'approved' : 'declined');
      } else {
        const data = await res.json();
        if (data.status === 'approved' || data.status === 'declined') {
          setStatus(data.status);
        } else if (data.status === 'expired') {
          setErrorMessage('This authorization has expired.');
          setStatus('error');
        } else {
          setErrorMessage(data.error || 'Something went wrong');
          setStatus('error');
        }
      }
    } catch {
      setErrorMessage('Network error. Please try again.');
      setStatus('error');
    }
  }

  if (status === 'approved') {
    return (
      <div className="rounded-lg bg-green-50 p-5 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
          <svg className="h-6 w-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="text-base font-semibold text-green-800">Approved!</p>
        <p className="mt-1 text-sm text-green-600">Your detailer will get right on it. Thank you!</p>
      </div>
    );
  }

  if (status === 'declined') {
    return (
      <div className="rounded-lg bg-gray-50 p-5 text-center">
        <p className="text-base font-semibold text-gray-700">Declined</p>
        <p className="mt-1 text-sm text-gray-500">
          No problem! We&apos;ll note this as a recommendation for your next visit.
        </p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="rounded-lg bg-red-50 p-4 text-center">
        <p className="text-sm text-red-600">{errorMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <button
        onClick={() => handleAction('approve')}
        disabled={status === 'loading'}
        className="flex w-full items-center justify-center rounded-lg bg-green-600 py-4 text-base font-semibold text-white shadow-sm hover:bg-green-700 active:bg-green-800 disabled:opacity-50"
        style={{ minHeight: '48px' }}
      >
        {status === 'loading' ? 'Processing...' : 'Approve'}
      </button>
      <button
        onClick={() => handleAction('decline')}
        disabled={status === 'loading'}
        className="flex w-full items-center justify-center rounded-lg border-2 border-gray-300 bg-white py-4 text-base font-semibold text-gray-600 shadow-sm hover:bg-gray-50 active:bg-gray-100 disabled:opacity-50"
        style={{ minHeight: '48px' }}
      >
        {status === 'loading' ? '...' : 'Decline'}
      </button>
    </div>
  );
}
