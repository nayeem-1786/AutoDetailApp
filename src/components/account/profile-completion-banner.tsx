'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCustomerAuth } from '@/lib/auth/customer-auth-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import { Spinner } from '@/components/ui/spinner';
import { UserRoundPen, Mail, X, Check } from 'lucide-react';

/**
 * Unified profile completion card for the customer dashboard.
 * Dynamically shows inline-editable fields for whatever data is missing:
 * - First Name (required) — shown if empty
 * - Last Name (required) — shown if empty
 * - Email (optional) — shown if empty (with CTA messaging)
 *
 * Name fields are NOT dismissable (required for booking).
 * Email-only case is session-dismissable via "Maybe Later".
 *
 * After saving name fields, they disappear. Email saves immediately to
 * the customer record (unverified) and shows a "verify on Profile page" nudge.
 */
export function ProfileCompletionBanner() {
  const { customer, refreshCustomer } = useCustomerAuth();
  const router = useRouter();
  const [dismissed, setDismissed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameSaved, setNameSaved] = useState(false);

  // Form state for missing fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');

  // Pre-fill on first render when customer loads
  const [initialized, setInitialized] = useState(false);
  if (customer && !initialized) {
    setInitialized(true);
    setFirstName(customer.first_name || '');
    setLastName(customer.last_name || '');
    setEmail(customer.email || '');
  }

  if (!customer) return null;
  if (dismissed) return null;

  // Determine what's missing
  const missingFirstName = !customer.first_name?.trim();
  const missingLastName = !customer.last_name?.trim();
  const missingName = missingFirstName || missingLastName;
  const missingEmail = !customer.email;
  const hasUnverifiedEmail = !!customer.email && !customer.email_verified_at;

  // Nothing missing (and email is verified or present) → hide
  if (!missingName && !missingEmail && !hasUnverifiedEmail) return null;

  // If name was just saved and only email/verification remains, allow dismissal
  // Also allow dismissal if only email is missing (name already complete)
  const emailOnlyCase = !missingName && (missingEmail || hasUnverifiedEmail);
  const isDismissable = emailOnlyCase;

  // If name was saved this session and no email issue remains, hide entirely
  if (nameSaved && !missingEmail && !hasUnverifiedEmail) return null;

  // Email-only: unverified email → redirect to profile for verification
  if (!missingName && hasUnverifiedEmail && !missingEmail) {
    return (
      <div className="mb-6 rounded-lg border border-accent-brand/30 bg-accent-brand/10 p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-brand/20">
            <Mail className="h-4.5 w-4.5 text-accent-brand" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-site-text">Verify your email</p>
            <p className="mt-0.5 text-xs text-site-text-muted">
              Verify your email to receive booking confirmations and receipts.
            </p>
            <div className="mt-3 flex items-center gap-3">
              <Button
                size="sm"
                onClick={() => router.push('/account/profile')}
                className="h-8 rounded-full px-4 text-xs"
              >
                Verify Email
              </Button>
              <button
                type="button"
                onClick={() => setDismissed(true)}
                className="text-xs text-site-text-muted hover:text-site-text transition-colors"
              >
                Maybe Later
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="shrink-0 rounded p-1 text-site-text-muted hover:text-site-text hover:bg-site-border-light transition-colors"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  const handleSave = async () => {
    setError(null);

    // Validate required fields
    if (missingFirstName && !firstName.trim()) {
      setError('First name is required.');
      return;
    }
    if (missingLastName && !lastName.trim()) {
      setError('Last name is required.');
      return;
    }

    setSaving(true);
    try {
      // Save name via complete-profile endpoint
      const nameNeedsUpdate = missingFirstName || missingLastName;
      if (nameNeedsUpdate) {
        const res = await fetch('/api/customer/complete-profile', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            email: missingEmail && email.trim() ? email.trim() : '',
          }),
        });

        if (!res.ok) {
          const data = await res.json();
          setError(data.error || 'Failed to save. Please try again.');
          return;
        }
      } else if (missingEmail && email.trim()) {
        // Only email missing, no name update needed — save email via profile endpoint
        const res = await fetch('/api/customer/complete-profile', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            first_name: customer.first_name,
            last_name: customer.last_name,
            email: email.trim(),
          }),
        });

        if (!res.ok) {
          const data = await res.json();
          setError(data.error || 'Failed to save. Please try again.');
          return;
        }
      }

      // Refresh customer context so the component re-evaluates
      await refreshCustomer();
      setNameSaved(true);

      // If email was provided, nudge to verify it on the profile page
      if (email.trim() && missingEmail) {
        // Email saved but needs verification — component will re-render
        // and show the "verify email" variant or be dismissed
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // Determine heading and description
  let heading: string;
  let description: string;

  if (missingName && missingEmail) {
    heading = 'Complete your profile';
    description = 'Add your name and email to finish setting up your account.';
  } else if (missingName) {
    heading = 'Complete your profile';
    description = 'Add your name to finish setting up your account.';
  } else {
    // Email only
    heading = 'Complete Your Profile \u2014 Email Address Missing';
    description = 'Add your email for booking confirmations, digital receipts, and easy account recovery.';
  }

  return (
    <div className="mb-6 rounded-xl border border-accent-brand/30 bg-accent-brand/5 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-brand/20 mt-0.5">
            {missingName ? (
              <UserRoundPen className="h-4.5 w-4.5 text-accent-brand" />
            ) : (
              <Mail className="h-4.5 w-4.5 text-accent-brand" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-site-text">{heading}</p>
            <p className="mt-0.5 text-xs text-site-text-muted">{description}</p>
          </div>
        </div>

        {isDismissable && (
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="shrink-0 rounded p-1 text-site-text-muted hover:text-site-text hover:bg-site-border-light transition-colors"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="mt-4 space-y-3 pl-12">
        {/* Name fields — only show missing ones */}
        {(missingFirstName || missingLastName) && (
          <div className="grid gap-3 sm:grid-cols-2">
            {missingFirstName && (
              <FormField label="First Name" required htmlFor="banner-first-name">
                <Input
                  id="banner-first-name"
                  placeholder="John"
                  value={firstName}
                  onChange={(e) => { setFirstName(e.target.value); setError(null); }}
                  className="text-base sm:text-sm"
                />
              </FormField>
            )}
            {missingLastName && (
              <FormField label="Last Name" required htmlFor="banner-last-name">
                <Input
                  id="banner-last-name"
                  placeholder="Doe"
                  value={lastName}
                  onChange={(e) => { setLastName(e.target.value); setError(null); }}
                  className="text-base sm:text-sm"
                />
              </FormField>
            )}
          </div>
        )}

        {/* Email field — show if missing */}
        {missingEmail && (
          <FormField label="Email" htmlFor="banner-email">
            <Input
              id="banner-email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(null); }}
              className="text-base sm:text-sm"
            />
          </FormField>
        )}

        {error && (
          <p className="text-sm text-red-400">{error}</p>
        )}

        <div className="flex items-center gap-3">
          <Button
            size="sm"
            disabled={saving}
            onClick={handleSave}
            className="h-8 rounded-full px-5 text-xs"
          >
            {saving ? <Spinner size="sm" /> : (
              <span className="flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5" />
                Save
              </span>
            )}
          </Button>
          {isDismissable && (
            <button
              type="button"
              onClick={() => setDismissed(true)}
              className="text-xs text-site-text-muted hover:text-site-text transition-colors"
            >
              Maybe Later
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
