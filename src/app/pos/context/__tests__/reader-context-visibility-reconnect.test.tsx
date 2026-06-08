import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act, cleanup } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Session #145 Gap D — `reader-context.tsx`'s visibility-reconnect path
// (lines 100-124) calls `discoverAndConnect()` un-awaited so a rejection
// from the Stripe Terminal SDK can never bubble to `pos-shell.tsx`'s
// global error/rejection listener — which would falsely redirect the
// operator to /pos/login when the listener's pattern matcher sees Stripe
// SDK wording like "POS no longer authenticated".
//
// Pre-#145: bare `discoverAndConnect();` at line 115. Defensible against
// the audit-documented case where a future SDK update or microtask-spawn
// inside the Stripe runtime emits a rejection that escapes the helper's
// internal try/catch.
//
// Post-#145: `.catch((err) => console.warn(...))` wraps the call. The
// wrapper is DEFENSIVE — in current code discoverAndConnect's internal
// try/catch swallows known errors, so the wrapper never actually fires.
// But the audit identified the un-awaited call as the most likely surface
// for un-handled rejections IF the SDK or our own future changes leak, so
// closing the surface IS the value here.
//
// The tests below pin two things:
//   1. **Structural** — the source contains the .catch wrapper with the
//      labeled console.warn prefix. A regression that removes the wrap
//      shows up here as a string-match failure before it reaches prod.
//   2. **Functional** — the visibility handler runs end-to-end (auto-
//      connect on mount + visibilitychange) without emitting an
//      `unhandledrejection` event on the window. This guards against the
//      pre-#145 firing path even if the underlying helper changes.

const mockStripeTerminal = {
  isReaderConnected: vi.fn(),
  resetTerminal: vi.fn(),
  ensureConnected: vi.fn(),
  disconnectReader: vi.fn(),
};

vi.mock('../../lib/stripe-terminal', () => mockStripeTerminal);

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

import { ReaderProvider } from '../reader-context';

beforeEach(() => {
  mockStripeTerminal.isReaderConnected.mockReset();
  mockStripeTerminal.resetTerminal.mockReset();
  mockStripeTerminal.ensureConnected.mockReset();
  mockStripeTerminal.disconnectReader.mockReset();
  mockStripeTerminal.ensureConnected.mockResolvedValue({
    id: 'reader-1',
    label: 'Test Reader',
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('reader-context — visibility reconnect catch wrapper (Session #145 Gap D)', () => {
  it('source carries the .catch wrapper with the labeled console.warn prefix', () => {
    // Structural regression guard — removing the wrap fails this test before
    // a deploy regresses the operator's PWA-wake logout class.
    const source = readFileSync(
      resolve(__dirname, '..', 'reader-context.tsx'),
      'utf-8'
    );
    // Match `discoverAndConnect().catch(` near the visibility branch. The
    // exact lambda body is not pinned — only the wrap presence + the
    // labeled prefix string in the warn call.
    expect(source).toMatch(/discoverAndConnect\(\)\.catch\(/);
    expect(source).toMatch(/'\[reader-context\] visibility reconnect failed/);
  });

  it('visibility-change → reconnect failure does NOT emit unhandledrejection', async () => {
    // Configure the reconnect to fail. Even if discoverAndConnect's
    // internal try/catch eats this, the wrap is defense-in-depth for the
    // case where a future SDK shape leaks. The functional invariant is:
    // no window-level unhandledrejection escapes during a visibility cycle.
    mockStripeTerminal.isReaderConnected.mockResolvedValue(false);
    mockStripeTerminal.resetTerminal.mockRejectedValue(
      new Error('POS no longer authenticated')
    );

    const unhandled = vi.fn();
    window.addEventListener('unhandledrejection', unhandled);

    try {
      render(<ReaderProvider>{null}</ReaderProvider>);

      // Let mount auto-connect drain.
      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });

      // Reset the reconnect-attempted internal latch by simulating a
      // background → foreground cycle: first dispatch hidden (no-op for
      // the reconnect branch but clears the latch), then visible.
      await act(async () => {
        Object.defineProperty(document, 'visibilityState', {
          configurable: true,
          get: () => 'hidden',
        });
        document.dispatchEvent(new Event('visibilitychange'));
        await new Promise((r) => setTimeout(r, 5));
      });
      await act(async () => {
        Object.defineProperty(document, 'visibilityState', {
          configurable: true,
          get: () => 'visible',
        });
        document.dispatchEvent(new Event('visibilitychange'));
        await new Promise((r) => setTimeout(r, 30));
      });

      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('unhandledrejection', unhandled);
    }
  });
});
