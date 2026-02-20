'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useForm, Controller } from 'react-hook-form';
import { formResolver } from '@/lib/utils/form';
import { createClient } from '@/lib/supabase/client';
import { usePermission } from '@/lib/hooks/use-permission';
import { serviceCreateSchema, type ServiceCreateInput } from '@/lib/utils/validation';
import type {
  Service,
  ServiceCategory,
  ServicePricing,
  ServiceAddonSuggestion,
  ServicePrerequisite,
  PricingModel,
  VehicleType,
  PrerequisiteEnforcement,
} from '@/lib/supabase/types';
import {
  PRICING_MODEL_LABELS,
  CLASSIFICATION_LABELS,
  VEHICLE_TYPE_LABELS,
} from '@/lib/utils/constants';
import { formatCurrency } from '@/lib/utils/format';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { FormField } from '@/components/ui/form-field';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogContent,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  ServicePricingForm,
  getDefaultPricingValue,
  type PricingValue,
  type VehicleSizePricing,
  type ScopeTier,
  type SpecialtyTier,
} from '@/components/service-pricing-form';
import { toast } from 'sonner';
import { ArrowLeft, Plus, Pencil, Trash2, X } from 'lucide-react';
import {
  getSaleStatus,
  getTierSaleInfo,
  getSaleStatusDisplay,
  getSaleEndDescription,
  isEndingSoon,
  hasAnySalePrice,
} from '@/lib/utils/sale-pricing';
import { ImageUpload } from '@/app/admin/catalog/components/image-upload';

type ServiceWithRelations = Service & {
  service_categories: Pick<ServiceCategory, 'id' | 'name'> | null;
};

type AddonSuggestionWithService = ServiceAddonSuggestion & {
  addon_service: Pick<Service, 'id' | 'name'> | null;
};

type PrerequisiteWithService = ServicePrerequisite & {
  prerequisite_service: Pick<Service, 'id' | 'name'> | null;
};

const ALL_VEHICLE_TYPES: VehicleType[] = ['standard', 'motorcycle', 'rv', 'boat', 'aircraft'];

const ENFORCEMENT_LABELS: Record<PrerequisiteEnforcement, string> = {
  required_same_ticket: 'Required (Same Ticket)',
  required_history: 'Required (History)',
  recommended: 'Recommended',
};

const ENFORCEMENT_BADGE_VARIANTS: Record<PrerequisiteEnforcement, 'destructive' | 'warning' | 'info'> = {
  required_same_ticket: 'destructive',
  required_history: 'warning',
  recommended: 'info',
};

