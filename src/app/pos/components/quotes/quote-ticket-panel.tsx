'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogClose,
  DialogHeader,
  DialogTitle,
  DialogContent,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tag, X, CalendarDays, Loader2 } from 'lucide-react';
import { usePosPermission } from '../../context/pos-permission-context';
import { useQuote } from '../../context/quote-context';
import { useCatalog } from '../../hooks/use-catalog';
import { QuoteItemRow } from './quote-item-row';
import { QuoteTotals } from './quote-totals';
import { QuoteCouponInput } from './quote-coupon-input';
import { QuoteLoyaltyPanel } from './quote-loyalty-panel';
import { MobileFeePicker } from './mobile-fee-picker';
import { CustomerVehicleSummary } from '../customer-vehicle-summary';
import { CustomerLookup } from '../customer-lookup';
import { CustomerCreateDialog } from '../customer-create-dialog';
import { VehicleSelector } from '../vehicle-selector';
import { VehicleCreateDialog } from '../vehicle-create-dialog';
import { QuoteSendDialog } from './quote-send-dialog';
import { PrerequisiteRemovalDialog } from '../prerequisite-removal-dialog';
import { ManagerPinDialog } from '../manager-pin-dialog';
import { CustomerTypePrompt } from '../customer-type-prompt';
import { SaveAddressDialog } from '../checkout/save-address-dialog';
import type { Customer, CustomerType, Vehicle, VehicleSizeClass } from '@/lib/supabase/types';
import { VEHICLE_SIZE_LABELS } from '@/lib/utils/constants';
import { useRouter } from 'next/navigation';
import { posFetch } from '../../lib/pos-fetch';
import type { TicketItem, QuoteState } from '../../types';
import { formatCustomerAddress } from '@/lib/utils/format-address';
import type { MobileAddressAction } from '@/lib/utils/mobile-address-action';

interface QuoteTicketPanelProps {
  onSaved: (quoteId: string) => void;
  walkInMode?: boolean;
}

const AUTO_SAVE_DEBOUNCE_MS = 800;

function buildItemsPayload(items: TicketItem[]) {
  return items.map((item) => ({
    service_id: item.serviceId || null,
    product_id: item.productId || null,
    item_name: item.itemName,
    quantity: item.quantity,
    unit_price: item.unitPrice,
    tier_name: item.tierName || null,
    notes: item.notes || null,
  }));
}

// Stable hash of the persistable slice of quote state. Used to skip auto-save
// when current state matches the last successful save (or the load-snapshot
// captured on resume), so resuming a draft does not trigger a redundant PATCH.
//
// Item 15g Layer 15g-ii — manualDiscount + loyalty + couponDiscount are now
// persisted to the quotes table (added dedicated columns). Hash includes them
// so auto-save fires when the cashier adjusts a discount or loyalty toggle.
function computeQuoteHash(q: QuoteState): string {
  return JSON.stringify({
    items: q.items.map((i) => ({
      itemType: i.itemType,
      productId: i.productId,
      serviceId: i.serviceId,
      itemName: i.itemName,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      tierName: i.tierName,
      notes: i.notes,
    })),
    customerId: q.customer?.id ?? null,
    vehicleId: q.vehicle?.id ?? null,
    notes: q.notes,
    validUntil: q.validUntil,
    couponCode: q.coupon?.code ?? null,
    couponDiscount: q.coupon?.discount ?? null,
    loyaltyPoints: q.loyaltyPointsToRedeem || 0,
    loyaltyDiscount: q.loyaltyDiscount || 0,
    manualDiscount: q.manualDiscount
      ? {
          t: q.manualDiscount.type,
          v: q.manualDiscount.value,
          l: q.manualDiscount.label ?? '',
        }
      : null,
    mobile: {
      on: q.mobile?.isMobile ?? false,
      zone: q.mobile?.zoneId ?? null,
      addr: q.mobile?.address ?? '',
      sur: q.mobile?.surcharge ?? 0,
      label: q.mobile?.zoneNameSnapshot ?? '',
    },
  });
}

// Item 15g Layer 15g-ii — Build the modifier portion of the quote
// POST/PATCH body. All fields nullable; "no intent to send" is omission,
// "clear the column" is null. The shape matches the additions to
// createQuoteSchema / updateQuoteSchema in src/lib/utils/validation.ts.
function buildModifiersPayload(q: QuoteState) {
  return {
    coupon_discount: q.coupon?.discount ?? null,
    loyalty_points_to_redeem: q.loyaltyPointsToRedeem || null,
    loyalty_discount: q.loyaltyDiscount || null,
    manual_discount_type: q.manualDiscount?.type ?? null,
    manual_discount_value: q.manualDiscount?.value ?? null,
    manual_discount_label: q.manualDiscount?.label || null,
  };
}

// Build the mobile section of an API write payload. The {is_mobile=false}
// branch is shared explicitly between POST + PATCH so removing the toggle
// resets all five columns server-side.
//
// Phase Mobile-1.2: includes `is_custom` so the server can distinguish
// "Custom path chosen" from "no zone selected yet" — without that the
// server's no-zone branch produced a custom-fee error message even when
// the cashier hadn't picked anything.
function buildMobilePayload(q: QuoteState) {
  if (!q.mobile?.isMobile) {
    return {
      is_mobile: false,
      mobile_zone_id: null,
      mobile_address: null,
      mobile_surcharge: 0,
      mobile_zone_name_snapshot: null,
      is_custom: false,
    };
  }
  return {
    is_mobile: true,
    mobile_zone_id: q.mobile.zoneId,
    mobile_address: q.mobile.address || null,
    mobile_surcharge: q.mobile.surcharge,
    mobile_zone_name_snapshot: q.mobile.zoneNameSnapshot || null,
    is_custom: !!q.mobile.isCustom,
  };
}

