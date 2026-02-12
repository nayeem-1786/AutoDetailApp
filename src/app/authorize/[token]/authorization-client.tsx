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
      <div className="rounded-lg bg-green-50 p-4 text-center">
        <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-green-100">
          <svg className="h-5 w-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="text-sm font-medium text-green-800">Approved!</p>
        <p className="mt-1 text-xs text-green-600">Your detailer will get right on it.</p>
      </div>
    );
  }

  if (status === 'declined') {
    return (
      <div className="rounded-lg bg-gray-50 p-4 text-center">
        <p className="text-sm font-medium text-gray-700">Declined</p>
        <p className="mt-1 text-xs text-gray-500">
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
    <div className="flex gap-3">
      <button
        onClick={() => handleAction('approve')}
        disabled={status === 'loading'}
        className="flex flex-1 items-center justify-center rounded-lg bg-green-600 py-3.5 text-sm font-semibold text-white shadow-sm hover:bg-green-700 disabled:opacity-50"
      >
        {status === 'loading' ? 'Processing...' : 'Approve'}
      </button>
      <button
        onClick={() => handleAction('decline')}
        disabled={status === 'loading'}
        className="flex flex-1 items-center justify-center rounded-lg border-2 border-red-600 bg-white py-3.5 text-sm font-semibold text-red-600 shadow-sm hover:bg-red-50 disabled:opacity-50"
      >
        {status === 'loading' ? '...' : 'Decline'}
      </button>
    </div>
  );
}
