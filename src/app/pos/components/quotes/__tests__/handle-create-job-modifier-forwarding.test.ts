/**
 * Phase 3 Theme F (F.3) — A.3 path modifier propagation regression.
 *
 * Pre-F.3 the POS "Create Job from quote-detail" path (audit dcf511df A.3)
 * built a minimal POST body `{customer_id, vehicle_id, services, quote_id,
 * notes}` that silently dropped any coupon / loyalty / manual-discount the
 * quote carried. The A.4 path (quote-builder walk-in mode) DID forward
 * them via its `buildModifiersPayload` helper, producing different
 * appointment rows depending on which conversion seam an operator chose
 * for the SAME quote.
 *
 * F.3 closes the asymmetry by forwarding the same 7-field shape A.4 uses,
 * sourced from the persisted quote row (A.3 operates on an existing saved
 * quote, A.4 on the in-memory reducer state — different sources, same
 * field set on the wire).
 *
 * This source-string test pins the POST body field list so a future
 * refactor that drops one of the fields fails at unit-test time rather
 * than as a silent prod drift (the same pattern admin/catalog uses for
 * pricing-model-tooltip.test.ts). A behavioural render test would
 * require mocking the QuoteContext + router + posFetch wrappers; the
 * source-shape pin is the load-bearing assertion here and avoids the
 * fixture cost.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const SOURCE = readFileSync(
  join(__dirname, '..', 'quote-detail.tsx'),
  'utf-8'
);

/** Extract the JSON.stringify({...}) body block inside handleCreateJobFromQuote. */
function extractCreateJobBody(): string {
  // Anchor on the comment marker we added in Theme F so future renames don't
  // accidentally shift the regex onto a sibling body block (the file also
  // contains a status-update PATCH body further down).
  const marker = 'Phase 3 Theme F (F.3)';
  const markerIdx = SOURCE.indexOf(marker);
  if (markerIdx < 0) {
    throw new Error('handleCreateJobFromQuote marker comment not found');
  }
  const fetchIdx = SOURCE.indexOf("posFetch('/api/pos/jobs'", markerIdx);
  if (fetchIdx < 0) throw new Error('posFetch /api/pos/jobs call not found');
  const bodyStart = SOURCE.indexOf('JSON.stringify({', fetchIdx);
  if (bodyStart < 0) throw new Error('JSON.stringify({...}) body not found');
  // Walk the braces from `{` until the matching `}` closes.
  let depth = 0;
  let i = SOURCE.indexOf('{', bodyStart);
  for (; i < SOURCE.length; i++) {
    if (SOURCE[i] === '{') depth++;
    else if (SOURCE[i] === '}') {
      depth--;
      if (depth === 0) return SOURCE.slice(bodyStart, i + 1);
    }
  }
  throw new Error('Unterminated body block');
}

describe('quote-detail.tsx handleCreateJobFromQuote — Phase 3 Theme F (F.3) modifier forwarding', () => {
  const body = extractCreateJobBody();

  // The pre-F.3 minimal field set must still be present.
  it.each([
    ['customer_id'],
    ['vehicle_id'],
    ['services'],
    ['quote_id'],
    ['notes'],
  ])('still forwards %s (pre-F.3 minimal field)', (field) => {
    expect(body).toContain(`${field}:`);
  });

  // The 7 modifier fields added by F.3. If any of these drift away, the
  // A.3 conversion silently regresses to the pre-F.3 asymmetry — the
  // synthetic appointment row drops the corresponding modifier column.
  it.each([
    ['coupon_code'],
    ['coupon_discount'],
    ['loyalty_points_to_redeem'],
    ['loyalty_discount'],
    ['manual_discount_type'],
    ['manual_discount_value'],
    ['manual_discount_label'],
  ])('forwards modifier field %s from quote row (F.3 fix)', (field) => {
    expect(body).toContain(`${field}: quote.${field} ?? null`);
  });
});
