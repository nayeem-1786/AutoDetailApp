'use client';

import { AlertTriangle } from 'lucide-react';
import { Dialog, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface PrerequisiteRemovalDialogProps {
  prerequisiteName: string;
  dependentName: string;
  onRemoveBoth: () => void;
  onCancel: () => void;
}

export function PrerequisiteRemovalDialog({
  prerequisiteName,
  dependentName,
  onRemoveBoth,
  onCancel,
}: PrerequisiteRemovalDialogProps) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogClose onClose={onCancel} className="hidden pointer-fine:flex items-center justify-center h-8 w-8" />
      <div className="p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Remove Prerequisite?
          </h2>
        </div>

        <p className="text-sm text-gray-600 dark:text-gray-400">
          <strong className="text-gray-900 dark:text-gray-100">{prerequisiteName}</strong> is required by{' '}
          <strong className="text-gray-900 dark:text-gray-100">{dependentName}</strong>.
          Remove both services?
        </p>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onRemoveBoth}>
            Remove Both
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
