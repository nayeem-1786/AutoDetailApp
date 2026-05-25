/**
 * Phase Quote-Source-1 — channel-of-origin labels for quotes.
 *
 * Single source of truth shared by every render surface that displays
 * the Notes section. The `quotes.source` column (quote_source ENUM,
 * nullable) is set automatically at creation time and is immutable
 * thereafter. NULL means the quote was created before this column
 * existed; render logic falls back to displaying `quotes.notes`
 * verbatim in that case.
 *
 * To add a new source value: ALTER TYPE quote_source ADD VALUE in a
 * dedicated migration (Postgres requires ENUM additions to be
 * committed before they can be referenced — do NOT combine with
 * column writes in the same transaction). Then add the case to
 * `getQuoteSourceLabel`.
 */

import type { Database } from '@/lib/supabase/database.types';

export type QuoteSource = Database['public']['Enums']['quote_source'];

export function getQuoteSourceLabel(source: QuoteSource | null): string | null {
  switch (source) {
    case 'sms_agent':
      return 'Generated during SMS conversation';
    case 'voice_agent':
      return 'Generated during phone call';
    case 'pos':
      return 'Created at the shop';
    case 'admin':
      return 'Created by staff';
    case 'online_booking':
      return 'Created from online booking';
    case 'twilio_legacy':
      return 'Generated during SMS conversation';
    case null:
      return null;
    default:
      return null;
  }
}

/**
 * Combines the source label and operator-editable notes into the
 * single string rendered in the Notes section of a quote.
 *
 * - Both present:   "Source label. Operator notes"
 * - Source only:    "Source label"
 * - Notes only:     "Operator notes"  (historical pre-source-tracking quotes)
 * - Neither:        ""                (caller should hide the section)
 *
 * Notes are trimmed before evaluation — whitespace-only `notes` is
 * treated as empty.
 */
export function buildQuoteNotesDisplay(
  source: QuoteSource | null,
  notes: string | null,
): string {
  const label = getQuoteSourceLabel(source);
  const trimmedNotes = notes?.trim() ?? '';

  if (label && trimmedNotes) return `${label}. ${trimmedNotes}`;
  if (label) return label;
  if (trimmedNotes) return trimmedNotes;
  return '';
}