export default function ServiceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const supabase = createClient();
  const { granted: canDeleteService } = usePermission('services.delete');
  const serviceId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [service, setService] = useState<ServiceWithRelations | null>(null);
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [allServices, setAllServices] = useState<Pick<Service, 'id' | 'name' | 'classification'>[]>([]);
  const [pricing, setPricing] = useState<ServicePricing[]>([]);
  const [addons, setAddons] = useState<AddonSuggestionWithService[]>([]);
  const [prerequisites, setPrerequisites] = useState<PrerequisiteWithService[]>([]);
  const [activeTab, setActiveTab] = useState('details');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Deactivate confirm dialog state
  const [showDeactivateDialog, setShowDeactivateDialog] = useState(false);

  // Image upload state
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageAlt, setImageAlt] = useState<string>('');

  // Pricing state
  const [pricingValue, setPricingValue] = useState<PricingValue>(getDefaultPricingValue('vehicle_size'));
  const [savingPricing, setSavingPricing] = useState(false);
  // Track original pricing row IDs so we can detect deletions on save
  const [originalPricingIds, setOriginalPricingIds] = useState<string[]>([]);

  // Sale pricing state
  const [salePrices, setSalePrices] = useState<Record<string, number | ''>>({});
  const [saleStartsAt, setSaleStartsAt] = useState('');
  const [saleEndsAt, setSaleEndsAt] = useState('');
  const [savingSale, setSavingSale] = useState(false);
  const [showClearSaleDialog, setShowClearSaleDialog] = useState(false);

  // Add-on dialog state
  const [addonDialogOpen, setAddonDialogOpen] = useState(false);
  const [editingAddon, setEditingAddon] = useState<AddonSuggestionWithService | null>(null);
  const [addonForm, setAddonForm] = useState({
    addon_service_id: '',
    combo_price: '' as number | '',
    display_order: 0,
    auto_suggest: true,
    is_seasonal: false,
    seasonal_start: '',
    seasonal_end: '',
  });
  const [savingAddon, setSavingAddon] = useState(false);
  const [deleteAddonId, setDeleteAddonId] = useState<string | null>(null);

  // Prerequisite dialog state
  const [prereqDialogOpen, setPrereqDialogOpen] = useState(false);
  const [editingPrereq, setEditingPrereq] = useState<PrerequisiteWithService | null>(null);
  const [prereqForm, setPrereqForm] = useState({
    prerequisite_service_id: '',
    enforcement: 'recommended' as PrerequisiteEnforcement,
    history_window_days: 30,
    warning_message: '',
  });
  const [savingPrereq, setSavingPrereq] = useState(false);
  const [deletePrereqId, setDeletePrereqId] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<ServiceCreateInput>({
    resolver: formResolver(serviceCreateSchema),
  });

  const vehicleCompatibility = watch('vehicle_compatibility') || [];
  const isActive = watch('is_active');

  // Load all data
  const loadData = useCallback(async () => {
    setLoading(true);
    const [serviceRes, categoriesRes, allServicesRes, pricingRes, addonsRes, prereqsRes] = await Promise.all([
      supabase
        .from('services')
        .select('*, service_categories(id, name)')
        .eq('id', serviceId)
        .single(),
      supabase
        .from('service_categories')
        .select('*')
        .eq('is_active', true)
        .order('display_order'),
      supabase
        .from('services')
        .select('id, name, classification')
        .neq('id', serviceId)
        .eq('is_active', true)
        .order('name'),
      supabase
        .from('service_pricing')
        .select('*')
        .eq('service_id', serviceId)
        .order('display_order'),
      supabase
        .from('service_addon_suggestions')
        .select('*, addon_service:addon_service_id(id, name)')
        .eq('primary_service_id', serviceId)
        .order('display_order'),
      supabase
        .from('service_prerequisites')
        .select('*, prerequisite_service:prerequisite_service_id(id, name)')
        .eq('service_id', serviceId)
        .order('created_at'),
    ]);

    if (serviceRes.error || !serviceRes.data) {
      toast.error('Service not found');
      router.push('/admin/catalog/services');
      return;
    }

    const svc = serviceRes.data as ServiceWithRelations;
    setService(svc);
    if (categoriesRes.data) setCategories(categoriesRes.data);
    if (allServicesRes.data) setAllServices(allServicesRes.data);
    if (pricingRes.data) setPricing(pricingRes.data);
    if (addonsRes.data) setAddons(addonsRes.data as AddonSuggestionWithService[]);
    if (prereqsRes.data) setPrerequisites(prereqsRes.data as PrerequisiteWithService[]);

    // Populate form
    reset({
      name: svc.name,
      description: svc.description || '',
      category_id: svc.category_id || null,
      pricing_model: svc.pricing_model,
      classification: svc.classification,
      base_duration_minutes: svc.base_duration_minutes,
      flat_price: svc.flat_price,
      custom_starting_price: svc.custom_starting_price,
      per_unit_price: svc.per_unit_price,
      per_unit_max: svc.per_unit_max,
      per_unit_label: svc.per_unit_label || '',
      mobile_eligible: svc.mobile_eligible,
      online_bookable: svc.online_bookable,
      staff_assessed: svc.staff_assessed,
      is_taxable: svc.is_taxable,
      vehicle_compatibility: svc.vehicle_compatibility,
      special_requirements: svc.special_requirements || '',
      is_active: svc.is_active,
      display_order: svc.display_order,
    });

    // Set image preview from existing URL
    if (svc.image_url) setImagePreview(svc.image_url);
    setImageAlt(svc.image_alt ?? '');

    // Build pricing value from existing rows
    buildPricingValue(svc.pricing_model, pricingRes.data || [], svc);

    // Populate sale pricing state
    const sp: Record<string, number | ''> = {};
    (pricingRes.data || []).forEach((r: ServicePricing) => {
      sp[r.tier_name] = r.sale_price ?? '';
    });
    setSalePrices(sp);
    // Convert ISO timestamps to local date strings for date inputs
    setSaleStartsAt(svc.sale_starts_at ? new Date(svc.sale_starts_at).toISOString().split('T')[0] : '');
    setSaleEndsAt(svc.sale_ends_at ? new Date(svc.sale_ends_at).toISOString().split('T')[0] : '');

    setLoading(false);
  }, [serviceId]); // eslint-disable-line react-hooks/exhaustive-deps

  function buildPricingValue(model: PricingModel, rows: ServicePricing[], svc: Service) {
    // Track original row IDs so we can detect deletions on save
    setOriginalPricingIds(rows.map((r) => r.id));

    switch (model) {
      case 'vehicle_size': {
        const vsp: VehicleSizePricing = { sedan: '', truck_suv_2row: '', suv_3row_van: '' };
        rows.forEach((r) => {
          if (r.tier_name === 'sedan') vsp.sedan = r.price;
          if (r.tier_name === 'truck_suv_2row') vsp.truck_suv_2row = r.price;
          if (r.tier_name === 'suv_3row_van') vsp.suv_3row_van = r.price;
        });
        setPricingValue({ model: 'vehicle_size', data: vsp });
        break;
      }
      case 'scope': {
        const scopeTiers: ScopeTier[] = rows.map((r) => ({
          id: r.id,
          tier_name: r.tier_name,
          tier_label: r.tier_label || '',
          price: r.price,
          is_vehicle_size_aware: r.is_vehicle_size_aware,
          vehicle_size_sedan_price: r.vehicle_size_sedan_price ?? '',
          vehicle_size_truck_suv_price: r.vehicle_size_truck_suv_price ?? '',
          vehicle_size_suv_van_price: r.vehicle_size_suv_van_price ?? '',
        }));
        setPricingValue({ model: 'scope', data: scopeTiers.length > 0 ? scopeTiers : [{ tier_name: '', tier_label: '', price: '', is_vehicle_size_aware: false, vehicle_size_sedan_price: '', vehicle_size_truck_suv_price: '', vehicle_size_suv_van_price: '' }] });
        break;
      }
      case 'per_unit':
        setPricingValue({
          model: 'per_unit',
          data: {
            per_unit_price: svc.per_unit_price ?? '',
            per_unit_max: svc.per_unit_max ?? '',
            per_unit_label: svc.per_unit_label || '',
          },
        });
        break;
      case 'specialty': {
        const specTiers: SpecialtyTier[] = rows.map((r) => ({
          id: r.id,
          tier_name: r.tier_name,
          tier_label: r.tier_label || '',
          price: r.price,
        }));
        setPricingValue({ model: 'specialty', data: specTiers.length > 0 ? specTiers : [{ tier_name: '', tier_label: '', price: '' }] });
        break;
      }
      case 'flat':
        setPricingValue({ model: 'flat', data: { flat_price: svc.flat_price ?? '' } });
        break;
      case 'custom':
        setPricingValue({ model: 'custom', data: { custom_starting_price: svc.custom_starting_price ?? '' } });
        break;
    }
  }

  useEffect(() => {
    loadData();
  }, [loadData]);

  function toggleVehicleType(type: VehicleType) {
    const current = vehicleCompatibility;
    if (current.includes(type)) {
      if (current.length === 1) return;
      setValue('vehicle_compatibility', current.filter((t) => t !== type));
    } else {
      setValue('vehicle_compatibility', [...current, type]);
    }
  }

  // Handle deactivate toggle — show confirm when toggling OFF
  function handleIsActiveToggle(checked: boolean) {
    if (!checked) {
      // Deactivating — show confirm dialog
      setShowDeactivateDialog(true);
    } else {
      // Reactivating — no confirm needed
      setValue('is_active', true);
    }
  }

  function confirmDeactivate() {
    setValue('is_active', false);
    setShowDeactivateDialog(false);
  }

  // ---- Delete (soft-delete via is_active = false) ----
  async function handleDelete() {
    setDeleting(true);
    try {
      const { error } = await supabase
        .from('services')
        .update({ is_active: false })
        .eq('id', serviceId);

      if (error) throw error;

      toast.success('Service deleted');
      router.push('/admin/catalog/services');
    } catch (err) {
      console.error('Delete service error:', err);
      toast.error('Failed to delete service');
    } finally {
      setDeleting(false);
      setShowDeleteDialog(false);
    }
  }

  // ---- Image Upload ----
  async function uploadImage(): Promise<string | null> {
    if (!imageFile) return null;

    const ext = imageFile.name.split('.').pop();
    const path = `services/${serviceId}.${ext}`;

    const { error } = await supabase.storage
      .from('service-images')
      .upload(path, imageFile, { upsert: true });

    if (error) {
      console.error('Image upload error:', error);
      toast.error('Failed to upload image');
      return null;
    }

    const { data: urlData } = supabase.storage
      .from('service-images')
      .getPublicUrl(path);

    return urlData.publicUrl;
  }

  async function handleRemoveImage() {
    if (service?.image_url) {
      // Extract path from URL
      const url = new URL(service.image_url);
      const pathMatch = url.pathname.match(/service-images\/(.+)/);
      if (pathMatch) {
        await supabase.storage.from('service-images').remove([pathMatch[1]]);
      }
    }

    const { error } = await supabase
      .from('services')
      .update({ image_url: null })
      .eq('id', serviceId);

    if (error) {
      toast.error('Failed to remove image');
      return;
    }

    setImageFile(null);
    setImagePreview(null);
    toast.success('Image removed');
    loadData();
  }

  // ---- Save Details ----
  async function onSaveDetails(formData: ServiceCreateInput) {
    setSaving(true);
    try {
      let imageUrl = service?.image_url || null;

      if (imageFile) {
        const newUrl = await uploadImage();
        if (newUrl) imageUrl = newUrl;
      }

      const payload: Record<string, unknown> = {
        name: formData.name,
        description: formData.description || null,
        category_id: formData.category_id || null,
        classification: formData.classification,
        base_duration_minutes: formData.base_duration_minutes,
        mobile_eligible: formData.mobile_eligible,
        online_bookable: formData.online_bookable,
        staff_assessed: formData.staff_assessed,
        is_taxable: formData.is_taxable,
        vehicle_compatibility: formData.vehicle_compatibility,
        special_requirements: formData.special_requirements || null,
        is_active: formData.is_active,
        display_order: formData.display_order,
        image_url: imageUrl,
        image_alt: imageAlt.trim() || null,
      };

      const { error } = await supabase
        .from('services')
        .update(payload)
        .eq('id', serviceId);

      if (error) throw error;
      setImageFile(null);
      toast.success('Service details updated');
      loadData();
    } catch (err) {
      console.error('Failed to update service:', err);
      toast.error('Failed to update service');
    } finally {
      setSaving(false);
    }
  }

  // ---- Save Pricing ----
  async function onSavePricing() {
    if (!service) return;
    setSavingPricing(true);
    try {
      const model = service.pricing_model;

      // Update service-level fields
      const serviceUpdate: Record<string, unknown> = {};
      if (model === 'flat' && pricingValue.model === 'flat') {
        serviceUpdate.flat_price = typeof pricingValue.data.flat_price === 'number' ? pricingValue.data.flat_price : null;
      }
      if (model === 'custom' && pricingValue.model === 'custom') {
        serviceUpdate.custom_starting_price = typeof pricingValue.data.custom_starting_price === 'number' ? pricingValue.data.custom_starting_price : null;
      }
      if (model === 'per_unit' && pricingValue.model === 'per_unit') {
        serviceUpdate.per_unit_price = typeof pricingValue.data.per_unit_price === 'number' ? pricingValue.data.per_unit_price : null;
        serviceUpdate.per_unit_max = typeof pricingValue.data.per_unit_max === 'number' ? pricingValue.data.per_unit_max : null;
        serviceUpdate.per_unit_label = pricingValue.data.per_unit_label || null;
      }

      if (Object.keys(serviceUpdate).length > 0) {
        const { error } = await supabase.from('services').update(serviceUpdate).eq('id', serviceId);
        if (error) throw error;
      }

      // Handle pricing rows for models that use service_pricing table
      if (['vehicle_size', 'scope', 'specialty'].includes(model)) {

        // ---- Vehicle Size: use upsert on (service_id, tier_name) unique constraint ----
        if (model === 'vehicle_size' && pricingValue.model === 'vehicle_size') {
          const upsertRows = [
            { service_id: serviceId, tier_name: 'sedan', tier_label: 'Sedan', price: typeof pricingValue.data.sedan === 'number' ? pricingValue.data.sedan : 0, display_order: 0, is_vehicle_size_aware: false },
            { service_id: serviceId, tier_name: 'truck_suv_2row', tier_label: 'Truck/SUV (2-Row)', price: typeof pricingValue.data.truck_suv_2row === 'number' ? pricingValue.data.truck_suv_2row : 0, display_order: 1, is_vehicle_size_aware: false },
            { service_id: serviceId, tier_name: 'suv_3row_van', tier_label: 'SUV (3-Row) / Van', price: typeof pricingValue.data.suv_3row_van === 'number' ? pricingValue.data.suv_3row_van : 0, display_order: 2, is_vehicle_size_aware: false },
          ];
          const { error: upsertError } = await supabase
            .from('service_pricing')
            .upsert(upsertRows, { onConflict: 'service_id,tier_name' });
          if (upsertError) throw upsertError;
        }

        // ---- Scope: update existing, insert new, delete removed ----
        if (model === 'scope' && pricingValue.model === 'scope') {
          const validTiers = pricingValue.data.filter((t: ScopeTier) => t.tier_name.trim() !== '');
          const existingTiers = validTiers.filter((t: ScopeTier) => t.id);
          const newTiers = validTiers.filter((t: ScopeTier) => !t.id);

          // Determine which original IDs were removed by the user
          const currentIds = existingTiers.map((t: ScopeTier) => t.id as string);
          const removedIds = originalPricingIds.filter((id) => !currentIds.includes(id));

          // Delete removed tiers
          if (removedIds.length > 0) {
            const { error: deleteError } = await supabase
              .from('service_pricing')
              .delete()
              .in('id', removedIds);
            if (deleteError) throw deleteError;
          }

          // Update existing tiers
          for (let i = 0; i < existingTiers.length; i++) {
            const t = existingTiers[i];
            // Find the overall index for display_order
            const displayOrder = validTiers.indexOf(t);
            const { error: updateError } = await supabase
              .from('service_pricing')
              .update({
                tier_name: t.tier_name,
                tier_label: t.tier_label || null,
                price: typeof t.price === 'number' ? t.price : 0,
                display_order: displayOrder,
                is_vehicle_size_aware: t.is_vehicle_size_aware,
                vehicle_size_sedan_price: t.is_vehicle_size_aware && typeof t.vehicle_size_sedan_price === 'number' ? t.vehicle_size_sedan_price : null,
                vehicle_size_truck_suv_price: t.is_vehicle_size_aware && typeof t.vehicle_size_truck_suv_price === 'number' ? t.vehicle_size_truck_suv_price : null,
                vehicle_size_suv_van_price: t.is_vehicle_size_aware && typeof t.vehicle_size_suv_van_price === 'number' ? t.vehicle_size_suv_van_price : null,
              })
              .eq('id', t.id as string);
            if (updateError) throw updateError;
          }

          // Insert new tiers
          if (newTiers.length > 0) {
            const insertRows = newTiers.map((t: ScopeTier) => {
              const displayOrder = validTiers.indexOf(t);
              return {
                service_id: serviceId,
                tier_name: t.tier_name,
                tier_label: t.tier_label || null,
                price: typeof t.price === 'number' ? t.price : 0,
                display_order: displayOrder,
                is_vehicle_size_aware: t.is_vehicle_size_aware,
                vehicle_size_sedan_price: t.is_vehicle_size_aware && typeof t.vehicle_size_sedan_price === 'number' ? t.vehicle_size_sedan_price : null,
                vehicle_size_truck_suv_price: t.is_vehicle_size_aware && typeof t.vehicle_size_truck_suv_price === 'number' ? t.vehicle_size_truck_suv_price : null,
                vehicle_size_suv_van_price: t.is_vehicle_size_aware && typeof t.vehicle_size_suv_van_price === 'number' ? t.vehicle_size_suv_van_price : null,
              };
            });
            const { error: insertError } = await supabase.from('service_pricing').insert(insertRows);
            if (insertError) throw insertError;
          }
        }

        // ---- Specialty: update existing, insert new, delete removed ----
        if (model === 'specialty' && pricingValue.model === 'specialty') {
          const validTiers = pricingValue.data.filter((t: SpecialtyTier) => t.tier_name.trim() !== '');
          const existingTiers = validTiers.filter((t: SpecialtyTier) => t.id);
          const newTiers = validTiers.filter((t: SpecialtyTier) => !t.id);

          // Determine which original IDs were removed by the user
          const currentIds = existingTiers.map((t: SpecialtyTier) => t.id as string);
          const removedIds = originalPricingIds.filter((id) => !currentIds.includes(id));

          // Delete removed tiers
          if (removedIds.length > 0) {
            const { error: deleteError } = await supabase
              .from('service_pricing')
              .delete()
              .in('id', removedIds);
            if (deleteError) throw deleteError;
          }

          // Update existing tiers
          for (let i = 0; i < existingTiers.length; i++) {
            const t = existingTiers[i];
            const displayOrder = validTiers.indexOf(t);
            const { error: updateError } = await supabase
              .from('service_pricing')
              .update({
                tier_name: t.tier_name,
                tier_label: t.tier_label || null,
                price: typeof t.price === 'number' ? t.price : 0,
                display_order: displayOrder,
                is_vehicle_size_aware: false,
              })
              .eq('id', t.id as string);
            if (updateError) throw updateError;
          }

          // Insert new tiers
          if (newTiers.length > 0) {
            const insertRows = newTiers.map((t: SpecialtyTier) => {
              const displayOrder = validTiers.indexOf(t);
              return {
                service_id: serviceId,
                tier_name: t.tier_name,
                tier_label: t.tier_label || null,
                price: typeof t.price === 'number' ? t.price : 0,
                display_order: displayOrder,
                is_vehicle_size_aware: false,
              };
            });
            const { error: insertError } = await supabase.from('service_pricing').insert(insertRows);
            if (insertError) throw insertError;
          }
        }
      }

      toast.success('Pricing updated');
      loadData();
    } catch (err) {
      console.error('Failed to update pricing:', err);
      toast.error('Failed to update pricing');
    } finally {
      setSavingPricing(false);
    }
  }

  // ---- Add-On Suggestions CRUD ----
  function openAddonDialog(addon?: AddonSuggestionWithService) {
    if (addon) {
      setEditingAddon(addon);
      setAddonForm({
        addon_service_id: addon.addon_service_id,
        combo_price: addon.combo_price ?? '',
        display_order: addon.display_order,
        auto_suggest: addon.auto_suggest,
        is_seasonal: addon.is_seasonal,
        seasonal_start: addon.seasonal_start || '',
        seasonal_end: addon.seasonal_end || '',
      });
    } else {
      setEditingAddon(null);
      setAddonForm({
        addon_service_id: '',
        combo_price: '',
        display_order: addons.length,
        auto_suggest: true,
        is_seasonal: false,
        seasonal_start: '',
        seasonal_end: '',
      });
    }
    setAddonDialogOpen(true);
  }

  async function saveAddon() {
    if (!addonForm.addon_service_id) {
      toast.error('Please select an add-on service');
      return;
    }
    setSavingAddon(true);
    try {
      const payload = {
        primary_service_id: serviceId,
        addon_service_id: addonForm.addon_service_id,
        combo_price: typeof addonForm.combo_price === 'number' ? addonForm.combo_price : null,
        display_order: addonForm.display_order,
        auto_suggest: addonForm.auto_suggest,
        is_seasonal: addonForm.is_seasonal,
        seasonal_start: addonForm.is_seasonal && addonForm.seasonal_start ? addonForm.seasonal_start : null,
        seasonal_end: addonForm.is_seasonal && addonForm.seasonal_end ? addonForm.seasonal_end : null,
      };

      if (editingAddon) {
        const { error } = await supabase
          .from('service_addon_suggestions')
          .update(payload)
          .eq('id', editingAddon.id);
        if (error) throw error;
        toast.success('Add-on suggestion updated');
      } else {
        const { error } = await supabase
          .from('service_addon_suggestions')
          .insert(payload);
        if (error) throw error;
        toast.success('Add-on suggestion created');
      }

      setAddonDialogOpen(false);
      loadData();
    } catch (err) {
      console.error('Failed to save add-on suggestion:', err);
      toast.error('Failed to save add-on suggestion');
    } finally {
      setSavingAddon(false);
    }
  }

  async function deleteAddon() {
    if (!deleteAddonId) return;
    try {
      const { error } = await supabase
        .from('service_addon_suggestions')
        .delete()
        .eq('id', deleteAddonId);
      if (error) throw error;
      toast.success('Add-on suggestion removed');
      setDeleteAddonId(null);
      loadData();
    } catch (err) {
      console.error('Failed to delete add-on suggestion:', err);
      toast.error('Failed to delete add-on suggestion');
    }
  }

  // ---- Prerequisites CRUD ----
  function openPrereqDialog(prereq?: PrerequisiteWithService) {
    if (prereq) {
      setEditingPrereq(prereq);
      setPrereqForm({
        prerequisite_service_id: prereq.prerequisite_service_id,
        enforcement: prereq.enforcement,
        history_window_days: prereq.history_window_days || 30,
        warning_message: prereq.warning_message || '',
      });
    } else {
      setEditingPrereq(null);
      setPrereqForm({
        prerequisite_service_id: '',
        enforcement: 'recommended',
        history_window_days: 30,
        warning_message: '',
      });
    }
    setPrereqDialogOpen(true);
  }

  async function savePrereq() {
    if (!prereqForm.prerequisite_service_id) {
      toast.error('Please select a prerequisite service');
      return;
    }
    setSavingPrereq(true);
    try {
      const payload = {
        service_id: serviceId,
        prerequisite_service_id: prereqForm.prerequisite_service_id,
        enforcement: prereqForm.enforcement,
        history_window_days: prereqForm.enforcement === 'required_history' ? prereqForm.history_window_days : null,
        warning_message: prereqForm.warning_message || null,
      };

      if (editingPrereq) {
        const { error } = await supabase
          .from('service_prerequisites')
          .update(payload)
          .eq('id', editingPrereq.id);
        if (error) throw error;
        toast.success('Prerequisite updated');
      } else {
        const { error } = await supabase
          .from('service_prerequisites')
          .insert(payload);
        if (error) throw error;
        toast.success('Prerequisite added');
      }

      setPrereqDialogOpen(false);
      loadData();
    } catch (err) {
      console.error('Failed to save prerequisite:', err);
      toast.error('Failed to save prerequisite');
    } finally {
      setSavingPrereq(false);
    }
  }

  async function deletePrereq() {
    if (!deletePrereqId) return;
    try {
      const { error } = await supabase
        .from('service_prerequisites')
        .delete()
        .eq('id', deletePrereqId);
      if (error) throw error;
      toast.success('Prerequisite removed');
      setDeletePrereqId(null);
      loadData();
    } catch (err) {
      console.error('Failed to delete prerequisite:', err);
      toast.error('Failed to delete prerequisite');
    }
  }

  // ---- Save Sale Pricing ----
  async function onSaveSalePricing() {
    if (!service) return;
    setSavingSale(true);
    try {
      // Validate: each sale price must be less than its standard price
      for (const row of pricing) {
        const sp = salePrices[row.tier_name];
        if (sp !== '' && sp !== undefined && typeof sp === 'number') {
          if (sp >= row.price) {
            toast.error(`Sale price for ${row.tier_label || row.tier_name} must be less than standard price (${formatCurrency(row.price)})`);
            setSavingSale(false);
            return;
          }
          if (sp <= 0) {
            toast.error(`Sale price for ${row.tier_label || row.tier_name} must be greater than $0`);
            setSavingSale(false);
            return;
          }
        }
      }

      // Update sale_price on each pricing row
      for (const row of pricing) {
        const sp = salePrices[row.tier_name];
        const salePrice = (sp !== '' && typeof sp === 'number') ? sp : null;
        const { error } = await supabase
          .from('service_pricing')
          .update({ sale_price: salePrice })
          .eq('id', row.id);
        if (error) throw error;
      }

      // Update sale dates on service
      const startTs = saleStartsAt ? new Date(saleStartsAt + 'T00:00:00-08:00').toISOString() : null;
      const endTs = saleEndsAt ? new Date(saleEndsAt + 'T23:59:59-08:00').toISOString() : null;
      const { error: svcError } = await supabase
        .from('services')
        .update({ sale_starts_at: startTs, sale_ends_at: endTs })
        .eq('id', serviceId);
      if (svcError) throw svcError;

      toast.success('Sale pricing updated');
      loadData();
    } catch (err) {
      console.error('Failed to update sale pricing:', err);
      toast.error('Failed to update sale pricing');
    } finally {
      setSavingSale(false);
    }
  }

  // ---- Clear All Sale Prices ----
  async function clearAllSalePrices() {
    setSavingSale(true);
    try {
      // Clear sale_price on all pricing rows
      for (const row of pricing) {
        const { error } = await supabase
          .from('service_pricing')
          .update({ sale_price: null })
          .eq('id', row.id);
        if (error) throw error;
      }

      // Clear sale dates on service
      const { error: svcError } = await supabase
        .from('services')
        .update({ sale_starts_at: null, sale_ends_at: null })
        .eq('id', serviceId);
      if (svcError) throw svcError;

      toast.success('Sale pricing cleared');
      setShowClearSaleDialog(false);
      loadData();
    } catch (err) {
      console.error('Failed to clear sale pricing:', err);
      toast.error('Failed to clear sale pricing');
    } finally {
      setSavingSale(false);
    }
  }

  // ---- Rendering ----
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!service) return null;

  const addonEligibleServices = allServices.filter(
    (s) => s.classification !== 'primary' && !addons.some((a) => a.addon_service_id === s.id)
  );

  const prereqEligibleServices = allServices.filter(
    (s) => !prerequisites.some((p) => p.prerequisite_service_id === s.id)
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {service.name}
            <Badge variant={service.is_active ? 'success' : 'secondary'}>
              {service.is_active ? 'Active' : 'Inactive'}
            </Badge>
          </span>
        }
        description={`${PRICING_MODEL_LABELS[service.pricing_model]} pricing - ${CLASSIFICATION_LABELS[service.classification]}`}
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => router.push('/admin/catalog/services')}>
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            {canDeleteService && (
              <Button variant="destructive" onClick={() => setShowDeleteDialog(true)}>
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            )}
          </div>
        }
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="pricing">Pricing</TabsTrigger>
          <TabsTrigger value="addons">
            Add-Ons
            {addons.length > 0 && (
              <Badge variant="secondary" className="ml-2">{addons.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="prerequisites">
            Prerequisites
            {prerequisites.length > 0 && (
              <Badge variant="secondary" className="ml-2">{prerequisites.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ---- Details Tab ---- */}
        <TabsContent value="details">
          <form onSubmit={handleSubmit(onSaveDetails)}>
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Service Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField label="Service Name" required error={errors.name?.message}>
                    <Input {...register('name')} />
                  </FormField>

                  <FormField label="Description" error={errors.description?.message}>
                    <Textarea {...register('description')} rows={3} />
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

                  <FormField label="Base Duration (minutes)" error={errors.base_duration_minutes?.message}>
                    <Input type="number" min="0" step="15" {...register('base_duration_minutes')} />
                  </FormField>

                  <FormField label="Vehicle Compatibility">
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
                    <Textarea {...register('special_requirements')} rows={2} />
                  </FormField>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Service Options</CardTitle>
                </CardHeader>
                <CardContent>
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

              <Card>
                <CardHeader>
                  <CardTitle>Display Settings</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    label="Display Order"
                    description="Lower numbers appear first in POS and booking"
                    error={errors.display_order?.message}
                  >
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      {...register('display_order')}
                    />
                  </FormField>

                  <Controller
                    name="is_active"
                    control={control}
                    render={({ field }) => (
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-700">Active</p>
                          <p className="text-xs text-gray-500">
                            {field.value
                              ? 'Service is visible in POS and booking'
                              : 'Service is hidden from POS and booking'}
                          </p>
                        </div>
                        <Switch
                          checked={field.value}
                          onCheckedChange={handleIsActiveToggle}
                        />
                      </div>
                    )}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Service Image</CardTitle>
                </CardHeader>
                <CardContent>
                  <ImageUpload
                    imageUrl={imagePreview}
                    onUpload={async (file) => {
                      setImageFile(file);
                      setImagePreview(URL.createObjectURL(file));
                    }}
                    onRemove={handleRemoveImage}
                    uploading={saving}
                  />
                  {imagePreview && (
                    <div className="mt-4">
                      <FormField
                        label="Image Alt Text"
                        htmlFor="image_alt"
                        description="Describes the image for search engines and accessibility"
                      >
                        <Input
                          id="image_alt"
                          value={imageAlt}
                          onChange={(e) => setImageAlt(e.target.value)}
                          placeholder={`${service?.name ?? 'Service'} - ${service?.service_categories?.name ?? 'Auto Detailing'}`}
                        />
                      </FormField>
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="flex justify-end gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.push('/admin/catalog/services')}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? 'Saving...' : 'Save Details'}
                </Button>
              </div>
            </div>
          </form>
        </TabsContent>

        {/* ---- Pricing Tab ---- */}
        <TabsContent value="pricing">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {PRICING_MODEL_LABELS[service.pricing_model]} Pricing
                {(() => {
                  const hasDbSale = hasAnySalePrice(pricing);
                  if (!hasDbSale) return null;
                  const ss = getSaleStatus(service);
                  const sd = getSaleStatusDisplay(ss);
                  const ed = getSaleEndDescription(ss.saleEndsAt);
                  return (
                    <Badge
                      variant={
                        ss.isOnSale ? 'success' :
                        ss.isScheduled ? 'warning' :
                        ss.isExpired ? 'destructive' : 'secondary'
                      }
                    >
                      {sd.emoji} {sd.label}
                      {ss.isOnSale && ed && ` — ${ed}`}
                    </Badge>
                  );
                })()}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {service.pricing_model === 'vehicle_size' && pricingValue.model === 'vehicle_size' ? (
                <VehicleSizeUnifiedPricing
                  pricingValue={pricingValue.data}
                  onPricingChange={(data) => setPricingValue({ model: 'vehicle_size', data })}
                  salePrices={salePrices}
                  setSalePrices={setSalePrices}
                  pricing={pricing}
                />
              ) : (
                <>
                  <ServicePricingForm
                    pricingModel={service.pricing_model}
                    value={pricingValue}
                    onChange={setPricingValue}
                  />
                  {/* Inline sale pricing for scope/specialty tiers */}
                  {pricing.length > 0 && (
                    <div className="border-t border-gray-200 pt-6">
                      <p className="mb-3 text-sm font-semibold text-gray-700">Sale Prices</p>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-gray-200">
                              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Tier</th>
                              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Standard</th>
                              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Sale Price</th>
                            </tr>
                          </thead>
                          <tbody>
                            {[...pricing].sort((a, b) => a.display_order - b.display_order).map((tier) => {
                              const sp = salePrices[tier.tier_name] ?? '';
                              const hasError = sp !== '' && typeof sp === 'number' && sp >= tier.price;
                              return (
                                <tr key={tier.id} className="border-b border-gray-100">
                                  <td className="px-3 py-3 font-medium text-gray-700">{tier.tier_label || tier.tier_name}</td>
                                  <td className="px-3 py-3 text-gray-600">{formatCurrency(tier.price)}</td>
                                  <td className="px-3 py-3">
                                    <div className="relative max-w-[160px]">
                                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">$</span>
                                      <Input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        placeholder="No sale"
                                        className={`pl-7 ${hasError ? 'border-red-500 focus:ring-red-500' : ''}`}
                                        value={sp}
                                        onChange={(e) => setSalePrices({
                                          ...salePrices,
                                          [tier.tier_name]: e.target.value === '' ? '' : parseFloat(e.target.value),
                                        })}
                                      />
                                      {hasError && <p className="mt-1 text-xs text-red-500">Must be less than {formatCurrency(tier.price)}</p>}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Sale Period — shown when pricing rows exist */}
              {pricing.length > 0 && (
                <div className={service.pricing_model !== 'vehicle_size' ? 'border-t border-gray-200 pt-6' : ''}>
                  <p className="mb-2 text-sm font-medium text-gray-700">Sale Period (applies to all tiers)</p>
                  <div className="flex items-center gap-3">
                    <Input
                      type="date"
                      value={saleStartsAt}
                      onChange={(e) => setSaleStartsAt(e.target.value)}
                      className="max-w-[180px]"
                    />
                    <span className="text-gray-400">&rarr;</span>
                    <Input
                      type="date"
                      value={saleEndsAt}
                      onChange={(e) => setSaleEndsAt(e.target.value)}
                      className="max-w-[180px]"
                    />
                  </div>
                  <p className="mt-1 text-xs text-gray-400">Leave dates empty for no time limit</p>
                </div>
              )}

              {/* Sale Preview */}
              {pricing.length > 0 && (() => {
                const sortedTiers = [...pricing].sort((a, b) => a.display_order - b.display_order);
                const hasSale = sortedTiers.some((t) => salePrices[t.tier_name] !== '' && salePrices[t.tier_name] !== undefined);
                const hasDbSale = hasAnySalePrice(pricing);
                const endingSoon = isEndingSoon(getSaleStatus(service).saleEndsAt);
                if (!hasSale) return null;
                return (
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                    <p className="mb-2 text-sm font-semibold text-gray-700">
                      Sale Preview
                      {hasDbSale && getSaleStatus(service).isOnSale && endingSoon && (
                        <span className="ml-2 text-amber-600">&#9200; Ending soon!</span>
                      )}
                    </p>
                    <div className="space-y-1 text-sm">
                      {sortedTiers.map((tier) => {
                        const sp = salePrices[tier.tier_name];
                        if (sp === '' || sp === undefined || typeof sp !== 'number') return null;
                        const info = getTierSaleInfo(tier.price, sp, true);
                        if (!info || !info.isDiscounted) return null;
                        return (
                          <div key={tier.id} className="flex items-center gap-2 text-gray-600">
                            <span className="font-medium min-w-[140px]">{tier.tier_label || tier.tier_name}:</span>
                            <span className="text-gray-400 line-through">{formatCurrency(info.originalPrice)}</span>
                            <span className="text-gray-400">&rarr;</span>
                            <span className="font-semibold text-green-600">{formatCurrency(info.currentPrice)}</span>
                            <span className="text-xs text-gray-400">
                              (-{info.discountPercent}%, save {formatCurrency(info.savings)})
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* Action buttons */}
              <div className="flex items-center justify-between">
                {hasAnySalePrice(pricing) && (
                  <Button variant="outline" size="sm" onClick={() => setShowClearSaleDialog(true)} disabled={savingSale}>
                    <X className="h-4 w-4" />
                    Clear All Sale Prices
                  </Button>
                )}
                <div className="ml-auto flex items-center gap-3">
                  <Button onClick={onSavePricing} disabled={savingPricing}>
                    {savingPricing ? 'Saving...' : 'Save Pricing'}
                  </Button>
                  {pricing.length > 0 && (
                    <Button onClick={onSaveSalePricing} disabled={savingSale}>
                      {savingSale ? 'Saving...' : 'Save Sale Pricing'}
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---- Add-Ons Tab ---- */}
        <TabsContent value="addons">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Add-On Suggestions</CardTitle>
              <Button size="sm" onClick={() => openAddonDialog()}>
                <Plus className="h-4 w-4" />
                Add Suggestion
              </Button>
            </CardHeader>
            <CardContent>
              {addons.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-500">
                  No add-on suggestions configured. Add services that pair well with this one.
                </p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {addons.map((addon) => (
                    <div key={addon.id} className="flex items-center justify-between py-3">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">
                          {addon.addon_service?.name || 'Unknown Service'}
                        </p>
                        <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
                          {addon.combo_price !== null && (
                            <span>Combo price: {formatCurrency(addon.combo_price)}</span>
                          )}
                          <span>Order: {addon.display_order}</span>
                          {addon.auto_suggest && (
                            <Badge variant="info">Auto-suggest</Badge>
                          )}
                          {addon.is_seasonal && (
                            <Badge variant="warning">
                              Seasonal: {addon.seasonal_start} - {addon.seasonal_end}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openAddonDialog(addon)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setDeleteAddonId(addon.id)}>
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---- Prerequisites Tab ---- */}
        <TabsContent value="prerequisites">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Service Prerequisites</CardTitle>
              <Button size="sm" onClick={() => openPrereqDialog()}>
                <Plus className="h-4 w-4" />
                Add Prerequisite
              </Button>
            </CardHeader>
            <CardContent>
              {prerequisites.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-500">
                  No prerequisites configured. Add services that must be completed before this one.
                </p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {prerequisites.map((prereq) => (
                    <div key={prereq.id} className="flex items-center justify-between py-3">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">
                          {prereq.prerequisite_service?.name || 'Unknown Service'}
                        </p>
                        <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
                          <Badge variant={ENFORCEMENT_BADGE_VARIANTS[prereq.enforcement]}>
                            {ENFORCEMENT_LABELS[prereq.enforcement]}
                          </Badge>
                          {prereq.enforcement === 'required_history' && prereq.history_window_days && (
                            <span>Within {prereq.history_window_days} days</span>
                          )}
                          {prereq.warning_message && (
                            <span className="text-gray-400 truncate max-w-xs">{prereq.warning_message}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openPrereqDialog(prereq)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setDeletePrereqId(prereq.id)}>
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ---- Add-On Dialog ---- */}
      <Dialog open={addonDialogOpen} onOpenChange={setAddonDialogOpen}>
        <DialogClose onClose={() => setAddonDialogOpen(false)} />
        <DialogHeader>
          <DialogTitle>{editingAddon ? 'Edit Add-On Suggestion' : 'Add Add-On Suggestion'}</DialogTitle>
        </DialogHeader>
        <DialogContent className="space-y-4">
          <FormField label="Add-On Service" required>
            <Select
              value={addonForm.addon_service_id}
              onChange={(e) => setAddonForm({ ...addonForm, addon_service_id: e.target.value })}
              disabled={!!editingAddon}
            >
              <option value="">Select a service...</option>
              {(editingAddon ? allServices.filter((s) => s.classification !== 'primary') : addonEligibleServices).map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
          </FormField>

          <FormField label="Combo Price" description="Special price when booked together (leave empty for regular price)">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">$</span>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="Regular price"
                className="pl-7"
                value={addonForm.combo_price}
                onChange={(e) => setAddonForm({
                  ...addonForm,
                  combo_price: e.target.value === '' ? '' : parseFloat(e.target.value),
                })}
              />
            </div>
          </FormField>

          <FormField label="Display Order">
            <Input
              type="number"
              min="0"
              step="1"
              value={addonForm.display_order}
              onChange={(e) => setAddonForm({ ...addonForm, display_order: parseInt(e.target.value, 10) || 0 })}
            />
          </FormField>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700">Auto-Suggest</p>
              <p className="text-xs text-gray-500">Automatically suggest during booking</p>
            </div>
            <Switch
              checked={addonForm.auto_suggest}
              onCheckedChange={(checked) => setAddonForm({ ...addonForm, auto_suggest: checked })}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700">Seasonal</p>
              <p className="text-xs text-gray-500">Only suggest during specific dates</p>
            </div>
            <Switch
              checked={addonForm.is_seasonal}
              onCheckedChange={(checked) => setAddonForm({ ...addonForm, is_seasonal: checked })}
            />
          </div>

          {addonForm.is_seasonal && (
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Start Date">
                <Input
                  type="date"
                  value={addonForm.seasonal_start}
                  onChange={(e) => setAddonForm({ ...addonForm, seasonal_start: e.target.value })}
                />
              </FormField>
              <FormField label="End Date">
                <Input
                  type="date"
                  value={addonForm.seasonal_end}
                  onChange={(e) => setAddonForm({ ...addonForm, seasonal_end: e.target.value })}
                />
              </FormField>
            </div>
          )}
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setAddonDialogOpen(false)} disabled={savingAddon}>
            Cancel
          </Button>
          <Button onClick={saveAddon} disabled={savingAddon}>
            {savingAddon ? 'Saving...' : editingAddon ? 'Update' : 'Add'}
          </Button>
        </DialogFooter>
      </Dialog>

      {/* ---- Prerequisite Dialog ---- */}
      <Dialog open={prereqDialogOpen} onOpenChange={setPrereqDialogOpen}>
        <DialogClose onClose={() => setPrereqDialogOpen(false)} />
        <DialogHeader>
          <DialogTitle>{editingPrereq ? 'Edit Prerequisite' : 'Add Prerequisite'}</DialogTitle>
        </DialogHeader>
        <DialogContent className="space-y-4">
          <FormField label="Prerequisite Service" required>
            <Select
              value={prereqForm.prerequisite_service_id}
              onChange={(e) => setPrereqForm({ ...prereqForm, prerequisite_service_id: e.target.value })}
              disabled={!!editingPrereq}
            >
              <option value="">Select a service...</option>
              {(editingPrereq ? allServices : prereqEligibleServices).map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
          </FormField>

          <FormField label="Enforcement Type" required>
            <Select
              value={prereqForm.enforcement}
              onChange={(e) => setPrereqForm({ ...prereqForm, enforcement: e.target.value as PrerequisiteEnforcement })}
            >
              <option value="recommended">Recommended</option>
              <option value="required_same_ticket">Required (Same Ticket)</option>
              <option value="required_history">Required (History)</option>
            </Select>
          </FormField>

          {prereqForm.enforcement === 'required_history' && (
            <FormField label="History Window (days)" description="How recently the prerequisite must have been completed">
              <Input
                type="number"
                min="1"
                step="1"
                value={prereqForm.history_window_days}
                onChange={(e) => setPrereqForm({ ...prereqForm, history_window_days: parseInt(e.target.value, 10) || 30 })}
              />
            </FormField>
          )}

          <FormField label="Warning Message" description="Shown to staff when prerequisite is not met">
            <Textarea
              value={prereqForm.warning_message}
              onChange={(e) => setPrereqForm({ ...prereqForm, warning_message: e.target.value })}
              placeholder="e.g., Customer should have a wash before this service"
              rows={2}
            />
          </FormField>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setPrereqDialogOpen(false)} disabled={savingPrereq}>
            Cancel
          </Button>
          <Button onClick={savePrereq} disabled={savingPrereq}>
            {savingPrereq ? 'Saving...' : editingPrereq ? 'Update' : 'Add'}
          </Button>
        </DialogFooter>
      </Dialog>

      {/* ---- Delete Confirmations ---- */}
      <ConfirmDialog
        open={!!deleteAddonId}
        onOpenChange={(open) => !open && setDeleteAddonId(null)}
        title="Remove Add-On Suggestion"
        description="Are you sure you want to remove this add-on suggestion? This action cannot be undone."
        confirmLabel="Remove"
        variant="destructive"
        onConfirm={deleteAddon}
      />

      <ConfirmDialog
        open={!!deletePrereqId}
        onOpenChange={(open) => !open && setDeletePrereqId(null)}
        title="Remove Prerequisite"
        description="Are you sure you want to remove this prerequisite? This action cannot be undone."
        confirmLabel="Remove"
        variant="destructive"
        onConfirm={deletePrereq}
      />

      {/* ---- Deactivate Confirmation ---- */}
      <ConfirmDialog
        open={showDeactivateDialog}
        onOpenChange={setShowDeactivateDialog}
        title={`Deactivate ${service.name}?`}
        description="It will be hidden from POS and booking. You can reactivate it later."
        confirmLabel="Deactivate"
        variant="destructive"
        onConfirm={confirmDeactivate}
      />

      {/* ---- Delete Confirmation ---- */}
      <ConfirmDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        title="Delete Service"
        description={`Are you sure you want to delete "${service.name}"? This will deactivate the service from the catalog.`}
        confirmLabel="Delete"
        variant="destructive"
        loading={deleting}
        onConfirm={handleDelete}
      />

      {/* ---- Clear Sale Pricing Confirmation ---- */}
      <ConfirmDialog
        open={showClearSaleDialog}
        onOpenChange={setShowClearSaleDialog}
        title="Clear All Sale Prices"
        description="This will remove all sale prices and date ranges for this service. The standard prices will remain unchanged."
        confirmLabel="Clear Sale"
        variant="destructive"
        loading={savingSale}
        onConfirm={clearAllSalePrices}
      />
    </div>
  );
}

// ─── Vehicle Size Unified Pricing (Standard + Sale in one table) ─────────

const VEHICLE_SIZE_TIER_KEYS: { key: 'sedan' | 'truck_suv_2row' | 'suv_3row_van'; label: string }[] = [
  { key: 'sedan', label: 'Sedan' },
  { key: 'truck_suv_2row', label: 'Truck/SUV (2-Row)' },
  { key: 'suv_3row_van', label: 'SUV (3-Row) / Van' },
];

function VehicleSizeUnifiedPricing({
  pricingValue,
  onPricingChange,
  salePrices,
  setSalePrices,
  pricing,
}: {
  pricingValue: VehicleSizePricing;
  onPricingChange: (data: VehicleSizePricing) => void;
  salePrices: Record<string, number | ''>;
  setSalePrices: (v: Record<string, number | ''>) => void;
  pricing: ServicePricing[];
}) {
  return (
    <>
      {/* Desktop table */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Vehicle Type</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Standard Price</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Sale Price</th>
            </tr>
          </thead>
          <tbody>
            {VEHICLE_SIZE_TIER_KEYS.map(({ key, label }) => {
              const standardVal = pricingValue[key];
              const standardNum = typeof standardVal === 'number' ? standardVal : 0;
              const sp = salePrices[key] ?? '';
              const hasError = sp !== '' && typeof sp === 'number' && standardNum > 0 && sp >= standardNum;
              return (
                <tr key={key} className="border-b border-gray-100">
                  <td className="px-3 py-3 font-medium text-gray-700">{label}</td>
                  <td className="px-3 py-3">
                    <div className="relative max-w-[160px]">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">$</span>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        className="pl-7"
                        value={standardVal}
                        onChange={(e) => onPricingChange({
                          ...pricingValue,
                          [key]: e.target.value === '' ? '' : parseFloat(e.target.value),
                        })}
                      />
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="relative max-w-[160px]">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">$</span>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="No sale"
                        className={`pl-7 ${hasError ? 'border-red-500 focus:ring-red-500' : ''}`}
                        value={sp}
                        onChange={(e) => setSalePrices({
                          ...salePrices,
                          [key]: e.target.value === '' ? '' : parseFloat(e.target.value),
                        })}
                      />
                      {hasError && <p className="mt-1 text-xs text-red-500">Must be less than {formatCurrency(standardNum)}</p>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile: stacked mini-cards */}
      <div className="sm:hidden space-y-3">
        {VEHICLE_SIZE_TIER_KEYS.map(({ key, label }) => {
          const standardVal = pricingValue[key];
          const standardNum = typeof standardVal === 'number' ? standardVal : 0;
          const sp = salePrices[key] ?? '';
          const hasError = sp !== '' && typeof sp === 'number' && standardNum > 0 && sp >= standardNum;
          return (
            <div key={key} className="rounded-lg border border-gray-200 p-4">
              <p className="text-sm font-medium text-gray-700 mb-3">{label}</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Standard</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">$</span>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      className="pl-7"
                      value={standardVal}
                      onChange={(e) => onPricingChange({
                        ...pricingValue,
                        [key]: e.target.value === '' ? '' : parseFloat(e.target.value),
                      })}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Sale</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">$</span>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="No sale"
                      className={`pl-7 ${hasError ? 'border-red-500 focus:ring-red-500' : ''}`}
                      value={sp}
                      onChange={(e) => setSalePrices({
                        ...salePrices,
                        [key]: e.target.value === '' ? '' : parseFloat(e.target.value),
                      })}
                    />
                    {hasError && <p className="mt-1 text-xs text-red-500">Must be &lt; standard</p>}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
