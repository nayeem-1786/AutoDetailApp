'use client';

import { useEffect, useRef } from 'react';

interface UseBarcodeScannerOptions {
  /** Called when a scan is detected (fast burst + Enter terminator). */
  onScan: (barcode: string) => void;

  /** Hook mounts its listener only when true. Default: true. Reactive. */
  enabled?: boolean;

  /** Minimum chars in the detected burst. Default: 4. */
  minLength?: number;

  /**
   * Max inter-key gap (ms) for adjacent chars to count as part of one scan
   * burst. Default: 50. Hardware-validated 2026-04-22: BT scanner max gap
   * 27 ms, fast typing min gap 144 ms, 117 ms clean separation band. See
   * docs/audits/SCANNER_HOOK_REWRITE_SESSION42F.md §6.
   */
  scanBurstMs?: number;

  /**
   * Gap above which a new "burst window" begins — any inter-key gap above
   * this triggers a fresh pre-burst snapshot of the focused input. Default:
   * 300 (comfortably above the slowest scanner, well below slow typing).
   */
  snapshotGapMs?: number;

  /**
   * Ring-buffer cap for recent keystrokes. Default: 32. Log is capped at
   * `maxBarcodeLength + 8` to tolerate the occasional dropped Enter.
   */
  maxBarcodeLength?: number;
}

interface KeyLogEntry {
  key: string;
  timestamp: number;
}

interface Snapshot {
  el: HTMLInputElement | HTMLTextAreaElement;
  value: string;
  start: number;
  end: number;
}

/**
 * Barcode scanner detector (observe-don't-capture model — Session 42F).
 *
 * Attaches a passive, capture-phase `keydown` listener at `document`.
 * Printable keys are OBSERVED (logged with timestamps) and pass through
 * NATIVELY — the hook does NOT `preventDefault` or `stopPropagation` on
 * typing. On Enter, the hook walks the key log backwards to find the
 * longest contiguous tail whose inter-key gaps are all `< scanBurstMs`.
 * If that tail meets `minLength`, it's a scan: `preventDefault(Enter)`,
 * restore the focused input to its pre-burst snapshot (erasing stray
 * chars), and fire `onScan(barcode)`.
 *
 * Scan-consumer opt-in: if the focused element carries `data-scan-consumer`,
 * scans are "consumed" by that input — chars stay, no restore, no event
 * dispatch, no `onScan` call. Enter is still preventDefault'd to suppress
 * form submission. Used by the Quick Edit drawer's Barcode field.
 *
 * Design notes:
 * - Typing flows natively → no cursor-reorder bugs with controlled-reformat
 *   inputs (formatPhoneInput, currency formatters, etc.). Fixes the Session
 *   42F motivating regression.
 * - Scan detection is purely timing-based → no per-input opt-in required.
 * - Capture phase → the Enter preventDefault wins against browser
 *   form-submission before bubble-phase handlers can commit.
 * - NO stopPropagation → React onKeyDown handlers (useEnterSubmit, etc.)
 *   still observe Enter. Intentional design choice; consumers that need
 *   stricter isolation can add their own guards.
 *
 * See docs/audits/SCANNER_HOOK_REWRITE_SESSION42F.md for the full design
 * and hardware timing measurements. See
 * docs/audits/SCANNER_MIGRATION_SESSION42F.md for the compat-shim cleanup
 * that finalized this API.
 */
