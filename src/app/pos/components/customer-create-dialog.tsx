'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogClose,
  DialogHeader,
  DialogTitle,
  DialogContent,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { posFetch } from '../lib/pos-fetch';
import { formatPhone, formatPhoneInput, formatDate } from '@/lib/utils/format';
import type { Customer, CustomerType } from '@/lib/supabase/types';

interface ArchivedMatch {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  deleted_at: string;
}

interface CustomerCreateDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (customer: Customer) => void;
  onBack?: () => void;
}

const TYPE_OPTIONS: { value: CustomerType; label: string; activeClass: string }[] = [
  { value: 'enthusiast', label: 'Enthusiast', activeClass: 'bg-blue-600 dark:bg-blue-500 text-white border-blue-600 dark:border-blue-500' },
  { value: 'professional', label: 'Professional', activeClass: 'bg-purple-600 text-white border-purple-600' },
];

const CONSENT_OPTIONS: { value: boolean; label: string; activeClass: string }[] = [
  { value: true, label: 'Yes', activeClass: 'bg-green-600 dark:bg-green-500 text-white border-green-600 dark:border-green-500' },
  { value: false, label: 'No', activeClass: 'bg-gray-600 dark:bg-gray-500 text-white border-gray-600 dark:border-gray-500' },
];

interface DuplicateError {
  name: string;
}

