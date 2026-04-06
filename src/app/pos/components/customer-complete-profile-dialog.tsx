'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogContent,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { posFetch } from '../lib/pos-fetch';
import { formatPhone } from '@/lib/utils/format';
import type { Customer, CustomerType } from '@/lib/supabase/types';

const TYPE_OPTIONS: { value: CustomerType; label: string; activeClass: string }[] = [
  { value: 'enthusiast', label: 'Enthusiast', activeClass: 'bg-blue-600 dark:bg-blue-500 text-white border-blue-600 dark:border-blue-500' },
  { value: 'professional', label: 'Professional', activeClass: 'bg-purple-600 text-white border-purple-600' },
];

interface CustomerCompleteProfileDialogProps {
  open: boolean;
  customer: Customer | null;
  onComplete: (updatedCustomer: Customer) => void;
  onClose: () => void;
}

export function CustomerCompleteProfileDialog({
  open,
  customer,
  onComplete,
  onClose,
}: CustomerCompleteProfileDialogProps) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [customerType, setCustomerType] = useState<CustomerType | null>(null);
  const [typeError, setTypeError] = useState(false);
  const [saving, setSaving] = useState(false);

  // Reset form when customer changes
  const [lastCustomerId, setLastCustomerId] = useState<string | null>(null);
  if (customer && customer.id !== lastCustomerId) {
    setLastCustomerId(customer.id);
    setFirstName(customer.first_name || '');
    setLastName(customer.last_name || '');
    setEmail(customer.email || '');
    setCustomerType(customer.customer_type || null);
    setTypeError(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!customer) return;

    if (!firstName.trim() || !lastName.trim()) {
      toast.error('First name and last name are required');
      return;
    }

    if (!customerType) {
      setTypeError(true);
      toast.error('Please select a customer type');
      return;
    }

    setSaving(true);
    try {
      const res = await posFetch(`/api/pos/customers/${customer.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          email: email.trim() || null,
          customer_type: customerType,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        toast.error(json.error || 'Failed to update customer');
        return;
      }

      toast.success(`Updated ${firstName.trim()} ${lastName.trim()}`);
      // Merge the update back into the full customer object
      const updatedCustomer: Customer = {
        ...customer,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim() || null,
        customer_type: customerType,
      };
      onComplete(updatedCustomer);
    } catch {
      toast.error('Failed to update customer');
    } finally {
      setSaving(false);
    }
  }

  if (!customer) return null;

  return (
    <Dialog open={open} onOpenChange={() => { /* prevent close by clicking outside */ }}>
      <DialogHeader>
        <DialogTitle>Complete Customer Profile</DialogTitle>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {customer.phone ? formatPhone(customer.phone) : 'Unknown phone'} — fill in the required details to continue.
        </p>
      </DialogHeader>
      <form onSubmit={handleSubmit}>
        <DialogContent className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                First Name <span className="text-red-500">*</span>
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
                Last Name <span className="text-red-500">*</span>
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
              Email
            </label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jane@example.com"
            />
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
              Collect email for receipts &amp; promotions
            </p>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
              Customer Type <span className="text-red-500">*</span>
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
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Save &amp; Continue
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
