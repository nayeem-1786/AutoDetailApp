'use client';

import { useState, useCallback } from 'react';
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
}

export function VehicleCreateDialog({
  open,
  onClose,
  customerId,
  onCreated,
}: VehicleCreateDialogProps) {
  const [category, setCategory] = useState<VehicleCategory>('automobile');
  const [sizeClass, setSizeClass] = useState('sedan');
  const [specialtyTier, setSpecialtyTier] = useState('');
  const [year, setYear] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [color, setColor] = useState('');
  const [saving, setSaving] = useState(false);

  const handleMakeChange = useCallback((val: string) => {
    setMake(val);
  }, []);

  function handleCategoryChange(newCategory: VehicleCategory) {
    setCategory(newCategory);
    setMake('');
    setSizeClass('sedan');
    setSpecialtyTier('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const isSpecialty = isSpecialtyCategory(category);

    setSaving(true);
    try {
      const res = await posFetch(`/api/pos/customers/${customerId}/vehicles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vehicle_category: category,
          vehicle_type: isSpecialty ? category : 'standard',
          size_class: !isSpecialty ? sizeClass : null,
          specialty_tier: isSpecialty ? (specialtyTier || null) : null,
          year: year || null,
          make: make || null,
          model: titleCaseField(model),
          color: titleCaseField(color),
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        toast.error(json.error || 'Failed to create vehicle');
        return;
      }

      toast.success('Vehicle added');
      onCreated(json.data as Vehicle);
      handleClose();
    } catch {
      toast.error('Failed to create vehicle');
    } finally {
      setSaving(false);
    }
  }

  function handleClose() {
    setCategory('automobile');
    setSizeClass('sedan');
    setSpecialtyTier('');
    setYear('');
    setMake('');
    setModel('');
    setColor('');
    onClose();
  }

  const isSpecialty = isSpecialtyCategory(category);
  const tierLabel = TIER_DROPDOWN_LABELS[category];
  const specialtyOptions = isSpecialty ? SPECIALTY_TIERS[category] : [];

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogClose onClose={handleClose} className="hidden pointer-fine:flex items-center justify-center h-8 w-8" />
      <DialogHeader>
        <DialogTitle>Add Vehicle</DialogTitle>
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
              <Select
                value={year}
                onChange={(e) => setYear(e.target.value)}
              >
                <option value="">Year...</option>
                {getVehicleYearOptions().map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                Make
              </label>
              <VehicleMakeCombobox
                value={make}
                onChange={handleMakeChange}
                category={category}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                Model
              </label>
              <Input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="e.g., Camry"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                Color
              </label>
              <Input
                value={color}
                onChange={(e) => setColor(e.target.value)}
                placeholder="e.g., Silver"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                {tierLabel}
              </label>
              {isSpecialty ? (
                <Select
                  value={specialtyTier}
                  onChange={(e) => setSpecialtyTier(e.target.value)}
                >
                  <option value="">Select {tierLabel.toLowerCase()}...</option>
                  {specialtyOptions.map((opt) => (
                    <option key={opt.key} value={opt.key}>
                      {opt.label}
                    </option>
                  ))}
                </Select>
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
            Add Vehicle
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
