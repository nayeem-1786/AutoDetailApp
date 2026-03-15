'use client';

import { AlertTriangle, ShieldAlert, Plus } from 'lucide-react';
import { Dialog, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { usePosPermission } from '../context/pos-permission-context';
import { formatDate } from '@/lib/utils/format';
import type { PrerequisiteWarning } from '../hooks/use-prerequisite-check';

interface PrerequisiteWarningDialogProps {
  warning: PrerequisiteWarning;
  onClose: () => void;
  /** Override: add the service without prerequisites */
  onOverride: () => void;
  /** Add a prerequisite service to the ticket, then add the original service */
  onAddPrerequisite: (prerequisiteServiceName: string) => void;
}

export function PrerequisiteWarningDialog({
  warning,
  onClose,
  onOverride,
  onAddPrerequisite,
}: PrerequisiteWarningDialogProps) {
  const { granted: canOverride, loading: permLoading } = usePosPermission('pos.override_prerequisites');
  const unmetPrereqs = warning.prerequisites.filter((p) => !p.met_by);
  const hasRequired = unmetPrereqs.some((p) => p.enforcement !== 'recommended');
  const isRecommendedOnly = unmetPrereqs.every((p) => p.enforcement === 'recommended');

  // Build the list of prerequisite service names for display
  const prereqNames = unmetPrereqs.map((p) => p.service_name);
  const daysText = unmetPrereqs[0]?.required_within_days
    ? ` within the last ${unmetPrereqs[0].required_within_days} days`
    : '';
  const customMessage = unmetPrereqs.find((p) => p.warning_message)?.warning_message;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogClose onClose={onClose} className="hidden pointer-fine:flex items-center justify-center h-8 w-8" />
      <div className="p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {isRecommendedOnly ? 'Service Recommendation' : 'Service Prerequisite Required'}
          </h2>
        </div>

        <div className="text-sm text-gray-600 dark:text-gray-400 space-y-2">
          {customMessage ? (
            <p>{customMessage}</p>
          ) : (
            <p>
              <strong className="text-gray-900 dark:text-gray-100">{warning.service.name}</strong>
              {hasRequired ? ' requires ' : ' is recommended to have '}
              <strong className="text-gray-900 dark:text-gray-100">
                {prereqNames.join(' or ')}
              </strong>
              {daysText}. No qualifying service found.
            </p>
          )}

          {/* Show met prerequisites if any */}
          {warning.prerequisites.filter((p) => p.met_by).map((p, idx) => (
            <p key={idx} className="text-green-600 dark:text-green-400">
              ✓ {p.service_name} — {p.met_by!.source === 'ticket'
                ? 'on current ticket'
                : `completed ${p.met_by!.date ? formatDate(p.met_by!.date) : 'recently'}`}
            </p>
          ))}
        </div>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>

          {/* Add prerequisite to ticket — only show first unmet prerequisite */}
          {unmetPrereqs.length > 0 && (
            <Button
              variant="outline"
              onClick={() => onAddPrerequisite(unmetPrereqs[0].service_name)}
              className="gap-1.5"
            >
              <Plus className="h-4 w-4" />
              Add {unmetPrereqs[0].service_name}
            </Button>
          )}

          {/* Override button */}
          {isRecommendedOnly ? (
            <Button onClick={onOverride}>
              Add Anyway
            </Button>
          ) : (
            <Button
              onClick={onOverride}
              disabled={permLoading || !canOverride}
              title={!canOverride && !permLoading ? 'You do not have permission to override prerequisites' : undefined}
              className="gap-1.5"
            >
              <ShieldAlert className="h-4 w-4" />
              Override
            </Button>
          )}
        </div>

        {hasRequired && !canOverride && !permLoading && (
          <p className="mt-2 text-xs text-gray-400 dark:text-gray-500 text-right">
            Override requires manager permission
          </p>
        )}
      </div>
    </Dialog>
  );
}
