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
  /** Session 29: size_class carries 'exotic' / 'classic' directly — no parallel flags. */
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
      // Auto-update category only when the classifier is high-confidence:
      // the user has typed at least one model character. Without a model the
      // resolver silently defaults to 'automobile' for dual-category makes
      // (`vehicle-categories.ts:302-305`), 0-row lookups (`:691`), and DB
      // errors (`:712-714`) — which would otherwise overwrite the user's
      // explicit RV/motorcycle/boat/aircraft pick. This is the public-booking-
      // flow audit's Y-1 hotfix (PUBLIC_BOOKING_FLOW_AUDIT.md F1, #129) and
      // the C1 corrective from VEHICLE_FORM_UNIFICATION_AUDIT.md.
      if (mdl.trim() && result.vehicle_category !== cat) {
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

  // When auto-classification updates (make/model changed), clear manual overrides
  // so the new detected size takes effect. User can still override afterward.
  useEffect(() => {
    if (classification) {
      setManualSizeClass(null);
      setManualSpecialtyTier(null);
    }
  }, [classification]);

  // Effective size class: classifier-detected 'exotic' / 'classic' always wins; otherwise
  // manual override takes priority, then auto-detected. Session 29 anti-gaming: the manual
  // dropdown is limited to 3 values (sedan / truck_suv_2row / suv_3row_van), so classifier
  // is the only authority for specialty vehicles.
  const classifierSpecialty =
    classification?.size_class === 'exotic' || classification?.size_class === 'classic';
  const effectiveSizeClass = classifierSpecialty
    ? classification!.size_class
    : (manualSizeClass ?? classification?.size_class ?? null);

  // Effective specialty tier: manual override takes priority, then auto-detected
  const effectiveSpecialtyTier = manualSpecialtyTier ?? classification?.specialty_tier ?? null;

  // Auto-sync: when classification changes, pre-select the detected size/tier
  // (only if user hasn't manually overridden yet)
  useEffect(() => {
    if (classification?.size_class && !manualSizeClass) {
      // Auto-detected — will be used via effectiveSizeClass
    }
    if (classification?.specialty_tier && !manualSpecialtyTier) {
      // Auto-detected — will be used via effectiveSpecialtyTier
    }
  }, [classification, manualSizeClass, manualSpecialtyTier]);

  // --- Determine if Continue is enabled ---
  function isValid(): boolean {
    if (mode === 'saved') {
      return !!selectedVehicleId;
    }

    // Manual mode: all fields required
    if (!category) return false;
    if (!make.trim()) return false;
    if (!model.trim()) return false;
    if (!year) return false;
    if (!color.trim()) return false;

    // Need size class (auto) or specialty tier for pricing
    if (category === 'automobile' && !effectiveSizeClass) return false;
    if (isSpecialtyCategory(category) && !effectiveSpecialtyTier) return false;

    // If still classifying, wait
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

    // Manual entry — all fields required.
    // Session 29: classifier's exotic/classic detection flows through effectiveSizeClass
    // (derived above) and overrides the user's manual size_class pick for specialty cases.
    const effectiveCat = classification?.vehicle_category ?? category;
    return {
      vehicle_category: effectiveCat,
      vehicle_type: classification?.vehicle_type ?? (effectiveCat === 'automobile' ? 'standard' : effectiveCat),
      size_class: effectiveSizeClass,
      specialty_tier: effectiveSpecialtyTier,
      make: make.trim(),
      model: model.trim(),
      year: year,
      color: color.trim(),
    };
  }

  function handleContinue() {
    // Validate required fields
    const newErrors: Record<string, string> = {};
    if (mode === 'manual') {
      if (!make.trim()) newErrors.make = 'Required';
      if (!model.trim()) newErrors.model = 'Required';
      if (!year) newErrors.year = 'Required';
      if (!color.trim()) newErrors.color = 'Required';
      if (category === 'automobile' && !effectiveSizeClass) {
        newErrors.size_class = 'Please select a vehicle size';
      }
      if (isSpecialtyCategory(category) && !effectiveSpecialtyTier) {
        newErrors.specialty_tier = 'Please select a size/type';
      }
    }
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    const selection = buildSelection();
    if (!selection) return;

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
        <FormField label="Make" required htmlFor="vehicle-make" error={errors.make}>
          <VehicleMakeCombobox
            id="vehicle-make"
            value={make}
            onChange={(val) => {
              setMake(val);
              if (val !== make) setModel('');
              setErrors((prev) => ({ ...prev, make: '' }));
            }}
            category={category}
          />
        </FormField>

        {/* Model */}
        <FormField label="Model" required htmlFor="vehicle-model" error={errors.model}>
          <Input
            id="vehicle-model"
            value={model}
            onChange={(e) => { setModel(titleCaseField(e.target.value)); setErrors((prev) => ({ ...prev, model: '' })); }}
            placeholder={category === 'automobile' ? 'e.g., Camry' : 'e.g., Sportster'}
            className="text-base sm:text-sm"
          />
        </FormField>

        {/* Year + Color row */}
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Year" required htmlFor="vehicle-year" error={errors.year}>
            <Select
              id="vehicle-year"
              value={year?.toString() ?? ''}
              onChange={(e) => { setYear(e.target.value ? parseInt(e.target.value, 10) : null); setErrors((prev) => ({ ...prev, year: '' })); }}
            >
              <option value="">Select year</option>
              {yearOptions.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </Select>
          </FormField>
          <FormField label="Color" required htmlFor="vehicle-color" error={errors.color}>
            <Input
              id="vehicle-color"
              value={color}
              onChange={(e) => { setColor(titleCaseField(e.target.value)); setErrors((prev) => ({ ...prev, color: '' })); }}
              placeholder="e.g., Silver"
              className="text-base sm:text-sm"
            />
          </FormField>
        </div>

        {/* Classification spinner */}
        {classifying && (
          <div className="flex items-center gap-2 text-sm text-site-text-secondary">
            <Spinner className="h-4 w-4" />
            Identifying vehicle...
          </div>
        )}

        {/* Vehicle size picker — always visible for automobiles, auto-detection pre-selects */}
        {category === 'automobile' && (
          <FormField label="Vehicle Size" required error={errors.size_class}>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(VEHICLE_SIZE_LABELS).map(([key, label]) => {
                const isSelected = effectiveSizeClass === key;
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
              Vehicle size affects service pricing.
            </p>
          </FormField>
        )}

        {/* Specialty tier picker — always visible for specialty categories */}
        {isSpecialty && (
          <FormField label="Size / Type" required error={errors.specialty_tier}>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {SPECIALTY_TIERS[category as Exclude<VehicleCategory, 'automobile'>]?.map((tier) => {
                const isSelected = effectiveSpecialtyTier === tier.key;
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
