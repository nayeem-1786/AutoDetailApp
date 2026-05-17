'use client';

import { Pencil, AlertCircle } from 'lucide-react';
import { useTicket } from '../context/ticket-context';
import { serializeTicketEditSlice } from '../context/ticket-reducer';

/**
 * Item 15f Phase 1 Layer 8c — edit-mode visual indicator.
 *
 * Renders a subtle pill above the Sale tab content when `ticket.editMode`
 * is true. Surfaces "Editing Appointment #XXX" (or "Editing Job #XXX") and
 * an "Unsaved changes" badge when the cart has diverged from the
 * initial-load snapshot.
 *
 * Returns `null` outside edit mode so the bare `/pos` surface is unchanged.
 */
export function EditModeBanner() {
  const { ticket } = useTicket();
  if (!ticket.editMode || !ticket.sourceId) return null;

  // Friendly identifier: the audit-log style "#abc12345" — first 8 chars of
  // the UUID. Layer 8d may resolve this to an `appointment_number` /
  // `job.id`-prefixed friendly id later; for now the operator can recognize
  // the record by the trailing path of the deep-link URL they came from.
  const shortId = ticket.sourceId.slice(0, 8);
  const label =
    ticket.source === 'appointment'
      ? `Editing Appointment #${shortId}`
      : ticket.source === 'job'
        ? `Editing Job #${shortId}`
        : `Editing #${shortId}`;

  // Dirty detection: serialize current state, compare to the snapshot the
  // drain stamped at MARK_EDIT_INITIAL_STATE. Equal = clean. Different =
  // unsaved changes. Pure O(N) string-compare; runs each render but is
  // cheap (sub-millisecond on a typical cart).
  const isDirty =
    ticket.editInitialSnapshot != null &&
    serializeTicketEditSlice(ticket) !== ticket.editInitialSnapshot;

  return (
    <div
      className="flex items-center justify-between gap-2 border-b border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-4 py-2 text-xs font-medium text-amber-800 dark:text-amber-200"
      role="status"
      aria-label={label}
    >
      <div className="flex items-center gap-1.5">
        <Pencil className="h-3.5 w-3.5" />
        <span>{label}</span>
      </div>
      {isDirty && (
        <div className="flex items-center gap-1 text-amber-700 dark:text-amber-300">
          <AlertCircle className="h-3.5 w-3.5" />
          <span>Unsaved changes</span>
        </div>
      )}
    </div>
  );
}