export function QuoteTicketPanel({ onSaved, walkInMode }: QuoteTicketPanelProps) {
  const router = useRouter();
  const { granted: canManualDiscount } = usePosPermission('pos.manual_discounts');
  const { granted: canOverridePricing } = usePosPermission('pos.discount_override');
  const { quote, dispatch, quoteValidityDays } = useQuote();
  const { services } = useCatalog();

  const [customerLookupOpen, setCustomerLookupOpen] = useState(false);
  const [showCustomerCreate, setShowCustomerCreate] = useState(false);
  const [customerCreatePrefill, setCustomerCreatePrefill] = useState('');
  const [showVehicleSelector, setShowVehicleSelector] = useState(false);
  const [showVehicleCreate, setShowVehicleCreate] = useState(false);
  const [showDiscountForm, setShowDiscountForm] = useState(false);
  const hasSpecialPricingWithoutOverride = !canOverridePricing && quote.items.some((i) => i.pricingType === 'sale' || i.pricingType === 'combo');
  const [discountType, setDiscountType] = useState<'dollar' | 'percent'>('dollar');
  const [discountValue, setDiscountValue] = useState('');
  const [discountLabel, setDiscountLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [discountOverrideGranted, setDiscountOverrideGranted] = useState(false);
  const [showDiscountOverridePin, setShowDiscountOverridePin] = useState(false);
  const [pendingVehicleChange, setPendingVehicleChange] = useState<Vehicle | null>(null);
  // G2 — vehicle being edited (parity with ticket-panel.tsx:67). When set, the
  // VehicleCreateDialog opens in edit mode and saving dispatches SET_VEHICLE.
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  // G4 — customer-type classification prompt (parity with ticket-panel.tsx:77).
  const [showTypePrompt, setShowTypePrompt] = useState(false);

  // Prerequisite removal guard state
  const [prereqRemoval, setPrereqRemoval] = useState<{
    prerequisiteItemId: string;
    prerequisiteName: string;
    dependentItemId: string;
    dependentName: string;
  } | null>(null);

  // Phase Mobile-1.1: address validation + save-to-customer state.
  // showAddressError is flipped on when the user attempts to save/create
  // with mobile=on and the address field empty — picker renders inline error.
  const [showAddressError, setShowAddressError] = useState(false);
  // Phase Mobile-1.2: zone + custom-fee inline errors. Flipped on when the
  // submit gate fires and the corresponding picker field is invalid;
  // cleared as the cashier resolves the field.
  const [showZoneError, setShowZoneError] = useState(false);
  const [showCustomFeeError, setShowCustomFeeError] = useState(false);
  // saveAddressAction is the post-success diff payload from the server; the
  // dialog renders when this is non-null.
  const [saveAddressAction, setSaveAddressAction] =
    useState<MobileAddressAction | null>(null);
  // Pending continuation runs after the user closes the dialog (Skip or
  // Update profile). Used to defer navigation/cleanup so the dialog appears
  // before route changes.
  const pendingAfterDialogRef = useRef<(() => void) | null>(null);

  function handleSaveAddressDialogClose() {
    setSaveAddressAction(null);
    const cont = pendingAfterDialogRef.current;
    pendingAfterDialogRef.current = null;
    if (cont) cont();
  }

  // Memoize the customer's formatted profile address for pre-fill. Recomputes
  // when the linked customer changes (LOCKED-10: picker preserves typed input).
  const customerProfileAddress = quote.customer
    ? formatCustomerAddress(quote.customer)
    : null;

  // Auto-save plumbing. The debounced effect persists drafts as the user edits;
  // savingRef + dirtyRef coalesce concurrent change bursts; lastSavedHashRef
  // doubles as the load-snapshot on resume so the first render of an existing
  // draft does not fire a redundant PATCH.
  const savingRef = useRef(false);
  const dirtyRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightPromiseRef = useRef<Promise<void> | null>(null);
  const lastSavedHashRef = useRef<string | null>(null);
  const quoteRef = useRef(quote);
  useEffect(() => {
    quoteRef.current = quote;
  }, [quote]);

  // G3 — toast when a vehicle-change reprice failed for one or more items
  // (parity with ticket-panel.tsx:123-143). quote-reducer SET_VEHICLE already
  // sets the `repriceFailed` flag and keeps the stale price; without this the
  // mispricing would persist silently on a customer-facing quote. Watches
  // quote.items for NEWLY-failed flags (not carried over from prior state).
  const prevFailedIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const currentFailedIds = new Set(
      quote.items.filter((i) => i.repriceFailed).map((i) => i.id)
    );
    const newlyFailed = quote.items.filter(
      (i) => i.repriceFailed && !prevFailedIdsRef.current.has(i.id)
    );
    if (newlyFailed.length > 0) {
      // All newly-failed items share the same attemptedSize (set in the same reducer pass).
      const attemptedSize = newlyFailed[0].repriceFailed!.attemptedSize;
      const sizeLabel = attemptedSize ? VEHICLE_SIZE_LABELS[attemptedSize as VehicleSizeClass] : 'this vehicle';
      toast.warning(
        `${newlyFailed.length} item${newlyFailed.length === 1 ? '' : 's'} kept at previous price — no pricing configured for ${sizeLabel}`,
        { duration: 5000 }
      );
    }
    prevFailedIdsRef.current = currentFailedIds;
  }, [quote.items]);

  const persistDraft = useCallback(
    async ({ silent }: { silent: boolean }): Promise<boolean> => {
      const q = quoteRef.current;
      if (q.items.length === 0) {
        if (!silent) toast.error('Add at least one item to the quote');
        return false;
      }
      // Status guard: never auto-save a quote that is no longer a draft.
      if (silent && q.status && q.status !== 'draft') {
        console.log(`[QUOTE_AUTO_SAVE] skip — status=${q.status}`);
        return false;
      }

      const items = buildItemsPayload(q.items);
      const isUpdate = !!q.quoteId;

      if (silent) {
        console.log(
          `[QUOTE_AUTO_SAVE] save start (quoteId=${q.quoteId ?? 'null'}, items=${items.length})`
        );
      }

      savingRef.current = true;
      if (!silent) setSaving(true);
      try {
        if (isUpdate) {
          const res = await posFetch(`/api/pos/quotes/${q.quoteId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              customer_id: q.customer?.id || null,
              vehicle_id: q.vehicle?.id || null,
              notes: q.notes,
              valid_until: q.validUntil,
              coupon_code: q.coupon?.code || null,
              items,
              ...buildMobilePayload(q),
              ...buildModifiersPayload(q),
            }),
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            const msg = data.error || `Failed to update quote (status=${res.status})`;
            if (silent) {
              console.log(
                `[QUOTE_AUTO_SAVE] save failed (status=${res.status}, message=${JSON.stringify(msg)}) — swallowed`
              );
              return false;
            }
            throw new Error(msg);
          }
          lastSavedHashRef.current = computeQuoteHash(q);
          if (silent) {
            console.log(
              `[QUOTE_AUTO_SAVE] save success (quoteId=${q.quoteId}, quote_number=${q.quoteNumber ?? 'unchanged'})`
            );
          } else {
            // Phase Mobile-1.1: inspect mobile_address_action.
            const data = await res.json().catch(() => ({}));
            const action: MobileAddressAction | null =
              data?.mobile_address_action ?? null;
            toast.success('Quote updated');
            if (action?.silently_saved) {
              toast.success('Address saved to customer profile');
            }
            const savedId = q.quoteId!;
            if (action?.diff) {
              // Defer onSaved until dialog closes (LOCKED-6 Context A).
              pendingAfterDialogRef.current = () => onSaved(savedId);
              setSaveAddressAction(action);
            } else {
              onSaved(savedId);
            }
          }
          return true;
        } else {
          const res = await posFetch('/api/pos/quotes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              customer_id: q.customer?.id || null,
              vehicle_id: q.vehicle?.id || null,
              notes: q.notes,
              valid_until: q.validUntil,
              coupon_code: q.coupon?.code || null,
              items,
              ...buildMobilePayload(q),
              ...buildModifiersPayload(q),
            }),
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            const msg = data.error || `Failed to create quote (status=${res.status})`;
            if (silent) {
              console.log(
                `[QUOTE_AUTO_SAVE] save failed (status=${res.status}, message=${JSON.stringify(msg)}) — swallowed`
              );
              return false;
            }
            throw new Error(msg);
          }
          const data = await res.json();
          lastSavedHashRef.current = computeQuoteHash(q);
          if (silent) {
            // Capture id+number so subsequent saves PATCH instead of POST.
            // Metadata-only dispatch — never clobbers in-flight item/customer edits.
            dispatch({
              type: 'SET_QUOTE_META',
              quoteId: data.quote.id,
              quoteNumber: data.quote.quote_number,
              status: 'draft',
            });
            console.log(
              `[QUOTE_AUTO_SAVE] save success (quoteId=${data.quote.id}, quote_number=${data.quote.quote_number})`
            );
          } else {
            toast.success(`Quote ${data.quote.quote_number} created`);
            const newQuoteId = data.quote.id;
            const action: MobileAddressAction | null =
              data?.mobile_address_action ?? null;
            if (action?.silently_saved) {
              toast.success('Address saved to customer profile');
            }
            dispatch({ type: 'CLEAR_QUOTE', validityDays: quoteValidityDays });
            if (action?.diff) {
              pendingAfterDialogRef.current = () => onSaved(newQuoteId);
              setSaveAddressAction(action);
            } else {
              onSaved(newQuoteId);
            }
          }
          return true;
        }
      } catch (err) {
        if (silent) {
          console.log(
            `[QUOTE_AUTO_SAVE] save failed (${err instanceof Error ? err.message : 'unknown'}) — swallowed`
          );
          return false;
        }
        toast.error(err instanceof Error ? err.message : 'Failed to save quote');
        return false;
      } finally {
        savingRef.current = false;
        if (!silent) setSaving(false);
      }
    },
    [dispatch, onSaved, quoteValidityDays]
  );

  // Always-fresh ref so the unmount cleanup can call the latest persistDraft.
  const persistDraftRef = useRef(persistDraft);
  useEffect(() => {
    persistDraftRef.current = persistDraft;
  }, [persistDraft]);

  // Debounced auto-save. Trailing edge only — fires AUTO_SAVE_DEBOUNCE_MS
  // after the last user change. Skipped when: walk-in mode, no items, status
  // beyond draft, or current state matches the last save / load-snapshot.
  useEffect(() => {
    if (walkInMode) {
      // Only log the gate once per panel mount to avoid spam — gate-on-walk-in
      // is a static decision tied to the prop, not a per-keystroke skip.
      return;
    }
    if (quote.items.length === 0) return;
    if (quote.status && quote.status !== 'draft') return;

    const currentHash = computeQuoteHash(quote);

    // Resume-init: capture the load-snapshot once for an existing draft so the
    // initial render of LOAD_QUOTE'd state does not trigger a redundant PATCH.
    if (quote.quoteId && lastSavedHashRef.current === null) {
      lastSavedHashRef.current = currentHash;
      return;
    }
    if (lastSavedHashRef.current === currentHash) return;

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      if (savingRef.current) {
        // A save is mid-flight; coalesce by marking dirty. The completion path
        // below re-fires once when the in-flight save resolves.
        dirtyRef.current = true;
        return;
      }
      const promise = (async () => {
        await persistDraftRef.current({ silent: true });
        if (dirtyRef.current) {
          dirtyRef.current = false;
          await persistDraftRef.current({ silent: true });
        }
      })();
      inFlightPromiseRef.current = promise;
      promise.finally(() => {
        if (inFlightPromiseRef.current === promise) {
          inFlightPromiseRef.current = null;
        }
      });
    }, AUTO_SAVE_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [quote, walkInMode]);

  // Final flush on unmount — covers footer-tab navigation and the Back link.
  // Hard tab-close is acceptably out of scope (no beforeunload by design).
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      const q = quoteRef.current;
      if (walkInMode) return;
      if (q.items.length === 0) return;
      if (q.status && q.status !== 'draft') return;
      const currentHash = computeQuoteHash(q);
      if (lastSavedHashRef.current === currentHash) return;
      console.log('[QUOTE_AUTO_SAVE] cleanup flush');
      // Fire-and-forget: the fetch outlives the unmount; we don't await.
      persistDraftRef.current({ silent: true }).catch(() => {});
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRemoveItem = useCallback((itemId: string) => {
    const item = quote.items.find((i) => i.id === itemId);
    if (!item || !item.serviceId) {
      dispatch({ type: 'REMOVE_ITEM', itemId });
      return;
    }

    // This item was added as a prerequisite FOR another service — check if that dependent is still on the quote
    if (item.prerequisiteForServiceId) {
      const dependent = quote.items.find(
        (i) => i.serviceId === item.prerequisiteForServiceId && i.id !== itemId
      );
      if (dependent) {
        setPrereqRemoval({
          prerequisiteItemId: itemId,
          prerequisiteName: item.itemName,
          dependentItemId: dependent.id,
          dependentName: dependent.itemName,
        });
        return;
      }
    }

    dispatch({ type: 'REMOVE_ITEM', itemId });
  }, [quote.items, dispatch]);

  function handleSelectCustomer(customer: Customer) {
    dispatch({ type: 'SET_CUSTOMER', customer });
    setCustomerLookupOpen(false);
    // G4 (parity with ticket-panel.tsx:279-281): prompt to classify an
    // unknown-type customer. The quote flow also collects a vehicle next, so we
    // sequence — the vehicle selector opens once the prompt is dismissed (see
    // CustomerTypePrompt's onOpenChange below). Known type → straight to vehicle.
    if (!customer.customer_type) {
      setShowTypePrompt(true);
    } else {
      setShowVehicleSelector(true);
    }
  }

  function handleCustomerCreated(customer: Customer) {
    dispatch({ type: 'SET_CUSTOMER', customer });
    setShowCustomerCreate(false);
    // G4 — same sequencing as handleSelectCustomer (the create dialog may have
    // already set a type, in which case we skip straight to the vehicle selector).
    if (!customer.customer_type) {
      setShowTypePrompt(true);
    } else {
      setShowVehicleSelector(true);
    }
  }

  function applyVehicleSelection(vehicle: Vehicle) {
    const hasServices = quote.items.some((i) => i.itemType === 'service');
    // Session 31: atomic vehicle-change action. Quotes have no checkout/payment path so blockedByPayment is always false.
    dispatch({ type: 'SET_VEHICLE', vehicle, services, blockedByPayment: false });
    if (hasServices) {
      toast.info('Service prices updated for vehicle size');
    }

    setShowVehicleSelector(false);
  }

  function handleSelectVehicle(vehicle: Vehicle) {
    const hasServices = quote.items.some((i) => i.itemType === 'service');
    const categoryChanged = quote.vehicle && vehicle.vehicle_category !== quote.vehicle.vehicle_category;

    if (hasServices && categoryChanged) {
      setPendingVehicleChange(vehicle);
      return;
    }

    applyVehicleSelection(vehicle);
  }

  function handleConfirmVehicleChange() {
    if (!pendingVehicleChange) return;
    for (const item of quote.items) {
      if (item.itemType === 'service') {
        dispatch({ type: 'REMOVE_ITEM', itemId: item.id });
      }
    }
    dispatch({ type: 'SET_VEHICLE', vehicle: pendingVehicleChange, services, blockedByPayment: false });
    setPendingVehicleChange(null);
    setShowVehicleSelector(false);
    toast.info('Services cleared — vehicle type changed');
  }

  function handleVehicleCreated(vehicle: Vehicle) {
    handleSelectVehicle(vehicle);
    setShowVehicleCreate(false);
  }

  function handleClearCustomer() {
    dispatch({ type: 'SET_CUSTOMER', customer: null });
    dispatch({ type: 'SET_VEHICLE', vehicle: null, services, blockedByPayment: false });
  }

  // Mirror of ticket-panel.tsx:357-361 — keep the quote's local customer in sync
  // after the pill PATCHes customers.customer_type, so the badge cycles
  // (Unknown → Enthusiast → Professional → Unknown) instead of repeating one
  // transition from stale state. See docs/dev/POS_CUSTOMER_TYPE_PILL_PARITY_AUDIT.md.
  function handleCustomerTypeChanged(newType: CustomerType | null) {
    if (quote.customer) {
      dispatch({ type: 'SET_CUSTOMER', customer: { ...quote.customer, customer_type: newType } });
    }
  }

  function handleApplyDiscount() {
    const parsed = parseFloat(discountValue);
    if (isNaN(parsed) || parsed <= 0) {
      toast.error('Enter a discount value greater than 0');
      return;
    }
    if (discountType === 'percent' && parsed > 100) {
      toast.error('Percentage discount cannot exceed 100%');
      return;
    }
    if (hasSpecialPricingWithoutOverride && !discountOverrideGranted) {
      setShowDiscountOverridePin(true);
      return;
    }
    dispatch({
      type: 'APPLY_MANUAL_DISCOUNT',
      discountType,
      value: parsed,
      label: discountLabel.trim(),
    });
    toast.success(
      `Discount applied: ${discountType === 'percent' ? `${parsed}%` : `$${parsed.toFixed(2)}`}`
    );
    setShowDiscountForm(false);
    setDiscountValue('');
    setDiscountLabel('');
  }

  function handleRemoveDiscount() {
    dispatch({ type: 'REMOVE_MANUAL_DISCOUNT' });
    toast.info('Discount removed');
  }

  // Phase Mobile-1.1 + 1.2: client-side mobile-section gate. Returns true if
  // OK to proceed, false if blocked. Flips on the appropriate picker error
  // (address / zone / custom-fee) so the cashier sees inline feedback at
  // the offending field rather than a single generic toast.
  function gateMobileAddress(): boolean {
    if (!quote.mobile?.isMobile) {
      setShowAddressError(false);
      setShowZoneError(false);
      setShowCustomFeeError(false);
      return true;
    }

    const m = quote.mobile;
    const addressEmpty = !(m.address ?? '').trim();
    if (addressEmpty) {
      setShowAddressError(true);
      setShowZoneError(false);
      setShowCustomFeeError(false);
      toast.error('Address is required for mobile service');
      return false;
    }

    // No zone selected AND cashier did not choose Custom.
    if (!m.zoneId && !m.isCustom) {
      setShowAddressError(false);
      setShowZoneError(true);
      setShowCustomFeeError(false);
      toast.error('Please select a service area for the mobile fee');
      return false;
    }

    // Custom path with invalid surcharge.
    if (m.isCustom && !(m.surcharge > 0 && m.surcharge <= 500)) {
      setShowAddressError(false);
      setShowZoneError(false);
      setShowCustomFeeError(true);
      toast.error('Enter a custom fee between $1 and $500');
      return false;
    }

    setShowAddressError(false);
    setShowZoneError(false);
    setShowCustomFeeError(false);
    return true;
  }

  async function handleSaveDraft() {
    if (!gateMobileAddress()) return;
    await persistDraft({ silent: false });
  }

  async function handleSendQuote() {
    if (quote.items.length === 0) {
      toast.error('Add at least one item to the quote');
      return;
    }
    if (!quote.customer) {
      toast.error('Select a customer before sending');
      return;
    }
    if (!gateMobileAddress()) return;

    setSaving(true);
    try {
      // Wait for any in-flight auto-save so we don't double-create or race the
      // POST→PATCH transition.
      if (inFlightPromiseRef.current) {
        await inFlightPromiseRef.current;
      }
      // Cancel any pending debounce — we'll save synchronously below.
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      // Persist current state silently. Handles POST-on-first-save (which
      // dispatches SET_QUOTE_META) or PATCH on subsequent saves. Returns false
      // on swallowed silent failure — we treat that as a hard send-blocker so
      // the dialog never opens with stale-on-server data.
      const ok = await persistDraft({ silent: true });
      if (!ok || !quoteRef.current.quoteId) {
        throw new Error('Failed to save quote before sending');
      }
      setSendDialogOpen(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save quote');
    } finally {
      setSaving(false);
    }
  }

  function handleSendComplete() {
    setSendDialogOpen(false);
    if (quote.quoteId) {
      dispatch({ type: 'CLEAR_QUOTE', validityDays: quoteValidityDays });
      onSaved(quote.quoteId);
    }
  }

  async function handleCreateJob() {
    // Validate: customer required for walk-in jobs
    if (!quote.customer) {
      toast.error('Select a customer before creating a job');
      return;
    }

    // Validate: at least one service item (products alone cannot create a job)
    const serviceItems = quote.items.filter(
      (i) => i.itemType === 'service' && i.serviceId
    );
    if (serviceItems.length === 0) {
      toast.error('At least one service is required to create a job');
      return;
    }

    if (!gateMobileAddress()) return;

    setSaving(true);
    try {
      // Step 1: Save the quote as 'converted' for audit trail
      // ALL items (services + products) go into the quote for the checkout bridge
      const items = quote.items.map((item) => ({
        service_id: item.serviceId || null,
        product_id: item.productId || null,
        item_name: item.itemName,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        tier_name: item.tierName || null,
        notes: item.notes || null,
      }));

      const couponCode = quote.coupon?.code || null;
      let savedQuoteId = quote.quoteId;

      const mobilePayload = buildMobilePayload(quote);
      const modifiersPayload = buildModifiersPayload(quote);
      if (savedQuoteId) {
        // Update existing quote and mark as converted
        const res = await posFetch(`/api/pos/quotes/${savedQuoteId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customer_id: quote.customer.id,
            vehicle_id: quote.vehicle?.id || null,
            notes: quote.notes,
            valid_until: quote.validUntil,
            status: 'converted',
            coupon_code: couponCode,
            items,
            ...mobilePayload,
            ...modifiersPayload,
          }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to update quote');
        }
      } else {
        // Create new quote as converted
        const res = await posFetch('/api/pos/quotes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customer_id: quote.customer.id,
            vehicle_id: quote.vehicle?.id || null,
            notes: quote.notes,
            valid_until: quote.validUntil,
            status: 'converted',
            coupon_code: couponCode,
            items,
            ...mobilePayload,
            ...modifiersPayload,
          }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to save quote');
        }
        const data = await res.json();
        savedQuoteId = data.quote.id;
      }

      // Step 2: Map ONLY service items to job services (products carry through via quote_id)
      const jobServices = serviceItems.map((item) => ({
        id: item.serviceId,
        name: item.itemName,
        price: item.totalPrice,
        quantity: item.quantity,
        tier_name: item.tierName,
      }));

      // Step 3: Build notes with coupon info for cashier reference
      let jobNotes = quote.notes || '';
      if (quote.coupon) {
        const couponNote = `Coupon: ${quote.coupon.code}`;
        jobNotes = jobNotes ? `${jobNotes}\n${couponNote}` : couponNote;
      }

      // Step 4: Create the job
      // Item 15g Layer 15g-ii — modifier payload propagates so the synthetic
      // walk-in appointment carries loyalty/manual-discount/coupon snapshot.
      // The walk-in path POST /api/pos/jobs persists them on the appointment
      // row (see route.ts updates in this same layer).
      const jobRes = await posFetch('/api/pos/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: quote.customer.id,
          vehicle_id: quote.vehicle?.id || null,
          services: jobServices,
          quote_id: savedQuoteId,
          notes: jobNotes || undefined,
          ...mobilePayload,
          ...modifiersPayload,
        }),
      });

      if (!jobRes.ok) {
        const data = await jobRes.json();
        throw new Error(data.error || 'Failed to create job');
      }

      const jobData = await jobRes.json();
      const action: MobileAddressAction | null =
        jobData?.mobile_address_action ?? null;

      // Step 5: Notify about products + coupon carryover
      const productItems = quote.items.filter((i) => i.itemType === 'product');
      if (productItems.length > 0 || couponCode) {
        const parts: string[] = [];
        if (productItems.length > 0) parts.push(`${productItems.length} product(s)`);
        if (couponCode) parts.push(`coupon ${couponCode}`);
        toast.info(`${parts.join(' and ')} will carry over at checkout`, { duration: 4000 });
      }

      toast.success(`Walk-in job created for ${quote.customer.first_name} ${quote.customer.last_name}`);
      if (action?.silently_saved) {
        toast.success('Address saved to customer profile');
      }
      dispatch({ type: 'CLEAR_QUOTE', validityDays: quoteValidityDays });

      // Step 6: Navigate to jobs tab — deferred when the address dialog
      // needs to appear first (LOCKED-6 Context A).
      if (action?.diff) {
        pendingAfterDialogRef.current = () => router.push('/pos/jobs');
        setSaveAddressAction(action);
      } else {
        router.push('/pos/jobs');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create job');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden border-l border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
      {/* Customer / Vehicle summary */}
      <div className="shrink-0 border-b border-gray-100 dark:border-gray-800 px-4 py-2">
        <CustomerVehicleSummary
          customer={quote.customer}
          vehicle={quote.vehicle}
          onChangeCustomer={() => setCustomerLookupOpen(true)}
          onChangeVehicle={() => {
            if (quote.customer) {
              setShowVehicleSelector(true);
            } else {
              setCustomerLookupOpen(true);
            }
          }}
          onClear={handleClearCustomer}
          onCustomerTypeChanged={handleCustomerTypeChanged}
          onEditVehicle={() => {
            if (quote.vehicle) {
              setEditingVehicle(quote.vehicle);
              setShowVehicleCreate(true);
            }
          }}
        />
      </div>

      {/* Header */}
      <div className="shrink-0 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          {walkInMode
            ? 'Walk-In Job'
            : `Quote ${quote.quoteNumber ? `#${quote.quoteNumber}` : '(New)'}`}
        </h2>
      </div>

      {/* Items list */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4">
        {quote.items.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-gray-400 dark:text-gray-500">
            Browse catalog to add items
          </div>
        ) : (
          <div className="py-2">
            {quote.items.map((item) => (
              <QuoteItemRow key={item.id} item={item} onRemoveItem={handleRemoveItem} />
            ))}
          </div>
        )}
      </div>

      {/* Coupon + Loyalty + Discount */}
      {quote.items.length > 0 && (
        <div className="shrink-0 space-y-2 border-t border-gray-100 dark:border-gray-800 px-4 py-2">
          <QuoteCouponInput />
          <QuoteLoyaltyPanel />

          {/* Manual Discount — permission gated */}
          {canManualDiscount && (
            <>
              {quote.manualDiscount ? (
                <div className="flex items-center justify-between rounded-md bg-red-50 dark:bg-red-900/30 px-3 py-1.5">
                  <div className="flex items-center gap-1.5 text-sm text-red-700 dark:text-red-400">
                    <Tag className="h-3.5 w-3.5" />
                    <span className="font-medium">
                      {quote.manualDiscount.label || 'Discount'}
                    </span>
                    <span className="text-red-600 dark:text-red-400">
                      {quote.manualDiscount.type === 'percent'
                        ? `${quote.manualDiscount.value}%`
                        : `-$${quote.manualDiscount.value.toFixed(2)}`}
                    </span>
                  </div>
                  <button
                    onClick={handleRemoveDiscount}
                    className="flex h-11 w-11 items-center justify-center rounded text-red-500 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 hover:text-red-700 dark:hover:text-red-400"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : showDiscountForm ? (
                <div className="space-y-2 rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-3">
                  <div className="flex gap-1">
                    <button
                      onClick={() => setDiscountType('dollar')}
                      className={`min-h-[44px] flex-1 rounded px-3 py-2 text-xs font-medium transition-colors ${
                        discountType === 'dollar'
                          ? 'bg-gray-900 text-white'
                          : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                      }`}
                    >
                      Dollar ($)
                    </button>
                    <button
                      onClick={() => setDiscountType('percent')}
                      className={`min-h-[44px] flex-1 rounded px-3 py-2 text-xs font-medium transition-colors ${
                        discountType === 'percent'
                          ? 'bg-gray-900 text-white'
                          : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                      }`}
                    >
                      Percent (%)
                    </button>
                  </div>
                  <Input
                    type="text"
                    inputMode={discountType === 'percent' ? 'numeric' : 'decimal'}
                    pattern={discountType === 'percent' ? '[0-9]*' : '[0-9]*\\.?[0-9]*'}
                    value={discountValue}
                    onChange={(e) => {
                      const v = discountType === 'percent'
                        ? e.target.value.replace(/[^0-9]/g, '')
                        : e.target.value.replace(/[^0-9.]/g, '');
                      setDiscountValue(v);
                    }}
                    placeholder={discountType === 'dollar' ? 'Amount ($)' : 'Percentage (%)'}
                    className="min-h-[44px] text-sm"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleApplyDiscount();
                    }}
                  />
                  <Input
                    value={discountLabel}
                    onChange={(e) => setDiscountLabel(e.target.value)}
                    placeholder="Reason (e.g., Employee discount)"
                    className="min-h-[44px] text-sm"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleApplyDiscount();
                    }}
                  />
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowDiscountForm(false);
                        setDiscountValue('');
                        setDiscountLabel('');
                      }}
                      className="min-h-[44px] flex-1 text-xs"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleApplyDiscount}
                      disabled={!discountValue.trim()}
                      className="min-h-[44px] flex-1 text-xs"
                    >
                      Apply
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => {
                    if (hasSpecialPricingWithoutOverride && !discountOverrideGranted) {
                      setShowDiscountOverridePin(true);
                      return;
                    }
                    setShowDiscountForm(true);
                  }}
                  className="flex min-h-[44px] items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                >
                  <Tag className="h-4 w-4" />
                  Add Discount
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* Valid Until — hidden in walk-in mode */}
      {!walkInMode && (
        <div className="shrink-0 border-t border-gray-100 dark:border-gray-800 px-4 py-2">
          <label className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
            <CalendarDays className="h-3 w-3" />
            Valid Until
          </label>
          <input
            type="date"
            value={quote.validUntil || ''}
            onChange={(e) => dispatch({ type: 'SET_VALID_UNTIL', date: e.target.value || null })}
            className="mt-1 h-8 w-full rounded border border-gray-200 dark:border-gray-700 px-2 text-sm text-gray-700 dark:text-gray-300 outline-none focus:border-blue-300 dark:focus:border-blue-700 focus:ring-1 focus:ring-blue-200 dark:focus:ring-blue-800"
          />
        </div>
      )}

      {/* Mobile service picker (Option D2). Visible for both quote and walk-in
          modes. Cashier discretion — toggle off when the customer is on-site.
          Phase Mobile-1.1: customerProfileAddress drives pre-fill;
          showAddressRequiredError surfaces validation inline.
          Phase Mobile-1.2: showZoneRequiredError + showCustomFeeError
          surface the zone-vs-custom validation distinctions inline. */}
      <div className="shrink-0 border-t border-gray-100 dark:border-gray-800 px-4 py-2">
        <MobileFeePicker
          value={quote.mobile}
          onChange={(mobile) => {
            // Clear each inline error as soon as the cashier resolves it.
            if (showAddressError && (mobile.address ?? '').trim()) {
              setShowAddressError(false);
            }
            if (showZoneError && (mobile.zoneId || mobile.isCustom)) {
              setShowZoneError(false);
            }
            if (
              showCustomFeeError &&
              (!mobile.isCustom ||
                (mobile.surcharge > 0 && mobile.surcharge <= 500))
            ) {
              setShowCustomFeeError(false);
            }
            dispatch({ type: 'SET_MOBILE', mobile });
          }}
          customerProfileAddress={customerProfileAddress}
          showAddressRequiredError={showAddressError}
          showZoneRequiredError={showZoneError}
          showCustomFeeError={showCustomFeeError}
        />
      </div>

      {/* Notes */}
      <div className="shrink-0 border-t border-gray-100 dark:border-gray-800 px-4 py-2">
        <label className="text-xs text-gray-500 dark:text-gray-400">Internal Notes</label>
        <textarea
          value={quote.notes || ''}
          onChange={(e) => dispatch({ type: 'SET_NOTES', notes: e.target.value || null })}
          placeholder="Notes for internal use..."
          rows={2}
          className="mt-1 w-full resize-none rounded border border-gray-200 dark:border-gray-700 px-2 py-1.5 text-sm text-gray-700 dark:text-gray-300 placeholder-gray-400 dark:placeholder-gray-500 outline-none focus:border-blue-300 dark:focus:border-blue-700 focus:ring-1 focus:ring-blue-200 dark:focus:ring-blue-800"
        />
      </div>

      {/* Totals + Actions */}
      <div className="shrink-0 px-4 pb-4">
        <QuoteTotals />
        {walkInMode ? (
          <div className="mt-3">
            <Button
              onClick={handleCreateJob}
              disabled={saving || quote.items.length === 0}
              className="w-full"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create Job'}
            </Button>
          </div>
        ) : (
          <div className="mt-3 flex gap-2">
            <Button
              variant="outline"
              onClick={handleSaveDraft}
              disabled={saving || quote.items.length === 0}
              className="flex-1"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save Draft'}
            </Button>
            <Button
              onClick={handleSendQuote}
              disabled={saving || quote.items.length === 0}
              className="flex-1"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send Quote'}
            </Button>
          </div>
        )}
      </div>

      {/* Customer Lookup Dialog
        * Narrow-height wrapperClassName top-anchors the modal on iPad
        * landscape and similar viewports so the auto-focused search input
        * isn't hidden behind the iOS keyboard. Desktop (height > 768px)
        * stays centered. */}
      <Dialog
        open={customerLookupOpen}
        onOpenChange={setCustomerLookupOpen}
        wrapperClassName="[@media(max-height:768px)]:items-start [@media(max-height:768px)]:pt-[25vh]"
      >
        <DialogClose onClose={() => setCustomerLookupOpen(false)} className="hidden pointer-fine:flex items-center justify-center h-8 w-8" />
        <DialogHeader>
          <DialogTitle>Find Customer</DialogTitle>
        </DialogHeader>
        <DialogContent>
          <CustomerLookup
            onSelect={handleSelectCustomer}
            onGuest={() => setCustomerLookupOpen(false)}
            onCreateNew={(searchQuery) => {
              setCustomerCreatePrefill(searchQuery);
              setCustomerLookupOpen(false);
              setShowCustomerCreate(true);
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Customer Create Dialog */}
      <CustomerCreateDialog
        open={showCustomerCreate}
        onClose={() => setShowCustomerCreate(false)}
        onCreated={handleCustomerCreated}
        onBack={() => {
          setShowCustomerCreate(false);
          setCustomerLookupOpen(true);
        }}
        initialQuery={customerCreatePrefill}
      />

      {/* Vehicle Selector Dialog */}
      {quote.customer && (
        <Dialog
          open={showVehicleSelector}
          onOpenChange={setShowVehicleSelector}
        >
          <DialogClose onClose={() => setShowVehicleSelector(false)} className="hidden pointer-fine:flex items-center justify-center h-8 w-8" />
          <DialogHeader>
            <DialogTitle>
              Select Vehicle — {quote.customer.first_name}{' '}
              {quote.customer.last_name}
            </DialogTitle>
          </DialogHeader>
          <DialogContent>
            <VehicleSelector
              customerId={quote.customer.id}
              selectedVehicleId={quote.vehicle?.id ?? null}
              onSelect={handleSelectVehicle}
              onAddNew={() => {
                setShowVehicleSelector(false);
                setShowVehicleCreate(true);
              }}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Vehicle Create/Edit Dialog */}
      {quote.customer && (
        <VehicleCreateDialog
          open={showVehicleCreate}
          onClose={() => { setShowVehicleCreate(false); setEditingVehicle(null); }}
          customerId={quote.customer.id}
          onCreated={(vehicle) => {
            if (editingVehicle) {
              // G2 — editing existing vehicle: update on the quote. Quotes have
              // no checkout/payment path, so blockedByPayment is always false.
              dispatch({ type: 'SET_VEHICLE', vehicle, services, blockedByPayment: false });
              setShowVehicleCreate(false);
              setEditingVehicle(null);
            } else {
              handleVehicleCreated(vehicle);
            }
          }}
          editVehicle={editingVehicle}
        />
      )}

      {/* Send Quote Dialog */}
      {quote.quoteId && (
        <QuoteSendDialog
          open={sendDialogOpen}
          onClose={() => setSendDialogOpen(false)}
          quoteId={quote.quoteId}
          customerEmail={quote.customer?.email ?? null}
          customerPhone={quote.customer?.phone ?? null}
          onSent={handleSendComplete}
        />
      )}

      {/* Prerequisite Removal Confirmation */}
      {prereqRemoval && (
        <PrerequisiteRemovalDialog
          prerequisiteName={prereqRemoval.prerequisiteName}
          dependentName={prereqRemoval.dependentName}
          onRemoveBoth={() => {
            dispatch({ type: 'REMOVE_ITEM', itemId: prereqRemoval.dependentItemId });
            dispatch({ type: 'REMOVE_ITEM', itemId: prereqRemoval.prerequisiteItemId });
            setPrereqRemoval(null);
          }}
          onCancel={() => setPrereqRemoval(null)}
        />
      )}

      {/* Discount Override Manager PIN */}
      {showDiscountOverridePin && (
        <ManagerPinDialog
          permissionKey="pos.discount_override"
          onSuccess={() => {
            setDiscountOverrideGranted(true);
            setShowDiscountOverridePin(false);
            setShowDiscountForm(true);
          }}
          onCancel={() => setShowDiscountOverridePin(false)}
        />
      )}

      {/* Vehicle Type Change Confirmation */}
      {pendingVehicleChange && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-sm rounded-xl bg-white dark:bg-gray-900 p-6 shadow-2xl dark:shadow-gray-950/60">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Change vehicle type?
            </h3>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              Changing vehicle type will clear all services from this quote. Products will be kept.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setPendingVehicleChange(null)}
                className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmVehicleChange}
                className="flex-1 rounded-lg bg-amber-500 dark:bg-amber-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-amber-600 dark:hover:bg-amber-500"
              >
                Clear Services
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Phase Mobile-1.1: save-to-customer prompt (LOCKED-6 Context A) */}
      {saveAddressAction && (
        <SaveAddressDialog
          open={!!saveAddressAction}
          onClose={handleSaveAddressDialogClose}
          customerId={saveAddressAction.customer_id}
          currentProfileAddress={saveAddressAction.current_profile_address}
          enteredAddress={saveAddressAction.entered_address}
        />
      )}

      {/* G4 — Customer Type Prompt (parity with ticket-panel.tsx:738-750). Shown
          when a selected/created customer has no customer_type. On dismiss
          (classify or skip) the quote flow continues to the vehicle selector.
          onTypeSelected reuses handleCustomerTypeChanged (the #119 pill handler)
          to sync the quote's local customer after the prompt PATCHes the record. */}
      {quote.customer && (
        <CustomerTypePrompt
          open={showTypePrompt}
          onOpenChange={(open) => {
            setShowTypePrompt(open);
            if (!open) setShowVehicleSelector(true);
          }}
          customerId={quote.customer.id}
          customerName={`${quote.customer.first_name} ${quote.customer.last_name}`}
          onTypeSelected={handleCustomerTypeChanged}
        />
      )}
    </div>
  );
}
