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
}

/**
 * Detects barcode scanner input (keyboard emulation mode).
 * Supports both USB (~10ms/char) and Bluetooth (~60-100ms/char) scanners.
 *
 * Works globally — attaches on `document` regardless of focus.
 * Uses timing threshold to distinguish scanner from human typing (200-400ms).
 * Once a rapid pair of characters is detected, ALL subsequent characters are
 * suppressed (preventDefault) until Enter fires or the idle timeout clears.
 */
export function useBarcodeScanner({
  onScan,
  maxKeystrokeGap = 150,
  minLength = 4,
  enabled = true,
}: UseBarcodeOptions) {
  const bufferRef = useRef('');
  const lastKeystrokeRef = useRef(0);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const scanningRef = useRef(false);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    if (!enabled) return;

    function endScanSession() {
      bufferRef.current = '';
      scanningRef.current = false;
    }

    function handleKeyDown(e: KeyboardEvent) {
      const now = Date.now();
      const gap = now - lastKeystrokeRef.current;

      // If too much time passed since last keystroke, reset
      if (gap > maxKeystrokeGap) {
        endScanSession();
      }
      lastKeystrokeRef.current = now;

      // Clear idle timer on every keystroke
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);

      if (e.key === 'Enter') {
        const barcode = bufferRef.current.replace(/[\r\n]/g, '').trim();
        const activeEl = document.activeElement;
        const isBarcodeScanTarget = activeEl?.hasAttribute('data-barcode-target');
        if (barcode.length >= minLength && isBarcodeScanTarget) {
          e.preventDefault();
          e.stopPropagation();
          onScanRef.current(barcode);
          window.dispatchEvent(new Event('pos-scanner-detected'));
        }
        endScanSession();
        return;
      }

      // Only accumulate printable single characters
      if (e.key.length === 1) {
        bufferRef.current += e.key;

        // Once we see 2+ rapid characters, flag as scanning — suppress ALL chars
        if (bufferRef.current.length >= 2) {
          scanningRef.current = true;
        }

        // Prevent character from echoing into focused inputs during scan
        if (scanningRef.current) {
          e.preventDefault();
        }
      }

      // Idle timeout: clear buffer after maxKeystrokeGap + 50ms headroom
      idleTimerRef.current = setTimeout(endScanSession, maxKeystrokeGap + 50);
    }

    document.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => {
      document.removeEventListener('keydown', handleKeyDown, { capture: true });
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [enabled, maxKeystrokeGap, minLength]);
}
