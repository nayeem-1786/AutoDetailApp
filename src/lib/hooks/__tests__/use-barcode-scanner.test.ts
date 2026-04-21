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

  it('releases multi-char human typing when no Enter follows', () => {
    const input = installTargetedInput();
    const onScan = vi.fn();
    renderHook(() => useBarcodeScanner({ onScan }));

    // Three chars within maxKeystrokeGap of each other, no Enter.
    pressKey('a');
    vi.advanceTimersByTime(40);
    pressKey('b');
    vi.advanceTimersByTime(40);
    pressKey('c');

    // Still buffered — nothing in the input yet.
    expect(input.value).toBe('');

    // Silence for the full release window.
    vi.advanceTimersByTime(200);

    expect(input.value).toBe('abc');
    expect(onScan).not.toHaveBeenCalled();
  });

  it('scanner burst with Enter still fires onScan after multi-char release change (regression)', () => {
    const input = installTargetedInput();
    const onScan = vi.fn();
    renderHook(() => useBarcodeScanner({ onScan }));

    for (const ch of ['S', 'D', '-', '9', '8', '7', '6', '5']) {
      pressKey(ch);
      vi.advanceTimersByTime(15);
    }
    pressKey('Enter');

    expect(onScan).toHaveBeenCalledTimes(1);
    expect(onScan).toHaveBeenCalledWith('SD-98765');
    expect(input.value).toBe('');

    // Release timer must not fire after Enter cleared it (would double-release).
    vi.advanceTimersByTime(500);
    expect(input.value).toBe('');
    expect(onScan).toHaveBeenCalledTimes(1);
  });

  it('multi-char typing, pause, more typing — released in chunks, input accumulates', () => {
    const input = installTargetedInput();
    const onScan = vi.fn();
    renderHook(() => useBarcodeScanner({ onScan }));

    // First chunk: "ab" fast
    pressKey('a');
    vi.advanceTimersByTime(40);
    pressKey('b');
    // Pause > maxKeystrokeGap — first chunk releases.
    vi.advanceTimersByTime(200);
    expect(input.value).toBe('ab');

    // Second chunk: "cd" fast
    pressKey('c');
    vi.advanceTimersByTime(40);
    pressKey('d');
    vi.advanceTimersByTime(200);

    expect(input.value).toBe('abcd');
    expect(onScan).not.toHaveBeenCalled();
  });
});

describe('useBarcodeScanner — data-barcode-scan-target override (42D-interlude)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  // Test 1: regression — without the new attribute, onScan fires as before.
  it('scan burst still fires onScan when no input has data-barcode-scan-target', () => {
    installTargetedInput();
    const onScan = vi.fn();
    renderHook(() => useBarcodeScanner({ onScan }));

    for (const ch of ['S', 'D', '-', '1', '2', '3', '4']) {
      pressKey(ch);
      vi.advanceTimersByTime(15);
    }
    pressKey('Enter');

    expect(onScan).toHaveBeenCalledTimes(1);
    expect(onScan).toHaveBeenCalledWith('SD-1234');
  });

  // Test 2: with the attribute, onScan is NOT called and keystrokes are not intercepted.
  it('scan burst does NOT call onScan when active element has data-barcode-scan-target="input"', () => {
    // The input opts into scan-target behavior. It does NOT carry
    // data-barcode-target (the onScan-opt-in), but the early-return in the
    // hook should take precedence regardless.
    const input = document.createElement('input');
    input.setAttribute('data-barcode-scan-target', 'input');
    document.body.appendChild(input);
    input.focus();

    const onScan = vi.fn();
    renderHook(() => useBarcodeScanner({ onScan }));

    const events = ['S', 'D', '-', '9', '9', '9', '9'].map((ch) => {
      const ev = pressKey(ch);
      vi.advanceTimersByTime(15);
      return ev;
    });
    const enterEv = pressKey('Enter');

    // None of the keystrokes were intercepted — native behavior (and the
    // input's own handlers, if any) take over.
    for (const ev of events) {
      expect(ev.defaultPrevented).toBe(false);
    }
    expect(enterEv.defaultPrevented).toBe(false);
    expect(onScan).not.toHaveBeenCalled();

    // Release timer must not fire later either — hook didn't buffer anything.
    vi.advanceTimersByTime(500);
    expect(onScan).not.toHaveBeenCalled();
  });

  // Test 3: first-char suppression (from 40B) is bypassed for target-attribute
  // inputs — the very first keystroke is not eaten by the hook.
  it('first character of a burst is not eaten when the input has data-barcode-scan-target', () => {
    const input = document.createElement('input');
    input.setAttribute('data-barcode-scan-target', 'input');
    document.body.appendChild(input);
    input.focus();

    const onScan = vi.fn();
    renderHook(() => useBarcodeScanner({ onScan }));

    const first = pressKey('S');
    // 40B would have preventDefaulted this keystroke. With the override it
    // flows through natively — asserted via defaultPrevented.
    expect(first.defaultPrevented).toBe(false);

    // Nothing got buffered, so the release-as-typing path must not fire.
    vi.advanceTimersByTime(500);
    expect(onScan).not.toHaveBeenCalled();
  });
});
