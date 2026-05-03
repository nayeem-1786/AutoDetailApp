import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, act, waitFor, within } from '@testing-library/react';
import { CustomerCreateDialog } from '../customer-create-dialog';
import { posFetch } from '../../lib/pos-fetch';

vi.mock('../../lib/pos-fetch', () => ({
  posFetch: vi.fn(async (url: string, init?: RequestInit) => {
    if (typeof url === 'string' && url.includes('check-duplicate')) {
      return { ok: true, json: async () => ({ exists: false }) };
    }
    if (typeof url === 'string' && url.endsWith('/api/pos/customers') && init?.method === 'POST') {
      return {
        ok: true,
        status: 201,
        json: async () => ({
          data: {
            id: 'cust-uuid-1',
            first_name: 'A',
            last_name: 'B',
            phone: '+14244010094',
          },
        }),
      };
    }
    return { ok: true, json: async () => ({ data: [] }) };
  }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

beforeEach(() => {
  vi.mocked(posFetch).mockClear();
});

afterEach(() => {
  cleanup();
});

function renderDialog(overrides: Partial<{
  onCreated: (c: unknown) => void;
  onClose: () => void;
}> = {}) {
  const onCreated = overrides.onCreated ?? vi.fn();
  const onClose = overrides.onClose ?? vi.fn();
  render(
    <CustomerCreateDialog
      open
      onCreated={onCreated}
      onClose={onClose}
    />
  );
  return { onCreated, onClose };
}

function getCreateButton() {
  return screen.getByRole('button', { name: /^create$/i });
}

function fillBaseFields() {
  fireEvent.change(screen.getByPlaceholderText('First name'), { target: { value: 'A' } });
  fireEvent.change(screen.getByPlaceholderText('Last name'), { target: { value: 'B' } });
  fireEvent.change(screen.getByPlaceholderText('(310) 555-1234'), { target: { value: '4244010094' } });
  fireEvent.click(screen.getByRole('button', { name: 'Enthusiast' }));
}

describe('CustomerCreateDialog — Session 6b TCPA consent capture', () => {
  it('always renders the SMS Consent control', () => {
    renderDialog();
    expect(screen.getByRole('group', { name: 'SMS Consent' })).toBeTruthy();
  });

  it('does not render the Email Consent control when no email is entered', () => {
    renderDialog();
    expect(screen.queryByRole('group', { name: 'Email Consent' })).toBeNull();
  });

  it('renders the Email Consent control once an email is typed', () => {
    renderDialog();
    fireEvent.change(screen.getByPlaceholderText('jane@example.com'), { target: { value: 'a@b.com' } });
    expect(screen.getByRole('group', { name: 'Email Consent' })).toBeTruthy();
  });

  it('hides Email Consent again when the email field is cleared', () => {
    renderDialog();
    const emailInput = screen.getByPlaceholderText('jane@example.com');
    fireEvent.change(emailInput, { target: { value: 'a@b.com' } });
    expect(screen.getByRole('group', { name: 'Email Consent' })).toBeTruthy();
    fireEvent.change(emailInput, { target: { value: '' } });
    expect(screen.queryByRole('group', { name: 'Email Consent' })).toBeNull();
  });

  it('keeps the consent row at a stable two-column grid regardless of email presence (no jitter)', () => {
    renderDialog();
    const row = screen.getByTestId('consent-row');
    expect(row.className).toMatch(/grid-cols-2/);
    expect(row.children).toHaveLength(2);
    fireEvent.change(screen.getByPlaceholderText('jane@example.com'), { target: { value: 'a@b.com' } });
    const rowAfter = screen.getByTestId('consent-row');
    expect(rowAfter.className).toMatch(/grid-cols-2/);
    expect(rowAfter.children).toHaveLength(2);
  });

  it('blocks submit and shows a Required indicator when SMS Consent is not selected', async () => {
    renderDialog();
    fillBaseFields();
    fireEvent.click(getCreateButton());

    await waitFor(() => {
      const group = screen.getByRole('group', { name: 'SMS Consent' });
      // Required indicator appears as the next sibling <p>
      expect(group.parentElement?.textContent).toContain('Required');
    });

    // No POST call made
    const posts = vi.mocked(posFetch).mock.calls.filter((c) => (c[1] as RequestInit | undefined)?.method === 'POST');
    expect(posts).toHaveLength(0);
  });

  it('blocks submit and shows a Required indicator when email is provided but Email Consent is not selected', async () => {
    renderDialog();
    fillBaseFields();
    fireEvent.change(screen.getByPlaceholderText('jane@example.com'), { target: { value: 'a@b.com' } });
    // Pick SMS Yes — only Email Consent is missing
    const smsGroup = screen.getByRole('group', { name: 'SMS Consent' });
    fireEvent.click(within(smsGroup).getByRole('button', { name: 'Yes' }));

    fireEvent.click(getCreateButton());

    await waitFor(() => {
      const group = screen.getByRole('group', { name: 'Email Consent' });
      expect(group.parentElement?.textContent).toContain('Required');
    });

    const posts = vi.mocked(posFetch).mock.calls.filter((c) => (c[1] as RequestInit | undefined)?.method === 'POST');
    expect(posts).toHaveLength(0);
  });

  it('submits with sms_consent=true and no email_consent when email is empty', async () => {
    renderDialog();
    fillBaseFields();
    const smsGroup = screen.getByRole('group', { name: 'SMS Consent' });
    fireEvent.click(within(smsGroup).getByRole('button', { name: 'Yes' }));

    await act(async () => {
      fireEvent.click(getCreateButton());
    });

    const post = vi.mocked(posFetch).mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === 'POST');
    expect(post).toBeDefined();
    const body = JSON.parse((post![1] as RequestInit).body as string);
    expect(body.sms_consent).toBe(true);
    expect('email_consent' in body).toBe(false);
  });

  it('submits with both sms_consent and email_consent when email is provided', async () => {
    renderDialog();
    fillBaseFields();
    fireEvent.change(screen.getByPlaceholderText('jane@example.com'), { target: { value: 'a@b.com' } });
    const smsGroup = screen.getByRole('group', { name: 'SMS Consent' });
    fireEvent.click(within(smsGroup).getByRole('button', { name: 'No' }));
    const emailGroup = screen.getByRole('group', { name: 'Email Consent' });
    fireEvent.click(within(emailGroup).getByRole('button', { name: 'Yes' }));

    await act(async () => {
      fireEvent.click(getCreateButton());
    });

    const post = vi.mocked(posFetch).mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === 'POST');
    expect(post).toBeDefined();
    const body = JSON.parse((post![1] as RequestInit).body as string);
    expect(body.sms_consent).toBe(false);
    expect(body.email_consent).toBe(true);
    expect(body.email).toBe('a@b.com');
  });

  it('clears the email_consent selection when email is removed after being filled', async () => {
    renderDialog();
    const emailInput = screen.getByPlaceholderText('jane@example.com');
    fireEvent.change(emailInput, { target: { value: 'a@b.com' } });
    const emailGroup = screen.getByRole('group', { name: 'Email Consent' });
    fireEvent.click(within(emailGroup).getByRole('button', { name: 'Yes' }));
    // Email Consent Yes button should be aria-pressed=true
    expect(within(emailGroup).getByRole('button', { name: 'Yes' }).getAttribute('aria-pressed')).toBe('true');

    fireEvent.change(emailInput, { target: { value: '' } });
    // Re-add an email — fresh state, neither button pressed
    fireEvent.change(emailInput, { target: { value: 'c@d.com' } });
    const emailGroup2 = screen.getByRole('group', { name: 'Email Consent' });
    expect(within(emailGroup2).getByRole('button', { name: 'Yes' }).getAttribute('aria-pressed')).toBe('false');
    expect(within(emailGroup2).getByRole('button', { name: 'No' }).getAttribute('aria-pressed')).toBe('false');
  });
});
