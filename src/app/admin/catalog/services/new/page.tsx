'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, Controller } from 'react-hook-form';
import { formResolver } from '@/lib/utils/form';
import { createClient } from '@/lib/supabase/client';
import { serviceCreateSchema, type ServiceCreateInput } from '@/lib/utils/validation';
import type { ServiceCategory, PricingModel, VehicleType } from '@/lib/supabase/types';
import { PRICING_MODEL_LABELS, CLASSIFICATION_LABELS, VEHICLE_TYPE_LABELS } from '@/lib/utils/constants';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { FormField } from '@/components/ui/form-field';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import {
  ServicePricingForm,
  getDefaultPricingValue,
  type PricingValue,
  type ScopeTier,
  type SpecialtyTier,
} from '@/components/service-pricing-form';
import { toast } from 'sonner';
import { ArrowLeft } from 'lucide-react';

const PRICING_MODEL_DESCRIPTIONS: Record<PricingModel, string> = {
  vehicle_size: 'Different price for sedan, truck/SUV, and SUV 3-row/van',
  scope: 'Named tiers with optional vehicle-size-aware final tier',
  per_unit: 'Price per unit (e.g., per panel, per seat)',
  specialty: 'Vehicle-type specific tiers (boats, RVs, etc.)',
  flat: 'Single flat rate for all vehicles',
  custom: 'Starting price displayed; final quote after inspection',
};

const ALL_VEHICLE_TYPES: VehicleType[] = ['standard', 'motorcycle', 'rv', 'boat', 'aircraft'];

