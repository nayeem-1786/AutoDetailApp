'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogContent,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { posFetch } from '../lib/pos-fetch';
import { Button } from '@/components/ui/button';
import type { CustomerType } from '@/lib/supabase/types';

interface CustomerTypePromptProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string;
  customerName: string;
  onTypeSelected: (newType: CustomerType | null) => void;
}

const TYPE_OPTIONS: { value: CustomerType; label: string; description: string; color: string }[] = [
  {
    value: 'enthusiast',
    label: 'Enthusiast',
    description: 'Personal vehicle owner who cares about their car',
    color: 'border-blue-400 bg-blue-50 text-blue-700 hover:bg-blue-100',
  },
  {
    value: 'professional',
    label: 'Professional',
    description: 'Detailer, dealer, fleet manager, or other business customer',
    color: 'border-purple-400 bg-purple-50 text-purple-700 hover:bg-purple-100',
  },
];

export function CustomerTypePrompt({
  open,
  onOpenChange,
  customerId,
  customerName,
  onTypeSelected,
}: CustomerTypePromptProps) {
  const [saving, setSaving] = useState(false);

  async function handleSelect(type: CustomerType) {
    setSaving(true);
    try {
      const res = await posFetch(`/api/pos/customers/${customerId}/type`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_type: type }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to update');

      onTypeSelected(json.data?.customer_type ?? type);
      onOpenChange(false);
    } catch {
      toast.error('Failed to save customer type');
    } finally {
      setSaving(false);
    }
  }

  function handleSkip() {
    onTypeSelected(null);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogClose onClose={() => onOpenChange(false)} />
      <DialogHeader>
        <DialogTitle>Customer Type</DialogTitle>
      </DialogHeader>
      <DialogContent>
        <p className="mb-4 text-sm text-gray-600">
          What type of customer is <span className="font-medium text-gray-900">{customerName}</span>?
        </p>
        <div className="space-y-2">
          {TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => handleSelect(opt.value)}
              disabled={saving}
              className={`flex w-full items-start gap-3 rounded-lg border-2 p-3 text-left transition-all ${opt.color} ${saving ? 'opacity-50' : ''}`}
            >
              <div>
                <p className="text-sm font-semibold">{opt.label}</p>
                <p className="text-xs opacity-75">{opt.description}</p>
              </div>
            </button>
          ))}
        </div>
      </DialogContent>
      <DialogFooter>
        <Button variant="ghost" size="sm" onClick={handleSkip} disabled={saving}>
          Skip for now
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
