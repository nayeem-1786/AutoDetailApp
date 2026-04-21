import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, cleanup } from '@testing-library/react';
import { useBarcodeScanner } from '../use-barcode-scanner';

// Helper: dispatch a keydown in capture phase (which the hook listens on).
function pressKey(key: string) {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
  });
  document.dispatchEvent(event);
  return event;
}

function installTargetedInput(extraAttrs: Record<string, string> = {}) {
  const input = document.createElement('input');
  input.setAttribute('data-barcode-target', '');
  for (const [k, v] of Object.entries(extraAttrs)) input.setAttribute(k, v);
  document.body.appendChild(input);
  input.focus();
  return input;
}

describe('useBarcodeScanner — first-char leak suppression', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    // Vitest globals aren't enabled, so @testing-library/react's auto-
    // cleanup doesn't fire — unmount hooks manually or their document
    // keydown listeners accumulate across tests.
    cleanup();
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('single slow character is released as typing after timeout', () => {
    const input = installTargetedInput();
    const onScan = vi.fn();

    renderHook(() => useBarcodeScanner({ onScan }));

    pressKey('a');
    expect(input.value).toBe('');

    vi.advanceTimersByTime(200);

    expect(input.value).toBe('a');
    expect(onScan).not.toHaveBeenCalled();
  });

  it('rapid burst is suppressed entirely; onScan fires on Enter', () => {
    const input = installTargetedInput();
    const onScan = vi.fn();

    renderHook(() => useBarcodeScanner({ onScan }));

    const chars = ['S', 'D', '-', '0', '0', '6', '2', '1', '7'];
    for (const ch of chars) {
      pressKey(ch);
      vi.advanceTimersByTime(30);
      // Input must remain empty the whole way through — including after char 1
      expect(input.value).toBe('');
    }

    pressKey('Enter');

    expect(onScan).toHaveBeenCalledTimes(1);
    expect(onScan).toHaveBeenCalledWith('SD-006217');
    expect(input.value).toBe('');
  });

  it('first character of a burst never becomes visible in the focused input', () => {
    const input = installTargetedInput();
    const onScan = vi.fn();
    renderHook(() => useBarcodeScanner({ onScan }));

    pressKey('S');
    // After char 1 (before char 2 arrives) the input must already be empty —
    // this is the exact regression Session 40B fixes.
    expect(input.value).toBe('');
    vi.advanceTimersByTime(20);
    expect(input.value).toBe('');

    pressKey('D');
    pressKey('-');
    pressKey('1');
    pressKey('2');
    pressKey('3');
    pressKey('4');
    pressKey('Enter');

    expect(input.value).toBe('');
    expect(onScan).toHaveBeenCalledWith('SD-1234');
  });

  it('slow character then a burst: slow char is typed, burst fires onScan cleanly', () => {
    const input = installTargetedInput();
    const onScan = vi.fn();
    renderHook(() => useBarcodeScanner({ onScan }));

    // 1) slow single char (released as typing)
    pressKey('x');
    vi.advanceTimersByTime(200);
    expect(input.value).toBe('x');

    // 2) rapid burst
    for (const ch of ['S', 'D', '-', '9', '9', '9', '9']) {
      pressKey(ch);
      vi.advanceTimersByTime(20);
    }
    pressKey('Enter');

    // Input still holds only the previously-typed 'x'; burst did not leak.
    expect(input.value).toBe('x');
    expect(onScan).toHaveBeenCalledTimes(1);
    expect(onScan).toHaveBeenCalledWith('SD-9999');
  });

  it('enabled=false passes all characters through and never calls onScan', () => {
    const input = installTargetedInput();
    const onScan = vi.fn();
    renderHook(() => useBarcodeScanner({ onScan, enabled: false }));

    // With the hook disabled, keydown events aren't intercepted and the
    // browser's default behavior (filling the input) would apply. jsdom
    // doesn't auto-fill inputs from synthetic keydowns, but the hook also
    // must not preventDefault — verify by checking defaultPrevented on each
    // event and that onScan stays silent.
    const events = ['S', 'D', '-', '1', '2', '3', '4'].map((ch) => pressKey(ch));
    const enterEvent = pressKey('Enter');

    for (const e of events) {
      expect(e.defaultPrevented).toBe(false);
    }
    expect(enterEvent.defaultPrevented).toBe(false);

    // The release timer must not have scheduled anything, either.
    vi.advanceTimersByTime(500);
    expect(onScan).not.toHaveBeenCalled();
    expect(input.value).toBe('');
  });
});
