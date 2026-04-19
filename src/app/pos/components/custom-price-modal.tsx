'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogContent,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { formatCurrency } from '@/lib/utils/format';
import { cleanVehicleDescription } from '@/lib/utils/vehicle-helpers';
import { resolveServicePrice } from '../utils/pricing';
import type { Vehicle, Service, ServicePricing, VehicleSizeClass } from '@/lib/supabase/types';

const REASON_OPTIONS = [
  { value: '', label: 'Select reason (optional)' },
  { value: 'Exotic surcharge', label: 'Exotic surcharge' },
  { value: 'Classic paint care', label: 'Classic paint care' },
  { value: 'Customer-agreed pricing', label: 'Customer-agreed pricing' },
  { value: 'Other', label: 'Other' },
];

interface CustomPriceModalProps {
  open: boolean;
  vehicle: Vehicle | null;
  service: (Service & { pricing?: ServicePricing[] }) | null;
  pricing: ServicePricing | null;
  vehicleSizeClass: VehicleSizeClass | null;
  onConfirm: (price: number, note: string | null) => void;
  onCancel: () => void;
}

export function CustomPriceModal({
  open,
  vehicle,
  service,
  pricing,
  vehicleSizeClass,
  onConfirm,
  onCancel,
}: CustomPriceModalProps) {
  const [price, setPrice] = useState<string>('');
  const [reason, setReason] = useState('');
  const [otherReason, setOtherReason] = useState('');
  const [showBelowCatalogConfirm, setShowBelowCatalogConfirm] = useState(false);

  // Compute catalog price for reference (sedan/truck/van based on vehicle size_class)
  const catalogPrice = pricing ? resolveServicePrice(pricing, vehicleSizeClass) : 0;

  // Look up exotic/classic tier prices from service_pricing rows
  const isExotic = vehicle?.is_exotic ?? false;
  const isClassic = vehicle?.is_classic ?? false;
  const isDualFlag = isExotic && isClassic;

  const exoticTier = service?.pricing?.find(p => p.tier_name === 'exotic');
  const classicTier = service?.pricing?.find(p => p.tier_name === 'classic');
  const exoticPrice = exoticTier && exoticTier.price > 0 ? exoticTier.price : null;
  const classicPrice = classicTier && classicTier.price > 0 ? classicTier.price : null;

  // Build reference label and prefill
  let referenceLabel: string;
  let prefillPrice: number | null = null;

  if (isDualFlag) {
    // Dual-flag: show both tier prices as reference, input always empty
    const exoticRef = exoticPrice != null ? formatCurrency(exoticPrice) : 'not set';
    const classicRef = classicPrice != null ? formatCurrency(classicPrice) : 'not set';
    referenceLabel = `Exotic tier: ${exoticRef} · Classic tier: ${classicRef} (reference only)`;
  } else if (isExotic && exoticPrice != null) {
    referenceLabel = `Exotic tier: ${formatCurrency(exoticPrice)}`;
    prefillPrice = exoticPrice;
  } else if (isClassic && classicPrice != null) {
    referenceLabel = `Classic tier: ${formatCurrency(classicPrice)}`;
    prefillPrice = classicPrice;
  } else {
    // Single-flag, tier missing — show catalog equivalent as reference
    const tierWord = isExotic ? 'exotic' : 'classic';
    referenceLabel = `Reference price: ${formatCurrency(catalogPrice)} (no ${tierWord} tier set)`;
  }

  // Reset state when modal opens with new service
  useEffect(() => {
    if (open) {
      setPrice(prefillPrice != null ? prefillPrice.toFixed(2) : '');
      setReason('');
      setOtherReason('');
      setShowBelowCatalogConfirm(false);
    }
  }, [open, prefillPrice]);

  const parsedPrice = parseFloat(price);
  const isValidPrice = !isNaN(parsedPrice) && parsedPrice > 0;

  function handleSubmit() {
    if (!isValidPrice) return;

    // Warn if below catalog price
    if (parsedPrice < catalogPrice) {
      setShowBelowCatalogConfirm(true);
      return;
    }

    doConfirm();
  }

  function doConfirm() {
    const note = reason === 'Other'
      ? (otherReason.trim() || 'Other')
      : (reason || null);
    onConfirm(parsedPrice, note);
  }

  const vehicleDesc = vehicle
    ? cleanVehicleDescription({ year: vehicle.year, make: vehicle.make, model: vehicle.model })
    : '';

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
        <DialogContent className="max-w-md dark:bg-gray-900 dark:border-gray-700">
          <DialogHeader>
            <DialogTitle>Custom pricing required</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Vehicle + service info */}
            <div className="space-y-1">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {vehicleDesc}
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {service?.name}
              </p>
            </div>

            {/* Reference price */}
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {referenceLabel}
            </p>

            {/* Price input */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Price
              </label>
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="$0.00"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="text-base sm:text-sm"
                autoFocus
              />
            </div>

            {/* Reason dropdown */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Reason (optional)
              </label>
              <Select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              >
                {REASON_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>
              {reason === 'Other' && (
                <Input
                  type="text"
                  placeholder="Describe reason..."
                  value={otherReason}
                  onChange={(e) => setOtherReason(e.target.value)}
                  className="mt-2 text-base sm:text-sm"
                />
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={onCancel}>Cancel</Button>
            <Button
              onClick={handleSubmit}
              disabled={!isValidPrice}
            >
              Add to Ticket
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Below-catalog-price confirmation */}
      <ConfirmDialog
        open={showBelowCatalogConfirm}
        onOpenChange={setShowBelowCatalogConfirm}
        title="Below catalog price"
        description={`The entered price (${isValidPrice ? formatCurrency(parsedPrice) : '$0'}) is below the catalog price (${formatCurrency(catalogPrice)}). Continue?`}
        confirmLabel="Yes, continue"
        onConfirm={() => {
          setShowBelowCatalogConfirm(false);
          doConfirm();
        }}
      />
    </>
  );
}
