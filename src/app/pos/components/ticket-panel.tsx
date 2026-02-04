'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogContent,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tag, X } from 'lucide-react';
import { usePosAuth } from '../context/pos-auth-context';
import { useTicket } from '../context/ticket-context';
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
import type { Customer, Vehicle, CustomerType } from '@/lib/supabase/types';

interface TicketPanelProps {
  customerLookupOpen: boolean;
  onCustomerLookupChange: (open: boolean) => void;
}

export function TicketPanel({ customerLookupOpen, onCustomerLookupChange }: TicketPanelProps) {
  const { role } = usePosAuth();
  const isManager = role === 'super_admin' || role === 'admin';
  const { ticket, dispatch } = useTicket();
  const { services } = useCatalog();
  const [showCustomerCreate, setShowCustomerCreate] = useState(false);
  const [showVehicleSelector, setShowVehicleSelector] = useState(false);
  const [showVehicleCreate, setShowVehicleCreate] = useState(false);
  const [showDiscountForm, setShowDiscountForm] = useState(false);
  const [showTypePrompt, setShowTypePrompt] = useState(false);
  const [discountType, setDiscountType] = useState<'dollar' | 'percent'>('dollar');
  const [discountValue, setDiscountValue] = useState('');
  const [discountLabel, setDiscountLabel] = useState('');

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
    <div className="flex h-full flex-col border-l border-gray-200 bg-white">
      {/* Customer / Vehicle summary */}
      <div className="border-b border-gray-100 px-4 py-2">
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
      <div className="border-b border-gray-200 px-4 py-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
          Ticket
        </h2>
      </div>

      {/* Items list */}
      <div className="flex-1 overflow-y-auto px-4">
        {ticket.items.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-gray-400">
            Tap items to add to ticket
          </div>
        ) : (
          <div className="py-2">
            {ticket.items.map((item) => (
              <TicketItemRow key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>

      {/* Coupon + Loyalty + Discount */}
      {ticket.items.length > 0 && (
        <div className="space-y-2 border-t border-gray-100 px-4 py-2">
          <CouponInput />
          <LoyaltyPanel />

          {/* Manual Discount — manager only */}
          {isManager && (
            <>
              {ticket.manualDiscount ? (
                <div className="flex items-center justify-between rounded-md bg-red-50 px-3 py-1.5">
                  <div className="flex items-center gap-1.5 text-sm text-red-700">
                    <Tag className="h-3.5 w-3.5" />
                    <span className="font-medium">
                      {ticket.manualDiscount.label || 'Discount'}
                    </span>
                    <span className="text-red-600">
                      {ticket.manualDiscount.type === 'percent'
                        ? `${ticket.manualDiscount.value}%`
                        : `-$${ticket.manualDiscount.value.toFixed(2)}`}
                    </span>
                  </div>
                  <button
                    onClick={handleRemoveDiscount}
                    className="rounded p-0.5 text-red-500 hover:bg-red-100 hover:text-red-700"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : showDiscountForm ? (
                <div className="space-y-2 rounded-md border border-gray-200 bg-gray-50 p-3">
                  {/* Toggle: Dollar / Percent */}
                  <div className="flex gap-1">
                    <button
                      onClick={() => setDiscountType('dollar')}
                      className={`flex-1 rounded px-2 py-1 text-xs font-medium transition-colors ${
                        discountType === 'dollar'
                          ? 'bg-gray-900 text-white'
                          : 'bg-white text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      Dollar ($)
                    </button>
                    <button
                      onClick={() => setDiscountType('percent')}
                      className={`flex-1 rounded px-2 py-1 text-xs font-medium transition-colors ${
                        discountType === 'percent'
                          ? 'bg-gray-900 text-white'
                          : 'bg-white text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      Percent (%)
                    </button>
                  </div>

                  {/* Value input */}
                  <Input
                    type="number"
                    min="0"
                    max={discountType === 'percent' ? '100' : undefined}
                    step="0.01"
                    value={discountValue}
                    onChange={(e) => setDiscountValue(e.target.value)}
                    placeholder={discountType === 'dollar' ? 'Amount ($)' : 'Percentage (%)'}
                    className="h-8 text-xs"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleApplyDiscount();
                    }}
                  />

                  {/* Label input */}
                  <Input
                    value={discountLabel}
                    onChange={(e) => setDiscountLabel(e.target.value)}
                    placeholder="Reason (e.g., Employee discount)"
                    className="h-8 text-xs"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleApplyDiscount();
                    }}
                  />

                  {/* Actions */}
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setShowDiscountForm(false);
                        setDiscountValue('');
                        setDiscountLabel('');
                      }}
                      className="h-8 flex-1 text-xs"
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleApplyDiscount}
                      disabled={!discountValue.trim()}
                      className="h-8 flex-1 text-xs"
                    >
                      Apply
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowDiscountForm(true)}
                  className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700"
                >
                  <Tag className="h-3 w-3" />
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
          <TicketActions />
        </div>
      </div>

      {/* Customer Lookup Dialog */}
      <Dialog open={customerLookupOpen} onOpenChange={onCustomerLookupChange}>
        <DialogClose onClose={() => onCustomerLookupChange(false)} />
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
          <DialogClose onClose={() => setShowVehicleSelector(false)} />
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
