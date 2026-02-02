'use client';

import { useEffect, useRef } from 'react';

interface UseBarcodeOptions {
  /** Callback when a barcode is scanned */
  onScan: (barcode: string) => void;
  /** Max time between keystrokes in ms (USB scanners are very fast) */
  maxKeystrokeGap?: number;
  /** Minimum barcode length to consider valid */
  minLength?: number;
  /** Whether scanning is enabled */
  enabled?: boolean;
}

/**
 * Detects USB barcode scanner input (keyboard emulation mode).
 * Scanners type characters very rapidly (< 50ms apart) and end with Enter.
 * This distinguishes scanner input from normal keyboard typing.
 */
export function useBarcodeScanner({
  onScan,
  maxKeystrokeGap = 50,
  minLength = 4,
  enabled = true,
}: UseBarcodeOptions) {
  const bufferRef = useRef('');
  const lastKeystrokeRef = useRef(0);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    if (!enabled) return;

    function handleKeyDown(e: KeyboardEvent) {
      // Ignore if user is typing in an input/textarea
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        // Exception: allow if it's the POS search bar (has data-barcode-target)
        if (!target.hasAttribute('data-barcode-target')) {
          return;
        }
      }

      const now = Date.now();

      // If too much time passed since last keystroke, reset buffer
      if (now - lastKeystrokeRef.current > maxKeystrokeGap) {
        bufferRef.current = '';
      }
      lastKeystrokeRef.current = now;

      if (e.key === 'Enter') {
        if (bufferRef.current.length >= minLength) {
          e.preventDefault();
          onScanRef.current(bufferRef.current);
        }
        bufferRef.current = '';
        return;
      }

      // Only accumulate printable single characters
      if (e.key.length === 1) {
        bufferRef.current += e.key;
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled, maxKeystrokeGap, minLength]);
}
