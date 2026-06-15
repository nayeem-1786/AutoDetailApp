/**
 * Session #154 (2026-06-14) — message-bubble.tsx predicate-based routing.
 *
 * Locks the UI-layer mirror of the AI-context contract codified in
 * Session #150 at `src/lib/utils/conversation-helpers.ts:259-269` and
 * `src/app/api/webhooks/twilio/inbound/route.ts:540-545`:
 *
 *   metadata.notificationType PRESENT → customer-facing notification
 *                                       (AI sees, customer received)
 *   metadata.notificationType ABSENT  → internal status marker
 *                                       (AI ignores, operator-only)
 *
 * Pre-#154 the UI split on `sender_type === 'system'` alone, lumping
 * both classes into a centered NotificationBar with a 120-char substring
 * truncation that mangled payment-link URLs (the bug case — full URL
 * unrecoverable from thread view). Post-#154 customer-facing system SMS
 * renders as a chat bubble with "Auto · {label}" badge and full body;
 * status markers (reactivation, auto-close) still render as the centered
 * banner that 08532a933 (2026-03-30) introduced.
 *
 * Companion to `src/lib/utils/__tests__/conversation-reactivation.test.ts`
 * — that file locks the write-side + AI-context-side of the predicate;
 * this file closes the loop on the UI-side. All three layers now assert
 * the same `metadata.notificationType` contract.
 *
 * All 6 tests below are reverse-validated — see the matrix at file footer.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MessageBubble } from '../message-bubble';
import type { Message } from '@/lib/supabase/types';

// ─────────────────────────────────────────────────────────────────────────────
// Fixture helpers — minimal Message rows. The routing predicate only reads
// channel + sender_type + metadata.notificationType; other fields are filled
// with reasonable defaults so the bubble can render without exploding.
// ─────────────────────────────────────────────────────────────────────────────

function makeMessage(overrides: Partial<Message>): Message {
  return {
    id: overrides.id ?? 'msg-test',
    conversation_id: 'conv-test',
    direction: 'outbound',
    body: 'Test body',
    media_url: null,
    sender_type: 'staff',
    sent_by: null,
    twilio_sid: null,
    status: 'sent',
    channel: 'sms',
    voice_duration_seconds: null,
    metadata: null,
    created_at: '2026-06-14T10:00:00.000Z',
    ...overrides,
  } as Message;
}

// Centered NotificationBar's root wrapper renders `<div class="flex justify-center py-1.5">…</div>`.
// Chat bubbles render `<div class="flex justify-end|justify-start">…</div>` (no `justify-center`).
// The "Phone call (…)" prefix is only emitted by NotificationBar's voice branch.
//
// We assert via class-string inspection on the rendered root because the
// component does not expose a test-id surface and we don't want to lock
// implementation details beyond the routing decision itself.
function assertNotificationBar(container: HTMLElement) {
  const root = container.firstChild as HTMLElement;
  expect(root.className).toContain('justify-center');
}

function assertChatBubble(container: HTMLElement) {
  const root = container.firstChild as HTMLElement;
  expect(root.className).not.toContain('justify-center');
  expect(root.className).toMatch(/justify-(start|end)/);
}

afterEach(() => {
  cleanup();
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('MessageBubble routing — Session #154 predicate-based split', () => {
  // ── Test 1 ── Voice-channel messages always go to NotificationBar.
  //              Regression check: the routing change must not strip the
  //              voice-branch leg (NotificationBar handles voice and
  //              status-marker SMS; both classes share the centered marker).
  it('voice-channel message → NotificationBar', () => {
    const msg = makeMessage({
      channel: 'voice',
      sender_type: 'system',
      voice_duration_seconds: 125,
      body: 'Phone call (2:05)\nCustomer requested callback',
    });
    const { container } = render(<MessageBubble message={msg} />);
    assertNotificationBar(container);
    // Voice prefix is rendered separately when voice_duration_seconds is set.
    expect(screen.getByText(/Phone call \(2:05\)/)).toBeTruthy();
  });

  // ── Test 2 ── Customer-facing system SMS WITH notificationType.
  //              Pre-#154 this would route to NotificationBar and get
  //              substringed at 120 chars. Post-#154 it renders as a
  //              ChatBubble with "Auto · {label}" badge.
  //
  //              This is the load-bearing test — the bug case is
  //              payment_link_sent with a 138-char ngrok URL. Asserts
  //              both (a) routing decision and (b) badge label format.
  it('system SMS with notificationType=payment_link_sent → ChatBubble with "Auto · Payment Link Sent" badge', () => {
    const msg = makeMessage({
      channel: 'sms',
      sender_type: 'system',
      direction: 'outbound',
      body: 'Smart Details: Your payment link is ready: frederic-intratelluric-rosalyn.ngrok-free.dev/pay/abc123',
      metadata: { notificationType: 'payment_link_sent' },
    });
    const { container } = render(<MessageBubble message={msg} />);
    assertChatBubble(container);
    expect(screen.getByText('Auto · Payment Link Sent')).toBeTruthy();
  });

  // ── Test 3 ── System SMS WITHOUT notificationType — reactivation banner.
  //              Status-marker contract (Session #150) — these stay in the
  //              centered NotificationBar. Regression check: must not
  //              accidentally flip to ChatBubble.
  it('system SMS without notificationType (reactivation banner) → NotificationBar', () => {
    const msg = makeMessage({
      channel: 'sms',
      sender_type: 'system',
      direction: 'outbound',
      body: 'Conversation reopened — automated activity',
      metadata: null,
    });
    const { container } = render(<MessageBubble message={msg} />);
    assertNotificationBar(container);
  });

  // ── Test 4 ── System SMS WITHOUT notificationType — auto-close banner.
  //              Same predicate as test 3, different banner text. Locks
  //              that the predicate is uniform across status-marker shapes
  //              (auto-close vs reactivation both write null metadata).
  it('system SMS without notificationType (auto-close banner) → NotificationBar', () => {
    const msg = makeMessage({
      channel: 'sms',
      sender_type: 'system',
      direction: 'outbound',
      body: 'Conversation closed — no activity for 72 hours',
      metadata: null,
    });
    const { container } = render(<MessageBubble message={msg} />);
    assertNotificationBar(container);
  });

  // ── Test 5 ── Staff / customer / AI sender types always go to ChatBubble.
  //              Regression check: the predicate change must not over-fire
  //              and incorrectly route non-system SMS to NotificationBar.
  it('staff SMS → ChatBubble (no badge)', () => {
    const msg = makeMessage({
      channel: 'sms',
      sender_type: 'staff',
      direction: 'outbound',
      body: "On my way — be there in 15.",
    });
    const { container } = render(<MessageBubble message={msg} />);
    assertChatBubble(container);
    // Staff bubbles never carry the "Auto" badge.
    expect(screen.queryByText(/^Auto/)).toBeNull();
  });

  it('AI SMS → ChatBubble (AI label, no Auto badge)', () => {
    const msg = makeMessage({
      channel: 'sms',
      sender_type: 'ai',
      direction: 'outbound',
      body: "Thanks for your message! I'll have someone follow up shortly.",
    });
    const { container } = render(<MessageBubble message={msg} />);
    assertChatBubble(container);
    expect(screen.queryByText(/^Auto/)).toBeNull();
  });

  it('inbound customer SMS → ChatBubble (no badge)', () => {
    const msg = makeMessage({
      channel: 'sms',
      sender_type: 'customer',
      direction: 'inbound',
      body: 'Hi, can you give me a quote for ceramic coating on my Tesla Model 3?',
    });
    const { container } = render(<MessageBubble message={msg} />);
    assertChatBubble(container);
    expect(screen.queryByText(/^Auto/)).toBeNull();
  });

  // ── Test 6 ── Long body + notificationType → full body, NO truncation.
  //              This is the smoking-gun regression — pre-#154 system SMS
  //              with body.length > 120 was substring'd to 120 chars + '…'
  //              at message-bubble.tsx:82-84. The substring was deleted
  //              in #154 because the only branch that could trigger it
  //              (system SMS in NotificationBar) is now status-marker-only,
  //              and status markers are by design short. This test reverse-
  //              validates: a 200-char notificationType-bearing body must
  //              render in full because it routes to ChatBubble, which has
  //              no length truncation.
  it('long body with notificationType → ChatBubble shows full body, no substring truncation', () => {
    const longBody =
      'Smart Details: Your payment link is ready. Click here to complete payment: ' +
      'https://frederic-intratelluric-rosalyn.ngrok-free.dev/pay/abcdefghijklmnop';
    // Assertion only meaningful when the body actually exceeds the
    // pre-#154 120-char cutoff. If a future refactor shortens this fixture
    // below 120, the regression check silently becomes vacuous — pin it.
    expect(longBody.length).toBeGreaterThan(120);

    const msg = makeMessage({
      channel: 'sms',
      sender_type: 'system',
      direction: 'outbound',
      body: longBody,
      metadata: { notificationType: 'payment_link_sent' },
    });
    render(<MessageBubble message={msg} />);
    // Full body must be present — exact match, not partial.
    expect(screen.getByText(longBody)).toBeTruthy();
    // The substring-marker "..." that pre-#154 NotificationBar appended
    // must NOT appear in the rendered text.
    expect(screen.queryByText(/^Smart Details:.*\.\.\.$/)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Reverse-validation index (for the session ledger):
//
//   Test 1 fails when the `message.channel === 'voice'` branch is removed
//     from the isNotification predicate (voice messages would route to
//     ChatBubble, losing the centered call-duration marker).
//
//   Tests 2 + 6 fail when the predicate reverts to the pre-#154 shape
//     `isNotification = message.channel === 'voice' || message.sender_type === 'system'`
//     — payment-link SMS routes back to NotificationBar; test 2 asserts
//     ChatBubble routing, test 6 asserts full body (which the NotificationBar
//     branch would substring to 120 chars + '...').
//
//   Tests 3 + 4 fail when the `isStatusMarker` leg is dropped from the
//     predicate (`isNotification = message.channel === 'voice'` only) —
//     reactivation/auto-close banners would route to ChatBubble, losing
//     the centered visual signal that these are internal status events.
//
//   Test 2's badge assertion fails when the chat-bubble's `Auto · {label}`
//     span is reverted to bare `Auto` — the notificationType context
//     surfaced for operators at-a-glance disappears.
//
//   Test 6's "no ellipsis" assertion fails if a future refactor reintroduces
//     a length-based substring in either NotificationBar or ChatBubble.
//
//   Tests 5 (3 cases) fail when the predicate over-fires and accidentally
//     catches staff / AI / inbound — would be a clear regression but is
//     unlikely from the current code shape (those have sender_type !==
//     'system'); included as defense-in-depth.
//
// Reverse-validation runs during pre-commit verification — see Session
// #154 CHANGELOG entry for the matrix and confirmed-green-after-restoration
// outcome.
// ─────────────────────────────────────────────────────────────────────────────
