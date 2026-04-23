import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { CustomerLookup } from '../customer-lookup';
import { useBarcodeScanner } from '@/lib/hooks/use-barcode-scanner';
import { posFetch } from '../../lib/pos-fetch';

// posFetch is called by searchCustomers when query.length >= 2 via debounce.
// Mock as a no-op so the debounced fetch doesn't interfere with the test.
vi.mock('../../lib/pos-fetch', () => ({
  posFetch: vi.fn(async () => ({ ok: true, json: async () => ({ data: [] }) })),
}));

afterEach(() => {
  cleanup();
  vi.mocked(posFetch).mockClear();
});

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
  it('typing a 10-digit phone number at 60ms intervals produces correct raw output (no caret reorder)', () => {
    vi.useFakeTimers();
    const onScan = vi.fn();
    try {
      render(
        <ScannerHookHarness onScan={onScan}>
          <CustomerLookup onSelect={() => {}} onGuest={() => {}} onCreateNew={() => {}} />
        </ScannerHookHarness>
      );

      const input = screen.getByPlaceholderText(
        'Search by name, phone, or email'
      ) as HTMLInputElement;
      input.focus();

      // Type "5551234567" at 60ms gap between keys — above scanBurstMs (50),
      // below snapshotGapMs (300). Natural iPad typing speed. Test preserves
      // 42F regression coverage (scanner hook must not corrupt typing); the
      // EXPECTED VALUE changed from '(555) 123-4567' to '5551234567' in
      // Session 42I because formatPhoneInput was removed from this search
      // input (see CHANGELOG 42I). Scanner-hook behavior is unchanged — the
      // test still verifies that keydown events aren't swallowed and typing
      // flows natively.
      const digits = '5551234567';
      for (const ch of digits) {
        const keydown = new KeyboardEvent('keydown', {
          key: ch,
          bubbles: true,
          cancelable: true,
        });
        document.dispatchEvent(keydown);

        // The scanner hook does not preventDefault printable keys.
        expect(keydown.defaultPrevented).toBe(false);

        // Simulate browser-native typing: append to current input value.
        // Post-42I, the input is plain text — no formatter intercepts.
        act(() => {
          fireEvent.change(input, { target: { value: input.value + ch } });
        });
        act(() => {
          vi.advanceTimersByTime(60);
        });
      }

      expect(input.value).toBe('5551234567');
      expect(onScan).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('CustomerLookup — search input is pass-through (Session 42I)', () => {
  function renderLookup() {
    render(
      <CustomerLookup
        onSelect={() => {}}
        onGuest={() => {}}
        onCreateNew={() => {}}
      />
    );
    return screen.getByPlaceholderText(
      'Search by name, phone, or email'
    ) as HTMLInputElement;
  }

  it('preserves a phone-first mixed query "424 omar" exactly as typed', () => {
    vi.useFakeTimers();
    try {
      const input = renderLookup();
      act(() => {
        fireEvent.change(input, { target: { value: '424 omar' } });
      });
      expect(input.value).toBe('424 omar');
    } finally {
      vi.useRealTimers();
    }
  });

  it('preserves a name-first mixed query "omar 424" exactly as typed', () => {
    vi.useFakeTimers();
    try {
      const input = renderLookup();
      act(() => {
        fireEvent.change(input, { target: { value: 'omar 424' } });
      });
      expect(input.value).toBe('omar 424');
    } finally {
      vi.useRealTimers();
    }
  });

  it('preserves a multi-word name query "omar cuvias" exactly as typed', () => {
    vi.useFakeTimers();
    try {
      const input = renderLookup();
      act(() => {
        fireEvent.change(input, { target: { value: 'omar cuvias' } });
      });
      expect(input.value).toBe('omar cuvias');
    } finally {
      vi.useRealTimers();
    }
  });

  it('preserves a formatted phone "(310) 756-4789" exactly as typed (no re-formatting)', () => {
    vi.useFakeTimers();
    try {
      const input = renderLookup();
      act(() => {
        fireEvent.change(input, { target: { value: '(310) 756-4789' } });
      });
      expect(input.value).toBe('(310) 756-4789');
    } finally {
      vi.useRealTimers();
    }
  });

  it('sends the trimmed typed value to the API after debounce', () => {
    vi.useFakeTimers();
    try {
      const input = renderLookup();
      act(() => {
        fireEvent.change(input, { target: { value: '  424 omar  ' } });
      });
      act(() => {
        vi.advanceTimersByTime(300);
      });
      expect(posFetch).toHaveBeenCalledWith(
        expect.stringContaining(`q=${encodeURIComponent('424 omar')}`)
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not add parens, dashes, or other formatting when typing digits', () => {
    vi.useFakeTimers();
    try {
      const input = renderLookup();
      for (const ch of '424') {
        act(() => {
          fireEvent.change(input, { target: { value: input.value + ch } });
        });
      }
      expect(input.value).toBe('424');
      // Previously would have been '(424' via formatPhoneInput.
    } finally {
      vi.useRealTimers();
    }
  });
});
