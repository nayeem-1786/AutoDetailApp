'use client';

import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useTicket } from '../context/ticket-context';
import { posFetch } from '../lib/pos-fetch';
import { calculateItemTax } from '../utils/tax';
import type { TicketItem, TicketState, PriorPayment } from '../types';
import type { Customer, Vehicle } from '@/lib/supabase/types';

/**
 * Item 15f Phase 1 Layer 8b — POS deep-link drain.
 *
 * When the operator lands at `/pos?source=appointment&id=<uuid>&returnTo=...`
 * (or `source=job`), this hook fetches the source record via its POS-authed
 * load endpoint and dispatches `ENTER_EDIT_MODE` so the Sale tab opens with
 * the record's services + customer + vehicle + modifiers pre-populated.
 *
 * Security:
 *   - `id` MUST be UUID format (cheap pre-check before the API call).
 *   - `returnTo` MUST be a same-origin internal path. External URLs and
 *     `javascript:` / `data:` schemes are rejected up-front to prevent
 *     open-redirect when Layer 8c wires the "Save Changes → router.push(returnTo)"
 *     navigation.
 *   - On 401/403/404 the drain falls back to a fresh ticket and surfaces a
 *     toast. URL params are stripped either way so a refresh doesn't loop.
 *
 * State semantics: re-fetches the load endpoint on every mount (per audit §8.3
 * #5 — sessionStorage is a UX nicety, not authoritative). After a successful
 * drain the URL params are stripped via `history.replaceState` so subsequent
 * in-app navigations don't accidentally re-drain.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string | null | undefined): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

/**
 * Returns true iff `path` is a same-origin internal path. Rejects:
 *   - empty / non-string
 *   - protocol-relative (`//evil.com/...`)
 *   - absolute URLs (`https://...`, `http://...`)
 *   - dangerous schemes (`javascript:`, `data:`, `vbscript:`, `file:`, `about:`)
 *   - backslash-encoded paths (legacy IE quirk; harmless to block)
 *
 * Defensive against the open-redirect class of bugs the audit flagged in §8.3
 * — Layer 8b validates ALL three of {source, id, returnTo} before hitting the
 * load endpoint so a malformed deep-link can't even reach the server.
 */
export function isSafeInternalPath(path: string | null | undefined): path is string {
  if (typeof path !== 'string' || path.length === 0) return false;
  if (!path.startsWith('/')) return false;
  if (path.startsWith('//')) return false; // protocol-relative
  if (path.includes('\\')) return false; // IE legacy backslash trick
  if (/^\/?\s*(javascript|data|vbscript|file|about):/i.test(path)) return false;
  // URL.parse on a relative string with no base throws. An absolute URL parses
  // successfully — which means we should REJECT (it's not internal). Treat
  // throw as the accept case.
  try {
    new URL(path);
    return false;
  } catch {
    return true;
  }
}

// ---------------------------------------------------------------------------
// Load-endpoint response shape
// ---------------------------------------------------------------------------
// Mirrors the shape returned by both `GET /api/pos/jobs/[id]/checkout-items`
// and `GET /api/pos/appointments/[id]/load`. The two endpoints diverge in
// what they include (jobs returns prior_payments; appointments doesn't), but
// the drain only consumes the union — missing fields default safely.

interface LoadCustomer {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  customer_type: string | null;
  tags: string[] | null;
}

interface LoadVehicle {
  id: string;
  year: number | null;
  make: string | null;
  model: string | null;
  color: string | null;
  size_class: string | null;
}

interface LoadItem {
  item_type: 'service' | 'product' | 'custom' | 'mobile_fee';
  service_id?: string;
  product_id?: string;
  item_name: string;
  quantity: number;
  unit_price: number;
  is_addon?: boolean;
  tier_name?: string;
  is_taxable: boolean;
  category_id?: string;
}

