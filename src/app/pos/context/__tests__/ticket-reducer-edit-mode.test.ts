import { describe, it, expect } from 'vitest';
import { ticketReducer, initialTicketState } from '../ticket-reducer';
import type { TicketState, TicketItem } from '../../types';

/**
 * Item 15f Phase 1 Layer 8b — `<TicketContext>` reducer tests for the
 * edit-mode state extensions:
 *
 *   - default state defaults the 4 new fields to "fresh ticket"
 *   - ENTER_EDIT_MODE hydrates cart + sets the 4 fields
 *   - EXIT_EDIT_MODE clears the 4 fields without disturbing the cart
 *   - CLEAR_TICKET clears the 4 fields (state-leak prevention on "New Sale")
 *   - RESTORE_TICKET (sessionStorage path) NEVER carries edit-mode through
 *     even if the persisted payload has editMode=true — re-entering edit
 *     mode requires a fresh deep-link drain
 *   - Modifier-bearing ticketData propagates loyalty + manual discount the
 *     same way RESTORE_TICKET does (Layer 15g-iii contract holds)
 */

function makeItem(overrides: Partial<TicketItem> = {}): TicketItem {
  return {
    id: 'item-1',
    itemType: 'service',
    productId: null,
    serviceId: 'svc-1',
    categoryId: null,
    itemName: 'Test Service',
    quantity: 1,
    unitPrice: 100,
    totalPrice: 100,
    taxAmount: 0,
    isTaxable: false,
    tierName: null,
    vehicleSizeClass: null,
    notes: null,
    perUnitQty: null,
    perUnitLabel: null,
    perUnitPrice: null,
    perUnitMax: null,
    parentItemId: null,
    standardPrice: 100,
    pricingType: 'standard',
    comboSourcePrimaryId: null,
    saleEffectivePrice: null,
    prerequisiteNote: null,
    prerequisiteForServiceId: null,
    ...overrides,
  };
}

function makeTicketData(overrides: Partial<TicketState> = {}): TicketState {
  return {
    items: [makeItem()],
    customer: null,
    vehicle: null,
    coupon: null,
    loyaltyPointsToRedeem: 0,
    loyaltyDiscount: 0,
    manualDiscount: null,
    depositCredit: 0,
    depositDate: null,
    priorPayments: [],
    priorPaymentsTotal: 0,
    notes: null,
    subtotal: 100,
    taxAmount: 0,
    discountAmount: 0,
    total: 100,
    source: 'new',
    sourceId: null,
    returnTo: null,
    editMode: false,
    ...overrides,
  };
}

const APPT_UUID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const JOB_UUID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('initialTicketState — edit-mode defaults', () => {
  it('source defaults to "new"', () => {
    expect(initialTicketState.source).toBe('new');
  });
  it('sourceId defaults to null', () => {
    expect(initialTicketState.sourceId).toBeNull();
  });
  it('returnTo defaults to null', () => {
    expect(initialTicketState.returnTo).toBeNull();
  });
  it('editMode defaults to false', () => {
    expect(initialTicketState.editMode).toBe(false);
  });
});

describe('ENTER_EDIT_MODE', () => {
  it('hydrates cart from ticketData AND stamps all 4 edit-mode fields', () => {
    const next = ticketReducer(initialTicketState, {
      type: 'ENTER_EDIT_MODE',
      source: 'appointment',
      sourceId: APPT_UUID,
      returnTo: '/admin/appointments/' + APPT_UUID,
      ticketData: makeTicketData(),
    });
    expect(next.items).toHaveLength(1);
    expect(next.items[0].itemName).toBe('Test Service');
    expect(next.source).toBe('appointment');
    expect(next.sourceId).toBe(APPT_UUID);
    expect(next.returnTo).toBe('/admin/appointments/' + APPT_UUID);
    expect(next.editMode).toBe(true);
    expect(next.subtotal).toBe(100);
  });

  it('overwrites edit-mode fields in ticketData with action params (caller does not have to mirror)', () => {
    const ticketData = makeTicketData({
      // Caller passes stale defaults — reducer must use action params.
      source: 'new',
      sourceId: null,
      returnTo: null,
      editMode: false,
    });
    const next = ticketReducer(initialTicketState, {
      type: 'ENTER_EDIT_MODE',
      source: 'job',
      sourceId: JOB_UUID,
      returnTo: '/pos/jobs/' + JOB_UUID,
      ticketData,
    });
    expect(next.source).toBe('job');
    expect(next.sourceId).toBe(JOB_UUID);
    expect(next.returnTo).toBe('/pos/jobs/' + JOB_UUID);
    expect(next.editMode).toBe(true);
  });

  it('preserves loyalty + manual discount carried on ticketData (Layer 15g-iii parity)', () => {
    const ticketData = makeTicketData({
      loyaltyPointsToRedeem: 150,
      loyaltyDiscount: 7.5,
      manualDiscount: { type: 'dollar', value: 20, label: 'Friends & Family' },
      items: [makeItem({ totalPrice: 200, unitPrice: 200, standardPrice: 200 })],
    });
    const next = ticketReducer(initialTicketState, {
      type: 'ENTER_EDIT_MODE',
      source: 'appointment',
      sourceId: APPT_UUID,
      returnTo: '/admin/appointments/' + APPT_UUID,
      ticketData,
    });
    expect(next.loyaltyPointsToRedeem).toBe(150);
    expect(next.loyaltyDiscount).toBe(7.5);
    expect(next.manualDiscount).toEqual({ type: 'dollar', value: 20, label: 'Friends & Family' });
    // recalculateTotals applies the discounts.
    expect(next.discountAmount).toBeGreaterThan(0);
  });

  it('defends against missing priorPayments fields in ticketData', () => {
    const ticketData = makeTicketData();
    // Simulate legacy payload where priorPayments/priorPaymentsTotal are undefined.
    delete (ticketData as unknown as Record<string, unknown>).priorPayments;
    delete (ticketData as unknown as Record<string, unknown>).priorPaymentsTotal;
    const next = ticketReducer(initialTicketState, {
      type: 'ENTER_EDIT_MODE',
      source: 'appointment',
      sourceId: APPT_UUID,
      returnTo: '/admin/appointments/' + APPT_UUID,
      ticketData,
    });
    expect(next.priorPayments).toEqual([]);
    expect(next.priorPaymentsTotal).toBe(0);
  });
});

