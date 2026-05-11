// Phase Mobile-1.1 / Mobile-1.2 — MobileFeePicker behaviors:
//   1.1: pre-fill from customerProfileAddress, preserve typed input,
//        X clear, inline address-required error
//   1.2: revised LOCKED-10 — clear on swap to address-less customer,
//        re-pre-fill on swap back, typed input always preserved,
//        zone-required + custom-fee inline errors

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
  showZoneRequiredError?: boolean;
  showCustomFeeError?: boolean;
}) {
  const [value, setValue] = useState(props.initial);
  return (
    <MobileFeePicker
      value={value}
      onChange={setValue}
      customerProfileAddress={props.customerProfileAddress}
      showAddressRequiredError={props.showAddressRequiredError}
      showZoneRequiredError={props.showZoneRequiredError}
      showCustomFeeError={props.showCustomFeeError}
    />
  );
}

// Two-phase harness: lets the test swap customerProfileAddress after mount
// (simulates the cashier swapping linked customer mid-ticket).
function SwappablePicker({
  initial,
  initialProfile,
}: {
  initial: QuoteMobileState;
  initialProfile: string | null;
}) {
  const [value, setValue] = useState(initial);
  const [profile, setProfile] = useState<string | null>(initialProfile);
  return (
    <div>
      <MobileFeePicker
        value={value}
        onChange={setValue}
        customerProfileAddress={profile}
      />
      <button onClick={() => setProfile(null)} data-testid="swap-to-empty">
        swap to empty
      </button>
      <button
        onClick={() => setProfile('123 Main St, Torrance, CA 90501')}
        data-testid="swap-to-a"
      >
        swap to A
      </button>
      <button
        onClick={() => setProfile('456 Oak Ave, Lomita, CA 90717')}
        data-testid="swap-to-b"
      >
        swap to B
      </button>
    </div>
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

describe('MobileFeePicker — Phase Mobile-1.2 (revised LOCKED-10)', () => {
  it('clears the address when switching to a customer with NO profile address (Bug 2)', async () => {
    // Customer A → has profile address, picker pre-fills.
    render(
      <SwappablePicker
        initial={baseMobile}
        initialProfile="123 Main St, Torrance, CA 90501"
      />
    );
    const input = screen.getByPlaceholderText(/123 Main St/i) as HTMLInputElement;
    await waitFor(() => {
      expect(input.value).toBe('123 Main St, Torrance, CA 90501');
    });

    // Swap to customer B (no profile address).
    fireEvent.click(screen.getByTestId('swap-to-empty'));

    await waitFor(() => {
      expect(input.value).toBe('');
    });
  });

  it('re-pre-fills when swapping back to a customer WITH a profile address', async () => {
    render(
      <SwappablePicker
        initial={baseMobile}
        initialProfile="123 Main St, Torrance, CA 90501"
      />
    );
    const input = screen.getByPlaceholderText(/123 Main St/i) as HTMLInputElement;
    await waitFor(() => {
      expect(input.value).toBe('123 Main St, Torrance, CA 90501');
    });

    fireEvent.click(screen.getByTestId('swap-to-empty'));
    await waitFor(() => expect(input.value).toBe(''));

    fireEvent.click(screen.getByTestId('swap-to-a'));
    await waitFor(() => {
      expect(input.value).toBe('123 Main St, Torrance, CA 90501');
    });
  });

  it('overwrites prior pre-fill when swapping between two customers each with a profile address', async () => {
    render(
      <SwappablePicker
        initial={baseMobile}
        initialProfile="123 Main St, Torrance, CA 90501"
      />
    );
    const input = screen.getByPlaceholderText(/123 Main St/i) as HTMLInputElement;
    await waitFor(() => {
      expect(input.value).toBe('123 Main St, Torrance, CA 90501');
    });

    fireEvent.click(screen.getByTestId('swap-to-b'));
    await waitFor(() => {
      expect(input.value).toBe('456 Oak Ave, Lomita, CA 90717');
    });
  });

  it('preserves user-typed input across customer swap', async () => {
    render(
      <SwappablePicker
        initial={baseMobile}
        initialProfile="123 Main St, Torrance, CA 90501"
      />
    );
    const input = screen.getByPlaceholderText(/123 Main St/i) as HTMLInputElement;
    await waitFor(() => {
      expect(input.value).toBe('123 Main St, Torrance, CA 90501');
    });

    // Cashier types over the pre-fill.
    fireEvent.change(input, {
      target: { value: '999 Manual Override Ln' },
    });
    expect(input.value).toBe('999 Manual Override Ln');

    // Swap to a different customer.
    fireEvent.click(screen.getByTestId('swap-to-b'));
    // The typed value must be preserved.
    expect(input.value).toBe('999 Manual Override Ln');

    // Also: swap to no-address customer should preserve typed value.
    fireEvent.click(screen.getByTestId('swap-to-empty'));
    expect(input.value).toBe('999 Manual Override Ln');
  });

  it('after X clear, a customer swap re-pre-fills (X clear unsets the auto-prefill flag)', async () => {
    render(
      <SwappablePicker
        initial={baseMobile}
        initialProfile="123 Main St, Torrance, CA 90501"
      />
    );
    const input = screen.getByPlaceholderText(/123 Main St/i) as HTMLInputElement;
    await waitFor(() => {
      expect(input.value).toBe('123 Main St, Torrance, CA 90501');
    });

    fireEvent.click(screen.getByLabelText(/clear address/i));
    await waitFor(() => expect(input.value).toBe(''));

    fireEvent.click(screen.getByTestId('swap-to-b'));
    await waitFor(() => {
      expect(input.value).toBe('456 Oak Ave, Lomita, CA 90717');
    });
  });

  it('Phase 1.3: when picker mounts with value.address already matching profile, swap to no-profile clears (loaded-quote scenario)', async () => {
    // Simulates loading an existing quote where mobile_address was saved
    // earlier and happens to equal the linked customer's profile address.
    // Pre-1.3 the addressWasAutoPrefilled flag was stuck at false on mount,
    // so a subsequent customer swap to a no-profile customer would NOT
    // clear the field. With the 1.3 fix the effect normalizes the flag on
    // mount and the swap clears correctly.
    const initial: QuoteMobileState = {
      ...baseMobile,
      address: '123 Main St, Torrance, CA 90501',
    };
    render(
      <SwappablePicker
        initial={initial}
        initialProfile="123 Main St, Torrance, CA 90501"
      />
    );
    const input = screen.getByPlaceholderText(/123 Main St/i) as HTMLInputElement;
    expect(input.value).toBe('123 Main St, Torrance, CA 90501');

    // Swap to a customer with no profile address.
    fireEvent.click(screen.getByTestId('swap-to-empty'));
    await waitFor(() => {
      expect(input.value).toBe('');
    });
  });

  it('Phase 1.3: matching-at-mount also recovers the overwrite path on swap to a different profile', async () => {
    // Same loaded-quote setup, but swap to Customer B (different profile).
    // Expect overwrite, not preserve — the field was never user-typed.
    const initial: QuoteMobileState = {
      ...baseMobile,
      address: '123 Main St, Torrance, CA 90501',
    };
    render(
      <SwappablePicker
        initial={initial}
        initialProfile="123 Main St, Torrance, CA 90501"
      />
    );
    const input = screen.getByPlaceholderText(/123 Main St/i) as HTMLInputElement;
    expect(input.value).toBe('123 Main St, Torrance, CA 90501');

    fireEvent.click(screen.getByTestId('swap-to-b'));
    await waitFor(() => {
      expect(input.value).toBe('456 Oak Ave, Lomita, CA 90717');
    });
  });

  it('renders "Please select a service area for the mobile fee" when showZoneRequiredError && no zone', () => {
    render(
      <ControlledPicker
        initial={{ ...baseMobile, address: '123 Main' }}
        showZoneRequiredError={true}
      />
    );
    expect(
      screen.getByText(/please select a service area for the mobile fee/i)
    ).toBeTruthy();
  });

  it('does NOT render zone-required error when isCustom is true', () => {
    render(
      <ControlledPicker
        initial={{ ...baseMobile, address: '123 Main', isCustom: true }}
        showZoneRequiredError={true}
      />
    );
    expect(
      screen.queryByText(/please select a service area for the mobile fee/i)
    ).toBeNull();
  });

  it('renders "Enter a custom fee between $1 and $500" on Custom path with invalid surcharge', () => {
    render(
      <ControlledPicker
        initial={{
          ...baseMobile,
          address: '123 Main',
          isCustom: true,
          surcharge: 0,
        }}
        showCustomFeeError={true}
      />
    );
    expect(
      screen.getByText(/enter a custom fee between \$1 and \$500/i)
    ).toBeTruthy();
  });

  it('does NOT render custom-fee error when isCustom path has a valid surcharge', () => {
    render(
      <ControlledPicker
        initial={{
          ...baseMobile,
          address: '123 Main',
          isCustom: true,
          surcharge: 50,
        }}
        showCustomFeeError={true}
      />
    );
    expect(
      screen.queryByText(/enter a custom fee between \$1 and \$500/i)
    ).toBeNull();
  });
});