export interface LoadResponseData {
  customer_id: string | null;
  vehicle_id: string | null;
  customer: LoadCustomer | null;
  vehicle: LoadVehicle | null;
  items: LoadItem[];
  coupon_code: string | null;
  coupon_discount?: number | null;
  loyalty_points_redeemed?: number | null;
  loyalty_discount?: number | null;
  manual_discount_value?: number | null;
  manual_discount_label?: string | null;
  deposit_amount: number;
  deposit_date: string | null;
  /**
   * Item 15f Phase 1 Layer 8d — appointment's `scheduled_date` (YYYY-MM-DD).
   * Optional so legacy load-endpoint responses without the field still
   * deserialize cleanly. Banner falls back to UUID prefix when null.
   */
  scheduled_date?: string | null;
  prior_payments?: PriorPayment[];
  prior_payments_total_cents?: number;
  status: string;
}

/**
 * Pure helper: maps a load-endpoint response into the `ticketData` payload
 * that `ENTER_EDIT_MODE` accepts. Mirrors `pos/jobs/page.tsx:handleCheckout`
 * lines 102-181 byte-for-byte on the cart-shape side. Modifiers (coupon,
 * loyalty, manual discount) are returned ZEROED on `ticketData` — the
 * caller follows up with `SET_LOYALTY_REDEEM`/`APPLY_MANUAL_DISCOUNT`/
 * coupon-revalidate-then-`SET_COUPON` to match the Layer 15g-iii contract
 * (the reducer's `recalculateTotals` recomputes once all three have settled).
 */
export function buildTicketStateFromLoad(data: LoadResponseData): TicketState {
  const ticketItems: TicketItem[] = data.items.map((item) => {
    const totalPrice = item.unit_price * item.quantity;
    const isTaxable = item.is_taxable ?? false;
    return {
      id: crypto.randomUUID(),
      // `mobile_fee` flows through verbatim — `pos/jobs/page.tsx:handleCheckout`
      // does the same. The Sale-tab renderers gate on `itemType === 'service'`
      // and ignore unknown values, so mobile_fee rows display as flat line
      // items with the surcharge as `totalPrice` — exactly the existing
      // behavior on the checkout-items code path.
      itemType: item.item_type as TicketItem['itemType'],
      productId: item.product_id || null,
      serviceId: item.service_id || null,
      categoryId: item.category_id || null,
      itemName: item.item_name + (item.is_addon ? ' (Add-on)' : ''),
      quantity: item.quantity,
      unitPrice: item.unit_price,
      totalPrice,
      taxAmount: calculateItemTax(totalPrice, isTaxable),
      isTaxable,
      tierName: item.tier_name || null,
      vehicleSizeClass: null,
      notes: null,
      perUnitQty: null,
      perUnitLabel: null,
      perUnitPrice: null,
      perUnitMax: null,
      parentItemId: null,
      standardPrice: item.unit_price,
      pricingType: 'standard' as const,
      comboSourcePrimaryId: null,
      saleEffectivePrice: null,
      prerequisiteNote: null,
      prerequisiteForServiceId: null,
    };
  });

  const ticketCustomer = data.customer
    ? ({
        ...data.customer,
        id: data.customer_id ?? data.customer.id,
        phone: data.customer.phone ?? null,
        email: data.customer.email ?? null,
        customer_type: data.customer.customer_type ?? null,
        tags: data.customer.tags ?? null,
      } as Customer)
    : null;

  const subtotal = ticketItems.reduce((sum, i) => sum + i.totalPrice, 0);
  const taxAmount = ticketItems.reduce((sum, i) => sum + i.taxAmount, 0);
  const depositCredit = data.deposit_amount || 0;

  const priorPayments = (data.prior_payments ?? []) as PriorPayment[];
  const priorPaymentsTotalCents = (data.prior_payments_total_cents ?? 0) as number;
  const priorPaymentsTotal = priorPaymentsTotalCents / 100;

  const total = Math.max(
    0,
    subtotal + taxAmount - depositCredit - priorPaymentsTotal
  );

  return {
    items: ticketItems,
    customer: ticketCustomer,
    vehicle: (data.vehicle || null) as Vehicle | null,
    coupon: null,
    loyaltyPointsToRedeem: 0,
    loyaltyDiscount: 0,
    manualDiscount: null,
    depositCredit,
    depositDate: data.deposit_date || null,
    priorPayments,
    priorPaymentsTotal: Math.round(priorPaymentsTotal * 100) / 100,
    notes: null,
    subtotal: Math.round(subtotal * 100) / 100,
    taxAmount: Math.round(taxAmount * 100) / 100,
    discountAmount: 0,
    total: Math.round(total * 100) / 100,
    // edit-mode fields are overwritten by the reducer's ENTER_EDIT_MODE
    // handler; values here are placeholders for the TicketState shape.
    source: 'new',
    sourceId: null,
    returnTo: null,
    editMode: false,
    editInitialSnapshot: null,
    editSourceScheduledDate: null,
  };
}

