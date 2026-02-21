'use client';

import { useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogContent,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tag, X } from 'lucide-react';
import { usePosPermission } from '../context/pos-permission-context';
import { useTicket } from '../context/ticket-context';
import { useCheckout } from '../context/checkout-context';
import { useCatalog } from '../hooks/use-catalog';
import { TicketItemRow } from './ticket-item-row';
import { TicketTotals } from './ticket-totals';
import { TicketActions } from './ticket-actions';
import { CustomerVehicleSummary } from './customer-vehicle-summary';
import { CustomerLookup } from './customer-lookup';
import { CustomerCreateDialog } from './customer-create-dialog';
import { VehicleSelector } from './vehicle-selector';
import { VehicleCreateDialog } from './vehicle-create-dialog';
import { CouponInput } from './coupon-input';
import { LoyaltyPanel } from './loyalty-panel';
import { CustomerTypePrompt } from './customer-type-prompt';
import { AddonSuggestions } from './addon-suggestions';
import {
  SwipeableCartItem,
  SwipeableCartList,
  SwipeableCartItemWrapper,
} from './swipeable-cart-item';
import type { TicketItem } from '../types';
import type { Customer, Vehicle, CustomerType } from '@/lib/supabase/types';

interface TicketPanelProps {
  customerLookupOpen: boolean;
  onCustomerLookupChange: (open: boolean) => void;
}

