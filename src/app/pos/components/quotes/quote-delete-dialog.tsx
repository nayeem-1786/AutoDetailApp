'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogContent,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { posFetch } from '../../lib/pos-fetch';

interface QuoteDeleteDialogProps {
  open: boolean;
  onClose: () => void;
  quoteId: string;
  quoteNumber: string;
  onDeleted: () => void;
}

export function QuoteDeleteDialog({
  open,
  onClose,
  quoteId,
  quoteNumber,
  onDeleted,
}: QuoteDeleteDialogProps) {
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await posFetch(`/api/pos/quotes/${quoteId}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete');
      }

      toast.success(`Quote ${quoteNumber} deleted`);
      onDeleted();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete quote');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogClose onClose={onClose} />
      <DialogHeader>
        <DialogTitle>Delete Quote</DialogTitle>
      </DialogHeader>
      <DialogContent>
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-md bg-red-50 p-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
            <div className="text-sm text-red-700">
              <p className="font-medium">Are you sure?</p>
              <p className="mt-1">
                This will permanently delete quote <strong>{quoteNumber}</strong> and all its items. This action cannot be undone.
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={deleting} className="flex-1">
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
              className="flex-1"
            >
              {deleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Delete'
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