// ---------------------------------------------------------------------------
// Drain orchestration — pure async function for testability
// ---------------------------------------------------------------------------

interface DrainParams {
  source: 'appointment' | 'job';
  id: string;
  returnTo: string;
}

type DispatchFn = ReturnType<typeof useTicket>['dispatch'];

/**
 * Runs the drain pipeline given already-validated params. Exported so tests
 * can drive it without needing to mock `useEffect` / `window.location`.
 */
export async function runEditModeDrain(
  { source, id, returnTo }: DrainParams,
  dispatch: DispatchFn
): Promise<{ ok: boolean; status?: number }> {
  const endpoint =
    source === 'appointment'
      ? `/api/pos/appointments/${id}/load`
      : `/api/pos/jobs/${id}/checkout-items`;

  let res: Response;
  try {
    res = await posFetch(endpoint);
  } catch {
    return { ok: false };
  }

  if (!res.ok) {
    return { ok: false, status: res.status };
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return { ok: false };
  }

  const data = (json as { data?: LoadResponseData }).data;
  if (!data || !Array.isArray(data.items)) {
    return { ok: false };
  }

  const ticketData = buildTicketStateFromLoad(data);

  dispatch({
    type: 'ENTER_EDIT_MODE',
    source,
    sourceId: id,
    returnTo,
    ticketData,
    // Item 15f Phase 1 Layer 8d — surface scheduled_date so the banner
    // can render "Editing Appointment: Jane Doe — Sat, May 16". Null when
    // the load endpoint didn't return it (legacy rows or future drift).
    scheduledDate: data.scheduled_date ?? null,
  });

  // Modifier hydration mirrors `pos/jobs/page.tsx:handleCheckout` lines
  // 185-217. RESTORE_TICKET-equivalent (ENTER_EDIT_MODE here) zeros the
  // modifiers so these follow-up dispatches replace, not accumulate.
  const loyaltyPoints = Number(data.loyalty_points_redeemed ?? 0);
  const loyaltyDiscount = Number(data.loyalty_discount ?? 0);
  if (loyaltyPoints > 0 || loyaltyDiscount > 0) {
    dispatch({
      type: 'SET_LOYALTY_REDEEM',
      points: loyaltyPoints,
      discount: loyaltyDiscount,
    });
  }

  const manualValue = Number(data.manual_discount_value ?? 0);
  if (manualValue > 0) {
    dispatch({
      type: 'APPLY_MANUAL_DISCOUNT',
      discountType: 'dollar',
      value: manualValue,
      label: data.manual_discount_label?.trim() || 'Manual discount',
    });
  }

  // Coupon re-validation — same as handleCheckout. If the code is no longer
  // valid (sold out / expired / customer no longer qualifies), the drain
  // continues without a coupon applied; the cart still hydrates with services.
  if (data.coupon_code) {
    try {
      const cartItems = ticketData.items.map((ti) => ({
        item_type: ti.itemType,
        product_id: ti.productId || undefined,
        service_id: ti.serviceId || undefined,
        category_id: ti.categoryId || undefined,
        unit_price: ti.unitPrice,
        quantity: ti.quantity,
        item_name: ti.itemName,
      }));
      const validateRes = await posFetch('/api/pos/coupons/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: data.coupon_code,
          subtotal: ticketData.subtotal,
          customer_id: data.customer_id,
          items: cartItems,
        }),
      });
      if (validateRes.ok) {
        const couponJson = await validateRes.json();
        const couponData = couponJson.data;
        if (couponData && couponData.total_discount > 0) {
          dispatch({
            type: 'SET_COUPON',
            coupon: {
              id: couponData.id,
              code: couponData.code,
              discount: couponData.total_discount,
            },
          });
        }
      }
    } catch {
      // Coupon revalidate failed — swallow; ticket already hydrated.
    }
  }

  // Item 15f Phase 1 Layer 8c — stamp the dirty-detection baseline AFTER
  // all modifier dispatches have settled. The drain emits this last so
  // `editInitialSnapshot` reflects the cart state the operator first sees
  // (post-coupon-revalidate), not the zeroed-modifier intermediate state
  // ENTER_EDIT_MODE momentarily holds. Without this, the Sale tab would
  // show "Unsaved changes" immediately on hydration.
  dispatch({ type: 'MARK_EDIT_INITIAL_STATE' });

  return { ok: true };
}

