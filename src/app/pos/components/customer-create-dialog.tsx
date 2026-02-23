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
import { formatPhoneInput } from '@/lib/utils/format';
import type { Customer, CustomerType } from '@/lib/supabase/types';

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
  const [saving, setSaving] = useState(false);

  // Duplicate check state
  const [phoneDup, setPhoneDup] = useState<DuplicateError | null>(null);
  const [emailDup, setEmailDup] = useState<DuplicateError | null>(null);
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
        }),
      });

      const json = await res.json();

      if (!res.ok) {
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
    setPhoneDup(null);
    setEmailDup(null);
    onBack?.();
  }

  return (
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
  );
}
