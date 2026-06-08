import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Session #145 Gap A — `JobDetail.autoStartIntake` effect (lines ~387-414)
// mounts <ZonePicker> in intake mode on first render when the unstarted-strip
// card's onMaterialized(jobId) callback routed the operator here with
// view-state `{ mode: 'detail', jobId, autoStartIntake: true }`. The effect
// has four hard gates that MUST all hold simultaneously, and they are
// load-bearing — the wrong gate set ships the wrong UX. JobDetail is too
// large to mount in a unit test without significant provider scaffolding
// (PosAuthProvider, ReaderProvider, TicketProvider, CheckoutProvider, ...),
// so the regression guards here are structural — the source itself must
// carry the expected gate chain.
//
// The four gates (Q3 LOCKED):
//   1. `autoStartIntakeConsumedRef.current` — one-shot guard (don't re-fire
//      on every re-render)
//   2. `autoStartIntake` prop true (parent expressed intent)
//   3. `photosEnabled` true (PHOTO_DOCUMENTATION feature flag ON)
//   4. `job` loaded (we know the current intake state)
//   5. `job.intake_completed_at == null` (Q3 guardrail — fall through to
//      JobDetail header when intake already finished in parallel session)
//
// Plus a separate regression-prevent for Q5's helper consumption: the inline
// payment-link predicate expression at the old job-detail.tsx:874-881 site
// MUST be gone; the helper-call shape MUST be present.

const SOURCE = readFileSync(
  resolve(__dirname, '..', 'job-detail.tsx'),
  'utf-8'
);

describe('JobDetail — autoStartIntake effect gate chain (Session #145 Gap A, Q3 LOCKED)', () => {
  it('declares the autoStartIntakeConsumedRef one-shot guard', () => {
    expect(SOURCE).toMatch(/autoStartIntakeConsumedRef\s*=\s*useRef\(false\)/);
  });

  it('gates the effect on the consumed-ref short-circuit (gate #1 — re-render protection)', () => {
    expect(SOURCE).toMatch(/if\s*\(\s*autoStartIntakeConsumedRef\.current\s*\)\s*return/);
  });

  it('gates the effect on the autoStartIntake prop (gate #2 — parent intent)', () => {
    expect(SOURCE).toMatch(/if\s*\(\s*!autoStartIntake\s*\)\s*return/);
  });

  it('gates the effect on photosEnabled (gate #3 — feature flag)', () => {
    expect(SOURCE).toMatch(/if\s*\(\s*!photosEnabled\s*\)\s*return/);
  });

  it('gates the effect on a loaded job (gate #4 — fetch settled)', () => {
    expect(SOURCE).toMatch(/if\s*\(\s*!job\s*\)\s*return/);
  });

  it('gates the effect on job.intake_completed_at == null (gate #5 — Q3 LOCKED race guardrail)', () => {
    // The exact gate expression. Using a loose match for whitespace; the
    // critical semantic is the `!= null` (NOT `=== undefined` or other).
    expect(SOURCE).toMatch(/if\s*\(\s*job\.intake_completed_at\s*!=\s*null\s*\)\s*return/);
  });

  it('sets zonePickerMode to intake mode after all gates pass', () => {
    expect(SOURCE).toMatch(/setZonePickerMode\(\s*['"]intake['"]\s*\)/);
  });

  it('notifies the parent via onAutoStartIntakeConsumed so the view-state flag clears', () => {
    expect(SOURCE).toMatch(/onAutoStartIntakeConsumed\?\.\(\)/);
  });

  it('marks the ref consumed BEFORE firing the side-effects (prevents double-fire on cleanup)', () => {
    // The sequence inside the effect: `current = true` MUST appear before
    // `setZonePickerMode` — flipping the ref last would let a re-render
    // before commit re-trigger the effect.
    const effectBlock = SOURCE.match(/useEffect\(\(\)\s*=>\s*\{[\s\S]*?autoStartIntake[\s\S]*?\},\s*\[autoStartIntake[^\]]*\]\)/);
    expect(effectBlock).toBeTruthy();
    const block = effectBlock?.[0] ?? '';
    const refSetIndex = block.indexOf('autoStartIntakeConsumedRef.current = true');
    const setIntakeIndex = block.indexOf("setZonePickerMode('intake')");
    expect(refSetIndex).toBeGreaterThan(-1);
    expect(setIntakeIndex).toBeGreaterThan(-1);
    expect(refSetIndex).toBeLessThan(setIntakeIndex);
  });
});

describe('JobDetail — Payment Link button uses canSendPaymentLink helper (Q5 regression-prevent)', () => {
  it('imports the canSendPaymentLink helper from the shared module', () => {
    expect(SOURCE).toMatch(
      /import\s*\{\s*canSendPaymentLink\s*\}\s*from\s*['"]@\/components\/jobs\/can-send-payment-link['"]/
    );
  });

  it('does NOT carry the pre-Q5 inline 5-line predicate expression', () => {
    // The pre-Q5 expression checked all 5 conditions inline.
    // Post-Q5 the expression is a single canSendPaymentLink({...}) call —
    // the inline chain should be gone.
    expect(SOURCE).not.toMatch(
      /appt\.payment_status\s*!==\s*['"]paid['"][\s\S]{0,40}appt\.status\s*!==\s*['"]cancelled['"][\s\S]{0,40}appt\.status\s*!==\s*['"]no_show['"]/
    );
  });

  it('the post-Q5 expression invokes canSendPaymentLink with the structural args', () => {
    expect(SOURCE).toMatch(/canSendPaymentLink\(\s*\{[\s\S]*?appointmentId:[\s\S]*?paymentStatus:[\s\S]*?appointmentStatus:[\s\S]*?customerEmail:[\s\S]*?customerPhone:/);
  });
});
