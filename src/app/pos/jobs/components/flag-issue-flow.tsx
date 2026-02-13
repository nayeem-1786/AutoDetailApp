'use client';

import { useState, useMemo } from 'react';
import {
  ArrowLeft,
  Check,
  ChevronRight,
  DollarSign,
  Clock,
  MessageSquare,
  Eye,
  Send,
  Edit3,
  Wrench,
  Package,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { toast } from 'sonner';
import { posFetch } from '../../lib/pos-fetch';
import { PhotoCapture } from './photo-capture';
import { AnnotationOverlay } from './photo-annotation';
import { CatalogBrowser } from '../../components/catalog-browser';
import { EXTERIOR_ZONES, INTERIOR_ZONES, getZoneLabel } from '@/lib/utils/job-zones';
import { resolveServicePrice } from '../../utils/pricing';
import type { Annotation } from '@/lib/utils/job-zones';
import type { JobPhoto, JobPhotoPhase, ServicePricing, VehicleSizeClass } from '@/lib/supabase/types';
import type { CatalogService, CatalogProduct } from '../../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SelectedItem {
  type: 'service' | 'product' | 'custom';
  id: string | null;
  name: string;
  price: number;
  base_duration_minutes?: number;
}

interface FlagIssueFlowProps {
  jobId: string;
  job: {
    id: string;
    services: { id: string; name: string; price: number }[];
    estimated_pickup_at: string | null;
    customer: {
      id: string;
      first_name: string;
      last_name: string;
      phone: string | null;
      email: string | null;
    } | null;
    vehicle: {
      id: string;
      year: number | null;
      make: string | null;
      model: string | null;
      color: string | null;
      size_class: string | null;
    } | null;
    addons?: { id: string; status: string; service_id: string | null }[] | null;
  };
  onComplete: () => void;
  onBack: () => void;
}

type Step = 'photo' | 'zone-select' | 'catalog' | 'discount' | 'delay' | 'message' | 'preview';

type CatalogTab = 'services' | 'products' | 'custom';

