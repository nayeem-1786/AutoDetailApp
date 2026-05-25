import { describe, it, expect } from 'vitest';

import {
  getQuoteSourceLabel,
  buildQuoteNotesDisplay,
  type QuoteSource,
} from '../source-labels';

// ──────────────────────────────────────────────────────────────────────────────
// Phase Quote-Source-1 — pins the source-label helper consumed by every
// surface that renders the Notes section of a quote.
//
// Pre-Quote-Source-1: SMS-AI v2 path hard-coded "Generated during phone call"
// into quotes.notes — mis-labeled the customer channel (Q-0084). Post-fix
// the source label is derived from the quotes.source ENUM and rendered
// separately from the operator-editable notes column.
// ──────────────────────────────────────────────────────────────────────────────

describe('getQuoteSourceLabel', () => {
  it('returns "Generated during SMS conversation" for sms_agent', () => {
    expect(getQuoteSourceLabel('sms_agent')).toBe(
      'Generated during SMS conversation'
    );
  });

  it('returns "Generated during phone call" for voice_agent', () => {
    expect(getQuoteSourceLabel('voice_agent')).toBe(
      'Generated during phone call'
    );
  });

  it('returns "Created at the shop" for pos', () => {
    expect(getQuoteSourceLabel('pos')).toBe('Created at the shop');
  });

  it('returns "Created by staff" for admin', () => {
    expect(getQuoteSourceLabel('admin')).toBe('Created by staff');
  });

  it('returns "Created from online booking" for online_booking', () => {
    expect(getQuoteSourceLabel('online_booking')).toBe(
      'Created from online booking'
    );
  });

  it('returns "Generated during SMS conversation" for twilio_legacy (alias of sms_agent)', () => {
    expect(getQuoteSourceLabel('twilio_legacy')).toBe(
      'Generated during SMS conversation'
    );
  });

  it('returns null for null source (historical pre-source-tracking quote)', () => {
    expect(getQuoteSourceLabel(null)).toBeNull();
  });
});

describe('buildQuoteNotesDisplay', () => {
  it('combines source label and notes with a period separator', () => {
    expect(buildQuoteNotesDisplay('sms_agent', 'VIP customer')).toBe(
      'Generated during SMS conversation. VIP customer'
    );
  });

  it('returns source label alone when notes is null', () => {
    expect(buildQuoteNotesDisplay('pos', null)).toBe('Created at the shop');
  });

  it('returns source label alone when notes is empty string', () => {
    expect(buildQuoteNotesDisplay('pos', '')).toBe('Created at the shop');
  });

  it('returns source label alone when notes is whitespace-only', () => {
    expect(buildQuoteNotesDisplay('pos', '   \n\t  ')).toBe(
      'Created at the shop'
    );
  });

  it('returns notes alone when source is null (historical quote)', () => {
    expect(buildQuoteNotesDisplay(null, 'Bring dog towel')).toBe(
      'Bring dog towel'
    );
  });

  it('returns empty string when both source and notes are null', () => {
    expect(buildQuoteNotesDisplay(null, null)).toBe('');
  });

  it('returns empty string when source is null and notes is empty', () => {
    expect(buildQuoteNotesDisplay(null, '')).toBe('');
  });

  it('trims surrounding whitespace from notes in the combined output', () => {
    expect(buildQuoteNotesDisplay('voice_agent', '  Custom request  ')).toBe(
      'Generated during phone call. Custom request'
    );
  });

  it('renders correctly for each source value paired with notes', () => {
    const sources: QuoteSource[] = [
      'sms_agent',
      'voice_agent',
      'pos',
      'admin',
      'online_booking',
      'twilio_legacy',
    ];
    for (const source of sources) {
      const label = getQuoteSourceLabel(source);
      expect(buildQuoteNotesDisplay(source, 'extra')).toBe(`${label}. extra`);
    }
  });

  it('preserves multi-line notes in the combined output', () => {
    expect(buildQuoteNotesDisplay('pos', 'Line one\nLine two')).toBe(
      'Created at the shop. Line one\nLine two'
    );
  });

  it('treats undefined-coerced null notes as empty', () => {
    // null coercion path — notes?.trim() must not throw on null/undefined.
    expect(buildQuoteNotesDisplay('admin', null)).toBe('Created by staff');
  });

  it('handles the historical SMS-AI mislabel verbatim when source is null', () => {
    // Pre-fix quotes (source=NULL) still carry the misleading literal
    // string in their notes column. Render policy per Q3: leave as-is.
    expect(
      buildQuoteNotesDisplay(null, 'Generated during phone call')
    ).toBe('Generated during phone call');
  });
});