describe('EXIT_EDIT_MODE', () => {
  it('clears all 4 edit-mode fields back to defaults', () => {
    const editing = ticketReducer(initialTicketState, {
      type: 'ENTER_EDIT_MODE',
      source: 'appointment',
      sourceId: APPT_UUID,
      returnTo: '/admin/appointments/' + APPT_UUID,
      ticketData: makeTicketData(),
    });
    expect(editing.editMode).toBe(true);
    const exited = ticketReducer(editing, { type: 'EXIT_EDIT_MODE' });
    expect(exited.source).toBe('new');
    expect(exited.sourceId).toBeNull();
    expect(exited.returnTo).toBeNull();
    expect(exited.editMode).toBe(false);
  });

  it('does NOT clear items / customer / vehicle (only the 4 fields)', () => {
    const ticketData = makeTicketData({ items: [makeItem(), makeItem({ id: 'item-2' })] });
    const editing = ticketReducer(initialTicketState, {
      type: 'ENTER_EDIT_MODE',
      source: 'job',
      sourceId: JOB_UUID,
      returnTo: '/pos/jobs/' + JOB_UUID,
      ticketData,
    });
    const exited = ticketReducer(editing, { type: 'EXIT_EDIT_MODE' });
    expect(exited.items).toHaveLength(2);
  });
});

describe('CLEAR_TICKET — state-leak prevention', () => {
  it('clears edit-mode fields when operator clicks "New Sale" mid-edit', () => {
    const editing = ticketReducer(initialTicketState, {
      type: 'ENTER_EDIT_MODE',
      source: 'appointment',
      sourceId: APPT_UUID,
      returnTo: '/admin/appointments/' + APPT_UUID,
      ticketData: makeTicketData(),
    });
    const cleared = ticketReducer(editing, { type: 'CLEAR_TICKET' });
    expect(cleared.source).toBe('new');
    expect(cleared.sourceId).toBeNull();
    expect(cleared.returnTo).toBeNull();
    expect(cleared.editMode).toBe(false);
    expect(cleared.items).toHaveLength(0);
  });
});

describe('RESTORE_TICKET — never re-enters edit mode from sessionStorage', () => {
  it('strips edit-mode fields even when restored payload has editMode=true', () => {
    // Simulate a payload that sessionStorage might surface — say, a previous
    // session's state where the operator was mid-edit. Re-entering edit mode
    // requires a fresh deep-link drain; the restored snapshot must not
    // surface a stale sourceId the operator can't actually save back to.
    const persisted = makeTicketData({
      source: 'appointment',
      sourceId: APPT_UUID,
      returnTo: '/admin/appointments/' + APPT_UUID,
      editMode: true,
    });
    const restored = ticketReducer(initialTicketState, {
      type: 'RESTORE_TICKET',
      state: persisted,
    });
    expect(restored.source).toBe('new');
    expect(restored.sourceId).toBeNull();
    expect(restored.returnTo).toBeNull();
    expect(restored.editMode).toBe(false);
    // Cart contents DO restore (the sessionStorage UX nicety).
    expect(restored.items).toHaveLength(1);
  });
});
