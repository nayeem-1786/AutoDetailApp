'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  Dialog,
  DialogClose,
  DialogHeader,
  DialogTitle,
  DialogContent,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { posFetch } from '../lib/pos-fetch';
import {
  VEHICLE_SIZE_LABELS,
} from '@/lib/utils/constants';
import {
  VEHICLE_CATEGORIES,
  VEHICLE_CATEGORY_LABELS,
  SPECIALTY_TIERS,
  TIER_DROPDOWN_LABELS,
  MODEL_PLACEHOLDERS,
  isSpecialtyCategory,
  type VehicleCategory,
} from '@/lib/utils/vehicle-categories';
import { VehicleMakeCombobox, getVehicleYearOptions, titleCaseField } from '@/components/ui/vehicle-make-combobox';
import type { Vehicle } from '@/lib/supabase/types';

const AUTOMOBILE_SIZE_CLASSES = ['sedan', 'truck_suv_2row', 'suv_3row_van'] as const;

interface VehicleCreateDialogProps {
  open: boolean;
  onClose: () => void;
  customerId: string;
  onCreated: (vehicle: Vehicle) => void;
  /** When set, pre-populates the form for editing */
  editVehicle?: Vehicle | null;
}

export function VehicleCreateDialog({
  open,
  onClose,
  customerId,
  onCreated,
  editVehicle,
}: VehicleCreateDialogProps) {
  const isEdit = !!editVehicle;
  const [category, setCategory] = useState<VehicleCategory>('automobile');
  const [sizeClass, setSizeClass] = useState('sedan');
  const [specialtyTier, setSpecialtyTier] = useState('');
  const [year, setYear] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [color, setColor] = useState('');
  const [saving, setSaving] = useState(false);
  const [yearOtherMode, setYearOtherMode] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Pre-populate form when editing
  useEffect(() => {
    if (open && editVehicle) {
      const cat = (editVehicle.vehicle_category || (editVehicle.vehicle_type === 'standard' ? 'automobile' : editVehicle.vehicle_type)) as VehicleCategory;
      setCategory(cat);
      setSizeClass(editVehicle.size_class || 'sedan');
      setSpecialtyTier(editVehicle.specialty_tier || '');
      const yearStr = editVehicle.year?.toString() || '';
      setYear(yearStr);
      setMake(editVehicle.make || '');
      setModel(editVehicle.model || '');
      setColor(editVehicle.color || '');
      // Auto-detect "Other" mode if year is outside the dropdown range
      const yearNum = editVehicle.year;
      const yearOptions = getVehicleYearOptions();
      setYearOtherMode(!!yearNum && !yearOptions.includes(yearNum));
      setErrors({});
    } else if (open && !editVehicle) {
      handleReset();
    }
  }, [open, editVehicle]);

  const handleMakeChange = useCallback((val: string) => {
    setMake(val);
    if (val) setErrors((prev) => ({ ...prev, make: '' }));
  }, []);

  function handleCategoryChange(newCategory: VehicleCategory) {
    setCategory(newCategory);
    setMake('');
    setSizeClass('sedan');
    setSpecialtyTier('');
    setErrors({});
  }

  function validate(): boolean {
    const newErrors: Record<string, string> = {};
    if (!year) newErrors.year = 'Please select a year';
    if (yearOtherMode && year) {
      const yr = parseInt(year);
      if (isNaN(yr) || yr < 1900 || yr > new Date().getFullYear() + 2) {
        newErrors.year = 'Please enter a valid 4-digit year';
      }
    }
    if (!make) newErrors.make = 'Please select or enter a make';
    if (!model.trim()) newErrors.model = 'Please enter a model';
    if (!color.trim()) newErrors.color = 'Please enter a color';
    const isSpecialty = isSpecialtyCategory(category);
    if (isSpecialty && !specialtyTier) {
      const tierLabel = TIER_DROPDOWN_LABELS[category].toLowerCase();
      newErrors.tier = `Please select a ${tierLabel}`;
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    const isSpecialty = isSpecialtyCategory(category);

    setSaving(true);
    try {
      const url = isEdit
        ? `/api/pos/customers/${customerId}/vehicles`
        : `/api/pos/customers/${customerId}/vehicles`;

      const body = {
        vehicle_category: category,
        vehicle_type: isSpecialty ? category : 'standard',
        size_class: !isSpecialty ? sizeClass : null,
        specialty_tier: isSpecialty ? (specialtyTier || null) : null,
        year: year || null,
        make: make || null,
        model: titleCaseField(model),
        color: titleCaseField(color),
      };

      let res: Response;
      if (isEdit) {
        res = await posFetch(`/api/pos/customers/${customerId}/vehicles`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...body, vehicle_id: editVehicle!.id }),
        });
      } else {
        res = await posFetch(`/api/pos/customers/${customerId}/vehicles`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      }

      const json = await res.json();

      if (!res.ok) {
        toast.error(json.error || `Failed to ${isEdit ? 'update' : 'create'} vehicle`);
        return;
      }

      toast.success(isEdit ? 'Vehicle updated' : 'Vehicle added');
      onCreated(json.data as Vehicle);
      handleClose();
    } catch {
      toast.error(`Failed to ${isEdit ? 'update' : 'create'} vehicle`);
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setCategory('automobile');
    setSizeClass('sedan');
    setSpecialtyTier('');
    setYear('');
    setMake('');
    setModel('');
    setColor('');
    setYearOtherMode(false);
    setErrors({});
  }

  function handleClose() {
    handleReset();
    onClose();
  }

  const isSpecialty = isSpecialtyCategory(category);
  const tierLabel = TIER_DROPDOWN_LABELS[category];
  const specialtyOptions = isSpecialty ? SPECIALTY_TIERS[category] : [];

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogClose onClose={handleClose} className="hidden pointer-fine:flex items-center justify-center h-8 w-8" />
      <DialogHeader>
        <DialogTitle>{isEdit ? 'Edit Vehicle' : 'Add Vehicle'}</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit}>
        <DialogContent className="flex flex-col gap-3">
          {/* Category Selector */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
              Category
            </label>
            <Select
              value={category}
              onChange={(e) => handleCategoryChange(e.target.value as VehicleCategory)}
            >
              {VEHICLE_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {VEHICLE_CATEGORY_LABELS[cat]}
                </option>
              ))}
            </Select>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                Year
              </label>
              {yearOtherMode ? (
                <>
                  <Input
                    value={year}
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^0-9]/g, '').slice(0, 4);
                      setYear(v);
                      if (v) setErrors((prev) => ({ ...prev, year: '' }));
                    }}
                    placeholder="Enter year (e.g., 1965)"
                    className={errors.year ? 'border-red-500' : ''}
                    inputMode="numeric"
                  />
                  <button
                    type="button"
                    onClick={() => { setYearOtherMode(false); setYear(''); }}
                    className="mt-1 text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                  >
                    Back to list
                  </button>
                </>
              ) : (
                <Select
                  value={year}
                  onChange={(e) => {
                    if (e.target.value === 'other') {
                      setYearOtherMode(true);
                      setYear('');
                    } else {
                      setYear(e.target.value);
                      if (e.target.value) setErrors((prev) => ({ ...prev, year: '' }));
                    }
                  }}
                  className={errors.year ? 'border-red-500' : ''}
                >
                  <option value="">Year...</option>
                  {getVehicleYearOptions().map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                  <option value="other">Other</option>
                </Select>
              )}
              {errors.year && <p className="mt-1 text-xs text-red-500">{errors.year}</p>}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                Make
              </label>
              <VehicleMakeCombobox
                value={make}
                onChange={handleMakeChange}
                category={category}
                hasError={!!errors.make}
              />
              {errors.make && <p className="mt-1 text-xs text-red-500">{errors.make}</p>}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                Model
              </label>
              <Input
                value={model}
                onChange={(e) => {
                  setModel(e.target.value);
                  if (e.target.value.trim()) setErrors((prev) => ({ ...prev, model: '' }));
                }}
                placeholder={MODEL_PLACEHOLDERS[category]}
                className={errors.model ? 'border-red-500' : ''}
              />
              {errors.model && <p className="mt-1 text-xs text-red-500">{errors.model}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                Color
              </label>
              <Input
                value={color}
                onChange={(e) => {
                  setColor(e.target.value);
                  if (e.target.value.trim()) setErrors((prev) => ({ ...prev, color: '' }));
                }}
                placeholder="e.g., Silver"
                className={errors.color ? 'border-red-500' : ''}
              />
              {errors.color && <p className="mt-1 text-xs text-red-500">{errors.color}</p>}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                {tierLabel}
              </label>
              {isSpecialty ? (
                <>
                  <Select
                    value={specialtyTier}
                    onChange={(e) => {
                      setSpecialtyTier(e.target.value);
                      if (e.target.value) setErrors((prev) => ({ ...prev, tier: '' }));
                    }}
                    className={errors.tier ? 'border-red-500' : ''}
                  >
                    <option value="">Select {tierLabel.toLowerCase()}...</option>
                    {specialtyOptions.map((opt) => (
                      <option key={opt.key} value={opt.key}>
                        {opt.label}
                      </option>
                    ))}
                  </Select>
                  {errors.tier && <p className="mt-1 text-xs text-red-500">{errors.tier}</p>}
                </>
              ) : (
                <Select
                  value={sizeClass}
                  onChange={(e) => setSizeClass(e.target.value)}
                >
                  {AUTOMOBILE_SIZE_CLASSES.map((sc) => (
                    <option key={sc} value={sc}>
                      {VEHICLE_SIZE_LABELS[sc]}
                    </option>
                  ))}
                </Select>
              )}
            </div>
          </div>
        </DialogContent>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {isEdit ? 'Save Changes' : `Add ${VEHICLE_CATEGORY_LABELS[category]}`}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
