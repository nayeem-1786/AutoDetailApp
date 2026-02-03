'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogContent,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatPhoneInput } from '@/lib/utils/format';
import type { Customer } from '@/lib/supabase/types';

interface CustomerCreateDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (customer: Customer) => void;
  onBack?: () => void;
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
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!firstName.trim() || !lastName.trim() || !phone.trim()) {
      toast.error('All fields are required');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/pos/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          phone,
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
    onClose();
  }

  function handleBack() {
    setFirstName('');
    setLastName('');
    setPhone('');
    onBack?.();
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogClose onClose={handleClose} />
      <DialogHeader>
        {onBack && (
          <button
            type="button"
            onClick={handleBack}
            className="mb-1 flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
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
              <label className="mb-1 block text-xs font-medium text-gray-600">
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
              <label className="mb-1 block text-xs font-medium text-gray-600">
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
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Phone
            </label>
            <Input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(formatPhoneInput(e.target.value))}
              placeholder="(310) 555-0123"
            />
          </div>
        </DialogContent>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Create
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
