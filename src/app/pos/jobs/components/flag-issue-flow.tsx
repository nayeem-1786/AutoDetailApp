'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  ArrowLeft,
  Camera,
  Search,
  Check,
  ChevronRight,
  DollarSign,
  Clock,
  MessageSquare,
  Eye,
  Send,
  X,
  Package,
  Wrench,
  Edit3,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { posFetch } from '../../lib/pos-fetch';
import { PhotoCapture } from './photo-capture';
import { EXTERIOR_ZONES, INTERIOR_ZONES, getZoneLabel } from '@/lib/utils/job-zones';
import type { JobPhoto, JobPhotoPhase } from '@/lib/supabase/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CatalogItem {
  id: string;
  name: string;
  description: string | null;
  price: number;
  type: 'service' | 'product';
  estimated_duration_minutes?: number;
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
    } | null;
  };
  onComplete: () => void;
  onBack: () => void;
}

type Step = 'photo' | 'zone-select' | 'catalog' | 'discount' | 'delay' | 'message' | 'preview';

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
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [selectedItem, setSelectedItem] = useState<CatalogItem | null>(null);
  const [isCustom, setIsCustom] = useState(false);
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

  // Derived values
  const price = isCustom ? parseFloat(customPrice) || 0 : selectedItem?.price || 0;
  const discount = parseFloat(discountAmount) || 0;
  const finalPrice = Math.max(0, price - discount);
  const delayMinutes = parseInt(pickupDelay) || 0;
  const itemName = isCustom ? customDescription : selectedItem?.name || '';

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

  // Fetch catalog items
  const fetchCatalog = useCallback(async (query: string) => {
    setCatalogLoading(true);
    try {
      // Fetch services
      const servicesRes = await posFetch(`/api/pos/services?search=${encodeURIComponent(query)}`);
      let services: CatalogItem[] = [];
      if (servicesRes.ok) {
        const { data } = await servicesRes.json();
        services = (data ?? []).map((s: Record<string, unknown>) => ({
          id: s.id,
          name: s.name,
          description: s.description || null,
          price: s.base_price || s.price || 0,
          type: 'service' as const,
          estimated_duration_minutes: s.estimated_duration_minutes || undefined,
        }));
      }

      // Fetch products
      const productsRes = await posFetch(`/api/pos/catalog?type=products&search=${encodeURIComponent(query)}`);
      let products: CatalogItem[] = [];
      if (productsRes.ok) {
        const { data } = await productsRes.json();
        products = (data ?? []).map((p: Record<string, unknown>) => ({
          id: p.id,
          name: p.name,
          description: p.description || null,
          price: p.price || 0,
          type: 'product' as const,
        }));
      }

      setCatalogItems([...services, ...products]);
    } catch (err) {
      console.error('Failed to fetch catalog:', err);
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  useEffect(() => {
    if (step === 'catalog') {
      fetchCatalog(catalogSearch);
    }
  }, [step, catalogSearch, fetchCatalog]);

  // Auto-set delay from service duration
  useEffect(() => {
    if (selectedItem?.estimated_duration_minutes && !pickupDelay) {
      setPickupDelay(String(selectedItem.estimated_duration_minutes));
    }
  }, [selectedItem]);

  function handlePhotoSaved(photo: JobPhoto) {
    setCapturedPhotos((prev) => [...prev, photo]);
    setStep('catalog');
  }

  function handleSelectItem(item: CatalogItem) {
    setSelectedItem(item);
    setIsCustom(false);
    setStep('discount');
  }

  function handleCustomSubmit() {
    if (!customDescription.trim() || !customPrice) return;
    setIsCustom(true);
    setSelectedItem(null);
    setStep('discount');
  }

  async function handleSend() {
    setSending(true);
    try {
      const payload = {
        service_id: !isCustom && selectedItem?.type === 'service' ? selectedItem.id : null,
        product_id: !isCustom && selectedItem?.type === 'product' ? selectedItem.id : null,
        custom_description: isCustom ? customDescription : (selectedItem?.name || null),
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
      }
    } catch (err) {
      console.error('Send addon error:', err);
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
  // Step: Catalog Selection
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

        <div className="border-b border-gray-200 bg-white px-4 py-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search services or products..."
              value={catalogSearch}
              onChange={(e) => setCatalogSearch(e.target.value)}
              className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Custom toggle */}
          <button
            onClick={() => setIsCustom(!isCustom)}
            className={cn(
              'mt-2 flex w-full items-center gap-2 rounded-lg border p-2.5 text-sm',
              isCustom
                ? 'border-blue-500 bg-blue-50 text-blue-700'
                : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            )}
          >
            <Edit3 className="h-4 w-4" />
            Custom line item
          </button>
        </div>

        <div className="flex-1 overflow-y-auto bg-gray-50 p-4">
          {isCustom ? (
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
          ) : (
            <div className="space-y-2">
              {catalogLoading ? (
                <div className="flex justify-center py-8">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                </div>
              ) : catalogItems.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-400">
                  {catalogSearch ? 'No results found' : 'Search for a service or product'}
                </p>
              ) : (
                catalogItems.map((item) => (
                  <button
                    key={`${item.type}-${item.id}`}
                    onClick={() => handleSelectItem(item)}
                    className="flex w-full items-start gap-3 rounded-lg bg-white p-3 shadow-sm hover:bg-gray-50"
                  >
                    <div className={cn(
                      'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
                      item.type === 'service' ? 'bg-blue-100' : 'bg-purple-100'
                    )}>
                      {item.type === 'service' ? (
                        <Wrench className="h-3.5 w-3.5 text-blue-600" />
                      ) : (
                        <Package className="h-3.5 w-3.5 text-purple-600" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1 text-left">
                      <p className="text-sm font-medium text-gray-900">{item.name}</p>
                      {item.description && (
                        <p className="line-clamp-1 text-xs text-gray-500">{item.description}</p>
                      )}
                      {item.estimated_duration_minutes && (
                        <p className="text-xs text-gray-400">~{item.estimated_duration_minutes} min</p>
                      )}
                    </div>
                    <span className="shrink-0 text-sm font-medium text-gray-900">
                      ${item.price.toFixed(2)}
                    </span>
                  </button>
                ))
              )}
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
              {selectedItem?.estimated_duration_minutes
                ? `Auto-filled from service duration (${selectedItem.estimated_duration_minutes} min). You can adjust.`
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
  // Step: Preview
  // ---------------------------------------------------------------------------
  if (step === 'preview') {
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
              {/* Photo preview */}
              {capturedPhotos.length > 0 && capturedPhotos[0].thumbnail_url && (
                <div className="overflow-hidden rounded-lg">
                  <img
                    src={capturedPhotos[0].thumbnail_url}
                    alt="Issue photo"
                    className="w-full object-cover"
                  />
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
