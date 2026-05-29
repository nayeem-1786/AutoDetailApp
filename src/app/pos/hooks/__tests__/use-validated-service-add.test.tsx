import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import type { CatalogService } from '../../types';
import type { ServicePricing, VehicleSizeClass } from '@/lib/supabase/types';

/**
 * Track A — `useValidatedServiceAdd` shared engine.
 *
 * This hook is the SINGLE add-time validation gate behind every POS add
 * surface (Sale catalog-browser, Quotes search/browse, register-tab). Testing
 * it directly locks the two gates and the override continuations that the
 * per-surface wiring tests then prove are wired with the correct context:
 *
 *   1. add-on-only gate  (classification === 'addon_only' && no anchor present)
 *   2. prerequisite check (delegated to usePrerequisiteCheck)
 *   3. commit via onAdd
 *
 * The prerequisite endpoint is exercised through a mocked `posFetch`; the
 * manager-PIN dialog is stubbed to an "approve" button so the override
 * continuations are testable without the real PIN/verify-override round-trip.
 */

const posFetchMock = vi.hoisted(() => vi.fn());
vi.mock('../../lib/pos-fetch', () => ({ posFetch: posFetchMock }));

// Stub ManagerPinDialog (used by BOTH the prerequisite dialog and the helper's
// add-on-solo dialog) → an immediate approve button.
vi.mock('../../components/manager-pin-dialog', () => ({
  ManagerPinDialog: ({ onSuccess }: { onSuccess: (name: string) => void }) => (
    <button data-testid="approve-pin" onClick={() => onSuccess('Manager Jane')}>
      approve-pin
    </button>
  ),
}));

