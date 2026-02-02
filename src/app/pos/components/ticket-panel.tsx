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
import type { Customer, Vehicle } from '@/lib/supabase/types';

export function TicketPanel() {
  const { ticket, dispatch } = useTicket();
  const { services } = useCatalog();

  // Dialog state
  const [showCustomerLookup, setShowCustomerLookup] = useState(false);
  const [showCustomerCreate, setShowCustomerCreate] = useState(false);
  const [showVehicleSelector, setShowVehicleSelector] = useState(false);
  const [showVehicleCreate, setShowVehicleCreate] = useState(false);

  function handleSelectCustomer(customer: Customer) {
    dispatch({ type: 'SET_CUSTOMER', customer });
    setShowCustomerLookup(false);
    // Open vehicle selector for the new customer
    setShowVehicleSelector(true);
  }

  function handleGuestCheckout() {
    dispatch({ type: 'SET_CUSTOMER', customer: null });
    dispatch({ type: 'SET_VEHICLE', vehicle: null });
    setShowCustomerLookup(false);
  }

  function handleCustomerCreated(customer: Customer) {
    dispatch({ type: 'SET_CUSTOMER', customer });
    setShowCustomerCreate(false);
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

  return (
    <div className="flex h-full flex-col border-l border-gray-200 bg-white">
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

      {/* Customer / Vehicle summary */}
      <div className="border-t border-gray-100 px-4 py-2">
        <CustomerVehicleSummary
          customer={ticket.customer}
          vehicle={ticket.vehicle}
          onChangeCustomer={() => setShowCustomerLookup(true)}
          onChangeVehicle={() => {
            if (ticket.customer) {
              setShowVehicleSelector(true);
            } else {
              setShowCustomerLookup(true);
            }
          }}
          onClear={handleClearCustomer}
        />
      </div>

      {/* Coupon + Loyalty */}
      {ticket.items.length > 0 && (
        <div className="space-y-2 border-t border-gray-100 px-4 py-2">
          <CouponInput />
          <LoyaltyPanel />
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
      <Dialog open={showCustomerLookup} onOpenChange={setShowCustomerLookup}>
        <DialogClose onClose={() => setShowCustomerLookup(false)} />
        <DialogHeader>
          <DialogTitle>Find Customer</DialogTitle>
        </DialogHeader>
        <DialogContent>
          <CustomerLookup
            onSelect={handleSelectCustomer}
            onGuest={handleGuestCheckout}
            onCreateNew={() => {
              setShowCustomerLookup(false);
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
    </div>
  );
}
