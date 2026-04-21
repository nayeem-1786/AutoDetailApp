'use client';

import { useEffect, useRef } from 'react';

interface UseBarcodeOptions {
  /** Callback when a barcode is scanned */
  onScan: (barcode: string) => void;
  /** Max time between keystrokes in ms (Bluetooth scanners need ~150ms) */
  maxKeystrokeGap?: number;
  /** Minimum barcode length to consider valid */
  minLength?: number;
  /** Whether scanning is enabled */
  enabled?: boolean;
  /**
   * When true (default), Enter only fires `onScan` if the focused element
   * carries `data-barcode-target`. This prevents the scanner from eating
   * Enter in unrelated inputs (e.g. POS cash/tip fields).
   *
   * Set to false on pages that want any rapid keystroke burst to trigger
   * a scan regardless of focus (e.g. a list view with no dedicated input).
   */
  requireTargetAttribute?: boolean;
}

/**
 * Detects barcode scanner input (keyboard emulation mode).
 * Supports both USB (~10ms/char) and Bluetooth (~60-100ms/char) scanners.
 *
 * Works globally — attaches on `document` regardless of focus.
 *
 * Speculative-prevent strategy: every printable keydown is preventDefault'd
 * immediately and appended to a buffer. A release timer of maxKeystrokeGap
 * is (re)scheduled. If it fires with exactly one buffered character, that
 * character is synthesized into the focused input as human typing. Scan
 * bursts always end with Enter before the timer can fire, so their
 * characters never leak into the input — including the first char of the
 * burst, which previously reached the input before burst detection kicked
 * in.
 */
export function useBarcodeScanner({
  onScan,
  maxKeystrokeGap = 150,
  minLength = 4,
  enabled = true,
  requireTargetAttribute = true,
}: UseBarcodeOptions) {
  const bufferRef = useRef('');
  const releaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    if (!enabled) return;

    function clearReleaseTimer() {
      if (releaseTimerRef.current !== null) {
        clearTimeout(releaseTimerRef.current);
        releaseTimerRef.current = null;
      }
    }

    function releaseAsTyping(ch: string) {
      const el = document.activeElement as
        | HTMLInputElement
        | HTMLTextAreaElement
        | null;
      if (!el || typeof (el as HTMLInputElement).value !== 'string') return;
      // Contenteditable surfaces don't expose a `value` setter; bail out.
      if ((el as HTMLElement).isContentEditable) return;

      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? el.value.length;
      const newValue = el.value.slice(0, start) + ch + el.value.slice(end);

      // Native setter + bubbling input event so React's controlled-input
      // onChange handlers fire (React overrides the `value` setter on the
      // instance; we have to call the one on the prototype).
      const proto = Object.getPrototypeOf(el);
      const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (nativeSetter) {
        nativeSetter.call(el, newValue);
      } else {
        el.value = newValue;
      }
      el.dispatchEvent(new Event('input', { bubbles: true }));

      const newCursor = start + ch.length;
      el.setSelectionRange?.(newCursor, newCursor);
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Enter') {
        clearReleaseTimer();
        const barcode = bufferRef.current.replace(/[\r\n]/g, '').trim();
        bufferRef.current = '';

        const activeEl = document.activeElement;
        const hasTarget = activeEl?.hasAttribute('data-barcode-target') ?? false;
        const gatePass = requireTargetAttribute ? hasTarget : true;
        if (barcode.length >= minLength && gatePass) {
          e.preventDefault();
          e.stopPropagation();
          onScanRef.current(barcode);
          window.dispatchEvent(new Event('pos-scanner-detected'));
        }
        return;
      }

      // Modifiers, arrows, function keys — let them through unchanged.
      if (e.key.length !== 1) return;

      e.preventDefault();
      e.stopPropagation();
      bufferRef.current += e.key;

      clearReleaseTimer();
      releaseTimerRef.current = setTimeout(() => {
        const buf = bufferRef.current;
        bufferRef.current = '';
        releaseTimerRef.current = null;
        // A single speculatively-suppressed char with no follow-up is human
        // typing — put it back. Multi-char buffers without Enter are treated
        // as an aborted/incomplete burst and dropped (scans always end with
        // Enter well before this timer fires).
        if (buf.length === 1) {
          releaseAsTyping(buf);
        }
      }, maxKeystrokeGap);
    }

    document.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => {
      document.removeEventListener('keydown', handleKeyDown, { capture: true });
      clearReleaseTimer();
      bufferRef.current = '';
    };
  }, [enabled, maxKeystrokeGap, minLength, requireTargetAttribute]);
}
