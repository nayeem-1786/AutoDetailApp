'use client';

import { useCallback } from 'react';
import type { PricingModel } from '@/lib/supabase/types';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Switch } from '@/components/ui/switch';
import { VEHICLE_SIZE_LABELS } from '@/lib/utils/constants';
import { Plus, Trash2, GripVertical } from 'lucide-react';

// ---- Value types for each pricing model ----

export interface VehicleSizePricing {
  sedan: number | '';
  truck_suv_2row: number | '';
  suv_3row_van: number | '';
}

export interface ScopeTier {
  id?: string;
  tier_name: string;
  tier_label: string;
  price: number | '';
  is_vehicle_size_aware: boolean;
  vehicle_size_sedan_price: number | '';
  vehicle_size_truck_suv_price: number | '';
  vehicle_size_suv_van_price: number | '';
}

export interface PerUnitPricing {
  per_unit_price: number | '';
  per_unit_max: number | '';
  per_unit_label: string;
}

export interface SpecialtyTier {
  id?: string;
  tier_name: string;
  tier_label: string;
  price: number | '';
}

export interface FlatPricing {
  flat_price: number | '';
}

export interface CustomPricing {
  custom_starting_price: number | '';
}

export type PricingValue =
  | { model: 'vehicle_size'; data: VehicleSizePricing }
  | { model: 'scope'; data: ScopeTier[] }
  | { model: 'per_unit'; data: PerUnitPricing }
  | { model: 'specialty'; data: SpecialtyTier[] }
  | { model: 'flat'; data: FlatPricing }
  | { model: 'custom'; data: CustomPricing };

// Default values for each pricing model
export function getDefaultPricingValue(model: PricingModel): PricingValue {
  switch (model) {
    case 'vehicle_size':
      return { model: 'vehicle_size', data: { sedan: '', truck_suv_2row: '', suv_3row_van: '' } };
    case 'scope':
      return { model: 'scope', data: [{ tier_name: '', tier_label: '', price: '', is_vehicle_size_aware: false, vehicle_size_sedan_price: '', vehicle_size_truck_suv_price: '', vehicle_size_suv_van_price: '' }] };
    case 'per_unit':
      return { model: 'per_unit', data: { per_unit_price: '', per_unit_max: '', per_unit_label: '' } };
    case 'specialty':
      return { model: 'specialty', data: [{ tier_name: '', tier_label: '', price: '' }] };
    case 'flat':
      return { model: 'flat', data: { flat_price: '' } };
    case 'custom':
      return { model: 'custom', data: { custom_starting_price: '' } };
  }
}

interface ServicePricingFormProps {
  pricingModel: PricingModel;
  value: PricingValue;
  onChange: (value: PricingValue) => void;
}

export function ServicePricingForm({ pricingModel, value, onChange }: ServicePricingFormProps) {
  switch (pricingModel) {
    case 'vehicle_size':
      return <VehicleSizeForm value={value as PricingValue & { model: 'vehicle_size' }} onChange={onChange} />;
    case 'scope':
      return <ScopeForm value={value as PricingValue & { model: 'scope' }} onChange={onChange} />;
    case 'per_unit':
      return <PerUnitForm value={value as PricingValue & { model: 'per_unit' }} onChange={onChange} />;
    case 'specialty':
      return <SpecialtyForm value={value as PricingValue & { model: 'specialty' }} onChange={onChange} />;
    case 'flat':
      return <FlatForm value={value as PricingValue & { model: 'flat' }} onChange={onChange} />;
    case 'custom':
      return <CustomForm value={value as PricingValue & { model: 'custom' }} onChange={onChange} />;
    default:
      return null;
  }
}

// ---- Vehicle Size Pricing ----
function VehicleSizeForm({ value, onChange }: {
  value: PricingValue & { model: 'vehicle_size' };
  onChange: (value: PricingValue) => void;
}) {
  const data = value.data;
  const sizeKeys: (keyof VehicleSizePricing)[] = ['sedan', 'truck_suv_2row', 'suv_3row_van'];

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Set a price for each vehicle size class.
      </p>
      {sizeKeys.map((key) => (
        <FormField key={key} label={VEHICLE_SIZE_LABELS[key]}>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">$</span>
            <Input
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              className="pl-7"
              value={data[key]}
              onChange={(e) => {
                onChange({
                  model: 'vehicle_size',
                  data: { ...data, [key]: e.target.value === '' ? '' : parseFloat(e.target.value) },
                });
              }}
            />
          </div>
        </FormField>
      ))}
    </div>
  );
}

