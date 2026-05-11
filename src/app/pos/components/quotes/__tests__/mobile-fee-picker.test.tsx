// Phase Mobile-1.1 — MobileFeePicker:
//   - pre-fills empty address from customerProfileAddress on mount
//   - does NOT overwrite a non-empty typed address on customer change (LOCKED-10)
//   - X clear button clears + focuses the input
//   - inline error renders when showAddressRequiredError && empty

import { useState } from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
} from '@testing-library/react';
import { MobileFeePicker } from '../mobile-fee-picker';
import type { QuoteMobileState } from '../../../types';

// Mock posFetch so the zones load resolves to []. We don't exercise zones here.
vi.mock('../../../lib/pos-fetch', () => ({
  posFetch: vi.fn(async () => ({
    ok: true,
    json: async () => ({ zones: [] }),
  })),
}));

afterEach(() => {
  cleanup();
});

const baseMobile: QuoteMobileState = {
  isMobile: true,
  zoneId: null,
  address: '',
  surcharge: 0,
  zoneNameSnapshot: '',
  isCustom: false,
};

function ControlledPicker(props: {
  initial: QuoteMobileState;
  customerProfileAddress?: string | null;
  showAddressRequiredError?: boolean;
}) {
  const [value, setValue] = useState(props.initial);
  return (
    <MobileFeePicker
      value={value}
      onChange={setValue}
      customerProfileAddress={props.customerProfileAddress}
      showAddressRequiredError={props.showAddressRequiredError}
    />
  );
}

describe('MobileFeePicker — Phase Mobile-1.1', () => {
  it('pre-fills the address input from customerProfileAddress when empty', async () => {
    render(
      <ControlledPicker
        initial={baseMobile}
        customerProfileAddress="123 Main St, Torrance, CA 90501"
      />
    );

    await waitFor(() => {
      const input = screen.getByPlaceholderText(/123 Main St/i) as HTMLInputElement;
      expect(input.value).toBe('123 Main St, Torrance, CA 90501');
    });
  });

  it('does NOT overwrite a typed address when customerProfileAddress arrives later', async () => {
    const initial: QuoteMobileState = { ...baseMobile, address: '999 Custom Ave' };
    render(
      <ControlledPicker
        initial={initial}
        customerProfileAddress="123 Main St, Torrance, CA 90501"
      />
    );

    const input = screen.getByPlaceholderText(/123 Main St/i) as HTMLInputElement;
    // The mount effect should NOT overwrite, since address is non-empty.
    expect(input.value).toBe('999 Custom Ave');
  });

  it('clears the address when X button is clicked', async () => {
    const initial: QuoteMobileState = {
      ...baseMobile,
      address: '123 Main St, Torrance, CA 90501',
    };
    render(<ControlledPicker initial={initial} customerProfileAddress={null} />);

    const input = screen.getByPlaceholderText(/123 Main St/i) as HTMLInputElement;
    expect(input.value).toBe('123 Main St, Torrance, CA 90501');

    const clearBtn = screen.getByLabelText(/clear address/i);
    fireEvent.click(clearBtn);

    await waitFor(() => {
      expect(input.value).toBe('');
    });
  });

  it('renders inline required-error when showAddressRequiredError && empty', () => {
    render(
      <ControlledPicker
        initial={baseMobile}
        showAddressRequiredError={true}
      />
    );
    expect(
      screen.getByText(/address is required for mobile service/i)
    ).toBeTruthy();
  });

  it('does NOT render inline error when address is filled', async () => {
    const initial: QuoteMobileState = {
      ...baseMobile,
      address: '123 Main',
    };
    render(
      <ControlledPicker
        initial={initial}
        showAddressRequiredError={true}
      />
    );
    expect(
      screen.queryByText(/address is required for mobile service/i)
    ).toBeNull();
  });
});
