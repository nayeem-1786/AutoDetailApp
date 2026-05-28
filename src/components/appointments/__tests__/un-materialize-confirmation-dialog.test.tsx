import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

// Item 15e Phase 2C-β — shared un-materialize confirmation modal. Verifies the
// dry-run preview → enumeration → type-to-confirm → execute flow, and that
// `context` selects the right endpoint + fetch wrapper.

interface Call {
  url: string;
  body: Record<string, unknown>;
  wrapper: 'pos' | 'admin';
}
const calls: Call[] = [];

const state = {
  // dry-run response
  dryOk: true,
  dryStatus: 200,
  dryJson: {
    data: { jobId: 'job-1', jobStatus: 'scheduled', photoCount: 0, addonCount: 0, timerSeconds: 0, hasIntakeNotes: false, confirmRequired: false },
  } as Record<string, unknown>,
  // execute response
  execOk: true,
  execStatus: 200,
  execJson: { data: {} } as Record<string, unknown>,
};

function respond(wrapper: 'pos' | 'admin') {
  return async (url: string, init?: RequestInit) => {
    const body = JSON.parse((init?.body as string) ?? '{}');
    calls.push({ url, body, wrapper });
    const isDry = body.dryRun === true;
    const ok = isDry ? state.dryOk : state.execOk;
    const status = isDry ? state.dryStatus : state.execStatus;
    const json = isDry ? state.dryJson : state.execJson;
    return { ok, status, json: async () => json } as unknown as Response;
  };
}

vi.mock('@/app/pos/lib/pos-fetch', () => ({ posFetch: vi.fn(respond('pos')) }));
vi.mock('@/lib/utils/admin-fetch', () => ({ adminFetch: vi.fn(respond('admin')) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { UnMaterializeConfirmationDialog } from '../un-materialize-confirmation-dialog';

const appointment = {
  id: 'apt-1',
  customer: { id: 'c1', first_name: 'Jane', last_name: 'Doe', phone: null, email: null },
} as never;

function renderModal(context: 'admin' | 'pos' = 'pos', onSuccess = vi.fn()) {
  return render(
    <UnMaterializeConfirmationDialog
      open
      onOpenChange={vi.fn()}
      appointment={appointment}
      context={context}
      onSuccess={onSuccess}
    />
  );
}

beforeEach(() => {
  calls.length = 0;
  state.dryOk = true;
  state.dryStatus = 200;
  state.dryJson = {
    data: { jobId: 'job-1', jobStatus: 'scheduled', photoCount: 0, addonCount: 0, timerSeconds: 0, hasIntakeNotes: false, confirmRequired: false },
  };
  state.execOk = true;
  state.execStatus = 200;
  state.execJson = { data: {} };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('UnMaterializeConfirmationDialog', () => {
  it('runs a dry-run on open via the POS endpoint + posFetch', async () => {
    renderModal('pos');
    await waitFor(() => expect(calls.length).toBeGreaterThanOrEqual(1));
    expect(calls[0].url).toBe('/api/pos/appointments/apt-1/unmaterialize');
    expect(calls[0].body.dryRun).toBe(true);
    expect(calls[0].wrapper).toBe('pos');
  });

  it('admin context uses the admin endpoint + adminFetch', async () => {
    renderModal('admin');
    await waitFor(() => expect(calls.length).toBeGreaterThanOrEqual(1));
    expect(calls[0].url).toBe('/api/appointments/apt-1/unmaterialize');
    expect(calls[0].wrapper).toBe('admin');
  });

  it('enumerates the data that will be deleted', async () => {
    state.dryJson = {
      data: { jobId: 'job-1', jobStatus: 'intake', photoCount: 3, addonCount: 2, timerSeconds: 0, hasIntakeNotes: true, confirmRequired: false },
    };
    renderModal('pos');
    await waitFor(() => expect(screen.getByText(/3 photos will be permanently deleted/i)).toBeTruthy());
    expect(screen.getByText(/2 add-on requests will be deleted/i)).toBeTruthy();
    expect(screen.getByText(/Intake notes will be deleted/i)).toBeTruthy();
  });

  it('free-zone (scheduled) Revert is enabled and executes with confirmString=DELETE', async () => {
    const onSuccess = vi.fn();
    renderModal('pos', onSuccess);
    const btn = (await screen.findByRole('button', { name: /Revert to Pending/i })) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    const exec = calls.find((c) => c.body.dryRun !== true);
    expect(exec?.body.confirmString).toBe('DELETE');
  });

  it('confirm-required (in_progress) keeps Revert disabled until "DELETE" is typed', async () => {
    state.dryJson = {
      data: { jobId: 'job-1', jobStatus: 'in_progress', photoCount: 0, addonCount: 0, timerSeconds: 120, hasIntakeNotes: false, confirmRequired: true },
    };
    renderModal('pos');
    const btn = (await screen.findByRole('button', { name: /Revert to Pending/i })) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    const input = screen.getByPlaceholderText('Type DELETE');
    fireEvent.change(input, { target: { value: 'delete' } }); // wrong case
    expect(btn.disabled).toBe(true);
    fireEvent.change(input, { target: { value: 'DELETE' } });
    expect(btn.disabled).toBe(false);
  });

  it('shows a block message (no Revert button) when the job has a payment attached', async () => {
    state.dryOk = false;
    state.dryStatus = 409;
    state.dryJson = { error: 'transaction_linked' };
    renderModal('pos');
    await waitFor(() => expect(screen.getByText(/payment attached/i)).toBeTruthy());
    expect(screen.queryByRole('button', { name: /Revert to Pending/i })).toBeNull();
  });
});