export function TicketPanel({ customerLookupOpen, onCustomerLookupChange }: TicketPanelProps) {
  const { granted: canManualDiscount } = usePosPermission('pos.manual_discounts');
  const { ticket, dispatch } = useTicket();
  const { isOpen: checkoutOpen } = useCheckout();
  const { services } = useCatalog();
  const [showCustomerCreate, setShowCustomerCreate] = useState(false);
  const [showVehicleSelector, setShowVehicleSelector] = useState(false);
  const [showVehicleCreate, setShowVehicleCreate] = useState(false);
  const [showDiscountForm, setShowDiscountForm] = useState(false);
  const [showTypePrompt, setShowTypePrompt] = useState(false);
  const [discountType, setDiscountType] = useState<'dollar' | 'percent'>('dollar');
  const [discountValue, setDiscountValue] = useState('');
  const [discountLabel, setDiscountLabel] = useState('');

  // Swipe-to-delete undo state
  const undoTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pendingUndoRef = useRef<{ item: TicketItem; index: number } | null>(null);

  const handleSwipeRemove = useCallback(
    (itemId: string) => {
      // Find item + index before removing
      const index = ticket.items.findIndex((i) => i.id === itemId);
      if (index === -1) return;
      const item = ticket.items[index];

      // Store for undo
      pendingUndoRef.current = { item, index };

      // Remove from ticket
      dispatch({ type: 'REMOVE_ITEM', itemId });

      // Clear any existing undo timer
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);

      // Show undo toast
      toast(`${item.itemName} removed`, {
        action: {
          label: 'Undo',
          onClick: () => {
            if (pendingUndoRef.current?.item.id === itemId) {
              dispatch({
                type: 'RESTORE_ITEM',
                item: pendingUndoRef.current.item,
                index: pendingUndoRef.current.index,
              });
              pendingUndoRef.current = null;
            }
          },
        },
        duration: 5000,
        onAutoClose: () => {
          if (pendingUndoRef.current?.item.id === itemId) {
            pendingUndoRef.current = null;
          }
        },
        onDismiss: () => {
          if (pendingUndoRef.current?.item.id === itemId) {
            pendingUndoRef.current = null;
          }
        },
      });
    },
    [ticket.items, dispatch]
  );

  const handleSwipeUndo = useCallback((_itemId: string) => {
    // Undo is handled via the toast action
  }, []);

  function handleSelectCustomer(customer: Customer) {
    dispatch({ type: 'SET_CUSTOMER', customer });
    onCustomerLookupChange(false);
    // Prompt for customer type if unknown
    if (!customer.customer_type) {
      setShowTypePrompt(true);
    }
    // Open vehicle selector for the new customer
    setShowVehicleSelector(true);
  }

  function handleGuestCheckout() {
    dispatch({ type: 'SET_CUSTOMER', customer: null });
    dispatch({ type: 'SET_VEHICLE', vehicle: null });
    onCustomerLookupChange(false);
  }

  function handleCustomerCreated(customer: Customer) {
    dispatch({ type: 'SET_CUSTOMER', customer });
    setShowCustomerCreate(false);
    // Prompt for customer type if unknown
    if (!customer.customer_type) {
      setShowTypePrompt(true);
    }
    // Open vehicle selector for newly created customer
    setShowVehicleSelector(true);
  }

  function handleSelectVehicle(vehicle: Vehicle) {
    dispatch({ type: 'SET_VEHICLE', vehicle });

    // Recalculate service prices if ticket has service items
    const hasServices = ticket.items.some((i) => i.itemType === 'service');
    if (hasServices) {
      dispatch({
        type: 'RECALCULATE_VEHICLE_PRICES',
        vehicle,
        services,
      });
      toast.info('Service prices updated for vehicle size');
    }

    setShowVehicleSelector(false);
  }

  function handleVehicleCreated(vehicle: Vehicle) {
    handleSelectVehicle(vehicle);
    setShowVehicleCreate(false);
  }

  function handleClearCustomer() {
    dispatch({ type: 'SET_CUSTOMER', customer: null });
    dispatch({ type: 'SET_VEHICLE', vehicle: null });
  }

  function handleCustomerTypeChanged(newType: CustomerType | null) {
    if (ticket.customer) {
      dispatch({ type: 'SET_CUSTOMER', customer: { ...ticket.customer, customer_type: newType } });
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

  return (
    <div className="flex h-full flex-col overflow-hidden border-l border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
      {/* Customer / Vehicle summary */}
      <div className="shrink-0 border-b border-gray-100 dark:border-gray-800 px-4 py-2">
        <CustomerVehicleSummary
          customer={ticket.customer}
          vehicle={ticket.vehicle}
          onChangeCustomer={() => onCustomerLookupChange(true)}
          onChangeVehicle={() => {
            if (ticket.customer) {
              setShowVehicleSelector(true);
            } else {
              onCustomerLookupChange(true);
            }
          }}
          onClear={handleClearCustomer}
          onCustomerTypeChanged={handleCustomerTypeChanged}
        />
      </div>

      {/* Header */}
      <div className="shrink-0 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Ticket
        </h2>
      </div>

      {/* Items list */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4">
        {ticket.items.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-gray-400 dark:text-gray-500">
            Tap items to add to ticket
          </div>
        ) : (
          <div className="py-2">
            <SwipeableCartList>
              {ticket.items.map((item) => (
                <SwipeableCartItemWrapper key={item.id} itemId={item.id}>
                  <SwipeableCartItem
                    itemId={item.id}
                    itemName={item.itemName}
                    disabled={checkoutOpen}
                    onRemove={handleSwipeRemove}
                    onUndo={handleSwipeUndo}
                  >
                    <TicketItemRow item={item} />
                  </SwipeableCartItem>
                </SwipeableCartItemWrapper>
              ))}
            </SwipeableCartList>
          </div>
        )}
      </div>

      {/* Add-on Suggestions */}
      {ticket.items.some((i) => i.itemType === 'service') && (
        <div className="shrink-0">
          <AddonSuggestions />
        </div>
      )}

      {/* Coupon + Loyalty + Discount */}
      {ticket.items.length > 0 && (
        <div className="shrink-0 space-y-2 border-t border-gray-100 dark:border-gray-800 px-4 py-2">
          <CouponInput />
          <LoyaltyPanel />

          {/* Manual Discount — permission gated */}
          {canManualDiscount && (
            <>
              {ticket.manualDiscount ? (
                <div className="flex items-center justify-between rounded-md bg-red-50 dark:bg-red-900/30 px-3 py-1.5">
                  <div className="flex items-center gap-1.5 text-sm text-red-700 dark:text-red-400">
                    <Tag className="h-3.5 w-3.5" />
                    <span className="font-medium">
                      {ticket.manualDiscount.label || 'Discount'}
                    </span>
                    <span className="text-red-600 dark:text-red-400">
                      {ticket.manualDiscount.type === 'percent'
                        ? `${ticket.manualDiscount.value}%`
                        : `-$${ticket.manualDiscount.value.toFixed(2)}`}
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
                  {/* Toggle: Dollar / Percent */}
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

                  {/* Value input */}
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

                  {/* Label input */}
                  <Input
                    value={discountLabel}
                    onChange={(e) => setDiscountLabel(e.target.value)}
                    placeholder="Reason (e.g., Employee discount)"
                    className="min-h-[44px] text-sm"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleApplyDiscount();
                    }}
                  />

                  {/* Actions */}
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
                  onClick={() => setShowDiscountForm(true)}
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

      {/* Totals + Actions */}
      <div className="shrink-0 px-4 pb-4">
        <TicketTotals />
        <div className="mt-3">
          <TicketActions
            onRequireVehicle={() => {
              if (ticket.customer) {
                setShowVehicleSelector(true);
              }
            }}
          />
        </div>
      </div>

      {/* Customer Lookup Dialog */}
      <Dialog open={customerLookupOpen} onOpenChange={onCustomerLookupChange}>
        <DialogHeader>
          <DialogTitle>Find Customer</DialogTitle>
        </DialogHeader>
        <DialogContent>
          <CustomerLookup
            onSelect={handleSelectCustomer}
            onGuest={handleGuestCheckout}
            onCreateNew={() => {
              onCustomerLookupChange(false);
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
          onCustomerLookupChange(true);
        }}
      />

      {/* Vehicle Selector Dialog */}
      {ticket.customer && (
        <Dialog
          open={showVehicleSelector}
          onOpenChange={setShowVehicleSelector}
        >
          <DialogHeader>
            <DialogTitle>
              Select Vehicle — {ticket.customer.first_name}{' '}
              {ticket.customer.last_name}
            </DialogTitle>
          </DialogHeader>
          <DialogContent>
            <VehicleSelector
              customerId={ticket.customer.id}
              selectedVehicleId={ticket.vehicle?.id ?? null}
              onSelect={handleSelectVehicle}
              onAddNew={() => {
                setShowVehicleSelector(false);
                setShowVehicleCreate(true);
              }}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Vehicle Create Dialog */}
      {ticket.customer && (
        <VehicleCreateDialog
          open={showVehicleCreate}
          onClose={() => setShowVehicleCreate(false)}
          customerId={ticket.customer.id}
          onCreated={handleVehicleCreated}
        />
      )}

      {/* Customer Type Prompt — shown when customer type is unknown */}
      {ticket.customer && (
        <CustomerTypePrompt
          open={showTypePrompt}
          onOpenChange={setShowTypePrompt}
          customerId={ticket.customer.id}
          customerName={`${ticket.customer.first_name} ${ticket.customer.last_name}`}
          onTypeSelected={(newType) => {
            if (newType && ticket.customer) {
              dispatch({ type: 'SET_CUSTOMER', customer: { ...ticket.customer, customer_type: newType } });
            }
          }}
        />
      )}
    </div>
  );
}
