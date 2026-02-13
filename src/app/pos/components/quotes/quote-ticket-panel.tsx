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
import { Tag, X, CalendarDays, Loader2 } from 'lucide-react';
import { usePosPermission } from '../../context/pos-permission-context';
import { useQuote } from '../../context/quote-context';
import { useCatalog } from '../../hooks/use-catalog';
import { QuoteItemRow } from './quote-item-row';
import { QuoteTotals } from './quote-totals';
import { QuoteCouponInput } from './quote-coupon-input';
import { QuoteLoyaltyPanel } from './quote-loyalty-panel';
import { CustomerVehicleSummary } from '../customer-vehicle-summary';
import { CustomerLookup } from '../customer-lookup';
import { CustomerCreateDialog } from '../customer-create-dialog';
import { VehicleSelector } from '../vehicle-selector';
import { VehicleCreateDialog } from '../vehicle-create-dialog';
import { QuoteSendDialog } from './quote-send-dialog';
import type { Customer, Vehicle } from '@/lib/supabase/types';
import { useRouter } from 'next/navigation';
import { posFetch } from '../../lib/pos-fetch';

interface QuoteTicketPanelProps {
  onSaved: (quoteId: string) => void;
  walkInMode?: boolean;
}

export function QuoteTicketPanel({ onSaved, walkInMode }: QuoteTicketPanelProps) {
  const router = useRouter();
  const { granted: canManualDiscount } = usePosPermission('pos.manual_discounts');
  const { quote, dispatch } = useQuote();
  const { services } = useCatalog();

  const [customerLookupOpen, setCustomerLookupOpen] = useState(false);
  const [showCustomerCreate, setShowCustomerCreate] = useState(false);
  const [showVehicleSelector, setShowVehicleSelector] = useState(false);
  const [showVehicleCreate, setShowVehicleCreate] = useState(false);
  const [showDiscountForm, setShowDiscountForm] = useState(false);
  const [discountType, setDiscountType] = useState<'dollar' | 'percent'>('dollar');
  const [discountValue, setDiscountValue] = useState('');
  const [discountLabel, setDiscountLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [sendDialogOpen, setSendDialogOpen] = useState(false);

  function handleSelectCustomer(customer: Customer) {
    dispatch({ type: 'SET_CUSTOMER', customer });
    setCustomerLookupOpen(false);
    setShowVehicleSelector(true);
  }

  function handleCustomerCreated(customer: Customer) {
    dispatch({ type: 'SET_CUSTOMER', customer });
    setShowCustomerCreate(false);
    setShowVehicleSelector(true);
  }

  function handleSelectVehicle(vehicle: Vehicle) {
    dispatch({ type: 'SET_VEHICLE', vehicle });

    const hasServices = quote.items.some((i) => i.itemType === 'service');
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

  async function handleSaveDraft() {
    if (quote.items.length === 0) {
      toast.error('Add at least one item to the quote');
      return;
    }

    setSaving(true);
    try {
      const items = quote.items.map((item) => ({
        service_id: item.serviceId || null,
        product_id: item.productId || null,
        item_name: item.itemName,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        tier_name: item.tierName || null,
        notes: item.notes || null,
      }));

      if (quote.quoteId) {
        // Update existing quote
        const res = await posFetch(`/api/pos/quotes/${quote.quoteId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customer_id: quote.customer?.id || null,
            vehicle_id: quote.vehicle?.id || null,
            notes: quote.notes,
            valid_until: quote.validUntil,
            items,
          }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to update quote');
        }

        toast.success('Quote updated');
        onSaved(quote.quoteId);
      } else {
        // Create new quote
        const res = await posFetch('/api/pos/quotes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customer_id: quote.customer?.id || null,
            vehicle_id: quote.vehicle?.id || null,
            notes: quote.notes,
            valid_until: quote.validUntil,
            items,
          }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to create quote');
        }

        const data = await res.json();
        toast.success(`Quote ${data.quote.quote_number} created`);
        dispatch({ type: 'CLEAR_QUOTE' });
        onSaved(data.quote.id);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save quote');
    } finally {
      setSaving(false);
    }
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

    // Save first if not yet saved
    if (!quote.quoteId) {
      setSaving(true);
      try {
        const items = quote.items.map((item) => ({
          service_id: item.serviceId || null,
          product_id: item.productId || null,
          item_name: item.itemName,
          quantity: item.quantity,
          unit_price: item.unitPrice,
          tier_name: item.tierName || null,
          notes: item.notes || null,
        }));

        const res = await posFetch('/api/pos/quotes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customer_id: quote.customer.id,
            vehicle_id: quote.vehicle?.id || null,
            notes: quote.notes,
            valid_until: quote.validUntil,
            items,
          }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to create quote');
        }

        const data = await res.json();
        // Update state with the new quote ID
        dispatch({
          type: 'LOAD_QUOTE',
          state: {
            ...quote,
            quoteId: data.quote.id,
            quoteNumber: data.quote.quote_number,
            status: 'draft',
          },
        });

        // Now open the send dialog
        setSendDialogOpen(true);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to save quote');
      } finally {
        setSaving(false);
      }
    } else {
      // Already saved — also save any pending changes before sending
      setSaving(true);
      try {
        const items = quote.items.map((item) => ({
          service_id: item.serviceId || null,
          product_id: item.productId || null,
          item_name: item.itemName,
          quantity: item.quantity,
          unit_price: item.unitPrice,
          tier_name: item.tierName || null,
          notes: item.notes || null,
        }));

        const res = await posFetch(`/api/pos/quotes/${quote.quoteId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customer_id: quote.customer.id,
            vehicle_id: quote.vehicle?.id || null,
            notes: quote.notes,
            valid_until: quote.validUntil,
            items,
          }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to update quote');
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to save quote');
        setSaving(false);
        return;
      }
      setSaving(false);
      setSendDialogOpen(true);
    }
  }

  function handleSendComplete() {
    setSendDialogOpen(false);
    if (quote.quoteId) {
      dispatch({ type: 'CLEAR_QUOTE' });
      onSaved(quote.quoteId);
    }
  }

  async function handleCreateJob() {
    // Validate: customer required for walk-in jobs
    if (!quote.customer) {
      toast.error('Select a customer before creating a job');
      return;
    }

    // Validate: at least one service item
    const serviceItems = quote.items.filter((i) => i.itemType === 'service');
    if (serviceItems.length === 0) {
      toast.error('Add at least one service to create a job');
      return;
    }

    setSaving(true);
    try {
      // Step 1: Save the quote as 'converted' for audit trail
      const items = quote.items.map((item) => ({
        service_id: item.serviceId || null,
        product_id: item.productId || null,
        item_name: item.itemName,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        tier_name: item.tierName || null,
        notes: item.notes || null,
      }));

      let savedQuoteId = quote.quoteId;

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
            items,
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
            items,
          }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to save quote');
        }
        const data = await res.json();
        savedQuoteId = data.quote.id;
      }

      // Step 2: Map quote items to job services
      const jobServices = serviceItems.map((item) => ({
        id: item.serviceId,
        name: item.itemName,
        price: item.totalPrice,
        quantity: item.quantity,
        tier_name: item.tierName,
      }));

      // Step 3: Build notes with coupon info
      let jobNotes = quote.notes || '';
      if (quote.coupon) {
        const couponNote = `Coupon: ${quote.coupon.code}`;
        jobNotes = jobNotes ? `${jobNotes}\n${couponNote}` : couponNote;
      }

      // Step 4: Create the job
      const jobRes = await posFetch('/api/pos/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: quote.customer.id,
          vehicle_id: quote.vehicle?.id || null,
          services: jobServices,
          quote_id: savedQuoteId,
          notes: jobNotes || undefined,
        }),
      });

      if (!jobRes.ok) {
        const data = await jobRes.json();
        throw new Error(data.error || 'Failed to create job');
      }

      const { data: job } = await jobRes.json();

      // Step 5: Notify about products
      const productItems = quote.items.filter((i) => i.itemType === 'product');
      if (productItems.length > 0) {
        toast.info('Products will be added at checkout', { duration: 4000 });
      }

      toast.success(`Walk-in job created for ${quote.customer.first_name} ${quote.customer.last_name}`);
      dispatch({ type: 'CLEAR_QUOTE' });

      // Step 6: Navigate to jobs tab
      router.push('/pos/jobs');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create job');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex h-full flex-col border-l border-gray-200 bg-white">
      {/* Customer / Vehicle summary */}
      <div className="border-b border-gray-100 px-4 py-2">
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
        />
      </div>

      {/* Header */}
      <div className="border-b border-gray-200 px-4 py-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
          {walkInMode
            ? 'Walk-In Job'
            : `Quote ${quote.quoteNumber ? `#${quote.quoteNumber}` : '(New)'}`}
        </h2>
      </div>

      {/* Items list */}
      <div className="flex-1 overflow-y-auto px-4">
        {quote.items.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-gray-400">
            Browse catalog to add items
          </div>
        ) : (
          <div className="py-2">
            {quote.items.map((item) => (
              <QuoteItemRow key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>

      {/* Coupon + Loyalty + Discount */}
      {quote.items.length > 0 && (
        <div className="space-y-2 border-t border-gray-100 px-4 py-2">
          <QuoteCouponInput />
          <QuoteLoyaltyPanel />

          {/* Manual Discount — permission gated */}
          {canManualDiscount && (
            <>
              {quote.manualDiscount ? (
                <div className="flex items-center justify-between rounded-md bg-red-50 px-3 py-1.5">
                  <div className="flex items-center gap-1.5 text-sm text-red-700">
                    <Tag className="h-3.5 w-3.5" />
                    <span className="font-medium">
                      {quote.manualDiscount.label || 'Discount'}
                    </span>
                    <span className="text-red-600">
                      {quote.manualDiscount.type === 'percent'
                        ? `${quote.manualDiscount.value}%`
                        : `-$${quote.manualDiscount.value.toFixed(2)}`}
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
                  <Input
                    value={discountLabel}
                    onChange={(e) => setDiscountLabel(e.target.value)}
                    placeholder="Reason (e.g., Employee discount)"
                    className="h-8 text-xs"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleApplyDiscount();
                    }}
                  />
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

      {/* Valid Until — hidden in walk-in mode */}
      {!walkInMode && (
        <div className="border-t border-gray-100 px-4 py-2">
          <label className="flex items-center gap-1.5 text-xs text-gray-500">
            <CalendarDays className="h-3 w-3" />
            Valid Until
          </label>
          <input
            type="date"
            value={quote.validUntil || ''}
            onChange={(e) => dispatch({ type: 'SET_VALID_UNTIL', date: e.target.value || null })}
            className="mt-1 h-8 w-full rounded border border-gray-200 px-2 text-sm text-gray-700 outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-200"
          />
        </div>
      )}

      {/* Notes */}
      <div className="border-t border-gray-100 px-4 py-2">
        <label className="text-xs text-gray-500">Internal Notes</label>
        <textarea
          value={quote.notes || ''}
          onChange={(e) => dispatch({ type: 'SET_NOTES', notes: e.target.value || null })}
          placeholder="Notes for internal use..."
          rows={2}
          className="mt-1 w-full resize-none rounded border border-gray-200 px-2 py-1.5 text-sm text-gray-700 placeholder-gray-400 outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-200"
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

      {/* Customer Lookup Dialog */}
      <Dialog open={customerLookupOpen} onOpenChange={setCustomerLookupOpen}>
        <DialogClose onClose={() => setCustomerLookupOpen(false)} />
        <DialogHeader>
          <DialogTitle>Find Customer</DialogTitle>
        </DialogHeader>
        <DialogContent>
          <CustomerLookup
            onSelect={handleSelectCustomer}
            onGuest={() => setCustomerLookupOpen(false)}
            onCreateNew={() => {
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
      />

      {/* Vehicle Selector Dialog */}
      {quote.customer && (
        <Dialog
          open={showVehicleSelector}
          onOpenChange={setShowVehicleSelector}
        >
          <DialogClose onClose={() => setShowVehicleSelector(false)} />
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

      {/* Vehicle Create Dialog */}
      {quote.customer && (
        <VehicleCreateDialog
          open={showVehicleCreate}
          onClose={() => setShowVehicleCreate(false)}
          customerId={quote.customer.id}
          onCreated={handleVehicleCreated}
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
    </div>
  );
}
