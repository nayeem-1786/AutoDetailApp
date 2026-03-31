'use client';

import { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils/cn';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { FormField } from '@/components/ui/form-field';
import { Spinner } from '@/components/ui/spinner';
import { VehicleMakeCombobox, getVehicleYearOptions, titleCaseField } from '@/components/ui/vehicle-make-combobox';
import {
  VEHICLE_CATEGORIES,
  VEHICLE_CATEGORY_LABELS,
  SPECIALTY_TIERS,
  isSpecialtyCategory,
  resolveVehicleClassification,
  type VehicleCategory,
  type VehicleClassification,
} from '@/lib/utils/vehicle-categories';
import { VEHICLE_SIZE_LABELS } from '@/lib/utils/constants';
import { createClient } from '@/lib/supabase/client';
import { Car, Bike, Ship, Plane, Truck, Plus, Check } from 'lucide-react';
import type { AuthCustomerData } from './inline-auth';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VehicleSelection {
  id?: string;
  vehicle_category: string;
  vehicle_type: string;
  size_class: string | null;
  specialty_tier: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  color: string | null;
}

interface StepVehicleProps {
  customerData: AuthCustomerData | null;
  onContinue: (vehicle: VehicleSelection) => void;
  initialVehicle?: VehicleSelection | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CATEGORY_ICONS: Record<string, typeof Car> = {
  automobile: Car,
  motorcycle: Bike,
  rv: Truck,
  boat: Ship,
  aircraft: Plane,
};

const yearOptions = getVehicleYearOptions();

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StepVehicle({ customerData, onContinue, initialVehicle }: StepVehicleProps) {
  const vehicles = customerData?.vehicles ?? [];
  const hasVehicles = vehicles.length > 0;

  // Mode: 'saved' (selecting from list) or 'manual' (entering new)
  const [mode, setMode] = useState<'saved' | 'manual'>(
    initialVehicle?.id && hasVehicles ? 'saved' : hasVehicles ? 'saved' : 'manual'
  );

  // Saved vehicle selection
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(
    initialVehicle?.id ?? (hasVehicles ? vehicles[0].id : null)
  );

  // Manual entry form state
  const [category, setCategory] = useState<VehicleCategory>(
    (initialVehicle?.vehicle_category as VehicleCategory) ?? 'automobile'
  );
  const [make, setMake] = useState(initialVehicle?.make ?? '');
  const [model, setModel] = useState(initialVehicle?.model ?? '');
  const [year, setYear] = useState<number | null>(initialVehicle?.year ?? null);
  const [color, setColor] = useState(initialVehicle?.color ?? '');

  // Auto-resolved classification
  const [classification, setClassification] = useState<VehicleClassification | null>(null);
  const [classifying, setClassifying] = useState(false);

  // Manual size class override (for automobiles without make/model)
  const [manualSizeClass, setManualSizeClass] = useState<string | null>(
    initialVehicle?.size_class ?? null
  );

  // Manual specialty tier (for specialty categories without make/model)
  const [manualSpecialtyTier, setManualSpecialtyTier] = useState<string | null>(
    initialVehicle?.specialty_tier ?? null
  );

  // Errors
  const [errors, setErrors] = useState<Record<string, string>>({});

  // --- Auto-classify when make/model changes ---
  const classify = useCallback(async (mk: string, mdl: string, cat: VehicleCategory) => {
    if (!mk.trim()) {
      setClassification(null);
      return;
    }
    setClassifying(true);
    try {
      const supabase = createClient();
      const result = await resolveVehicleClassification(supabase, mk.trim(), mdl.trim() || undefined);
      setClassification(result);
      // Auto-update category if classification disagrees (e.g., Honda motorcycle)
      if (result.vehicle_category !== cat) {
        setCategory(result.vehicle_category);
      }
    } catch {
      setClassification(null);
    } finally {
      setClassifying(false);
    }
  }, []);

  // Debounced classification
  useEffect(() => {
    if (mode !== 'manual' || !make.trim()) {
      setClassification(null);
      return;
    }
    const timer = setTimeout(() => {
      classify(make, model, category);
    }, 400);
    return () => clearTimeout(timer);
  }, [make, model, category, mode, classify]);

  // Reset make/model when category changes manually
  function handleCategoryChange(newCat: VehicleCategory) {
    setCategory(newCat);
    setMake('');
    setModel('');
    setClassification(null);
    setManualSizeClass(null);
    setManualSpecialtyTier(null);
    setErrors({});
  }

  // --- Determine if Continue is enabled ---
  function isValid(): boolean {
    if (mode === 'saved') {
      return !!selectedVehicleId;
    }

    // Manual mode: need category
    if (!category) return false;

    // If no make entered: need size class (auto) or specialty tier (specialty)
    if (!make.trim()) {
      if (category === 'automobile') return !!manualSizeClass;
      if (isSpecialtyCategory(category)) return !!manualSpecialtyTier;
      return false;
    }

    // If make entered but still classifying, wait
    if (classifying) return false;

    return true;
  }

  // --- Build VehicleSelection from current state ---
  function buildSelection(): VehicleSelection | null {
    if (mode === 'saved' && selectedVehicleId) {
      const v = vehicles.find((veh) => veh.id === selectedVehicleId);
      if (!v) return null;
      return {
        id: v.id,
        vehicle_category: v.vehicle_category ?? 'automobile',
        vehicle_type: v.vehicle_type,
        size_class: v.size_class,
        specialty_tier: v.specialty_tier ?? null,
        make: v.make,
        model: v.model,
        year: v.year,
        color: v.color,
      };
    }

    // Manual entry
    const trimmedMake = make.trim();
    const trimmedModel = model.trim();

    if (trimmedMake && classification) {
      // Have classification from make/model
      return {
        vehicle_category: classification.vehicle_category,
        vehicle_type: classification.vehicle_type,
        size_class: classification.size_class,
        specialty_tier: classification.specialty_tier,
        make: trimmedMake,
        model: trimmedModel || null,
        year: year,
        color: color.trim() || null,
      };
    }

    // No make — category-only with manual size/tier
    if (category === 'automobile') {
      return {
        vehicle_category: 'automobile',
        vehicle_type: 'standard',
        size_class: manualSizeClass,
        specialty_tier: null,
        make: null,
        model: null,
        year: null,
        color: null,
      };
    }

    // Specialty category without make
    return {
      vehicle_category: category,
      vehicle_type: category,
      size_class: null,
      specialty_tier: manualSpecialtyTier,
      make: null,
      model: null,
      year: null,
      color: null,
    };
  }

  function handleContinue() {
    const selection = buildSelection();
    if (!selection) return;

    // Validate
    const newErrors: Record<string, string> = {};
    if (mode === 'manual' && !make.trim()) {
      // Category-only: need size class or specialty tier
      if (category === 'automobile' && !manualSizeClass) {
        newErrors.size_class = 'Please select a vehicle size';
      }
      if (isSpecialtyCategory(category) && !manualSpecialtyTier) {
        newErrors.specialty_tier = 'Please select a size/type';
      }
    }
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});
    onContinue(selection);
  }

  // --- Saved Vehicle Cards ---
  function renderSavedVehicles() {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-site-text">Select Your Vehicle</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {vehicles.map((v) => {
            const isSelected = selectedVehicleId === v.id;
            const Icon = CATEGORY_ICONS[v.vehicle_category ?? 'automobile'] ?? Car;
            const label = [v.year, v.color, v.make, v.model].filter(Boolean).join(' ') || 'Unknown Vehicle';
            const catLabel = VEHICLE_CATEGORY_LABELS[(v.vehicle_category ?? 'automobile') as VehicleCategory] ?? 'Automobile';
            const sizeLabel = v.size_class ? VEHICLE_SIZE_LABELS[v.size_class] ?? v.size_class : null;
            const tierLabel = v.specialty_tier ?? null;

            return (
              <button
                key={v.id}
                type="button"
                onClick={() => { setSelectedVehicleId(v.id); setMode('saved'); }}
                className={cn(
                  'relative flex items-start gap-3 rounded-xl border-2 p-4 text-left transition-all',
                  isSelected
                    ? 'border-accent-brand bg-accent-brand/5 shadow-sm'
                    : 'border-site-border bg-brand-card hover:border-accent-brand/40'
                )}
              >
                {isSelected && (
                  <div className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-accent-brand">
                    <Check className="h-3 w-3 text-white" />
                  </div>
                )}
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-surface">
                  <Icon className="h-5 w-5 text-site-text-secondary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-site-text leading-snug">{label}</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <span className="inline-flex items-center rounded-full bg-brand-surface px-2 py-0.5 text-xs font-medium text-site-text-secondary">
                      {catLabel}
                    </span>
                    {sizeLabel && (
                      <span className="inline-flex items-center rounded-full bg-brand-surface px-2 py-0.5 text-xs font-medium text-site-text-secondary">
                        {sizeLabel}
                      </span>
                    )}
                    {tierLabel && (
                      <span className="inline-flex items-center rounded-full bg-brand-surface px-2 py-0.5 text-xs font-medium text-site-text-secondary">
                        {tierLabel}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Add New Vehicle button */}
        <button
          type="button"
          onClick={() => { setMode('manual'); setSelectedVehicleId(null); }}
          className={cn(
            'flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed p-4 text-sm font-medium transition-colors',
            mode === 'manual'
              ? 'border-accent-brand text-accent-brand bg-accent-brand/5'
              : 'border-site-border text-site-text-secondary hover:border-accent-brand/40 hover:text-accent-brand'
          )}
        >
          <Plus className="h-4 w-4" />
          Add a New Vehicle
        </button>

        {mode === 'manual' && renderManualForm()}
      </div>
    );
  }

  // --- Manual Entry Form ---
  function renderManualForm() {
    const isSpecialty = isSpecialtyCategory(category);
    const showSizeClassPicker = category === 'automobile' && !make.trim();
    const showSpecialtyTierPicker = isSpecialty && !make.trim();
    const showClassificationResult = !!make.trim() && classification && !classifying;

    return (
      <div className="space-y-4 rounded-xl border border-site-border bg-brand-card p-4 sm:p-6">
        {!hasVehicles && (
          <h2 className="text-lg font-semibold text-site-text">Vehicle Information</h2>
        )}

        {/* Category selector */}
        <FormField label="Vehicle Category" required>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {VEHICLE_CATEGORIES.map((cat) => {
              const Icon = CATEGORY_ICONS[cat] ?? Car;
              const isSelected = category === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => handleCategoryChange(cat)}
                  className={cn(
                    'flex flex-col items-center gap-1.5 rounded-lg border-2 p-3 text-xs font-medium transition-all',
                    isSelected
                      ? 'border-accent-brand bg-accent-brand/5 text-accent-brand'
                      : 'border-site-border bg-brand-surface text-site-text-secondary hover:border-accent-brand/40'
                  )}
                >
                  <Icon className="h-5 w-5" />
                  {VEHICLE_CATEGORY_LABELS[cat]}
                </button>
              );
            })}
          </div>
        </FormField>

        {/* Make */}
        <FormField label="Make" htmlFor="vehicle-make">
          <VehicleMakeCombobox
            id="vehicle-make"
            value={make}
            onChange={(val) => {
              setMake(val);
              // Reset model when make changes
              if (val !== make) setModel('');
            }}
            category={category}
          />
        </FormField>

        {/* Model */}
        <FormField label="Model" htmlFor="vehicle-model">
          <Input
            id="vehicle-model"
            value={model}
            onChange={(e) => setModel(titleCaseField(e.target.value))}
            placeholder={category === 'automobile' ? 'e.g., Camry' : 'e.g., Sportster'}
            className="text-base sm:text-sm"
          />
        </FormField>

        {/* Year + Color row */}
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Year" htmlFor="vehicle-year">
            <Select
              id="vehicle-year"
              value={year?.toString() ?? ''}
              onChange={(e) => setYear(e.target.value ? parseInt(e.target.value, 10) : null)}
            >
              <option value="">Optional</option>
              {yearOptions.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </Select>
          </FormField>
          <FormField label="Color" htmlFor="vehicle-color">
            <Input
              id="vehicle-color"
              value={color}
              onChange={(e) => setColor(titleCaseField(e.target.value))}
              placeholder="Optional"
              className="text-base sm:text-sm"
            />
          </FormField>
        </div>

        {/* Classification indicator */}
        {classifying && (
          <div className="flex items-center gap-2 text-sm text-site-text-secondary">
            <Spinner className="h-4 w-4" />
            Identifying vehicle...
          </div>
        )}

        {showClassificationResult && (
          <div className="flex items-center gap-2 rounded-lg bg-brand-surface p-3 text-sm">
            <Check className="h-4 w-4 text-green-500 shrink-0" />
            <span className="text-site-text">
              Detected: <strong>{VEHICLE_CATEGORY_LABELS[classification.vehicle_category]}</strong>
              {classification.size_class && (
                <> &middot; {VEHICLE_SIZE_LABELS[classification.size_class] ?? classification.size_class}</>
              )}
              {classification.specialty_tier && (
                <> &middot; {classification.specialty_tier}</>
              )}
            </span>
          </div>
        )}

        {/* Size class picker (automobiles, no make entered) */}
        {showSizeClassPicker && (
          <FormField label="Vehicle Size" required error={errors.size_class}>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(VEHICLE_SIZE_LABELS).map(([key, label]) => {
                const isSelected = manualSizeClass === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => { setManualSizeClass(key); setErrors((prev) => ({ ...prev, size_class: '' })); }}
                    className={cn(
                      'rounded-lg border-2 p-3 text-center text-sm font-medium transition-all',
                      isSelected
                        ? 'border-accent-brand bg-accent-brand/5 text-accent-brand'
                        : 'border-site-border text-site-text-secondary hover:border-accent-brand/40'
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-site-text-muted mt-1">
              Entering your make and model above will auto-detect the size.
            </p>
          </FormField>
        )}

        {/* Specialty tier picker (non-automobile, no make entered) */}
        {showSpecialtyTierPicker && (
          <FormField label="Size / Type" required error={errors.specialty_tier}>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {SPECIALTY_TIERS[category as Exclude<VehicleCategory, 'automobile'>]?.map((tier) => {
                const isSelected = manualSpecialtyTier === tier.key;
                return (
                  <button
                    key={tier.key}
                    type="button"
                    onClick={() => { setManualSpecialtyTier(tier.key); setErrors((prev) => ({ ...prev, specialty_tier: '' })); }}
                    className={cn(
                      'rounded-lg border-2 p-3 text-center text-sm font-medium transition-all',
                      isSelected
                        ? 'border-accent-brand bg-accent-brand/5 text-accent-brand'
                        : 'border-site-border text-site-text-secondary hover:border-accent-brand/40'
                    )}
                  >
                    {tier.label}
                  </button>
                );
              })}
            </div>
          </FormField>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {hasVehicles ? renderSavedVehicles() : renderManualForm()}

      {/* Continue button — sticky on mobile */}
      <div className="sticky bottom-0 z-10 -mx-4 bg-gradient-to-t from-brand-dark via-brand-dark to-transparent px-4 pb-4 pt-6 sm:static sm:mx-0 sm:bg-transparent sm:p-0">
        <Button
          onClick={handleContinue}
          disabled={!isValid()}
          className="w-full bg-accent-brand text-site-text-on-primary hover:bg-accent-brand-hover disabled:opacity-50 disabled:cursor-not-allowed"
          size="lg"
        >
          Continue
        </Button>
      </div>
    </div>
  );
}
