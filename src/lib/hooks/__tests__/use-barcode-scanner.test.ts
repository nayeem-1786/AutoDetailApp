import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, cleanup } from '@testing-library/react';
import { useBarcodeScanner } from '../use-barcode-scanner';

// ─── Helpers ────────────────────────────────────────────────────────────

/** Dispatch a bare keydown at document (capture phase — hook listens here). */
function pressKey(key: string): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
  });
  document.dispatchEvent(event);
  return event;
}

/**
 * Simulate browser-native typing into a focused input. Fires the keydown
 * first (hook observes). If the hook did NOT preventDefault (the new model
 * never does on printable keys), appends the char via the native setter
 * and fires an `input` event — matching what the browser would do.
 */
function typeKey(input: HTMLInputElement, key: string): KeyboardEvent {
  const event = pressKey(key);
  if (!event.defaultPrevented && document.activeElement === input && key.length === 1) {
    const proto = Object.getPrototypeOf(input);
    const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    const newValue = input.value + key;
    if (nativeSetter) nativeSetter.call(input, newValue);
    else input.value = newValue;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
  return event;
}

function installInput(extraAttrs: Record<string, string> = {}): HTMLInputElement {
  const input = document.createElement('input');
  for (const [k, v] of Object.entries(extraAttrs)) input.setAttribute(k, v);
  document.body.appendChild(input);
  input.focus();
  return input;
}

// ─── Tests ──────────────────────────────────────────────────────────────

describe('useBarcodeScanner — observe-don\'t-capture', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  // Test 1 — Passive typing
  it('passive typing — non-Enter keys are NOT preventDefaulted; onScan never fires', () => {
    const input = installInput();
    const onScan = vi.fn();
    renderHook(() => useBarcodeScanner({ onScan }));

    const events: KeyboardEvent[] = [];
    for (const ch of ['h', 'e', 'l', 'l', 'o']) {
      events.push(typeKey(input, ch));
      vi.advanceTimersByTime(200);
    }

    for (const e of events) expect(e.defaultPrevented).toBe(false);
    expect(onScan).not.toHaveBeenCalled();
    expect(input.value).toBe('hello');
  });

  // Test 2 — Fast-burst scan
  it('fast-burst scan — 9 chars at 15ms gaps + Enter → onScan fires, input restored', () => {
    const input = installInput();
    const onScan = vi.fn();
    renderHook(() => useBarcodeScanner({ onScan }));

    for (const ch of ['S', 'D', '-', '0', '0', '6', '2', '1', '7']) {
      typeKey(input, ch);
      vi.advanceTimersByTime(15);
    }
    const enterEvent = pressKey('Enter');

    expect(onScan).toHaveBeenCalledTimes(1);
    expect(onScan).toHaveBeenCalledWith('SD-006217');
    expect(enterEvent.defaultPrevented).toBe(true);
    // Snapshot captured on first key at gap=Infinity (input was ''); restore
    // puts it back to ''.
    expect(input.value).toBe('');
  });

  // Test 3 — Slow typing + Enter
  it('slow typing + Enter — 6 chars at 200ms gaps + Enter → no scan, Enter flows natively', () => {
    const input = installInput();
    const onScan = vi.fn();
    renderHook(() => useBarcodeScanner({ onScan }));

    for (const ch of ['a', 'b', 'c', '1', '2', '3']) {
      typeKey(input, ch);
      vi.advanceTimersByTime(200);
    }
    const enterEvent = pressKey('Enter');

    expect(onScan).not.toHaveBeenCalled();
    expect(enterEvent.defaultPrevented).toBe(false);
    expect(input.value).toBe('abc123');
  });

  // Test 4 — Mixed: slow then fast, snapshot captures post-slow state
  it('mixed — 2 slow chars, pause, 8 fast + Enter → scan=fast tail, input restored to slow chars', () => {
    const input = installInput();
    const onScan = vi.fn();
    renderHook(() => useBarcodeScanner({ onScan }));

    // First slow char — gap=Infinity, snapshot captured at input=''
    typeKey(input, 'a');
    vi.advanceTimersByTime(400);
    // Second slow char — gap=400 > 300, snapshot refreshed at input='a'
    typeKey(input, 'b');
    vi.advanceTimersByTime(400);
    // Fast burst starts — gap=400 > 300, snapshot refreshed at input='ab'
    for (const ch of ['C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']) {
      typeKey(input, ch);
      vi.advanceTimersByTime(15);
    }
    pressKey('Enter');

    expect(onScan).toHaveBeenCalledTimes(1);
    expect(onScan).toHaveBeenCalledWith('CDEFGHIJ');
    // Restore returns input to the pre-burst snapshot ('ab').
    expect(input.value).toBe('ab');
  });

  // Test 5 — minLength respected
  it('minLength respected — 3 fast chars + Enter → no scan', () => {
    const input = installInput();
    const onScan = vi.fn();
    renderHook(() => useBarcodeScanner({ onScan }));

    for (const ch of ['x', 'y', 'z']) {
      typeKey(input, ch);
      vi.advanceTimersByTime(15);
    }
    const enterEvent = pressKey('Enter');

    expect(onScan).not.toHaveBeenCalled();
    expect(enterEvent.defaultPrevented).toBe(false);
    expect(input.value).toBe('xyz');
  });

  // Test 6 — enabled=false
  it('enabled=false — listener not attached; no preventDefault, no scan', () => {
    const input = installInput();
    const onScan = vi.fn();
    renderHook(() => useBarcodeScanner({ onScan, enabled: false }));

    const events: KeyboardEvent[] = [];
    for (const ch of ['S', 'D', '-', '1', '2', '3', '4']) {
      events.push(typeKey(input, ch));
      vi.advanceTimersByTime(15);
    }
    const enterEvent = pressKey('Enter');

    for (const e of events) expect(e.defaultPrevented).toBe(false);
    expect(enterEvent.defaultPrevented).toBe(false);
    expect(onScan).not.toHaveBeenCalled();
  });

  // Test 7 — enabled flips true→false mid-burst
  it('enabled flips true→false mid-burst — burst discarded, no scan on subsequent Enter', () => {
    const input = installInput();
    const onScan = vi.fn();
    const { rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useBarcodeScanner({ onScan, enabled }),
      { initialProps: { enabled: true } }
    );

    for (const ch of ['S', 'D', '-']) {
      typeKey(input, ch);
      vi.advanceTimersByTime(15);
    }
    rerender({ enabled: false });
    for (const ch of ['9', '9', '9', '9']) {
      typeKey(input, ch);
      vi.advanceTimersByTime(15);
    }
    pressKey('Enter');

    expect(onScan).not.toHaveBeenCalled();
  });

  // Test 8 — data-scan-consumer opt-in: chars stay, NO onScan, NO restore
  it('data-scan-consumer — fast burst + Enter: onScan NOT fired; input NOT restored (chars stay)', () => {
    const input = installInput({ 'data-scan-consumer': '' });
    const onScan = vi.fn();
    renderHook(() => useBarcodeScanner({ onScan }));

    for (const ch of ['S', 'D', '-', '1', '2', '3', '4']) {
      typeKey(input, ch);
      vi.advanceTimersByTime(15);
    }
    const enterEvent = pressKey('Enter');

    expect(onScan).not.toHaveBeenCalled();
    // Enter still preventDefault'd to suppress form submission.
    expect(enterEvent.defaultPrevented).toBe(true);
    // Chars stay — no restore.
    expect(input.value).toBe('SD-1234');
  });

  // Test 9 — focus change mid-burst
  it('focus change mid-burst — snapshot invalidated; scan still detected; no restore attempted', () => {
    const input1 = installInput();
    const input2 = document.createElement('input');
    document.body.appendChild(input2);
    const onScan = vi.fn();
    renderHook(() => useBarcodeScanner({ onScan }));

    // Start burst on input1
    for (const ch of ['S', 'D', '-']) {
      typeKey(input1, ch);
      vi.advanceTimersByTime(15);
    }
    // Focus change mid-burst
    input2.focus();
    // Continue burst — now input2 is focused
    for (const ch of ['1', '2', '3', '4']) {
      typeKey(input2, ch);
      vi.advanceTimersByTime(15);
    }
    pressKey('Enter');

    expect(onScan).toHaveBeenCalledTimes(1);
    expect(onScan).toHaveBeenCalledWith('SD-1234');
    // Snapshot was invalidated on focus change; restore skipped. Both inputs
    // keep what natively landed.
    expect(input1.value).toBe('SD-');
    expect(input2.value).toBe('1234');
  });

  // Test 10 — Non-input focused (body)
  it('non-input focused (body) — fast-burst + Enter: onScan fires, no restore needed', () => {
    const onScan = vi.fn();
    renderHook(() => useBarcodeScanner({ onScan }));
    // No input installed — document.body is the active element.
    expect(document.activeElement).toBe(document.body);

    for (const ch of ['S', 'D', '-', '1', '2', '3', '4']) {
      pressKey(ch);
      vi.advanceTimersByTime(15);
    }
    pressKey('Enter');

    expect(onScan).toHaveBeenCalledTimes(1);
    expect(onScan).toHaveBeenCalledWith('SD-1234');
  });

  // Test 11 — Ring buffer cap
  it('ring buffer cap — 50 fast chars without Enter, then Enter: buffer capped, onScan with tail only', () => {
    const input = installInput();
    const onScan = vi.fn();
    // Default maxBarcodeLength=32 → maxLogSize=40.
    renderHook(() => useBarcodeScanner({ onScan }));

    const chars = Array(50).fill(0).map((_, i) => String.fromCharCode(65 + (i % 26)));
    for (const ch of chars) {
      typeKey(input, ch);
      vi.advanceTimersByTime(10);
    }
    pressKey('Enter');

    expect(onScan).toHaveBeenCalledTimes(1);
    const calledWith = onScan.mock.calls[0][0];
    // Log capped at 40 entries; barcode is the last 40 chars typed.
    expect(calledWith.length).toBe(40);
    expect(calledWith).toBe(chars.slice(10).join(''));
  });

  // Test 12 — Cleanup on unmount
  it('cleanup on unmount — listener removed, no dispatches after unmount', () => {
    const input = installInput();
    const onScan = vi.fn();
    const { unmount } = renderHook(() => useBarcodeScanner({ onScan }));

    for (const ch of ['S', 'D', '-', '1', '2', '3', '4']) {
      typeKey(input, ch);
      vi.advanceTimersByTime(15);
    }
    pressKey('Enter');
    expect(onScan).toHaveBeenCalledTimes(1);

    unmount();

    for (const ch of ['A', 'B', 'C', 'D', 'E', 'F', 'G']) {
      typeKey(input, ch);
      vi.advanceTimersByTime(15);
    }
    pressKey('Enter');
    expect(onScan).toHaveBeenCalledTimes(1);
  });
});