export default function NewServicePage() {
  const router = useRouter();
  const supabase = createClient();

  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pricingValue, setPricingValue] = useState<PricingValue>(
    getDefaultPricingValue('vehicle_size')
  );

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors },
  } = useForm<ServiceCreateInput>({
    resolver: formResolver(serviceCreateSchema),
    defaultValues: {
      name: '',
      description: '',
      category_id: null,
      pricing_model: 'vehicle_size',
      classification: 'primary',
      base_duration_minutes: 60,
      flat_price: null,
      custom_starting_price: null,
      per_unit_price: null,
      per_unit_max: null,
      per_unit_label: '',
      mobile_eligible: false,
      online_bookable: true,
      staff_assessed: false,
      is_taxable: false,
      vehicle_compatibility: ['standard'],
      special_requirements: '',
    },
  });

  const selectedPricingModel = watch('pricing_model');
  const vehicleCompatibility = watch('vehicle_compatibility') || [];

  useEffect(() => {
    async function loadCategories() {
      const { data } = await supabase
        .from('service_categories')
        .select('*')
        .eq('is_active', true)
        .order('display_order');
      if (data) setCategories(data);
      setLoadingCategories(false);
    }
    loadCategories();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // When pricing model changes, reset pricing value
  useEffect(() => {
    setPricingValue(getDefaultPricingValue(selectedPricingModel));
  }, [selectedPricingModel]);

  function toggleVehicleType(type: VehicleType) {
    const current = vehicleCompatibility;
    if (current.includes(type)) {
      if (current.length === 1) return; // Must have at least one
      setValue('vehicle_compatibility', current.filter((t) => t !== type));
    } else {
      setValue('vehicle_compatibility', [...current, type]);
    }
  }

  async function onSubmit(formData: ServiceCreateInput) {
    setSaving(true);
    try {
      // Build the service insert payload
      const servicePayload: Record<string, unknown> = {
        name: formData.name,
        description: formData.description || null,
        category_id: formData.category_id || null,
        pricing_model: formData.pricing_model,
        classification: formData.classification,
        base_duration_minutes: formData.base_duration_minutes,
        mobile_eligible: formData.mobile_eligible,
        online_bookable: formData.online_bookable,
        staff_assessed: formData.staff_assessed,
        is_taxable: formData.is_taxable,
        vehicle_compatibility: formData.vehicle_compatibility,
        special_requirements: formData.special_requirements || null,
        is_active: true,
        display_order: 0,
      };

      // Set model-specific fields on the service row
      if (formData.pricing_model === 'flat' && pricingValue.model === 'flat') {
        servicePayload.flat_price = typeof pricingValue.data.flat_price === 'number' ? pricingValue.data.flat_price : null;
      }
      if (formData.pricing_model === 'custom' && pricingValue.model === 'custom') {
        servicePayload.custom_starting_price = typeof pricingValue.data.custom_starting_price === 'number' ? pricingValue.data.custom_starting_price : null;
      }
      if (formData.pricing_model === 'per_unit' && pricingValue.model === 'per_unit') {
        servicePayload.per_unit_price = typeof pricingValue.data.per_unit_price === 'number' ? pricingValue.data.per_unit_price : null;
        servicePayload.per_unit_max = typeof pricingValue.data.per_unit_max === 'number' ? pricingValue.data.per_unit_max : null;
        servicePayload.per_unit_label = pricingValue.data.per_unit_label || null;
      }

      // Insert the service
      const { data: service, error: serviceError } = await supabase
        .from('services')
        .insert(servicePayload)
        .select()
        .single();

      if (serviceError) throw serviceError;

      // Insert pricing rows if needed
      if (formData.pricing_model === 'vehicle_size' && pricingValue.model === 'vehicle_size') {
        const pricingRows = [
          { service_id: service.id, tier_name: 'sedan', tier_label: 'Sedan', price: typeof pricingValue.data.sedan === 'number' ? pricingValue.data.sedan : 0, display_order: 0, is_vehicle_size_aware: false },
          { service_id: service.id, tier_name: 'truck_suv_2row', tier_label: 'Truck/SUV (2-Row)', price: typeof pricingValue.data.truck_suv_2row === 'number' ? pricingValue.data.truck_suv_2row : 0, display_order: 1, is_vehicle_size_aware: false },
          { service_id: service.id, tier_name: 'suv_3row_van', tier_label: 'SUV (3-Row) / Van', price: typeof pricingValue.data.suv_3row_van === 'number' ? pricingValue.data.suv_3row_van : 0, display_order: 2, is_vehicle_size_aware: false },
        ];
        const { error: pricingError } = await supabase.from('service_pricing').insert(pricingRows);
        if (pricingError) throw pricingError;
      }

      if (formData.pricing_model === 'scope' && pricingValue.model === 'scope') {
        const pricingRows = pricingValue.data
          .filter((t: ScopeTier) => t.tier_name.trim() !== '')
          .map((t: ScopeTier, i: number) => ({
            service_id: service.id,
            tier_name: t.tier_name,
            tier_label: t.tier_label || null,
            price: typeof t.price === 'number' ? t.price : 0,
            display_order: i,
            is_vehicle_size_aware: t.is_vehicle_size_aware,
            vehicle_size_sedan_price: t.is_vehicle_size_aware && typeof t.vehicle_size_sedan_price === 'number' ? t.vehicle_size_sedan_price : null,
            vehicle_size_truck_suv_price: t.is_vehicle_size_aware && typeof t.vehicle_size_truck_suv_price === 'number' ? t.vehicle_size_truck_suv_price : null,
            vehicle_size_suv_van_price: t.is_vehicle_size_aware && typeof t.vehicle_size_suv_van_price === 'number' ? t.vehicle_size_suv_van_price : null,
          }));
        if (pricingRows.length > 0) {
          const { error: pricingError } = await supabase.from('service_pricing').insert(pricingRows);
          if (pricingError) throw pricingError;
        }
      }

      if (formData.pricing_model === 'specialty' && pricingValue.model === 'specialty') {
        const pricingRows = pricingValue.data
          .filter((t: SpecialtyTier) => t.tier_name.trim() !== '')
          .map((t: SpecialtyTier, i: number) => ({
            service_id: service.id,
            tier_name: t.tier_name,
            tier_label: t.tier_label || null,
            price: typeof t.price === 'number' ? t.price : 0,
            display_order: i,
            is_vehicle_size_aware: false,
          }));
        if (pricingRows.length > 0) {
          const { error: pricingError } = await supabase.from('service_pricing').insert(pricingRows);
          if (pricingError) throw pricingError;
        }
      }

      toast.success('Service created successfully');
      router.push('/admin/catalog/services');
    } catch (err) {
      console.error('Failed to create service:', err);
      toast.error('Failed to create service');
    } finally {
      setSaving(false);
    }
  }

  if (loadingCategories) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Add Service"
        action={
          <Button variant="outline" onClick={() => router.push('/admin/catalog/services')}>
            <ArrowLeft className="h-4 w-4" />
            Back to Services
          </Button>
        }
      />

      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Left column - Main form */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Service Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField label="Service Name" required error={errors.name?.message}>
                  <Input {...register('name')} placeholder="e.g., Full Detail, Paint Correction" />
                </FormField>

                <FormField label="Description" error={errors.description?.message}>
                  <Textarea {...register('description')} placeholder="Describe what this service includes..." rows={3} />
                </FormField>

                <div className="grid grid-cols-2 gap-4">
                  <FormField label="Category" error={errors.category_id?.message}>
                    <Select {...register('category_id')}>
                      <option value="">No category</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </Select>
                  </FormField>

                  <FormField label="Classification" error={errors.classification?.message}>
                    <Select {...register('classification')}>
                      {Object.entries(CLASSIFICATION_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </Select>
                  </FormField>
                </div>

                <FormField
                  label="Base Duration (minutes)"
                  error={errors.base_duration_minutes?.message}
                  description="Estimated time to complete this service"
                >
                  <Input type="number" min="0" step="15" {...register('base_duration_minutes')} />
                </FormField>

                <FormField label="Vehicle Compatibility" description="Select which vehicle types this service applies to">
                  <div className="flex flex-wrap gap-4 mt-1">
                    {ALL_VEHICLE_TYPES.map((type) => (
                      <label key={type} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={vehicleCompatibility.includes(type)}
                          onChange={() => toggleVehicleType(type)}
                        />
                        {VEHICLE_TYPE_LABELS[type]}
                      </label>
                    ))}
                  </div>
                </FormField>

                <FormField label="Special Requirements" error={errors.special_requirements?.message}>
                  <Textarea {...register('special_requirements')} placeholder="Any special equipment or conditions needed..." rows={2} />
                </FormField>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Service Options</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                  <Controller
                    name="mobile_eligible"
                    control={control}
                    render={({ field }) => (
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-700">Mobile Eligible</p>
                          <p className="text-xs text-gray-500">Can be performed at customer location</p>
                        </div>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </div>
                    )}
                  />

                  <Controller
                    name="online_bookable"
                    control={control}
                    render={({ field }) => (
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-700">Online Bookable</p>
                          <p className="text-xs text-gray-500">Available for online scheduling</p>
                        </div>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </div>
                    )}
                  />

                  <Controller
                    name="staff_assessed"
                    control={control}
                    render={({ field }) => (
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-700">Staff Assessed</p>
                          <p className="text-xs text-gray-500">Requires staff evaluation for pricing</p>
                        </div>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </div>
                    )}
                  />

                  <Controller
                    name="is_taxable"
                    control={control}
                    render={({ field }) => (
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-700">Taxable</p>
                          <p className="text-xs text-gray-500">Sales tax applied to this service</p>
                        </div>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </div>
                    )}
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right column - Pricing */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Pricing Model</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Controller
                  name="pricing_model"
                  control={control}
                  render={({ field }) => (
                    <div className="space-y-2">
                      {(Object.keys(PRICING_MODEL_LABELS) as PricingModel[]).map((model) => (
                        <label
                          key={model}
                          className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                            field.value === model
                              ? 'border-gray-900 bg-gray-50'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <input
                            type="radio"
                            name="pricing_model"
                            value={model}
                            checked={field.value === model}
                            onChange={() => field.onChange(model)}
                            className="mt-0.5 h-4 w-4 border-gray-300 text-gray-900 focus:ring-gray-400"
                          />
                          <div>
                            <p className="text-sm font-medium text-gray-900">
                              {PRICING_MODEL_LABELS[model]}
                            </p>
                            <p className="text-xs text-gray-500">
                              {PRICING_MODEL_DESCRIPTIONS[model]}
                            </p>
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>
                  {PRICING_MODEL_LABELS[selectedPricingModel]} Pricing
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ServicePricingForm
                  pricingModel={selectedPricingModel}
                  value={pricingValue}
                  onChange={setPricingValue}
                />
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Action buttons */}
        <div className="mt-6 flex items-center justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push('/admin/catalog/services')}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'Creating...' : 'Create Service'}
          </Button>
        </div>
      </form>
    </div>
  );
}
