// Phase Mobile-1.1 — SaveAddressDialog:
//   - renders the diff (on-file vs entered)
//   - "Update profile" PATCHes the POS endpoint with the entered address
//   - "Skip" closes without firing any request

import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
} from '@testing-library/react';
import { SaveAddressDialog } from '../save-address-dialog';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const posFetchMock = vi.fn(async () => ({
  ok: true,
  json: async () => ({ customer: { id: 'cust-1' } }),
}));

vi.mock('../../../lib/pos-fetch', () => ({
  posFetch: (...args: unknown[]) =>
    (posFetchMock as unknown as (...a: unknown[]) => Promise<{ ok: boolean; json: () => Promise<unknown> }>)(
      ...args
    ),
}));

afterEach(() => {
  cleanup();
  posFetchMock.mockClear();
});

describe('SaveAddressDialog — Phase Mobile-1.1', () => {
  it('renders both addresses in the diff', () => {
    render(
      <SaveAddressDialog
        open={true}
        onClose={() => {}}
        customerId="cust-1"
        currentProfileAddress="123 Main St, Torrance, CA 90501"
        enteredAddress="456 Oak Ave, Lomita, CA 90717"
      />
    );

    expect(screen.getByText(/123 Main St, Torrance, CA 90501/)).toBeTruthy();
    expect(screen.getByText(/456 Oak Ave, Lomita, CA 90717/)).toBeTruthy();
  });

  it('fires PATCH /api/pos/customers/[id]/address on Update profile', async () => {
    const onClose = vi.fn();
    render(
      <SaveAddressDialog
        open={true}
        onClose={onClose}
        customerId="cust-1"
        currentProfileAddress="123 Main St, Torrance, CA 90501"
        enteredAddress="456 Oak Ave, Lomita, CA 90717"
      />
    );

    const btn = screen.getByRole('button', { name: /update profile/i });
    fireEvent.click(btn);

    await waitFor(() => {
      expect(posFetchMock).toHaveBeenCalled();
    });

    const call = posFetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[0]).toBe('/api/pos/customers/cust-1/address');
    expect(call[1].method).toBe('PATCH');
    const body = JSON.parse(String(call[1].body));
    expect(body.entered_address).toBe('456 Oak Ave, Lomita, CA 90717');
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('does NOT fire any request on Skip', () => {
    const onClose = vi.fn();
    render(
      <SaveAddressDialog
        open={true}
        onClose={onClose}
        customerId="cust-1"
        currentProfileAddress="123 Main St, Torrance, CA 90501"
        enteredAddress="456 Oak Ave, Lomita, CA 90717"
      />
    );

    const btn = screen.getByRole('button', { name: /skip/i });
    fireEvent.click(btn);

    expect(posFetchMock).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('shows "(none)" when currentProfileAddress is null', () => {
    render(
      <SaveAddressDialog
        open={true}
        onClose={() => {}}
        customerId="cust-1"
        currentProfileAddress={null}
        enteredAddress="456 Oak Ave, Lomita, CA 90717"
      />
    );
    expect(screen.getByText(/\(none\)/)).toBeTruthy();
  });
});
