'use client';

import { useState } from 'react';
import { ShieldAlert, Loader2 } from 'lucide-react';
import { Dialog, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { PinPad } from './pin-pad';
import { posFetch } from '../lib/pos-fetch';

interface ManagerPinDialogProps {
  /** The permission key to verify (e.g., 'pos.override_prerequisites', 'pos.discount_override') */
  permissionKey: string;
  /** Called with the employee's full name on successful verification */
  onSuccess: (employeeName: string) => void;
  /** Called when the user cancels */
  onCancel: () => void;
}

/**
 * Generic manager PIN override dialog.
 * Verifies a 4-digit PIN against an employee who has the specified permission.
 * Reusable for any permission-gated override flow (prerequisites, discounts, etc.).
 */
export function ManagerPinDialog({ permissionKey, onSuccess, onCancel }: ManagerPinDialogProps) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function handleDigit(digit: string) {
    if (pin.length < 4) {
      setPin((prev) => prev + digit);
      setError(null);
    }
  }

  function handleBackspace() {
    setPin((prev) => prev.slice(0, -1));
    setError(null);
  }

  async function handleSubmit() {
    if (pin.length !== 4) return;

    setLoading(true);
    setError(null);

    try {
      const res = await posFetch('/api/pos/auth/verify-override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin, permission_key: permissionKey }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Verification failed');
        setPin('');
        setLoading(false);
        return;
      }

      onSuccess(data.employee_name);
    } catch {
      setError('Connection error');
      setPin('');
      setLoading(false);
    }
  }

  // Auto-submit when 4 digits entered
  const pinDisplay = pin.padEnd(4, ' ').split('').map((c) => (c !== ' ' ? '●' : '○'));

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogClose onClose={onCancel} className="hidden pointer-fine:flex items-center justify-center h-8 w-8" />
      <div className="p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30">
            <ShieldAlert className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Manager Override
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Enter manager PIN to authorize
            </p>
          </div>
        </div>

        {/* PIN dots display */}
        <div className="flex justify-center gap-4 mb-4">
          {pinDisplay.map((dot, i) => (
            <span
              key={i}
              className="text-2xl text-gray-900 dark:text-gray-100"
            >
              {dot}
            </span>
          ))}
        </div>

        {/* Error message */}
        {error && (
          <p className="mb-3 text-center text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        {/* PIN pad */}
        <div className="max-w-[280px] mx-auto">
          <PinPad
            onDigit={handleDigit}
            onBackspace={handleBackspace}
            onAction={handleSubmit}
            actionLabel={loading ? 'Verifying...' : 'Verify'}
            size="sm"
          />
        </div>

        <div className="mt-4 flex justify-center">
          <Button variant="outline" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
