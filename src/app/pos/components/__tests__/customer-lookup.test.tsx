import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { CustomerLookup } from '../customer-lookup';
import { useBarcodeScanner } from '@/lib/hooks/use-barcode-scanner';

// posFetch is called by searchCustomers when query.length >= 2 via debounce.
// Mock as a no-op so the debounced fetch doesn't interfere with the test.
vi.mock('../../lib/pos-fetch', () => ({
  posFetch: vi.fn(async () => ({ ok: true, json: async () => ({ data: [] }) })),
}));

afterEach(cleanup);

/**
 * Harness that mounts `useBarcodeScanner` alongside CustomerLookup — matches
 * the real page topology where PosWorkspace mounts the hook while the
 * Customer Lookup Dialog is rendered beneath it.
 */
function ScannerHookHarness({
  onScan,
  children,
}: {
  onScan: (barcode: string) => void;
  children: React.ReactNode;
}) {
  useBarcodeScanner({ onScan });
  return <>{children}</>;
}

describe('CustomerLookup + scanner hook — motivating-bug regression (Session 42F)', () => {
  it('typing a 10-digit phone number at 60ms intervals produces correct formatted output (no caret reorder)', () => {
    vi.useFakeTimers();
    const onScan = vi.fn();
    try {
      render(
        <ScannerHookHarness onScan={onScan}>
          <CustomerLookup onSelect={() => {}} onGuest={() => {}} onCreateNew={() => {}} />
        </ScannerHookHarness>
      );

      const input = screen.getByPlaceholderText('Search by name or phone...') as HTMLInputElement;
      input.focus();

      // Type "5551234567" at 60ms gap between keys — above scanBurstMs (50),
      // below snapshotGapMs (300). Natural iPad typing speed. Under the old
      // hook this sequence produced reordered digits like "(107) 478-9653"
      // (formatPhoneInput + release-as-typing cursor interaction). Under the
      // new observe-don't-capture hook, typing flows natively and React's
      // controlled reconciliation handles cursor position correctly.
      const digits = '5551234567';
      for (const ch of digits) {
        const keydown = new KeyboardEvent('keydown', {
          key: ch,
          bubbles: true,
          cancelable: true,
        });
        document.dispatchEvent(keydown);

        // The new hook does not preventDefault printable keys.
        expect(keydown.defaultPrevented).toBe(false);

        // Simulate browser-native typing: append to current (possibly
        // already-reformatted) input value.
        act(() => {
          fireEvent.change(input, { target: { value: input.value + ch } });
        });
        act(() => {
          vi.advanceTimersByTime(60);
        });
      }

      expect(input.value).toBe('(555) 123-4567');
      expect(onScan).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