// ---- Scope Pricing (Variable named tiers) ----
function ScopeForm({ value, onChange }: {
  value: PricingValue & { model: 'scope' };
  onChange: (value: PricingValue) => void;
}) {
  const tiers = value.data;

  const updateTier = useCallback((index: number, updates: Partial<ScopeTier>) => {
    const newTiers = tiers.map((t, i) => i === index ? { ...t, ...updates } : t);
    onChange({ model: 'scope', data: newTiers });
  }, [tiers, onChange]);

  const addTier = useCallback(() => {
    onChange({
      model: 'scope',
      data: [...tiers, { tier_name: '', tier_label: '', price: '', is_vehicle_size_aware: false, vehicle_size_sedan_price: '', vehicle_size_truck_suv_price: '', vehicle_size_suv_van_price: '' }],
    });
  }, [tiers, onChange]);

  const removeTier = useCallback((index: number) => {
    onChange({ model: 'scope', data: tiers.filter((_, i) => i !== index) });
  }, [tiers, onChange]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Define named pricing tiers. The last tier can optionally be vehicle-size-aware with separate prices per size.
      </p>
      {tiers.map((tier, index) => (
        <div key={index} className="rounded-lg border border-gray-200 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <GripVertical className="h-4 w-4 text-gray-400" />
              <span className="text-sm font-medium text-gray-700">Tier {index + 1}</span>
            </div>
            {tiers.length > 1 && (
              <Button variant="ghost" size="sm" onClick={() => removeTier(index)}>
                <Trash2 className="h-4 w-4 text-red-500" />
              </Button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Tier Name">
              <Input
                placeholder="e.g., Floor Mats"
                value={tier.tier_name}
                onChange={(e) => updateTier(index, { tier_name: e.target.value })}
              />
            </FormField>
            <FormField label="Display Label">
              <Input
                placeholder="e.g., Floor mats only"
                value={tier.tier_label}
                onChange={(e) => updateTier(index, { tier_label: e.target.value })}
              />
            </FormField>
          </div>
          {!tier.is_vehicle_size_aware && (
            <FormField label="Price">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">$</span>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  className="pl-7"
                  value={tier.price}
                  onChange={(e) => updateTier(index, { price: e.target.value === '' ? '' : parseFloat(e.target.value) })}
                />
              </div>
            </FormField>
          )}
          <div className="flex items-center gap-2">
            <Switch
              checked={tier.is_vehicle_size_aware}
              onCheckedChange={(checked) => updateTier(index, { is_vehicle_size_aware: checked })}
            />
            <span className="text-sm text-gray-600">Vehicle size aware pricing</span>
          </div>
          {tier.is_vehicle_size_aware && (
            <div className="grid grid-cols-3 gap-3 pl-4 border-l-2 border-gray-200">
              <FormField label="Sedan">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">$</span>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    className="pl-7"
                    value={tier.vehicle_size_sedan_price}
                    onChange={(e) => updateTier(index, { vehicle_size_sedan_price: e.target.value === '' ? '' : parseFloat(e.target.value) })}
                  />
                </div>
              </FormField>
              <FormField label="Truck/SUV">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">$</span>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    className="pl-7"
                    value={tier.vehicle_size_truck_suv_price}
                    onChange={(e) => updateTier(index, { vehicle_size_truck_suv_price: e.target.value === '' ? '' : parseFloat(e.target.value) })}
                  />
                </div>
              </FormField>
              <FormField label="SUV 3-Row/Van">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">$</span>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    className="pl-7"
                    value={tier.vehicle_size_suv_van_price}
                    onChange={(e) => updateTier(index, { vehicle_size_suv_van_price: e.target.value === '' ? '' : parseFloat(e.target.value) })}
                  />
                </div>
              </FormField>
            </div>
          )}
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={addTier}>
        <Plus className="h-4 w-4" />
        Add Tier
      </Button>
    </div>
  );
}

// ---- Per Unit Pricing ----
function PerUnitForm({ value, onChange }: {
  value: PricingValue & { model: 'per_unit' };
  onChange: (value: PricingValue) => void;
}) {
  const data = value.data;

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Price per unit with optional maximum. Example: "$150/panel, max 4 panels."
      </p>
      <FormField label="Price Per Unit">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">$</span>
          <Input
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            className="pl-7"
            value={data.per_unit_price}
            onChange={(e) => onChange({
              model: 'per_unit',
              data: { ...data, per_unit_price: e.target.value === '' ? '' : parseFloat(e.target.value) },
            })}
          />
        </div>
      </FormField>
      <FormField label="Max Units" description="Maximum number of units per service">
        <Input
          type="number"
          min="1"
          step="1"
          placeholder="e.g., 4"
          value={data.per_unit_max}
          onChange={(e) => onChange({
            model: 'per_unit',
            data: { ...data, per_unit_max: e.target.value === '' ? '' : parseInt(e.target.value, 10) },
          })}
        />
      </FormField>
      <FormField label="Unit Label" description="What the unit is called">
        <Input
          placeholder="e.g., panel, seat, row"
          value={data.per_unit_label}
          onChange={(e) => onChange({
            model: 'per_unit',
            data: { ...data, per_unit_label: e.target.value },
          })}
        />
      </FormField>
    </div>
  );
}

// ---- Specialty Pricing (Vehicle-type-specific tiers) ----
function SpecialtyForm({ value, onChange }: {
  value: PricingValue & { model: 'specialty' };
  onChange: (value: PricingValue) => void;
}) {
  const tiers = value.data;

  const updateTier = useCallback((index: number, updates: Partial<SpecialtyTier>) => {
    const newTiers = tiers.map((t, i) => i === index ? { ...t, ...updates } : t);
    onChange({ model: 'specialty', data: newTiers });
  }, [tiers, onChange]);

  const addTier = useCallback(() => {
    onChange({
      model: 'specialty',
      data: [...tiers, { tier_name: '', tier_label: '', price: '' }],
    });
  }, [tiers, onChange]);

  const removeTier = useCallback((index: number) => {
    onChange({ model: 'specialty', data: tiers.filter((_, i) => i !== index) });
  }, [tiers, onChange]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Define named pricing tiers for specialty vehicles. Example: Boat Interior with size-based tiers.
      </p>
      {tiers.map((tier, index) => (
        <div key={index} className="rounded-lg border border-gray-200 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <GripVertical className="h-4 w-4 text-gray-400" />
              <span className="text-sm font-medium text-gray-700">Tier {index + 1}</span>
            </div>
            {tiers.length > 1 && (
              <Button variant="ghost" size="sm" onClick={() => removeTier(index)}>
                <Trash2 className="h-4 w-4 text-red-500" />
              </Button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Tier Name">
              <Input
                placeholder="e.g., Up to 20'"
                value={tier.tier_name}
                onChange={(e) => updateTier(index, { tier_name: e.target.value })}
              />
            </FormField>
            <FormField label="Display Label">
              <Input
                placeholder="e.g., Small boats up to 20 ft"
                value={tier.tier_label}
                onChange={(e) => updateTier(index, { tier_label: e.target.value })}
              />
            </FormField>
          </div>
          <FormField label="Price">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">$</span>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                className="pl-7"
                value={tier.price}
                onChange={(e) => updateTier(index, { price: e.target.value === '' ? '' : parseFloat(e.target.value) })}
              />
            </div>
          </FormField>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={addTier}>
        <Plus className="h-4 w-4" />
        Add Tier
      </Button>
    </div>
  );
}

// ---- Flat Price ----
function FlatForm({ value, onChange }: {
  value: PricingValue & { model: 'flat' };
  onChange: (value: PricingValue) => void;
}) {
  const data = value.data;

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Single flat rate, same price regardless of vehicle.
      </p>
      <FormField label="Flat Price">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">$</span>
          <Input
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            className="pl-7"
            value={data.flat_price}
            onChange={(e) => onChange({
              model: 'flat',
              data: { flat_price: e.target.value === '' ? '' : parseFloat(e.target.value) },
            })}
          />
        </div>
      </FormField>
    </div>
  );
}

// ---- Custom Quote ----
function CustomForm({ value, onChange }: {
  value: PricingValue & { model: 'custom' };
  onChange: (value: PricingValue) => void;
}) {
  const data = value.data;

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Display a "starting at" price. Final quote is determined after inspection.
      </p>
      <FormField label="Starting Price" description="Displayed as 'Starting at $X'">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">$</span>
          <Input
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            className="pl-7"
            value={data.custom_starting_price}
            onChange={(e) => onChange({
              model: 'custom',
              data: { custom_starting_price: e.target.value === '' ? '' : parseFloat(e.target.value) },
            })}
          />
        </div>
      </FormField>
    </div>
  );
}
