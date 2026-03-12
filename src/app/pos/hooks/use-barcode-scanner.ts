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
 *
 * Works globally — attaches on `document` regardless of focus.
 * Uses timing threshold to distinguish scanner (~10ms/char) from human typing (100-300ms).
 * Prevents characters from echoing into focused input fields during rapid sequences.
 */
export function useBarcodeScanner({
  onScan,
  maxKeystrokeGap = 50,
  minLength = 4,
  enabled = true,
}: UseBarcodeOptions) {
  const bufferRef = useRef('');
  const lastKeystrokeRef = useRef(0);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    if (!enabled) return;

    function clearBuffer() {
      bufferRef.current = '';
    }

    function isRapidSequence() {
      return bufferRef.current.length >= 2;
    }

    function handleKeyDown(e: KeyboardEvent) {
      const now = Date.now();
      const gap = now - lastKeystrokeRef.current;

      // If too much time passed since last keystroke, reset buffer
      if (gap > maxKeystrokeGap) {
        bufferRef.current = '';
      }
      lastKeystrokeRef.current = now;

      // Clear idle timer on every keystroke
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);

      if (e.key === 'Enter') {
        const barcode = bufferRef.current.replace(/[\r\n]/g, '').trim();
        if (barcode.length >= minLength) {
          e.preventDefault();
          e.stopPropagation();
          onScanRef.current(barcode);
          window.dispatchEvent(new Event('pos-scanner-detected'));
        }
        bufferRef.current = '';
        return;
      }

      // Only accumulate printable single characters
      if (e.key.length === 1) {
        bufferRef.current += e.key;

        // Prevent characters from echoing into focused inputs during rapid sequences
        if (isRapidSequence()) {
          e.preventDefault();
        }
      }

      // Set idle timeout to clear buffer after 100ms of inactivity
      idleTimerRef.current = setTimeout(clearBuffer, 100);
    }

    document.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => {
      document.removeEventListener('keydown', handleKeyDown, { capture: true });
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [enabled, maxKeystrokeGap, minLength]);
}
