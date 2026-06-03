'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { cn } from '@/lib/utils/cn';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import { Spinner } from '@/components/ui/spinner';
import {
  VehicleMakeCombobox,
  validateCustomerVehicleYear,
  titleCaseField,
} from '@/components/ui/vehicle-make-combobox';
import {
  VEHICLE_CATEGORIES,
  VEHICLE_CATEGORY_LABELS,
  SPECIALTY_TIERS,
  isSpecialtyCategory,
  getSpecialtyTierLabel,
  type VehicleCategory,
  type VehicleClassification,
} from '@/lib/utils/vehicle-categories';
// C1 (Session #142, 2026-06-02 — Vehicle Classifier Restoration):
// classifier moves from direct browser-Supabase access (which fails
// for anonymous public-booking customers under `vehicle_makes` RLS;
// see VEHICLE_CLASSIFIER_BEHAVIOR_AUDIT.md 5e3d3388) to the server-
// routed wrapper. The wrapper calls /api/classify-vehicle which uses
// the admin client server-side (RLS bypassed). The browser Supabase
// client import is no longer needed on this surface.
import { classifyVehicleClient } from '@/lib/utils/classify-vehicle-client';
import { VEHICLE_SIZE_LABELS } from '@/lib/utils/constants';
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

  // #132 Issue 2 — year is a single 4-digit text input (supersedes #131's
  // dropdown+Other design). `yearInput` mirrors what the user typed (string);
  // `year` (above) is the canonical numeric value committed when the input
  // is valid. Inline-error rendering is gated by the onChange's `raw ? err : ''`
  // pattern so an empty initial state doesn't show "Year is required"; onBlur
  // forces the error once the user moves on, even if the input is empty.
  const [yearInput, setYearInput] = useState<string>(
    initialVehicle?.year ? String(initialVehicle.year) : ''
  );

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

  // #136 B5 — classifier request-id ref for race-cancellation. Every fresh
  // classify() call increments this; in-flight resolves check whether their
  // captured id is still current before writing state. handleCategoryChange
  // also increments it to invalidate any in-flight call from the prior
  // category. Without this guard, a stale classify('Yamaha', '', 'rv')
  // resolution could overwrite the just-cleared classification AFTER the
  // user switched to motorcycle.
  const classifyRequestIdRef = useRef(0);

  // --- Auto-classify when make/model changes ---
  // C1 (Session #142): the lifecycle is unchanged from the pre-refactor
  // version — `setClassifying(true)` in try, `setClassifying(false)` in
  // finally (gated on race-cancellation ticket); race-cancellation logic
  // also unchanged. The ONLY change is the DB-access primitive: the call
  // to `resolveVehicleClassification(browserSupabase, …)` is replaced
  // with `classifyVehicleClient(…)`, which routes the lookup through
  // `/api/classify-vehicle` (server admin-client). This eliminates the
  // RLS-denial hang/silent-default that broke /book Step 1 for anonymous
  // customers. The T9 contract test (`classifier-spinner-lifecycle.test.tsx`)
  // locks `setClassifying(false)` against all five classifier failure
  // modes — including the network-error case the wrapper newly surfaces.
  const classify = useCallback(async (
    mk: string,
    mdl: string,
    cat: VehicleCategory,
    // Finding 2 (Session #143, 2026-06-02 — STEP1_SIZE_CLASS_AND_MUSTANG_CLASSIC_AUDIT):
    // year is now forwarded through to the wrapper. Pre-fix the call at
    // the wrapper boundary dropped year silently, which broke Layer 5
    // classic detection across all year-gated classic candidates (Ford
    // Mustang, Chevy Camaro, etc.). Latent since the classifier was
    // first wired in — #142's restoration made it observable because
    // the rest of the classifier started returning useful results on
    // anonymous /book. Mirrors `vehicle-form-dialog.tsx:227` which has
    // always passed year correctly (canonical reference per Memory #2).
    yr: number | null
  ) => {
    if (!mk.trim()) {
      setClassification(null);
      return;
    }
    const myRequestId = ++classifyRequestIdRef.current;
    setClassifying(true);
    try {
      const result = await classifyVehicleClient(
        mk.trim(),
        mdl.trim() || undefined,
        yr ?? undefined
      );
      // #136 B5 race-cancellation: abandon stale results so a slow Yamaha-RV
      // fetch can't overwrite a cleared/changed classification after the
      // user picked a different category mid-flight.
      if (classifyRequestIdRef.current !== myRequestId) {
        return;
      }
      setClassification(result);
      // Auto-update category only when the classifier is CONFIDENT — i.e. it
      // matched a single `vehicle_makes` row OR disambiguated a dual-category
      // make via a known model keyword. The classifier flags this via
      // `category_confident` (#131 Layer 2 — promotes #129 C1's `mdl.trim()`
      // heuristic to a structural confidence signal that covers ALL silent-
      // default paths uniformly: 0-row lookup, dual-category empty/unmatched
      // model, DB error). See CLAUDE.md Rule 19 + PUBLIC_BOOKING_FLOW_AUDIT.md F1.
      if (result.category_confident && result.vehicle_category !== cat) {
        setCategory(result.vehicle_category);
      }
    } catch {
      if (classifyRequestIdRef.current !== myRequestId) return;
      setClassification(null);
    } finally {
      if (classifyRequestIdRef.current === myRequestId) {
        setClassifying(false);
      }
    }
  }, []);

  // Debounced classification. Finding 2 (Session #143): `year` is now
  // forwarded so Layer 5 (classic) can run. Adding `year` to the
  // dependency array re-fires the debounce when the customer types a
  // new year — e.g., typing 1965 for a Ford Mustang triggers a
  // reclassify that now resolves to 'classic' (previously stayed
  // 'sedan' because year was dropped at the wrapper boundary).
  useEffect(() => {
    if (mode !== 'manual' || !make.trim()) {
      setClassification(null);
      return;
    }
    const timer = setTimeout(() => {
      classify(make, model, category, year);
    }, 400);
    return () => clearTimeout(timer);
  }, [make, model, category, year, mode, classify]);

  // #136 T1/Q1/B1 — Category change resets ALL non-category fields. The
  // operator-locked anchor (VEHICLE_FORMS_BEHAVIOR_AUDIT.md T1.1): all
  // non-category state has category-specific validity, so a category change
  // invalidates every field's prior value. Previously this handler missed
  // year/yearInput/color (added to the form after the handler was authored,
  // refactor never updated). T8 contract test in
  // vehicle-forms-reset-contract.test.tsx locks this against regression.
  function handleCategoryChange(newCat: VehicleCategory) {
    // #136 B5 — invalidate any in-flight classifier call so its stale
    // result can't overwrite the cleared classification below.
    classifyRequestIdRef.current++;
    setCategory(newCat);
    setMake('');
    setModel('');
    setYear(null);
    setYearInput('');
    setColor('');
    setClassification(null);
    setClassifying(false);
    setManualSizeClass(null);
    setManualSpecialtyTier(null);
    setErrors({});
  }

  // Finding 1 (Session #143, 2026-06-02 — Q-A.4 LOCKED Option (iii),
  // STEP1_SIZE_CLASS_AND_MUSTANG_CLASSIC_AUDIT). The previous useEffect
  // here unconditionally cleared the customer's manual size_class +
  // specialty_tier picks whenever the classifier returned. Combined
  // with the old `effectiveSizeClass` formula's classifier fallback,
  // this caused mundane classifier results (Sedan, Truck/SUV, etc.)
  // to auto-highlight a size button — the bug the operator flagged
  // post-#142.
  //
  // **REFINED RULE:** the classifier may pre-select size_class ONLY
  // when it detects 'exotic' or 'classic' (the two cases that trigger
  // the SpecialtyVehicleBlock short-circuit via
  // `booking-wizard.tsx:763`). Those two values are flow-routing
  // signals, not button-defaulting. For every other classifier
  // result — mundane automobile sizes (sedan / truck_suv_2row /
  // suv_3row_van) AND non-automobile specialty_tier seeds — the
  // customer's manual pick is authoritative. Classifier output is
  // silently dropped from UI state.
  //
  // So this effect clears the manual picks ONLY when the classifier
  // returns exotic/classic (so `effectiveSizeClass` below can route
  // through `classification.size_class`). Mundane classifier returns
  // leave the customer's manual pick untouched.
  useEffect(() => {
    const isClassifierSpecialty =
      classification?.size_class === 'exotic' ||
      classification?.size_class === 'classic';
    if (isClassifierSpecialty) {
      setManualSizeClass(null);
      setManualSpecialtyTier(null);
    }
  }, [classification?.size_class]);

  // Effective size class. Finding 1 refined rule (Session #143):
  //   - Classifier-detected 'exotic' / 'classic' wins (flow-routing
  //     to SpecialtyVehicleBlock via `booking-wizard.tsx:763` reading
  //     `vehicle.size_class` from `buildSelection().size_class`).
  //   - Otherwise: `manualSizeClass` ONLY. The old fallback to
  //     `classification?.size_class` was the auto-fill bug — removed.
  //     Mundane classifier results no longer leak into UI state.
  const classifierSpecialty =
    classification?.size_class === 'exotic' || classification?.size_class === 'classic';
  const effectiveSizeClass = classifierSpecialty
    ? classification!.size_class
    : manualSizeClass;

  // Effective specialty tier. Finding 1 refined rule (Session #143):
  // non-automobile specialty_tier is purely customer-picked. The old
  // fallback `?? classification?.specialty_tier` auto-seeded the first
  // tier (e.g., 'rv_up_to_24' for any RV) the moment the classifier
  // returned, which violated the locked rule for non-automobile
  // surfaces. Classifier's specialty_tier output (always the smallest
  // tier per Layer-3 manual-pick design — see CLAUDE.md Rule 22) is
  // silently dropped from UI state; customer picks via the
  // SPECIALTY_TIERS buttons.
  const effectiveSpecialtyTier = manualSpecialtyTier;

  // Mi1 (Session #142): the dead useEffect that previously sat here had
  // empty `if` branches with only comments — auto-detect routing already
  // happens via `effectiveSizeClass` / `effectiveSpecialtyTier` derived
  // values above, no side-effect needed. Removed cleanly with no
  // behavioral impact. Audit ref: VEHICLE_CLASSIFIER_BEHAVIOR_AUDIT.md Mi1.

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
    // #131 Layer 2: only trust the classifier's `vehicle_category` / `vehicle_type`
    // when it's confident (`category_confident: true`). Without this gate, an
    // unconfident classifier (0-row lookup, dual-category-empty-model, DB error)
    // would silently submit `vehicle_category: 'automobile'` even though the
    // setCategory gate above kept the user's RV/motorcycle/etc. on screen. That's
    // the second silent-override path #129's hotfix missed — the form looked
    // right, the submitted record was wrong.
    const useClassifierCategory = classification?.category_confident === true;
    const effectiveCat = useClassifierCategory
      ? classification!.vehicle_category
      : category;
    const effectiveVehicleType = useClassifierCategory
      ? classification!.vehicle_type
      : (effectiveCat === 'automobile' ? 'standard' : effectiveCat);
    return {
      vehicle_category: effectiveCat,
      vehicle_type: effectiveVehicleType,
      size_class: effectiveSizeClass,
      specialty_tier: effectiveSpecialtyTier,
      make: make.trim(),
      model: model.trim(),
      year: year,
      // #136 B30 — color title-cased at SUBMIT, not on display. Matches
      // model's identity-on-display + transform-on-submit pattern (#132)
      // AND matches the portal dialog's submit-time titleCase, so both
      // surfaces converge on one timing.
      color: titleCaseField(color),
    };
  }

  function handleContinue() {
    // Validate required fields
    const newErrors: Record<string, string> = {};
    if (mode === 'manual') {
      if (!make.trim()) newErrors.make = 'Required';
      if (!model.trim()) newErrors.model = 'Required';
      // #132 Issue 2 — surface the validator's specific message rather than
      // a generic "Required" so the customer sees why their year was rejected
      // (e.g., "Year must start with 19 or 20" for a typo like "2024" → "204").
      if (!year) newErrors.year = validateCustomerVehicleYear(yearInput) ?? 'Required';
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
            // #136 B22 — humanize specialty_tier key (e.g. "rv_up_to_24" →
            // "Up to 24'") via the canonical helper. Previously rendered the
            // raw DB key, which was operator-unfriendly on the saved-vehicle
            // picker.
            const vehicleCategory = (v.vehicle_category ?? 'automobile') as VehicleCategory;
            const tierLabel = v.specialty_tier
              ? getSpecialtyTierLabel(vehicleCategory, v.specialty_tier)
              : null;

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
        <FormField label="Make" required htmlFor="vehicle-make" error={errors.make} reserveErrorSpace>
          <VehicleMakeCombobox
            id="vehicle-make"
            value={make}
            onChange={(val) => {
              setMake(val);
              if (val !== make) setModel('');
              // #136 Q5/B7 — real-time validation: any selection or typed
              // value clears the error; empty value will be re-flagged on
              // blur or submit. Combobox does not expose a separate blur,
              // so onChange-clear is the available feedback path.
              setErrors((prev) => ({ ...prev, make: val.trim() ? '' : prev.make }));
            }}
            category={category}
          />
        </FormField>

        {/* Model — #132 Issue 4: preserve case as the user types.
            Previously called `titleCaseField(e.target.value)` on every
            keystroke, which lower-cased "CBR600RR" to "Cbr600rr". The DB
            persists whatever the input emits; preserving case here means
            VINs / part-style model codes are saved verbatim. */}
        <FormField label="Model" required htmlFor="vehicle-model" error={errors.model} reserveErrorSpace>
          <Input
            id="vehicle-model"
            value={model}
            onChange={(e) => {
              const v = e.target.value;
              setModel(v);
              // #136 Q5/B7 — real-time validation.
              setErrors((prev) => ({ ...prev, model: v.trim() ? '' : prev.model }));
            }}
            onBlur={() => {
              setErrors((prev) => ({ ...prev, model: model.trim() ? '' : 'Required' }));
            }}
            placeholder={category === 'automobile' ? 'e.g., Camry' : 'e.g., Sportster'}
            className="text-base sm:text-sm"
          />
        </FormField>

        {/* Year + Color row */}
        <div className="grid grid-cols-2 gap-3">
          {/* Year — #132 Issue 2: single 4-digit text input. Allowed values
              match `/^(19|20)\d{2}$/` (1900–2099). The "19/20" prefix rule IS
              the range constraint. Replaces #131's dropdown+Other... pattern
              per operator reconsideration. */}
          <FormField label="Year" required htmlFor="vehicle-year" error={errors.year} reserveErrorSpace>
            <Input
              id="vehicle-year"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              value={yearInput}
              placeholder="e.g., 2024"
              className="text-base sm:text-sm"
              onChange={(e) => {
                const raw = e.target.value.replace(/\D/g, '').slice(0, 4);
                setYearInput(raw);
                const validationError = validateCustomerVehicleYear(raw);
                if (validationError) {
                  setYear(null);
                  // Only surface error after user has typed something;
                  // an empty input shouldn't render "Year is required" until blur/submit.
                  setErrors((prev) => ({ ...prev, year: raw ? validationError : '' }));
                } else {
                  setYear(parseInt(raw, 10));
                  setErrors((prev) => ({ ...prev, year: '' }));
                }
              }}
              onBlur={() => {
                const validationError = validateCustomerVehicleYear(yearInput);
                setErrors((prev) => ({ ...prev, year: validationError ?? '' }));
              }}
            />
          </FormField>
          <FormField label="Color" required htmlFor="vehicle-color" error={errors.color} reserveErrorSpace>
            {/* #136 B30 — preserve case as user types; titleCaseField runs in
                buildSelection() at submit time, mirroring the model field's
                identity-on-display pattern (#132). */}
            <Input
              id="vehicle-color"
              value={color}
              onChange={(e) => {
                const v = e.target.value;
                setColor(v);
                // #136 Q5/B7 — real-time validation. Empty/whitespace-only
                // surfaces "Required" inline; valid input clears the error.
                setErrors((prev) => ({ ...prev, color: v.trim() ? '' : prev.color }));
              }}
              onBlur={() => {
                setErrors((prev) => ({ ...prev, color: color.trim() ? '' : 'Required' }));
              }}
              placeholder="e.g., Silver"
              className="text-base sm:text-sm"
            />
          </FormField>
        </div>

        {/* #136 Q4/B2 — height-reserved classifier slot. Previously the
            "Identifying vehicle..." row appeared on `setClassifying(true)`
            and disappeared on `setClassifying(false)` per debounced model
            keystroke, pushing every downstream row (Vehicle Size / Specialty
            tier) up and down each classifier cycle. The container always
            renders at fixed height (h-5 ≈ 20px); the spinner+text fills it
            conditionally. Operator-reported "two rows flash" eliminated. */}
        <div
          className="flex h-5 items-center gap-2 text-sm text-site-text-secondary"
          aria-live="polite"
          aria-busy={classifying}
        >
          {classifying && (
            <>
              <Spinner className="h-4 w-4" />
              <span>Identifying vehicle...</span>
            </>
          )}
        </div>

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

        {/* Specialty tier picker — always visible for specialty categories.
            M1 (Session #142): the tier here is intentionally operator-input.
            Unlike automobile size_class (auto-detected via MODEL_SIZE_HINTS +
            Layers 4-5 exotic/classic), there's no classifier-derived
            mapping from RV/motorcycle/boat/aircraft model → tier. The
            microcopy below frames the picker as required information we
            need from the customer, NOT as a fallback because automatic
            detection "failed." Audit ref:
            VEHICLE_CLASSIFIER_BEHAVIOR_AUDIT.md M1. */}
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
            <p className="text-xs text-site-text-muted mt-1">
              Please select the size that matches your {VEHICLE_CATEGORY_LABELS[category].toLowerCase()} — affects service pricing.
            </p>
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
