/**
 * Phase 3 Theme F (F.6) — View Appointment link from converted-state quote.
 *
 * Audit `dcf511df` finding F.6 surfaced that the converted-state action bar
 * on the POS quote-detail surface was empty (a flat "Converted to
 * appointment" badge with no jump-affordance). F.6 closes that gap by
 * adding a "View Appointment" link to `/admin/appointments?id=<uuid>`,
 * which the deep-link useEffect on the admin appointments page (added in
 * this same session) consumes to open the appointment detail dialog.
 *
 * Sibling source-pin in
 * src/app/admin/quotes/components/__tests__ pins the same affordance on
 * the admin quote-slide-over surface; the deep-link receiver useEffect
 * lives on src/app/admin/appointments/page.tsx — see its own test if a
 * future refactor changes the deep-link consumer.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const POS_QUOTE_DETAIL = readFileSync(
  join(__dirname, '..', 'quote-detail.tsx'),
  'utf-8'
);

const ADMIN_QUOTE_SLIDE_OVER = readFileSync(
  join(
    __dirname,
    '..',
    '..',
    '..',
    '..',
    'admin',
    'quotes',
    'components',
    'quote-slide-over.tsx'
  ),
  'utf-8'
);

const ADMIN_APPOINTMENTS_PAGE = readFileSync(
  join(
    __dirname,
    '..',
    '..',
    '..',
    '..',
    'admin',
    'appointments',
    'page.tsx'
  ),
  'utf-8'
);

describe('Phase 3 Theme F (F.6) — converted quote surfaces View Appointment link', () => {
  it('POS quote-detail renders the View Appointment link gated on converted_appointment_id', () => {
    // The link only renders when BOTH conditions hold: status='converted'
    // AND converted_appointment_id is non-null. Historical walk-in pre-F.2
    // shape (converted without FK) falls through to the plain badge — no
    // appointment row exists to link to.
    expect(POS_QUOTE_DETAIL).toContain("quote.status === 'converted'");
    expect(POS_QUOTE_DETAIL).toMatch(
      /quote\.converted_appointment_id\s*&&[\s\S]*?\/admin\/appointments\?id=/
    );
    expect(POS_QUOTE_DETAIL).toContain('View Appointment');
  });

  it('admin quote-slide-over renders the same View Appointment link', () => {
    // Mirror affordance on the admin surface — the rendered DOM is
    // different (Link vs <a>), but the URL contract is identical so
    // the deep-link receiver on the admin appointments page handles
    // both surfaces uniformly.
    expect(ADMIN_QUOTE_SLIDE_OVER).toContain("quote.status === 'converted'");
    expect(ADMIN_QUOTE_SLIDE_OVER).toMatch(
      /quote\.converted_appointment_id[\s\S]*?\/admin\/appointments\?id=/
    );
    expect(ADMIN_QUOTE_SLIDE_OVER).toContain('View Appointment');
  });

  it('admin appointments page wires the ?id=<uuid> deep-link receiver useEffect', () => {
    // The receiver: a useEffect that reads `?id` from the URL, fetches
    // the single appointment, jumps the calendar to its date, and opens
    // the detail dialog. The URL-strip step (`replaceState`) keeps a
    // refresh from re-opening the dialog. Without ALL of those moving
    // pieces, the F.6 link from quote-detail produces a no-op landing
    // on the admin page.
    expect(ADMIN_APPOINTMENTS_PAGE).toContain('Phase 3 Theme F (F.6)');
    expect(ADMIN_APPOINTMENTS_PAGE).toContain("params.get('id')");
    expect(ADMIN_APPOINTMENTS_PAGE).toContain('setDetailOpen(true)');
    expect(ADMIN_APPOINTMENTS_PAGE).toContain('replaceState');
  });
});
