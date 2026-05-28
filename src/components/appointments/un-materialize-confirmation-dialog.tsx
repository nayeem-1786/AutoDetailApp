'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Camera, Clock, FileText, Sparkles } from 'lucide-react';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogContent,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { posFetch } from '@/app/pos/lib/pos-fetch';
import { adminFetch } from '@/lib/utils/admin-fetch';
import type { AppointmentWithRelations } from '@/lib/appointments/types';
import type { UnMaterializeData } from '@/lib/appointments/lifecycle-sync';

/**
 * Shared un-materialize confirmation dialog (Item 15e Phase 2C-β).
 *
 * Reused by BOTH surfaces (canonical-engine reuse): the admin Appointment dialog
 * Save intercept and the POS job-detail "Revert to Pending" button. The only
 * per-surface difference is `context`, which selects the endpoint URL + the auth
 * fetch wrapper (`posFetch` vs `adminFetch`).
 *
 * Flow: on open, a `dryRun` POST previews the EXACT data that will be deleted
 * (and surfaces transaction-linked / terminal blocks immediately). The operator
 * reviews the enumeration, types "DELETE" when the job is at/above the confirm
 * threshold, then Revert re-POSTs (without dryRun) to execute. No webhook fires
 * — this is a silent revert to `pending`.
 */
interface UnMaterializeConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointment: Pick<AppointmentWithRelations, 'id' | 'customer'>;
  /** Selects the endpoint + auth surface. */
  context: 'admin' | 'pos';
  /** Called after a successful un-materialize. */
  onSuccess: () => void;
}

function formatTimerDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function UnMaterializeConfirmationDialog({
  open,
  onOpenChange,
  appointment,
  context,
  onSuccess,
}: UnMaterializeConfirmationDialogProps) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<UnMaterializeData | null>(null);
  // A guard block (transaction-linked / terminal) surfaced by the dry-run.
  const [blockError, setBlockError] = useState<string | null>(null);
  const [confirmInput, setConfirmInput] = useState('');
  const [saving, setSaving] = useState(false);

  const endpoint =
    context === 'pos'
      ? `/api/pos/appointments/${appointment.id}/unmaterialize`
      : `/api/appointments/${appointment.id}/unmaterialize`;

  const doFetch = useCallback(
    (body: Record<string, unknown>) => {
      const init: RequestInit = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      };
      return context === 'pos' ? posFetch(endpoint, init) : adminFetch(endpoint, init);
    },
    [context, endpoint]
  );

  // Dry-run preview on open.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setData(null);
    setBlockError(null);
    setConfirmInput('');
    (async () => {
      try {
        const res = await doFetch({ dryRun: true });
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok) {
          setData(json.data as UnMaterializeData);
        } else if (json.error === 'transaction_linked') {
          setBlockError(
            'This job has a payment attached and cannot be reverted. Cancel the appointment instead.'
          );
        } else if (json.error === 'terminal') {
          setBlockError('This job is already completed, closed, or cancelled — revert is not applicable.');
        } else if (json.error === 'not_found') {
          setBlockError('No active job was found for this appointment.');
        } else {
          setBlockError('Could not load the revert preview. Please try again.');
        }
      } catch {
        if (!cancelled) setBlockError('Could not load the revert preview. Please try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, doFetch]);

  const confirmRequired = data?.confirmRequired ?? false;
  const canRevert =
    !!data && !saving && (!confirmRequired || confirmInput.trim() === 'DELETE');

  async function handleRevert() {
    if (!canRevert || !data) return;
    setSaving(true);
    try {
      const res = await doFetch({
        confirmString: confirmRequired ? confirmInput.trim() : 'DELETE',
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success('Reverted to pending');
        onSuccess();
        return;
      }
      if (json.error === 'transaction_linked') {
        toast.error('Cannot revert — payment attached. Cancel the appointment instead.');
      } else if (json.error === 'terminal') {
        toast.error('This job is already terminal; revert is not applicable.');
      } else if (json.error === 'confirm_required') {
        toast.error('Type DELETE to confirm.');
      } else {
        toast.error('Failed to revert. Please try again.');
      }
    } catch {
      toast.error('Failed to revert. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  const customerName = appointment.customer
    ? `${appointment.customer.first_name} ${appointment.customer.last_name}`
    : 'this appointment';

  // Enumeration rows — only rendered when the underlying data is present.
  const enumerationRows: Array<{ icon: typeof Camera; label: string }> = [];
  if (data) {
    if (data.photoCount > 0) {
      enumerationRows.push({
        icon: Camera,
        label: `${data.photoCount} photo${data.photoCount === 1 ? '' : 's'} will be permanently deleted (image files removed)`,
      });
    }
    if (data.addonCount > 0) {
      enumerationRows.push({
        icon: Sparkles,
        label: `${data.addonCount} add-on request${data.addonCount === 1 ? '' : 's'} will be deleted`,
      });
    }
    if (data.timerSeconds > 0) {
      enumerationRows.push({
        icon: Clock,
        label: `Timer progress (${formatTimerDuration(data.timerSeconds)}) will be lost`,
      });
    }
    if (data.hasIntakeNotes) {
      enumerationRows.push({ icon: FileText, label: 'Intake notes will be deleted' });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>Revert to Pending?</DialogTitle>
        <DialogDescription>
          This deletes the job and reverts {customerName} to pending. The customer is{' '}
          <strong>not</strong> notified.
        </DialogDescription>
      </DialogHeader>
      <DialogContent className="max-h-[70vh] overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-400 dark:border-gray-500 border-t-transparent" />
          </div>
        ) : blockError ? (
          <div className="flex items-start gap-2 rounded-md bg-red-50 dark:bg-red-950 p-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
            <p className="text-red-900 dark:text-red-200">{blockError}</p>
          </div>
        ) : data ? (
          <div className="space-y-4">
            {enumerationRows.length > 0 ? (
              <div className="space-y-1.5">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  The following will be deleted
                </p>
                <ul className="space-y-1.5">
                  {enumerationRows.map((row, i) => {
                    const Icon = row.icon;
                    return (
                      <li
                        key={i}
                        className="flex items-start gap-2 text-sm text-gray-900 dark:text-gray-100"
                      >
                        <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400 dark:text-gray-500" />
                        <span>{row.label}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                No photos, add-ons, timer progress, or intake notes are attached to this job.
              </p>
            )}

            {confirmRequired && (
              <div className="space-y-1.5">
                <p className="rounded-md bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                  Work is already in progress on this job. Type{' '}
                  <strong>DELETE</strong> to confirm you want to discard it.
                </p>
                <input
                  type="text"
                  value={confirmInput}
                  onChange={(e) => setConfirmInput(e.target.value)}
                  placeholder="Type DELETE"
                  autoFocus
                  className="flex w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-base sm:text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-1"
                />
              </div>
            )}
          </div>
        ) : null}
      </DialogContent>
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
          {blockError ? 'Close' : 'Keep Job'}
        </Button>
        {!blockError && (
          <Button variant="destructive" onClick={handleRevert} disabled={!canRevert}>
            {saving ? 'Reverting…' : 'Revert to Pending'}
          </Button>
        )}
      </DialogFooter>
      <DialogClose onClose={() => onOpenChange(false)} />
    </Dialog>
  );
}
