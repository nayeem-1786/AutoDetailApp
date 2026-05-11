'use client';

// Phase Mobile-1.1 — non-blocking dialog shown after a POS Create-Job or
// Save-Quote success when the entered mobile address differs from the
// customer's profile address (LOCKED-6 Context A).
//
// "Update profile" PATCHes /api/pos/customers/[id]/address and closes with
// a success toast. "Skip" closes without saving.

import { useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogContent,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { posFetch } from '../../lib/pos-fetch';

interface SaveAddressDialogProps {
  open: boolean;
  onClose: () => void;
  customerId: string;
  currentProfileAddress: string | null;
  enteredAddress: string;
}

export function SaveAddressDialog({
  open,
  onClose,
  customerId,
  currentProfileAddress,
  enteredAddress,
}: SaveAddressDialogProps) {
  const [saving, setSaving] = useState(false);

  async function handleConfirm() {
    setSaving(true);
    try {
      const res = await posFetch(`/api/pos/customers/${customerId}/address`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entered_address: enteredAddress }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || 'Failed to save address');
      }
      toast.success('Customer profile address updated');
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save address');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogHeader>
        <DialogTitle>Save address to customer profile?</DialogTitle>
      </DialogHeader>
      <DialogContent>
        <p className="text-sm text-ui-text-muted">
          Customer&apos;s profile has a different address on file.
        </p>
        <dl className="mt-4 space-y-2 text-sm">
          <div className="grid grid-cols-[auto_1fr] gap-x-3">
            <dt className="font-medium text-ui-text-muted">On file:</dt>
            <dd className="text-ui-text">
              {currentProfileAddress || <span className="text-ui-text-dim italic">(none)</span>}
            </dd>
          </div>
          <div className="grid grid-cols-[auto_1fr] gap-x-3">
            <dt className="font-medium text-ui-text-muted">Entered:</dt>
            <dd className="text-ui-text">{enteredAddress}</dd>
          </div>
        </dl>
      </DialogContent>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
          Skip
        </Button>
        <Button type="button" onClick={handleConfirm} disabled={saving}>
          {saving ? 'Saving…' : 'Update profile'}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
