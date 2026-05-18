'use client';

import { Pencil, AlertCircle } from 'lucide-react';
import { useTicket } from '../context/ticket-context';
import { serializeTicketEditSlice } from '../context/ticket-reducer';

/**
 * Item 15f Phase 1 Layer 8c (initial) / Layer 8d (label improved) — edit-mode
 * visual indicator.
 *
 * Renders a subtle pill above the Sale tab content when `ticket.editMode`
 * is true. Surfaces "Editing Appointment: {customer} — {date}" and an
 * "Unsaved changes" badge when the cart has diverged from the initial-load
 * snapshot.
 *
 * Layer 8d swaps the original UUID-prefix label ("Editing Appointment
 * #aaaaaaaa") for a friendlier `{customer name} — {scheduled date}`
 * identifier. Both fields fall back gracefully: missing customer →
 * "(customer not on file)"; missing scheduled date → UUID prefix. The
 * UUID prefix is preserved as the safety-net fallback so the banner can
 * always identify the record.
 *
 * Note: this is interim labeling. Proper A-XXXXX appointment numbering
 * is deferred to post-Phase-1 engine-unification work; the customer+date
 * format closes the worst-of-all-worlds "UUID prefix as identifier" UX
 * the audit flagged during Layer 8c UAT.
 *
 * Returns `null` outside edit mode so the bare `/pos` surface is unchanged.
 */
export function EditModeBanner() {
  const { ticket } = useTicket();
  if (!ticket.editMode || !ticket.sourceId) return null;

  const label = buildEditLabel(ticket);

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

/**
 * Composes the edit-mode banner label. Exported for unit-testing the
 * fallback logic without rendering the component.
 *
 * Output examples:
 *   "Editing Appointment: Jane Doe — Sat, May 16"
 *   "Editing Job: Jane Doe — Sat, May 16"
 *   "Editing Appointment: Jane Doe"           ← no date
 *   "Editing Appointment #aaaaaaaa"           ← no customer or date (UUID fallback)
 */
export function buildEditLabel(t: {
  source: string;
  sourceId: string | null;
  customer: { first_name: string; last_name: string } | null;
  editSourceScheduledDate: string | null;
}): string {
  const sourceWord =
    t.source === 'appointment'
      ? 'Appointment'
      : t.source === 'job'
        ? 'Job'
        : 'Record';

  const customerName = t.customer
    ? [t.customer.first_name, t.customer.last_name].filter(Boolean).join(' ').trim()
    : '';
  const dateLabel = t.editSourceScheduledDate
    ? formatScheduledDate(t.editSourceScheduledDate)
    : '';

  // Customer + date is the preferred format.
  if (customerName && dateLabel) {
    return `Editing ${sourceWord}: ${customerName} — ${dateLabel}`;
  }
  // Customer only (date missing — legacy row).
  if (customerName) {
    return `Editing ${sourceWord}: ${customerName}`;
  }
  // Date only (customer detached — rare but possible after soft-delete).
  if (dateLabel) {
    return `Editing ${sourceWord}: ${dateLabel}`;
  }
  // Safety net: UUID prefix (matches the Layer 8c original label).
  const shortId = t.sourceId?.slice(0, 8) ?? 'unknown';
  return `Editing ${sourceWord} #${shortId}`;
}

/**
 * Format a YYYY-MM-DD date string in America/Los_Angeles as
 * "{weekday}, {month} {day}". Example: "Sat, May 16".
 *
 * The date column is DATE (no timezone), so we anchor parsing at noon UTC
 * to dodge cross-DST midnight ambiguity when projecting to LA.
 */
function formatScheduledDate(dateStr: string): string {
  try {
    const iso = dateStr.length === 10 ? `${dateStr}T12:00:00Z` : dateStr;
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      timeZone: 'America/Los_Angeles',
    }).format(new Date(iso));
  } catch {
    return dateStr;
  }
}
