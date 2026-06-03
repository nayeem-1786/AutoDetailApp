import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Q-D / Q-Arch-D regression pins — pricing_model is INTENTIONALLY immutable
 * after service creation. See:
 *   - docs/dev/CATALOG_CRUD_WIRING_AUDIT.md Q4 (originating finding)
 *   - PUBLIC_BOOKING_ARCHITECTURAL_AUDIT.md Q-Arch-D locked decision
 *
 * Two structural invariants are pinned here:
 *
 * 1. The Edit Service page MUST render an info-tooltip next to the Pricing
 *    tab title that explains the immutability + the delete-and-recreate
 *    workaround. Mirrors the canonical admin tooltip pattern from
 *    `marketing/coupons/new/page.tsx:1555-1564` and adds keyboard
 *    discoverability (tabIndex + group-focus-within + aria-describedby +
 *    role="tooltip").
 *
 * 2. The Edit Service page's `onSaveDetails` PUT payload MUST NOT include
 *    `pricing_model`. Q-Arch-D locked KEEP-IMMUTABLE — accidentally adding
 *    `pricing_model: formData.pricing_model` to the payload (e.g., a future
 *    "fix" thinking the omission is a bug) would orphan existing
 *    `service_pricing` tier rows and risk ticket-history inconsistency.
 *
 * These are source-string pins (mirroring the `services-summary-adoption`
 * pin pattern at `src/lib/quotes/__tests__/services-summary-adoption.test.ts`)
 * rather than a full-page mount because the Edit Service page is a 2200-line
 * component whose render path requires Supabase + adminFetch + permission +
 * Sale-pricing + ImageUpload mocks well out of proportion to the surface
 * being verified.
 */

const ROOT = resolve(__dirname, '..', '..', '..', '..', '..', '..', '..');
const EDIT_PAGE_REL = 'src/app/admin/catalog/services/[id]/page.tsx';

function readEditPage(): string {
  return readFileSync(resolve(ROOT, EDIT_PAGE_REL), 'utf8');
}

describe('Q-D — pricing_model immutability tooltip + PUT-payload omission', () => {
  it('Edit Service page imports the `Info` lucide icon used by the tooltip', () => {
    const src = readEditPage();
    expect(src).toMatch(
      /import\s*\{[^}]*\bInfo\b[^}]*\}\s*from\s*['"]lucide-react['"]/,
    );
  });

  it('renders the tooltip with the locked immutability wording', () => {
    const src = readEditPage();
    // Wrapper carries the test hook + the canonical group/relative shell.
    expect(src).toContain('data-testid="pricing-model-immutable-info"');
    expect(src).toMatch(/className="group relative inline-flex"/);
    // Locked wording — the constraint + the workaround. The body text
    // spans multiple source lines (JSX whitespace) so we collapse runs
    // of whitespace before matching the workaround sentence.
    expect(src).toContain('Cannot be changed after creation.');
    const collapsed = src.replace(/\s+/g, ' ');
    expect(collapsed).toContain(
      'To use a different pricing model, delete and recreate the service.',
    );
    expect(collapsed).toContain(
      'This keeps tier rows, ticket history, and price calculations consistent.',
    );
  });

  it('tooltip is keyboard-discoverable (tabIndex + aria-describedby + role="tooltip" + group-focus-within)', () => {
    const src = readEditPage();
    // The focusable wrapper.
    expect(src).toMatch(/tabIndex=\{0\}/);
    expect(src).toContain('aria-describedby="pricing-model-immutable-tip"');
    // The popover body matches the wrapper's described-by id and carries
    // role="tooltip" so assistive tech can announce it.
    expect(src).toContain('id="pricing-model-immutable-tip"');
    expect(src).toMatch(/role="tooltip"/);
    // Keyboard reveal — focus-within mirrors the existing hover reveal.
    expect(src).toMatch(/group-focus-within:opacity-100/);
    // Screen-reader text so the icon-only trigger has an accessible name
    // when focused.
    expect(src).toMatch(
      /Pricing model help — cannot be changed after creation\./,
    );
  });

  it('PUT payload (onSaveDetails) intentionally OMITS `pricing_model`', () => {
    const src = readEditPage();
    // Locate the payload block (terminates at the closing `};`).
    const match = src.match(
      /const\s+payload:\s*Record<string,\s*unknown>\s*=\s*\{([\s\S]*?)\};/,
    );
    expect(match, 'onSaveDetails payload block must be present').toBeTruthy();
    const body = (match?.[1] ?? '').trim();
    // pricing_model must NOT be assigned in the payload (regression guard
    // for Q-Arch-D KEEP-IMMUTABLE — see CATALOG_CRUD_WIRING_AUDIT.md Q4).
    expect(body).not.toMatch(/^\s*pricing_model\s*:/m);
  });

  it('explanatory comment at the PUT-payload site references Q-Arch-D', () => {
    const src = readEditPage();
    // Pins the rationale comment so a future reader can find the audit.
    expect(src).toMatch(/Q-Arch-D LOCKED \(KEEP-IMMUTABLE\)/);
    expect(src).toMatch(/CATALOG_CRUD_WIRING_AUDIT\.md Q4/);
  });
});
