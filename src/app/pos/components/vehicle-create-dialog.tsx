'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogContent,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { posFetch } from '../lib/pos-fetch';
import {
  VEHICLE_TYPE_LABELS,
  VEHICLE_SIZE_LABELS,
  VEHICLE_TYPE_SIZE_CLASSES,
} from '@/lib/utils/constants';
import type { Vehicle } from '@/lib/supabase/types';

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
  const [vehicleType, setVehicleType] = useState('standard');
  const [sizeClass, setSizeClass] = useState('sedan');
  const [year, setYear] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [color, setColor] = useState('');
  const [saving, setSaving] = useState(false);

  const sizeClasses = VEHICLE_TYPE_SIZE_CLASSES[vehicleType] ?? [];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    setSaving(true);
    try {
      const res = await posFetch(`/api/pos/customers/${customerId}/vehicles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vehicle_type: vehicleType,
          size_class: sizeClasses.length > 0 ? sizeClass : null,
          year: year || null,
          make: make || null,
          model: model || null,
          color: color || null,
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
    setVehicleType('standard');
    setSizeClass('sedan');
    setYear('');
    setMake('');
    setModel('');
    setColor('');
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogClose onClose={handleClose} />
      <DialogHeader>
        <DialogTitle>Add Vehicle</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit}>
        <DialogContent className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                Type
              </label>
              <Select
                value={vehicleType}
                onChange={(e) => {
                  setVehicleType(e.target.value);
                  const classes = VEHICLE_TYPE_SIZE_CLASSES[e.target.value] ?? [];
                  if (classes.length > 0) setSizeClass(classes[0]);
                }}
              >
                {Object.entries(VEHICLE_TYPE_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>
                    {label}
                  </option>
                ))}
              </Select>
            </div>
            {sizeClasses.length > 0 && (
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  Size Class
                </label>
                <Select
                  value={sizeClass}
                  onChange={(e) => setSizeClass(e.target.value)}
                >
                  {sizeClasses.map((sc) => (
                    <option key={sc} value={sc}>
                      {VEHICLE_SIZE_LABELS[sc] ?? sc}
                    </option>
                  ))}
                </Select>
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                Year
              </label>
              <Input
                type="number"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                placeholder="2024"
                min={1900}
                max={2100}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                Make
              </label>
              <Input
                value={make}
                onChange={(e) => setMake(e.target.value)}
                placeholder="Toyota"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                Model
              </label>
              <Input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="Camry"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Color
            </label>
            <Input
              value={color}
              onChange={(e) => setColor(e.target.value)}
              placeholder="Black"
            />
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
