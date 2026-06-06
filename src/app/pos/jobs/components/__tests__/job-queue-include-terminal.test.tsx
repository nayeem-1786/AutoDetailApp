import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';

// ── Session 2.4 (AC-7) — terminal-state opt-in toggle ──────────────────────
// Verifies the `include_terminal` URL-persistent toggle: chip presence in the
// Today filter pills row, default OFF, click flips → URL write + refetch with
// &include_terminal=1, initial URL with ?include_terminal=1 → ON state +
// param threaded into the first fetch.

const fetchCalls: Array<{ url: string }> = [];
const routerReplace = vi.fn();
let searchParamsString = '';

const todayResponse = {
  data: [] as unknown[],
  unstarted_appointments: [] as unknown[],
};

vi.mock('next/navigation', () => ({
  useSearchParams: () => ({
    get: (key: string) => {
      const params = new URLSearchParams(searchParamsString);
      return params.get(key);
    },
    toString: () => searchParamsString,
  }),
  useRouter: () => ({ replace: routerReplace }),
}));

vi.mock('../../../context/pos-auth-context', () => ({
  usePosAuth: () => ({ employee: { first_name: 'Pat', bookable_for_appointments: false } }),
}));

vi.mock('../../../context/pos-permission-context', () => ({
  usePosPermission: () => ({ granted: true, loading: false }),
}));

vi.mock('@/lib/hooks/use-feature-flag', () => ({
  useFeatureFlag: () => ({ enabled: false, loading: false }),
}));

vi.mock('../job-timeline', () => ({
  JobTimeline: () => <div data-testid="job-timeline" />,
}));

vi.mock('@/app/admin/appointments/components/appointment-detail-dialog', () => ({
  AppointmentDetailDialog: () => <div />,
}));

vi.mock('@/app/pos/components/appointments/cancel-appointment-dialog', () => ({
  CancelAppointmentDialog: () => <div />,
}));

vi.mock('sonner', () => ({
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../lib/pos-fetch', () => ({
  posFetch: vi.fn(async (url: string) => {
    fetchCalls.push({ url });
    // Session 2.5 — populate retired; surface any reintroduced caller as 404.
    if (url.includes('/api/pos/jobs/populate')) {
      return { ok: false, status: 404, json: async () => ({ error: 'populate retired (Session 2.5)' }) };
    }
    if (url.match(/\/api\/pos\/jobs(\?|$)/)) {
      return { ok: true, json: async () => todayResponse };
    }
    return { ok: false, status: 500, json: async () => ({ error: 'no mock' }) };
  }),
}));

import { JobQueue } from '../job-queue';

const noop = vi.fn();

function renderQueue() {
  return render(<JobQueue onNewWalkIn={noop} onSelectJob={noop} onCheckout={noop} />);
}

beforeEach(() => {
  fetchCalls.length = 0;
  todayResponse.data = [];
  todayResponse.unstarted_appointments = [];
  searchParamsString = '';
  routerReplace.mockClear();
  localStorage.clear();
  localStorage.setItem('pos-jobs-view', 'list');
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('JobQueue — include-terminal toggle (Session 2.4 / AC-7)', () => {
  it('renders the Today toggle chip in the filter pills row', async () => {
    renderQueue();
    await waitFor(() =>
      expect(screen.getByTestId('include-terminal-toggle-today')).toBeTruthy()
    );
  });

  it('default toggle state is OFF (aria-checked=false; label reads "Show terminal")', async () => {
    renderQueue();
    const toggle = await screen.findByTestId('include-terminal-toggle-today');
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(toggle.textContent).toContain('Show terminal');
  });

  it('default fetch omits include_terminal from the Today URL', async () => {
    renderQueue();
    await waitFor(() =>
      expect(fetchCalls.some((c) => c.url.match(/\/api\/pos\/jobs(\?|$)/))).toBe(true)
    );
    const todayFetch = fetchCalls.find((c) => c.url.match(/\/api\/pos\/jobs(\?|$)/));
    expect(todayFetch?.url).not.toContain('include_terminal');
  });

  it('clicking the toggle writes ?include_terminal=1 to the URL', async () => {
    renderQueue();
    const toggle = await screen.findByTestId('include-terminal-toggle-today');
    fireEvent.click(toggle);
    await waitFor(() => expect(routerReplace).toHaveBeenCalled());
    const calls = routerReplace.mock.calls;
    const lastUrl = calls[calls.length - 1][0] as string;
    expect(lastUrl).toContain('include_terminal=1');
  });

  it('clicking the toggle flips aria-checked + chip label to the ON state', async () => {
    renderQueue();
    const toggle = await screen.findByTestId('include-terminal-toggle-today');
    fireEvent.click(toggle);
    await waitFor(() =>
      expect(screen.getByTestId('include-terminal-toggle-today').getAttribute('aria-checked')).toBe('true')
    );
    expect(screen.getByTestId('include-terminal-toggle-today').textContent).toContain('Showing terminal');
  });

  it('clicking the toggle ON triggers a refetch with include_terminal=1', async () => {
    renderQueue();
    const toggle = await screen.findByTestId('include-terminal-toggle-today');
    // Drain the initial fetches.
    await waitFor(() =>
      expect(fetchCalls.some((c) => c.url.match(/\/api\/pos\/jobs(\?|$)/))).toBe(true)
    );
    fetchCalls.length = 0;
    fireEvent.click(toggle);
    await waitFor(() =>
      expect(fetchCalls.some((c) => c.url.includes('include_terminal=1'))).toBe(true)
    );
  });

  it('initial URL ?include_terminal=1 mounts the toggle in the ON state', async () => {
    searchParamsString = 'include_terminal=1';
    renderQueue();
    const toggle = await screen.findByTestId('include-terminal-toggle-today');
    expect(toggle.getAttribute('aria-checked')).toBe('true');
  });

  it('initial URL ?include_terminal=1 threads the param into the first Today fetch', async () => {
    searchParamsString = 'include_terminal=1';
    renderQueue();
    await waitFor(() =>
      expect(fetchCalls.some((c) => c.url.includes('include_terminal=1'))).toBe(true)
    );
  });

  it('clicking ON then OFF strips the param from the URL', async () => {
    renderQueue();
    const toggle = await screen.findByTestId('include-terminal-toggle-today');
    fireEvent.click(toggle); // ON
    await waitFor(() =>
      expect(screen.getByTestId('include-terminal-toggle-today').getAttribute('aria-checked')).toBe('true')
    );
    // Simulate the URL state having updated so the second click computes
    // from the new searchParams snapshot.
    searchParamsString = 'include_terminal=1';
    routerReplace.mockClear();
    fireEvent.click(toggle); // OFF
    await waitFor(() => expect(routerReplace).toHaveBeenCalled());
    const lastUrl = routerReplace.mock.calls[routerReplace.mock.calls.length - 1][0] as string;
    expect(lastUrl).not.toContain('include_terminal');
  });
});
