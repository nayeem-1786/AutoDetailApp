'use client';

import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogHeader, DialogTitle, DialogContent, DialogFooter } from './dialog';
import { Button } from './button';
import { Input } from './input';
import { useEnterSubmit } from '@/lib/hooks/use-enter-submit';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'destructive';
  loading?: boolean;
  onConfirm: () => void;
  /** If provided, user must type this text to enable the confirm button */
  requireConfirmText?: string;
  /**
   * When true, the type-to-confirm input is hidden and the confirm button
   * is disabled regardless of typed text. Used when external state (e.g.
   * a precondition failure surfaced via preview) blocks confirmation
   * until the caller resolves it. Defaults to false.
   */
  blockedByExternalError?: boolean;
}

function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  loading = false,
  onConfirm,
  requireConfirmText,
  blockedByExternalError = false,
}: ConfirmDialogProps) {
  const [confirmInput, setConfirmInput] = useState('');

  // Reset input when dialog opens/closes
  useEffect(() => {
    if (!open) {
      setConfirmInput('');
    }
  }, [open]);

  const isConfirmDisabled =
    loading ||
    blockedByExternalError ||
    Boolean(requireConfirmText && confirmInput !== requireConfirmText);
  const enterSubmit = useEnterSubmit(onConfirm, !isConfirmDisabled);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
      </DialogHeader>
      <DialogContent>
        <div className="text-sm text-ui-text-muted">{description}</div>
        {requireConfirmText && !blockedByExternalError && (
          <div className="mt-4">
            <Input
              placeholder={`Type "${requireConfirmText}" to confirm`}
              value={confirmInput}
              onChange={(e) => setConfirmInput(e.target.value)}
              autoComplete="off"
              {...enterSubmit}
            />
          </div>
        )}
      </DialogContent>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
          {cancelLabel}
        </Button>
        <Button
          type="button"
          variant={variant === 'destructive' ? 'destructive' : 'default'}
          onClick={onConfirm}
          disabled={isConfirmDisabled}
        >
          {loading ? 'Processing...' : confirmLabel}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// useConfirmDialog — convenience hook for replacing confirm() calls
// ---------------------------------------------------------------------------

interface ConfirmState {
  title: string;
  description: string;
  confirmLabel?: string;
  variant?: 'default' | 'destructive';
  onConfirm: () => void;
}

function useConfirmDialog() {
  const [state, setState] = useState<ConfirmState | null>(null);

  const confirm = useCallback(
    (opts: ConfirmState) => {
      setState(opts);
    },
    []
  );

  const dialogProps = {
    open: state !== null,
    onOpenChange: (open: boolean) => { if (!open) setState(null); },
    title: state?.title ?? '',
    description: state?.description ?? '',
    confirmLabel: state?.confirmLabel ?? 'Delete',
    variant: (state?.variant ?? 'destructive') as 'default' | 'destructive',
    onConfirm: () => {
      state?.onConfirm();
      setState(null);
    },
  };

  return { confirm, dialogProps, ConfirmDialog };
}

export { ConfirmDialog, useConfirmDialog };
