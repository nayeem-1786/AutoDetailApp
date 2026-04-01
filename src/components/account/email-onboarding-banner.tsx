'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCustomerAuth } from '@/lib/auth/customer-auth-provider';
import { Mail, ShieldAlert, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Banner encouraging customers to add or verify their email.
 * - No email → "Add your email" message
 * - Email present but unverified → "Verify your email" message
 * - Email verified → hidden
 * Session-dismissable via "Maybe Later" — reappears on next visit.
 */
export function EmailOnboardingBanner() {
  const { customer } = useCustomerAuth();
  const router = useRouter();
  const [dismissed, setDismissed] = useState(false);

  if (!customer) return null;
  if (customer.email && customer.email_verified_at) return null;
  if (dismissed) return null;

  const hasUnverifiedEmail = !!customer.email && !customer.email_verified_at;

  function handleDismiss() {
    setDismissed(true);
  }

  function handleAction() {
    router.push('/account/profile');
  }

  return (
    <div className="mb-6 rounded-lg border border-accent-brand/30 bg-accent-brand/10 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-brand/20">
          {hasUnverifiedEmail ? (
            <ShieldAlert className="h-4.5 w-4.5 text-accent-brand" />
          ) : (
            <Mail className="h-4.5 w-4.5 text-accent-brand" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-site-text">
            {hasUnverifiedEmail ? 'Verify your email' : 'Complete your profile'}
          </p>
          <p className="mt-0.5 text-xs text-site-text-muted">
            {hasUnverifiedEmail
              ? 'Verify your email to receive booking confirmations and receipts.'
              : 'Add your email for booking confirmations, digital receipts, and easy account recovery.'}
          </p>
          <div className="mt-3 flex items-center gap-3">
            <Button
              size="sm"
              onClick={handleAction}
              className="h-8 rounded-full px-4 text-xs"
            >
              {hasUnverifiedEmail ? 'Verify Email' : 'Add Email'}
            </Button>
            <button
              type="button"
              onClick={handleDismiss}
              className="text-xs text-site-text-muted hover:text-site-text transition-colors"
            >
              Maybe Later
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          className="shrink-0 rounded p-1 text-site-text-muted hover:text-site-text hover:bg-site-border-light transition-colors"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