export function CustomerCreateDialog({
  open,
  onClose,
  onCreated,
  onBack,
}: CustomerCreateDialogProps) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [customerType, setCustomerType] = useState<CustomerType | null>(null);
  const [typeError, setTypeError] = useState(false);
  const [smsConsent, setSmsConsent] = useState<boolean | null>(null);
  const [smsConsentError, setSmsConsentError] = useState(false);
  const [emailConsent, setEmailConsent] = useState<boolean | null>(null);
  const [emailConsentError, setEmailConsentError] = useState(false);
  const [saving, setSaving] = useState(false);

  // Duplicate check state
  const [phoneDup, setPhoneDup] = useState<DuplicateError | null>(null);
  const [emailDup, setEmailDup] = useState<DuplicateError | null>(null);

  // Archived match state
  const [archivedMatch, setArchivedMatch] = useState<ArchivedMatch | null>(null);
  const [restoringArchived, setRestoringArchived] = useState(false);
  const phoneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const emailTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced phone duplicate check
  useEffect(() => {
    if (phoneTimerRef.current) clearTimeout(phoneTimerRef.current);

    const digits = phone.replace(/\D/g, '');
    if (digits.length < 10) {
      setPhoneDup(null);
      return;
    }

    phoneTimerRef.current = setTimeout(async () => {
      try {
        const res = await posFetch(`/api/pos/customers/check-duplicate?phone=${encodeURIComponent(phone)}`);
        const json = await res.json();
        if (json.exists && json.field === 'phone') {
          setPhoneDup({ name: `${json.match.first_name} ${json.match.last_name}` });
        } else {
          setPhoneDup(null);
        }
      } catch {
        setPhoneDup(null);
      }
    }, 500);

    return () => {
      if (phoneTimerRef.current) clearTimeout(phoneTimerRef.current);
    };
  }, [phone]);

  // Debounced email duplicate check
  useEffect(() => {
    if (emailTimerRef.current) clearTimeout(emailTimerRef.current);

    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes('@')) {
      setEmailDup(null);
      return;
    }

    emailTimerRef.current = setTimeout(async () => {
      try {
        const res = await posFetch(`/api/pos/customers/check-duplicate?email=${encodeURIComponent(trimmed)}`);
        const json = await res.json();
        if (json.exists && json.field === 'email') {
          setEmailDup({ name: `${json.match.first_name} ${json.match.last_name}` });
        } else {
          setEmailDup(null);
        }
      } catch {
        setEmailDup(null);
      }
    }, 500);

    return () => {
      if (emailTimerRef.current) clearTimeout(emailTimerRef.current);
    };
  }, [email]);

  const hasDuplicateError = !!phoneDup || !!emailDup;
  const hasEmail = email.trim().length > 0;

  // Email consent only applies when email is provided. Clearing the email field
  // resets the email-consent state so the next entry starts fresh and the
  // validation error doesn't linger after the slot becomes irrelevant.
  useEffect(() => {
    if (!hasEmail) {
      setEmailConsent(null);
      setEmailConsentError(false);
    }
  }, [hasEmail]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!firstName.trim() || !lastName.trim() || !phone.trim()) {
      toast.error('First name, last name, and mobile are required');
      return;
    }

    if (!customerType) {
      setTypeError(true);
      toast.error('Please select a customer type');
      return;
    }

    let consentBlocked = false;
    if (smsConsent === null) {
      setSmsConsentError(true);
      consentBlocked = true;
    }
    if (hasEmail && emailConsent === null) {
      setEmailConsentError(true);
      consentBlocked = true;
    }
    if (consentBlocked) {
      toast.error('Please answer the SMS and Email consent questions');
      return;
    }

    if (hasDuplicateError) return;

    setSaving(true);
    try {
      const res = await posFetch('/api/pos/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          phone,
          email: email.trim() || undefined,
          customer_type: customerType,
          sms_consent: smsConsent,
          ...(hasEmail ? { email_consent: emailConsent } : {}),
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        if (res.status === 409 && json.archived_match) {
          setArchivedMatch(json.archived_match);
          return;
        }
        toast.error(json.error || 'Failed to create customer');
        return;
      }

      toast.success(`Created ${firstName} ${lastName}`);
      onCreated(json.data as Customer);
      handleClose();
    } catch {
      toast.error('Failed to create customer');
    } finally {
      setSaving(false);
    }
  }

  function handleClose() {
    setFirstName('');
    setLastName('');
    setPhone('');
    setEmail('');
    setCustomerType(null);
    setTypeError(false);
    setSmsConsent(null);
    setSmsConsentError(false);
    setEmailConsent(null);
    setEmailConsentError(false);
    setPhoneDup(null);
    setEmailDup(null);
    onClose();
  }

  function handleBack() {
    setFirstName('');
    setLastName('');
    setPhone('');
    setEmail('');
    setCustomerType(null);
    setTypeError(false);
    setSmsConsent(null);
    setSmsConsentError(false);
    setEmailConsent(null);
    setEmailConsentError(false);
    setPhoneDup(null);
    setEmailDup(null);
    onBack?.();
  }

  return (
    <>
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogClose onClose={handleClose} className="hidden pointer-fine:flex items-center justify-center h-8 w-8" />
      <DialogHeader>
        {onBack && (
          <button
            type="button"
            onClick={handleBack}
            className="mb-1 flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to search
          </button>
        )}
        <DialogTitle>New Customer</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit}>
        <DialogContent className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                First Name
              </label>
              <Input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="First name"
                autoFocus
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                Last Name
              </label>
              <Input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Last name"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
              Mobile
            </label>
            <Input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(formatPhoneInput(e.target.value))}
              placeholder="(310) 555-1234"
            />
            {phoneDup && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                Phone already belongs to {phoneDup.name}
              </p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
              Email
            </label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jane@example.com"
            />
            {emailDup && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                Email already belongs to {emailDup.name}
              </p>
            )}
          </div>
          {/* TCPA consent capture (Session 6b). SMS slot always rendered + required;
              email slot reserves 50% width even when no email is entered, so the
              row layout never jitters as the email field is filled or cleared. */}
          <div className="grid grid-cols-2 gap-3" data-testid="consent-row">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                SMS Consent
              </label>
              <div className="flex gap-2" role="group" aria-label="SMS Consent">
                {CONSENT_OPTIONS.map((opt) => (
                  <button
                    key={`sms-${opt.label}`}
                    type="button"
                    aria-pressed={smsConsent === opt.value}
                    onClick={() => {
                      setSmsConsent(opt.value);
                      setSmsConsentError(false);
                    }}
                    className={`flex-1 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                      smsConsent === opt.value
                        ? opt.activeClass
                        : smsConsentError
                          ? 'border-red-400 dark:border-red-500 bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                          : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {smsConsentError && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                  Required
                </p>
              )}
            </div>
            <div>
              {hasEmail ? (
                <>
                  <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                    Email Consent
                  </label>
                  <div className="flex gap-2" role="group" aria-label="Email Consent">
                    {CONSENT_OPTIONS.map((opt) => (
                      <button
                        key={`email-${opt.label}`}
                        type="button"
                        aria-pressed={emailConsent === opt.value}
                        onClick={() => {
                          setEmailConsent(opt.value);
                          setEmailConsentError(false);
                        }}
                        className={`flex-1 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                          emailConsent === opt.value
                            ? opt.activeClass
                            : emailConsentError
                              ? 'border-red-400 dark:border-red-500 bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                              : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  {emailConsentError && (
                    <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                      Required
                    </p>
                  )}
                </>
              ) : null}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
              Customer Type
            </label>
            <div className="flex gap-2">
              {TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => {
                    setCustomerType(opt.value);
                    setTypeError(false);
                  }}
                  className={`flex-1 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                    customerType === opt.value
                      ? opt.activeClass
                      : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {typeError && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                Please select a customer type
              </p>
            )}
          </div>
        </DialogContent>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving || hasDuplicateError}>
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Create
          </Button>
        </DialogFooter>
      </form>
    </Dialog>

    {/* Archived Customer Match Dialog */}
    <Dialog open={!!archivedMatch} onOpenChange={(open) => { if (!open) setArchivedMatch(null); }}>
      <DialogHeader>
        <DialogTitle>Archived Customer Found</DialogTitle>
      </DialogHeader>
      <DialogContent>
        {archivedMatch && (
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm text-gray-700 dark:text-gray-300">
                <strong>{archivedMatch.first_name} {archivedMatch.last_name}</strong> ({formatPhone(archivedMatch.phone) || archivedMatch.phone}) was archived on {formatDate(archivedMatch.deleted_at)}.
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Restoring will reactivate their account with full history. Loyalty points will be reset to zero.
              </p>
            </div>
            <div className="flex flex-col gap-2 pt-2">
              <Button
                className="min-h-[44px]"
                disabled={restoringArchived}
                onClick={async () => {
                  setRestoringArchived(true);
                  try {
                    const res = await posFetch(`/api/admin/customers/${archivedMatch.id}/restore`, { method: 'POST' });
                    if (!res.ok) throw new Error('Failed to restore');
                    const custRes = await posFetch(`/api/pos/customers/search?q=${encodeURIComponent(archivedMatch.phone || '')}`);
                    const custJson = await custRes.json();
                    const restored = custJson.data?.[0];
                    if (restored) {
                      toast.success(`Restored ${restored.first_name} ${restored.last_name}`);
                      onCreated(restored as Customer);
                      handleClose();
                    } else {
                      toast.success('Customer restored');
                      handleClose();
                    }
                  } catch {
                    toast.error('Failed to restore customer');
                  } finally {
                    setRestoringArchived(false);
                    setArchivedMatch(null);
                  }
                }}
              >
                {restoringArchived ? 'Restoring...' : 'Restore Customer'}
              </Button>
              <Button
                variant="ghost"
                className="min-h-[44px]"
                disabled={restoringArchived}
                onClick={() => setArchivedMatch(null)}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
    </>
  );
}
