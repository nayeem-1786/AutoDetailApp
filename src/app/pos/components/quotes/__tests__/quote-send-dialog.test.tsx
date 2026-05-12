import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

// Mocks must be hoisted-safe.
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}));
vi.mock('../../../lib/pos-fetch', () => ({
  posFetch: vi.fn(),
}));

import { QuoteSendDialog } from '../quote-send-dialog';
import { toast } from 'sonner';
import { posFetch } from '../../../lib/pos-fetch';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function setup(overrides: Partial<React.ComponentProps<typeof QuoteSendDialog>> = {}) {
  const onSent = vi.fn();
  const onClose = vi.fn();
  const utils = render(
    <QuoteSendDialog
      open={true}
      onClose={onClose}
      quoteId="quote-1"
      customerEmail="jane@example.com"
      customerPhone="+15551112222"
      onSent={onSent}
      {...overrides}
    />
  );
  return { onSent, onClose, ...utils };
}

describe('QuoteSendDialog — HTTP 422 keeps modal interactive', () => {
  it('shows single error toast and leaves Cancel button enabled', async () => {
    vi.mocked(posFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: false,
          error: 'Customer has no phone number',
          sent_via: [],
          blocked_via: ['sms'],
          failed_via: [],
          errors: [{ channel: 'sms', reason: 'Customer has no phone number', status: 'blocked' }],
        }),
        { status: 422, headers: { 'Content-Type': 'application/json' } }
      )
    );

    setup();
    fireEvent.click(screen.getByRole('button', { name: /Send/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Customer has no phone number');
    });
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.warning).not.toHaveBeenCalled();

    // Cancel remains clickable — i.e. setSuccess(true) was NOT taken.
    const cancel = screen.getByRole('button', { name: /Cancel/i }) as HTMLButtonElement;
    expect(cancel.disabled).toBe(false);
  });
});

describe('QuoteSendDialog — HTTP 200 partial success → single success + single warning', () => {
  it('fires one success + one consolidated warning toast (no per-error duplication)', async () => {
    vi.mocked(posFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: true,
          sent_via: ['email'],
          blocked_via: [],
          failed_via: ['sms'],
          errors: [{ channel: 'sms', reason: 'Twilio 21610', status: 'failed' }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    setup();
    fireEvent.click(screen.getByRole('button', { name: /Send/i }));

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledTimes(1);
    });
    expect(toast.warning).toHaveBeenCalledTimes(1);
    expect(toast.warning).toHaveBeenCalledWith(expect.stringContaining('sms: Twilio 21610'));
  });
});