// ---------------------------------------------------------------------------
// React hook
// ---------------------------------------------------------------------------

/**
 * Mount-once deep-link drain. Reads `?source=...&id=...&returnTo=...` from
 * `window.location.search`, validates, fetches the source record, and
 * dispatches `ENTER_EDIT_MODE`. Strips the params from the URL on success so
 * a refresh inside `/pos` won't re-drain (the operator's in-progress edits
 * would otherwise be silently overwritten by the cached server snapshot).
 *
 * No-op when params are absent — bare `/pos` continues to behave as today.
 */
export function useEditModeDrain(): void {
  const { dispatch } = useTicket();
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const source = params.get('source');
    const id = params.get('id');
    const returnTo = params.get('returnTo');

    // No params → fresh ticket. Mark fired so we don't re-check on hot reloads.
    if (!source && !id && !returnTo) {
      firedRef.current = true;
      return;
    }

    firedRef.current = true;

    // Validate before fetching — every required field must be present and
    // shaped correctly. A single failure aborts the drain and surfaces a
    // toast; the operator falls through to a fresh ticket.
    if (source !== 'appointment' && source !== 'job') {
      toast.error('Invalid source for ticket edit');
      stripDeepLinkParams();
      return;
    }
    if (!isUuid(id)) {
      toast.error('Invalid record id for ticket edit');
      stripDeepLinkParams();
      return;
    }
    if (!isSafeInternalPath(returnTo)) {
      toast.error('Invalid return path for ticket edit');
      stripDeepLinkParams();
      return;
    }

    void (async () => {
      const result = await runEditModeDrain(
        { source, id, returnTo },
        dispatch
      );
      if (!result.ok) {
        if (result.status === 403) {
          toast.error("You don't have permission to edit this record");
        } else if (result.status === 404) {
          toast.error('Record not found');
        } else {
          toast.error('Failed to load record for edit');
        }
      }
      stripDeepLinkParams();
    })();
  }, [dispatch]);
}

/**
 * Removes the drain's query params from the URL bar after we've consumed
 * them. Uses `history.replaceState` (not `router.replace`) to avoid a Next.js
 * re-render — the drain has already mutated context state, no need to
 * trigger the page lifecycle again.
 */
function stripDeepLinkParams(): void {
  if (typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete('source');
    url.searchParams.delete('id');
    url.searchParams.delete('returnTo');
    window.history.replaceState(null, '', url.pathname + (url.search || '') + url.hash);
  } catch {
    // history API unavailable — non-fatal; URL just stays with params.
  }
}