const toastSuccess = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({
  toast: { success: toastSuccess, error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

import { useValidatedServiceAdd } from '../use-validated-service-add';

// ─── Fixtures ────────────────────────────────────────────────────

function makeService(overrides: Partial<CatalogService> = {}): CatalogService {
  return {
    id: 'svc-1',
    name: 'Paint Correction Prep',
    slug: 'paint-correction-prep',
    description: null,
    category_id: 'cat-1',
    pricing_model: 'flat',
    classification: 'primary',
    base_duration_minutes: 60,
    flat_price: 100,
    custom_starting_price: null,
    per_unit_price: null,
    per_unit_max: null,
    per_unit_label: null,
    mobile_eligible: false,
    online_bookable: false,
    staff_assessed: false,
    is_taxable: true,
    vehicle_compatibility: ['standard'],
    special_requirements: null,
    image_url: null,
    image_alt: null,
    is_active: true,
    show_on_website: false,
    is_featured: false,
    display_order: 0,
    sale_price: null,
    sale_starts_at: null,
    sale_ends_at: null,
    created_at: '',
    updated_at: '',
    pricing: [],
    ...overrides,
  } as unknown as CatalogService;
}

const PRICING: ServicePricing = {
  id: 'p1',
  service_id: 'svc-1',
  tier_name: 'default',
  tier_label: null,
  price: 100,
  sale_price: null,
  display_order: 0,
  is_vehicle_size_aware: false,
  vehicle_size_sedan_price: null,
  vehicle_size_truck_suv_price: null,
  vehicle_size_suv_van_price: null,
  vehicle_size_exotic_price: null,
  vehicle_size_classic_price: null,
  max_qty: null,
  qty_label: null,
  created_at: '',
};

function prereqResponse(satisfied: boolean) {
  return {
    ok: true,
    json: async () => ({
      has_prerequisites: !satisfied,
      satisfied,
      prerequisites: satisfied
        ? []
        : [
            {
              service_name: 'Express Exterior Wash',
              enforcement: 'required_same_ticket',
              required_within_days: null,
              warning_message: null,
            },
          ],
    }),
  };
}

interface HarnessProps {
  service: CatalogService;
  serviceIds: string[];
  services: CatalogService[];
  vsc?: VehicleSizeClass | null;
  onAdd: (...args: unknown[]) => void;
}

function Harness({ service, serviceIds, services, vsc = 'sedan', onAdd }: HarnessProps) {
  const { addService, dialogs } = useValidatedServiceAdd({
    customerId: 'cust-1',
    vehicleId: 'veh-1',
    serviceIds,
    services,
    vehicleSizeClass: vsc,
    onAdd,
    onAddHandlesToast: false,
  });
  return (
    <div>
      <button data-testid="add" onClick={() => addService(service, PRICING, vsc)}>
        add
      </button>
      {dialogs}
    </div>
  );
}

beforeEach(() => {
  posFetchMock.mockReset();
  toastSuccess.mockReset();
});
afterEach(cleanup);

describe('useValidatedServiceAdd — prerequisite check', () => {
  it('commits immediately when there are no prerequisites', async () => {
    posFetchMock.mockResolvedValue(prereqResponse(true));
    const onAdd = vi.fn();
    const svc = makeService({ classification: 'primary' });
    render(<Harness service={svc} serviceIds={[]} services={[svc]} onAdd={onAdd} />);

    fireEvent.click(screen.getByTestId('add'));
    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/Service Prerequisite Required/i)).toBeNull();
  });

  it('fires the prerequisite warning for an unmet required_same_ticket prereq (no commit)', async () => {
    posFetchMock.mockResolvedValue(prereqResponse(false));
    const onAdd = vi.fn();
    const svc = makeService({ classification: 'primary' });
    render(<Harness service={svc} serviceIds={[]} services={[svc]} onAdd={onAdd} />);

    fireEvent.click(screen.getByTestId('add'));
    expect(await screen.findByText(/Service Prerequisite Required/i)).toBeDefined();
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('posts the caller-supplied context (proves Sale-vs-Quote binding is options-driven)', async () => {
    posFetchMock.mockResolvedValue(prereqResponse(true));
    const onAdd = vi.fn();
    const svc = makeService({ classification: 'primary' });
    render(<Harness service={svc} serviceIds={['svc-a', 'svc-b']} services={[svc]} onAdd={onAdd} />);

    fireEvent.click(screen.getByTestId('add'));
    await waitFor(() => expect(posFetchMock).toHaveBeenCalled());
    const body = JSON.parse(posFetchMock.mock.calls[0][1].body);
    expect(body.ticket_service_ids).toEqual(['svc-a', 'svc-b']);
    expect(body.customer_id).toBe('cust-1');
    expect(body.vehicle_id).toBe('veh-1');
  });

  it('manager override on a prereq warning commits with an override note', async () => {
    posFetchMock.mockResolvedValue(prereqResponse(false));
    const onAdd = vi.fn();
    const svc = makeService({ classification: 'primary' });
    render(<Harness service={svc} serviceIds={[]} services={[svc]} onAdd={onAdd} />);

    fireEvent.click(screen.getByTestId('add'));
    await screen.findByText(/Service Prerequisite Required/i);
    fireEvent.click(screen.getByText(/Manager Override/i));
    fireEvent.click(screen.getByTestId('approve-pin'));

    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1));
    const opts = onAdd.mock.calls[0][4];
    expect(opts.prerequisiteNote).toMatch(/overridden by Manager Jane/i);
  });
});

describe('useValidatedServiceAdd — add-on-only gate', () => {
  it('warns when an addon_only service is added solo (no anchor present, no commit, no network)', async () => {
    posFetchMock.mockResolvedValue(prereqResponse(true));
    const onAdd = vi.fn();
    const addon = makeService({ id: 'addon-1', name: 'Pet Hair Removal', classification: 'addon_only' });
    render(<Harness service={addon} serviceIds={[]} services={[addon]} onAdd={onAdd} />);

    fireEvent.click(screen.getByTestId('add'));
    expect(await screen.findByRole('heading', { name: /Add-On Service/i })).toBeDefined();
    expect(onAdd).not.toHaveBeenCalled();
    // Add-on gate runs BEFORE the prerequisite check — no network call yet.
    expect(posFetchMock).not.toHaveBeenCalled();
  });

  it('does NOT warn when an anchor (primary) service is present — proceeds to commit', async () => {
    posFetchMock.mockResolvedValue(prereqResponse(true));
    const onAdd = vi.fn();
    const addon = makeService({ id: 'addon-1', name: 'Pet Hair Removal', classification: 'addon_only' });
    const anchor = makeService({ id: 'primary-1', name: 'Full Detail', classification: 'primary' });
    render(<Harness service={addon} serviceIds={['primary-1']} services={[addon, anchor]} onAdd={onAdd} />);

    fireEvent.click(screen.getByTestId('add'));
    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('heading', { name: /Add-On Service/i })).toBeNull();
  });

  it('treats a "both"-classified line item as an anchor (no solo warning)', async () => {
    posFetchMock.mockResolvedValue(prereqResponse(true));
    const onAdd = vi.fn();
    const addon = makeService({ id: 'addon-1', classification: 'addon_only' });
    const both = makeService({ id: 'both-1', name: 'Wax', classification: 'both' });
    render(<Harness service={addon} serviceIds={['both-1']} services={[addon, both]} onAdd={onAdd} />);

    fireEvent.click(screen.getByTestId('add'));
    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('heading', { name: /Add-On Service/i })).toBeNull();
  });

  it('manager override on the add-on-solo warning proceeds to commit', async () => {
    posFetchMock.mockResolvedValue(prereqResponse(true));
    const onAdd = vi.fn();
    const addon = makeService({ id: 'addon-1', classification: 'addon_only' });
    render(<Harness service={addon} serviceIds={[]} services={[addon]} onAdd={onAdd} />);

    fireEvent.click(screen.getByTestId('add'));
    await screen.findByRole('heading', { name: /Add-On Service/i });
    fireEvent.click(screen.getByText(/Manager Override/i));
    fireEvent.click(screen.getByTestId('approve-pin'));

    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1));
  });
});