export function useBarcodeScanner(options: UseBarcodeScannerOptions): void {
  const {
    onScan,
    enabled = true,
    minLength = 4,
    scanBurstMs = 50,
    snapshotGapMs = 300,
    maxBarcodeLength = 32,
  } = options;

  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  const logRef = useRef<KeyLogEntry[]>([]);
  const snapshotRef = useRef<Snapshot | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const maxLogSize = maxBarcodeLength + 8;

    function captureSnapshot(): void {
      const el = document.activeElement;
      if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
        snapshotRef.current = null;
        return;
      }
      if ((el as HTMLElement).isContentEditable) {
        snapshotRef.current = null;
        return;
      }
      snapshotRef.current = {
        el,
        value: el.value,
        start: el.selectionStart ?? el.value.length,
        end: el.selectionEnd ?? el.value.length,
      };
    }

    function restoreSnapshot(): void {
      const snap = snapshotRef.current;
      if (!snap) return;
      const proto = Object.getPrototypeOf(snap.el);
      const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (nativeSetter) nativeSetter.call(snap.el, snap.value);
      else snap.el.value = snap.value;
      snap.el.dispatchEvent(new Event('input', { bubbles: true }));
      snap.el.setSelectionRange?.(snap.start, snap.end);
    }

    function isScanConsumer(el: Element | null): boolean {
      if (!(el instanceof HTMLElement)) return false;
      return el.hasAttribute('data-scan-consumer');
    }

    function detectScanTail(): KeyLogEntry[] | null {
      const log = logRef.current;
      if (log.length < minLength) return null;

      let tailStart = log.length - 1;
      for (let i = log.length - 1; i > 0; i--) {
        const gap = log[i].timestamp - log[i - 1].timestamp;
        if (gap < scanBurstMs) {
          tailStart = i - 1;
        } else {
          break;
        }
      }
      const tail = log.slice(tailStart);
      if (tail.length < minLength) return null;
      return tail;
    }

    function handleKeyDown(e: KeyboardEvent): void {
      // Modifiers, arrows, function keys — flow through untouched.
      if (e.key !== 'Enter' && e.key.length !== 1) return;

      const now = performance.now();
      const log = logRef.current;
      const lastEntry = log[log.length - 1];
      const gap = lastEntry ? now - lastEntry.timestamp : Infinity;

      if (e.key !== 'Enter') {
        // Refresh snapshot on a new burst window. Unconditional overwrite
        // on gap > snapshotGapMs — a stale snapshot is always less useful
        // than a fresh one.
        if (gap > snapshotGapMs) {
          captureSnapshot();
        }

        // Focus invalidation: if activeElement changed since the snapshot
        // was captured, nothing meaningful remains to restore onto.
        if (
          snapshotRef.current &&
          document.activeElement !== snapshotRef.current.el
        ) {
          snapshotRef.current = null;
        }

        log.push({ key: e.key, timestamp: now });
        while (log.length > maxLogSize) log.shift();

        // NO preventDefault. NO stopPropagation. Keystroke flows natively.
        return;
      }

      // Enter — classify as scan or typing-terminated.
      const scanTail = detectScanTail();

      if (!scanTail) {
        // Typing-terminated Enter: reset state, let Enter flow natively
        // (form submit, useEnterSubmit handler, newline, etc.).
        logRef.current = [];
        snapshotRef.current = null;
        return;
      }

      // Scan detected.
      e.preventDefault();
      // Do NOT stopPropagation — React handlers (useEnterSubmit, etc.) can
      // still observe this Enter. See hook JSDoc for rationale.

      const barcode = scanTail.map((k) => k.key).join('').trim();

      // Reset log before dispatch so reentrant onScan starts fresh.
      logRef.current = [];

      const consumerOptIn = isScanConsumer(document.activeElement);

      if (consumerOptIn) {
        // Scan-consumer semantics: chars stay in the input (no restore),
        // no pos-scanner-detected dispatch, no onScan call. The focused
        // input has "consumed" the scan by letting chars land.
        snapshotRef.current = null;
        return;
      }

      // Standard path: restore input, dispatch event, fire onScan.
      restoreSnapshot();
      snapshotRef.current = null;

      window.dispatchEvent(new Event('pos-scanner-detected'));
      onScanRef.current(barcode);
    }

    document.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => {
      document.removeEventListener('keydown', handleKeyDown, { capture: true });
      logRef.current = [];
      snapshotRef.current = null;
    };
  }, [enabled, minLength, scanBurstMs, snapshotGapMs, maxBarcodeLength]);
}