const MESSAGE_TEMPLATES = [
  {
    id: 'noticed',
    label: 'Issue Found',
    template: 'We noticed {issue} during your {service}. We can take care of it today for {price}.',
  },
  {
    id: 'benefit',
    label: 'Recommendation',
    template: 'Your vehicle could really benefit from {service}. Here\'s what we found:',
  },
  {
    id: 'inspection',
    label: 'Inspection Finding',
    template: 'During our inspection we found {issue}. We recommend {service} for {price} — shall we go ahead?',
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FlagIssueFlow({ jobId, job, onComplete, onBack }: FlagIssueFlowProps) {
  const [step, setStep] = useState<Step>('zone-select');
  const [sending, setSending] = useState(false);

  // Step 1: Photo
  const [selectedZone, setSelectedZone] = useState<string | null>(null);
  const [capturedPhotos, setCapturedPhotos] = useState<JobPhoto[]>([]);

  // Step 2: Catalog selection
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogTab, setCatalogTab] = useState<CatalogTab>('services');
  const [selectedItem, setSelectedItem] = useState<SelectedItem | null>(null);
  const [customDescription, setCustomDescription] = useState('');
  const [customPrice, setCustomPrice] = useState('');

  // Step 3: Discount
  const [discountAmount, setDiscountAmount] = useState('');

  // Step 4: Delay
  const [pickupDelay, setPickupDelay] = useState('');

  // Step 5: Message
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [isCustomMessage, setIsCustomMessage] = useState(false);
  const [customMessageText, setCustomMessageText] = useState('');

  // Vehicle size class for pricing
  const vehicleSizeClass = (job.vehicle?.size_class ?? null) as VehicleSizeClass | null;

  // Build set of service IDs already on this job (Bug 3: quantity rules)
  const addedServiceIds = useMemo(() => {
    const ids = new Set<string>();
    // Services already on the job
    job.services.forEach((s) => ids.add(s.id));
    // Approved addon services
    (job.addons ?? [])
      .filter((a) => a.status === 'approved' && a.service_id)
      .forEach((a) => ids.add(a.service_id!));
    return ids;
  }, [job.services, job.addons]);

  // Derived values
  const price = selectedItem?.price || 0;
  const discount = parseFloat(discountAmount) || 0;
  const finalPrice = Math.max(0, price - discount);
  const delayMinutes = parseInt(pickupDelay) || 0;
  const itemName = selectedItem?.name || '';

  const currentServiceNames = job.services.map((s) => s.name).join(', ');
  const vehicleDesc = job.vehicle
    ? [job.vehicle.color, job.vehicle.year, job.vehicle.make, job.vehicle.model].filter(Boolean).join(' ')
    : 'your vehicle';

  const newEta = job.estimated_pickup_at && delayMinutes > 0
    ? new Date(new Date(job.estimated_pickup_at).getTime() + delayMinutes * 60000)
    : null;

  // Build the final message text
  const messageText = (() => {
    if (isCustomMessage) return customMessageText;
    const tmpl = MESSAGE_TEMPLATES.find((t) => t.id === selectedTemplate);
    if (!tmpl) return '';
    return tmpl.template
      .replace('{issue}', itemName || 'an issue')
      .replace('{service}', currentServiceNames || 'your service')
      .replace('{price}', `$${finalPrice.toFixed(2)}`);
  })();

  // ---------------------------------------------------------------------------
  // Catalog callbacks (Bug 2: proper pricing via CatalogBrowser)
  // ---------------------------------------------------------------------------

  function handleAddService(
    service: CatalogService,
    pricing: ServicePricing,
    vsc: VehicleSizeClass | null,
    perUnitQty?: number
  ) {
    // Duplicate guard (Bug 3)
    if (addedServiceIds.has(service.id)) {
      toast.warning(`${service.name} is already on this job`);
      return;
    }

    const resolved = perUnitQty != null && service.per_unit_price != null
      ? perUnitQty * service.per_unit_price
      : resolveServicePrice(pricing, vsc);

    setSelectedItem({
      type: 'service',
      id: service.id,
      name: service.name,
      price: resolved,
      base_duration_minutes: service.base_duration_minutes ?? undefined,
    });

    // Auto-fill pickup delay from service duration
    if (service.base_duration_minutes) {
      setPickupDelay(String(service.base_duration_minutes));
    }

    setStep('discount');
  }

  function handleAddProduct(product: CatalogProduct) {
    setSelectedItem({
      type: 'product',
      id: product.id,
      name: product.name,
      price: product.retail_price,
    });
    setStep('discount');
  }

  function handleCustomSubmit() {
    if (!customDescription.trim() || !customPrice) return;
    setSelectedItem({
      type: 'custom',
      id: null,
      name: customDescription.trim(),
      price: parseFloat(customPrice) || 0,
    });
    setStep('discount');
  }

  function handlePhotoSaved(photo: JobPhoto) {
    setCapturedPhotos((prev) => [...prev, photo]);
    setStep('catalog');
  }

  async function handleSend() {
    if (!selectedItem) return;
    setSending(true);
    try {
      const payload = {
        service_id: selectedItem.type === 'service' ? selectedItem.id : null,
        product_id: selectedItem.type === 'product' ? selectedItem.id : null,
        custom_description: selectedItem.type === 'custom' ? selectedItem.name : (selectedItem.name || null),
        price,
        discount_amount: discount,
        pickup_delay_minutes: delayMinutes,
        message_to_customer: messageText,
        photo_ids: capturedPhotos.map((p) => p.id),
      };

      const res = await posFetch(`/api/pos/jobs/${jobId}/addons`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        onComplete();
      } else {
        const { error } = await res.json();
        console.error('Send addon error:', error);
        toast.error(error || 'Failed to send authorization');
      }
    } catch (err) {
      console.error('Send addon error:', err);
      toast.error('Failed to send authorization');
    } finally {
      setSending(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Step: Zone Select
  // ---------------------------------------------------------------------------
  if (step === 'zone-select') {
    const allZones = [...EXTERIOR_ZONES, ...INTERIOR_ZONES];
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-3">
          <button onClick={onBack} className="rounded-lg p-1 hover:bg-gray-100">
            <ArrowLeft className="h-5 w-5 text-gray-600" />
          </button>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Flag Issue</h2>
            <p className="text-sm text-gray-500">Step 1: Select zone and capture photo</p>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto bg-gray-50 p-4">
          <p className="mb-3 text-sm font-medium text-gray-700">Where is the issue?</p>
          <div className="space-y-2">
            {allZones.map((zone) => (
              <button
                key={zone.key}
                onClick={() => {
                  setSelectedZone(zone.key);
                  setStep('photo');
                }}
                className="flex w-full items-center justify-between rounded-lg bg-white p-3 shadow-sm hover:bg-gray-50"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">{zone.label}</p>
                  <p className="text-xs text-gray-500">{zone.description}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-gray-400" />
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Step: Photo Capture
  // ---------------------------------------------------------------------------
  if (step === 'photo' && selectedZone) {
    return (
      <PhotoCapture
        jobId={jobId}
        zone={selectedZone}
        phase={'progress' as JobPhotoPhase}
        onSaved={handlePhotoSaved}
        onCancel={() => setStep('zone-select')}
      />
    );
  }

  // ---------------------------------------------------------------------------
  // Step: Catalog Selection (Bug 2: CatalogBrowser + vehicle-size pricing)
  // ---------------------------------------------------------------------------
  if (step === 'catalog') {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-3">
          <button onClick={() => setStep('zone-select')} className="rounded-lg p-1 hover:bg-gray-100">
            <ArrowLeft className="h-5 w-5 text-gray-600" />
          </button>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Select Service/Product</h2>
            <p className="text-sm text-gray-500">Step 2: What do you recommend?</p>
          </div>
        </div>

        {/* Search + Tabs */}
        <div className="border-b border-gray-200 bg-white px-4 py-2">
          {/* Tab bar */}
          <div className="mb-2 flex gap-1 rounded-lg bg-gray-100 p-0.5">
            {([
              { key: 'services' as CatalogTab, label: 'Services', icon: Wrench },
              { key: 'products' as CatalogTab, label: 'Products', icon: Package },
              { key: 'custom' as CatalogTab, label: 'Custom', icon: Edit3 },
            ]).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => {
                  setCatalogTab(key);
                  setCatalogSearch('');
                }}
                className={cn(
                  'flex flex-1 items-center justify-center gap-1.5 rounded-md py-2 text-xs font-medium transition-colors',
                  catalogTab === key
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>

          {/* Search bar (hidden for custom tab) */}
          {catalogTab !== 'custom' && (
            <div className="relative">
              <input
                type="text"
                placeholder={`Search ${catalogTab}...`}
                value={catalogSearch}
                onChange={(e) => setCatalogSearch(e.target.value)}
                className="w-full rounded-lg border border-gray-300 py-2 pl-3 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          )}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto bg-gray-50">
          {catalogTab === 'services' && (
            <CatalogBrowser
              type="services"
              search={catalogSearch}
              onAddService={handleAddService}
              vehicleSizeOverride={vehicleSizeClass}
              addedServiceIds={addedServiceIds}
            />
          )}
          {catalogTab === 'products' && (
            <CatalogBrowser
              type="products"
              search={catalogSearch}
              onAddProduct={handleAddProduct}
            />
          )}
          {catalogTab === 'custom' && (
            <div className="p-4">
              <div className="space-y-3 rounded-lg bg-white p-4 shadow-sm">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Description</label>
                  <input
                    type="text"
                    placeholder="e.g., Paint touch-up on rear bumper"
                    value={customDescription}
                    onChange={(e) => setCustomDescription(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Price ($)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={customPrice}
                    onChange={(e) => setCustomPrice(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <button
                  onClick={handleCustomSubmit}
                  disabled={!customDescription.trim() || !customPrice || parseFloat(customPrice) <= 0}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  <Check className="h-4 w-4" />
                  Use Custom Item
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Step: Discount
  // ---------------------------------------------------------------------------
  if (step === 'discount') {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-3">
          <button onClick={() => setStep('catalog')} className="rounded-lg p-1 hover:bg-gray-100">
            <ArrowLeft className="h-5 w-5 text-gray-600" />
          </button>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Discount</h2>
            <p className="text-sm text-gray-500">Step 3: Optional discount</p>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto bg-gray-50 p-4">
          <div className="rounded-lg bg-white p-4 shadow-sm">
            <div className="mb-4">
              <p className="text-sm font-medium text-gray-900">{itemName}</p>
              <p className="text-lg font-semibold text-gray-900">${price.toFixed(2)}</p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                <DollarSign className="mr-1 inline h-4 w-4" />
                Discount Amount ($)
              </label>
              <input
                type="number"
                min="0"
                max={price}
                step="0.01"
                placeholder="0.00"
                value={discountAmount}
                onChange={(e) => setDiscountAmount(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <p className="mt-1 text-xs text-gray-500">Leave empty for no discount</p>
            </div>
            {discount > 0 && (
              <div className="mt-3 rounded-lg bg-green-50 p-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Original</span>
                  <span className="text-gray-600 line-through">${price.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-green-600">Discount</span>
                  <span className="text-green-600">-${discount.toFixed(2)}</span>
                </div>
                <div className="mt-1 flex justify-between border-t border-green-200 pt-1 text-sm font-semibold">
                  <span className="text-gray-900">Final Price</span>
                  <span className="text-gray-900">${finalPrice.toFixed(2)}</span>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="border-t border-gray-200 bg-white px-4 py-3">
          <button
            onClick={() => setStep('delay')}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            Next: Pickup Delay
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Step: Pickup Delay
  // ---------------------------------------------------------------------------
  if (step === 'delay') {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-3">
          <button onClick={() => setStep('discount')} className="rounded-lg p-1 hover:bg-gray-100">
            <ArrowLeft className="h-5 w-5 text-gray-600" />
          </button>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Pickup Delay</h2>
            <p className="text-sm text-gray-500">Step 4: Additional time needed</p>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto bg-gray-50 p-4">
          <div className="rounded-lg bg-white p-4 shadow-sm">
            <label className="mb-1 block text-sm font-medium text-gray-700">
              <Clock className="mr-1 inline h-4 w-4" />
              Additional Minutes
            </label>
            <input
              type="number"
              min="0"
              step="5"
              placeholder="0"
              value={pickupDelay}
              onChange={(e) => setPickupDelay(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <p className="mt-1 text-xs text-gray-500">
              {selectedItem?.base_duration_minutes
                ? `Auto-filled from service duration (${selectedItem.base_duration_minutes} min). You can adjust.`
                : 'Enter 0 if no additional time needed.'}
            </p>

            {job.estimated_pickup_at && delayMinutes > 0 && (
              <div className="mt-3 rounded-lg bg-blue-50 p-3">
                <p className="text-sm text-blue-700">
                  Current ETA: {new Date(job.estimated_pickup_at).toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                    timeZone: 'America/Los_Angeles',
                  })}
                </p>
                <p className="text-sm font-medium text-blue-800">
                  New ETA: {newEta?.toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                    timeZone: 'America/Los_Angeles',
                  })}
                  {' '}(+{delayMinutes} min)
                </p>
              </div>
            )}
            {!job.estimated_pickup_at && delayMinutes > 0 && (
              <div className="mt-3 rounded-lg bg-blue-50 p-3">
                <p className="text-sm text-blue-700">+{delayMinutes} minutes to service time</p>
              </div>
            )}
          </div>
        </div>
        <div className="border-t border-gray-200 bg-white px-4 py-3">
          <button
            onClick={() => setStep('message')}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            Next: Message
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Step: Message
  // ---------------------------------------------------------------------------
  if (step === 'message') {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-3">
          <button onClick={() => setStep('delay')} className="rounded-lg p-1 hover:bg-gray-100">
            <ArrowLeft className="h-5 w-5 text-gray-600" />
          </button>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Message to Customer</h2>
            <p className="text-sm text-gray-500">Step 5: Choose a template or write custom</p>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto bg-gray-50 p-4">
          <div className="space-y-2">
            {MESSAGE_TEMPLATES.map((tmpl) => {
              const preview = tmpl.template
                .replace('{issue}', itemName || 'an issue')
                .replace('{service}', currentServiceNames || 'your service')
                .replace('{price}', `$${finalPrice.toFixed(2)}`);
              return (
                <button
                  key={tmpl.id}
                  onClick={() => {
                    setSelectedTemplate(tmpl.id);
                    setIsCustomMessage(false);
                  }}
                  className={cn(
                    'w-full rounded-lg border p-3 text-left transition-colors',
                    selectedTemplate === tmpl.id && !isCustomMessage
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 bg-white hover:bg-gray-50'
                  )}
                >
                  <p className="text-xs font-medium text-gray-500">{tmpl.label}</p>
                  <p className="mt-0.5 text-sm text-gray-900">{preview}</p>
                </button>
              );
            })}

            {/* Custom message toggle */}
            <button
              onClick={() => {
                setIsCustomMessage(true);
                setSelectedTemplate(null);
              }}
              className={cn(
                'flex w-full items-center gap-2 rounded-lg border p-3 text-left',
                isCustomMessage
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 bg-white hover:bg-gray-50'
              )}
            >
              <MessageSquare className="h-4 w-4 text-gray-500" />
              <span className="text-sm font-medium text-gray-700">Write custom message</span>
            </button>

            {isCustomMessage && (
              <textarea
                value={customMessageText}
                onChange={(e) => setCustomMessageText(e.target.value)}
                placeholder="Type your message to the customer..."
                rows={4}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            )}
          </div>
        </div>
        <div className="border-t border-gray-200 bg-white px-4 py-3">
          <button
            onClick={() => setStep('preview')}
            disabled={!messageText}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <Eye className="h-4 w-4" />
            Preview
          </button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Step: Preview (Bug 1: show annotations on photo)
  // ---------------------------------------------------------------------------
  if (step === 'preview') {
    const previewPhoto = capturedPhotos.length > 0 ? capturedPhotos[0] : null;
    const previewAnnotations = previewPhoto?.annotation_data as Annotation[] | null;

    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-3">
          <button onClick={() => setStep('message')} className="rounded-lg p-1 hover:bg-gray-100">
            <ArrowLeft className="h-5 w-5 text-gray-600" />
          </button>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Preview</h2>
            <p className="text-sm text-gray-500">Step 6: Review before sending</p>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto bg-gray-50 p-4">
          {/* Mock authorization page preview */}
          <div className="rounded-xl bg-white shadow-md">
            <div className="rounded-t-xl bg-blue-800 p-4 text-center">
              <p className="text-lg font-semibold text-white">Service Authorization Request</p>
            </div>
            <div className="space-y-4 p-4">
              {/* Photo preview with annotation overlay */}
              {previewPhoto && previewPhoto.image_url && (
                <div className="relative overflow-hidden rounded-lg">
                  <img
                    src={previewPhoto.image_url}
                    alt="Issue photo"
                    className="w-full object-cover"
                  />
                  {previewAnnotations && previewAnnotations.length > 0 && (
                    <AnnotationOverlay annotations={previewAnnotations} />
                  )}
                </div>
              )}

              {/* Message */}
              <p className="text-sm text-gray-700">{messageText}</p>

              {/* Vehicle */}
              <p className="text-xs text-gray-500">Vehicle: {vehicleDesc}</p>

              {/* Price */}
              <div className="rounded-lg bg-gray-50 p-3">
                {discount > 0 ? (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Original</span>
                      <span className="text-gray-500 line-through">${price.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-green-600">Discount</span>
                      <span className="text-green-600">-${discount.toFixed(2)}</span>
                    </div>
                    <div className="mt-1 flex justify-between border-t border-gray-200 pt-1">
                      <span className="font-semibold text-gray-900">Total</span>
                      <span className="text-lg font-bold text-gray-900">${finalPrice.toFixed(2)}</span>
                    </div>
                  </>
                ) : (
                  <div className="flex justify-between">
                    <span className="font-semibold text-gray-900">Total</span>
                    <span className="text-lg font-bold text-gray-900">${finalPrice.toFixed(2)}</span>
                  </div>
                )}
                {delayMinutes > 0 && (
                  <p className="mt-2 text-sm text-gray-500">
                    Additional time: +{delayMinutes} min
                    {newEta && (
                      <>
                        {' '}(New ETA: {newEta.toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit',
                          timeZone: 'America/Los_Angeles',
                        })})
                      </>
                    )}
                  </p>
                )}
              </div>

              {/* Current services context */}
              <p className="text-xs text-gray-400">
                Currently performing: {currentServiceNames}
              </p>

              {/* Mock buttons */}
              <div className="flex gap-2">
                <div className="flex flex-1 items-center justify-center rounded-lg bg-green-600 py-3 text-sm font-semibold text-white opacity-60">
                  Approve
                </div>
                <div className="flex flex-1 items-center justify-center rounded-lg border-2 border-red-600 py-3 text-sm font-semibold text-red-600 opacity-60">
                  Decline
                </div>
              </div>
            </div>
          </div>

          {/* Notification info */}
          <div className="mt-4 rounded-lg bg-blue-50 p-3">
            <p className="text-sm text-blue-700">
              Will be sent via:
              {job.customer?.phone && ' SMS (with photo)'}
              {job.customer?.phone && job.customer?.email && ' + '}
              {job.customer?.email && ' Email'}
              {!job.customer?.phone && !job.customer?.email && ' No contact info available'}
            </p>
          </div>
        </div>
        <div className="border-t border-gray-200 bg-white px-4 py-3">
          <div className="flex gap-2">
            <button
              onClick={() => setStep('message')}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Edit
            </button>
            <button
              onClick={handleSend}
              disabled={sending}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              {sending ? 'Sending...' : 'Send to Customer'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
