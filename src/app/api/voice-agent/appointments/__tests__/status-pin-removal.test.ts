/**
 * Phase 3 Theme B.2 (AC-11 completion) — voice-agent appointments status-pin
 * removal regression lock.
 *
 * Pre-Theme-B.2 the voice-agent appointments route hardcoded
 * `status: 'pending'` at both branches:
 *   - Direct branch (route.ts:521 pre-refactor — the `appointments.insert(...)`)
 *   - Quote-conversion branch (route.ts:290 pre-refactor — `convertQuote(...,
 *     { appointmentStatus: 'pending', channel: 'phone' })`)
 *
 * The audit (Phase 3.0.2, 10421f23 D.3) surfaced this as Option β/γ
 * territory — agents that ever collect payment in-call should be able to
 * land 'confirmed' synchronously, matching the online-booking path's
 * behavior at `book/route.ts:559` (`initialStatus = data.payment_intent_id
 * ? 'confirmed' : 'pending'`).
 *
 * Theme B.2 picks the forward-compatible refactor:
 *   - Accept optional `payment_intent_id` in the POST body
 *   - Derive `initialStatus: 'pending' | 'confirmed'` from its presence
 *   - Use `initialStatus` at BOTH branches
 *
 * Today the voice agent does NOT collect synchronous in-call payment, so
 * `payment_intent_id` is always absent → initialStatus = 'pending' → no
 * behavior change. The webhook (Theme B.1) handles the async pending →
 * confirmed flip when the customer pays via the link the agent sent via
 * `send_payment_link` (the new 14th tool). When the agent's tool surface
 * ever evolves to collect synchronous payment, passing payment_intent_id
 * lands the appointment at 'confirmed' synchronously.
 *
 * These tests are source-string regression locks — they verify the file
 * carries the right derivation pattern WITHOUT standing up the full route
 * mock (sendSms, convertQuote, generateAppointmentNumber, vehicle
 * classifier, etc.). The shape pinning is intentional: future refactors
 * that re-inline the literal 'pending' or break the payment-intent-id
 * gating fail this test loudly.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROUTE_PATH = resolve(
  __dirname,
  '..',
  'route.ts',
);

const SOURCE = readFileSync(ROUTE_PATH, 'utf-8');

describe('voice-agent appointments — status pin removal (Theme B.2)', () => {
  it('POST body destructuring accepts optional payment_intent_id', () => {
    // Body destructuring must include payment_intent_id alongside the
    // existing fields. Locks the new wire contract.
    expect(SOURCE).toMatch(/payment_intent_id\s*[,?:]/);
  });

  it('payment_intent_id is typed as optional string in the body type annotation', () => {
    // The body type cast must declare payment_intent_id?: string. Anyone
    // tightening to required (`string` without `?`) would break the
    // forward-compat contract.
    expect(SOURCE).toMatch(/payment_intent_id\?:\s*string/);
  });

  it('initialStatus is derived from payment_intent_id presence with explicit string-and-non-empty guard', () => {
    // The derivation must guard against `payment_intent_id: ''` empty
    // strings (which `typeof x === 'string'` alone would pass through to
    // 'confirmed' incorrectly). Mirrors book/route.ts:559's truthy semantic.
    expect(SOURCE).toMatch(
      /initialStatus[\s\S]{0,200}?payment_intent_id[\s\S]{0,200}?'confirmed'[\s\S]{0,80}?'pending'/,
    );
    expect(SOURCE).toMatch(/payment_intent_id\.length\s*>\s*0/);
  });

  it('initialStatus has an explicit "pending" | "confirmed" type annotation', () => {
    // Type pinning makes the contract visible at the derivation site and
    // catches future widening to `string`.
    expect(SOURCE).toMatch(
      /initialStatus\s*:\s*['"]pending['"]\s*\|\s*['"]confirmed['"]/,
    );
  });

  it('direct-branch INSERT uses initialStatus, NOT the literal "pending"', () => {
    // Locate the appointments.insert({...}) block in the direct branch.
    // status: 'pending' literal MUST NOT appear inside that block.
    // We don't assert raw string position; we assert that `status:
    // initialStatus` appears, and that there is no `status: 'pending'`
    // anywhere in the file.
    expect(SOURCE).toMatch(/status:\s*initialStatus/);
    expect(SOURCE).not.toMatch(/status:\s*['"]pending['"]/);
  });

  it('quote-conversion branch convertQuote call uses appointmentStatus: initialStatus', () => {
    // The pre-B.2 literal was `appointmentStatus: 'pending'`. The
    // payment-evidence refactor routes both branches through the same
    // initialStatus value.
    expect(SOURCE).toMatch(/appointmentStatus:\s*initialStatus/);
    expect(SOURCE).not.toMatch(/appointmentStatus:\s*['"]pending['"]/);
  });

  it('mentions Theme B.2 + AC-11 in the in-source documentation block above the derivation', () => {
    // Future readers need the audit trail. Lock the rationale comment so
    // a future refactor doesn't strip it as "dead documentation".
    expect(SOURCE).toMatch(/Theme B\.2/);
    expect(SOURCE).toMatch(/AC-11/);
  });

  it('cross-references the online-booking path at book/route.ts as the canonical pattern', () => {
    // Anchors the implementation to the existing best-in-class reference,
    // making it easy for future maintainers to verify the two paths stay
    // aligned (or update both in lockstep).
    expect(SOURCE).toMatch(/book\/route\.ts/);
    expect(SOURCE).toMatch(/559/);
  });

  it('cross-references Theme B.1 (webhook flip) so future readers understand the async-vs-sync semantic', () => {
    // The forward-compat refactor only makes sense when paired with B.1's
    // async webhook reconciliation — otherwise a missed payment_intent_id
    // would silently lose the confirmed state.
    expect(SOURCE).toMatch(/Theme B\.1/);
    expect(SOURCE).toMatch(/webhook/);
  });

  it('preserves channel: "phone" for both branches (Theme B.2 only changes status, not channel)', () => {
    // Defensive: a refactor that accidentally widens channel handling
    // would surface here. Both branches keep their existing channel
    // assignment.
    const channelPhoneOccurrences = SOURCE.match(/channel:\s*['"]phone['"]/g);
    expect(channelPhoneOccurrences).toBeTruthy();
    expect(channelPhoneOccurrences!.length).toBeGreaterThanOrEqual(2);
  });
});
