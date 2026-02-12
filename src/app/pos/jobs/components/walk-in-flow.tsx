'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  ArrowLeft,
  Search,
  Plus,
  Check,
  ChevronRight,
  User,
  Car,
  Wrench,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { posFetch } from '../../lib/pos-fetch';
import type { JobServiceSnapshot } from '@/lib/supabase/types';

type Step = 'customer' | 'vehicle' | 'services';

interface CustomerResult {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
}

interface VehicleResult {
  id: string;
  year: number | null;
  make: string | null;
  model: string | null;
  color: string | null;
}

interface ServiceResult {
  id: string;
  name: string;
  flat_price: number | null;
  pricing_model: string;
  pricing?: { tier_name: string; price: number }[];
}

interface WalkInFlowProps {
  onBack: () => void;
  onCreated: (jobId: string) => void;
}

export function WalkInFlow({ onBack, onCreated }: WalkInFlowProps) {
  const [step, setStep] = useState<Step>('customer');
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerResult | null>(null);
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleResult | null>(null);
  const [selectedServices, setSelectedServices] = useState<JobServiceSnapshot[]>([]);
  const [creating, setCreating] = useState(false);

  async function handleCreate() {
    if (!selectedCustomer || selectedServices.length === 0) return;
    setCreating(true);
    try {
      const res = await posFetch('/api/pos/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: selectedCustomer.id,
          vehicle_id: selectedVehicle?.id || null,
          services: selectedServices,
        }),
      });
      if (res.ok) {
        const { data } = await res.json();
        onCreated(data.id);
      }
    } catch (err) {
      console.error('Failed to create walk-in job:', err);
    } finally {
      setCreating(false);
    }
  }

  const stepLabel = step === 'customer' ? 'Select Customer' : step === 'vehicle' ? 'Select Vehicle' : 'Select Services';

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-3">
        <button
          onClick={() => {
            if (step === 'vehicle') setStep('customer');
            else if (step === 'services') setStep('vehicle');
            else onBack();
          }}
          className="rounded-lg p-1 hover:bg-gray-100"
        >
          <ArrowLeft className="h-5 w-5 text-gray-600" />
        </button>
        <div>
          <h1 className="text-lg font-semibold text-gray-900">New Walk-in</h1>
          <p className="text-sm text-gray-500">{stepLabel}</p>
        </div>
      </div>

      {/* Step indicators */}
      <div className="flex items-center gap-2 border-b border-gray-100 bg-gray-50 px-4 py-2">
        {[
          { key: 'customer', icon: User, label: 'Customer' },
          { key: 'vehicle', icon: Car, label: 'Vehicle' },
          { key: 'services', icon: Wrench, label: 'Services' },
        ].map((s, idx) => {
          const isActive = step === s.key;
          const isDone =
            (s.key === 'customer' && selectedCustomer) ||
            (s.key === 'vehicle' && (selectedVehicle || step === 'services'));

          return (
            <div key={s.key} className="flex items-center gap-2">
              {idx > 0 && <ChevronRight className="h-4 w-4 text-gray-300" />}
              <div
                className={cn(
                  'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
                  isActive
                    ? 'bg-blue-100 text-blue-700'
                    : isDone
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-100 text-gray-400'
                )}
              >
                {isDone && !isActive ? (
                  <Check className="h-3 w-3" />
                ) : (
                  <s.icon className="h-3 w-3" />
                )}
                {s.label}
              </div>
            </div>
          );
        })}
      </div>

      {/* Step content */}
      <div className="flex-1 overflow-y-auto bg-gray-50">
        {step === 'customer' && (
          <CustomerStep
            onSelect={(c) => {
              setSelectedCustomer(c);
              setStep('vehicle');
            }}
          />
        )}
        {step === 'vehicle' && selectedCustomer && (
          <VehicleStep
            customerId={selectedCustomer.id}
            onSelect={(v) => {
              setSelectedVehicle(v);
              setStep('services');
            }}
            onSkip={() => {
              setSelectedVehicle(null);
              setStep('services');
            }}
          />
        )}
        {step === 'services' && (
          <ServiceStep
            selectedServices={selectedServices}
            onToggle={(svc) => {
              setSelectedServices((prev) => {
                const exists = prev.find((s) => s.id === svc.id);
                if (exists) return prev.filter((s) => s.id !== svc.id);
                return [...prev, svc];
              });
            }}
            onSubmit={handleCreate}
            creating={creating}
          />
        )}
      </div>
    </div>
  );
}

// ─── Customer Step ───────────────────────────────────────────────────────────

function CustomerStep({ onSelect }: { onSelect: (c: CustomerResult) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CustomerResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(async (term: string) => {
    if (term.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await posFetch(`/api/pos/customers/search?q=${encodeURIComponent(term)}`);
      if (res.ok) {
        const { data } = await res.json();
        setResults(data ?? []);
      }
    } catch {
      /* ignore */
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(query), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, search]);

  if (showQuickAdd) {
    return (
      <QuickAddCustomer
        onCreated={onSelect}
        onCancel={() => setShowQuickAdd(false)}
      />
    );
  }

  return (
    <div className="p-4">
      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or phone..."
          className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-4 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          autoFocus
        />
      </div>

      {/* Quick Add button */}
      <button
        onClick={() => setShowQuickAdd(true)}
        className="mt-3 flex w-full items-center gap-2 rounded-lg border border-dashed border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600"
      >
        <Plus className="h-4 w-4" />
        Quick Add New Customer
      </button>

      {/* Results */}
      {searching && (
        <div className="mt-4 flex justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
        </div>
      )}

      {!searching && results.length > 0 && (
        <div className="mt-3 space-y-1">
          {results.map((c) => (
            <button
              key={c.id}
              onClick={() => onSelect(c)}
              className="flex w-full items-center justify-between rounded-lg bg-white p-3 text-left shadow-sm hover:bg-gray-50"
            >
              <div>
                <p className="font-medium text-gray-900">
                  {c.first_name} {c.last_name}
                </p>
                <p className="text-sm text-gray-500">{c.phone || c.email || 'No contact'}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-gray-400" />
            </button>
          ))}
        </div>
      )}

      {!searching && query.trim().length >= 2 && results.length === 0 && (
        <p className="mt-4 text-center text-sm text-gray-400">No customers found</p>
      )}
    </div>
  );
}

// ─── Quick Add Customer ──────────────────────────────────────────────────────

function QuickAddCustomer({
  onCreated,
  onCancel,
}: {
  onCreated: (c: CustomerResult) => void;
  onCancel: () => void;
}) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!firstName.trim() || !lastName.trim()) return;
    setSaving(true);
    try {
      const res = await posFetch('/api/pos/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          phone: phone.trim() || null,
        }),
      });
      if (res.ok) {
        const { data } = await res.json();
        onCreated(data);
      }
    } catch (err) {
      console.error('Failed to create customer:', err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-4">
      <h3 className="mb-3 text-sm font-medium text-gray-700">Quick Add Customer</h3>
      <div className="space-y-3">
        <input
          type="text"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          placeholder="First name *"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          autoFocus
        />
        <input
          type="text"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          placeholder="Last name *"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Phone (optional)"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>
      <div className="mt-4 flex gap-2">
        <button
          onClick={onCancel}
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={!firstName.trim() || !lastName.trim() || saving}
          className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Creating...' : 'Create & Select'}
        </button>
      </div>
    </div>
  );
}

// ─── Vehicle Step ────────────────────────────────────────────────────────────

function VehicleStep({
  customerId,
  onSelect,
  onSkip,
}: {
  customerId: string;
  onSelect: (v: VehicleResult) => void;
  onSkip: () => void;
}) {
  const [vehicles, setVehicles] = useState<VehicleResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    async function fetchVehicles() {
      try {
        const res = await posFetch(`/api/pos/customers/${customerId}/vehicles`);
        if (res.ok) {
          const { data } = await res.json();
          setVehicles(data ?? []);
        }
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    }
    fetchVehicles();
  }, [customerId]);

  if (showAdd) {
    return (
      <QuickAddVehicle
        customerId={customerId}
        onCreated={(v) => onSelect(v)}
        onCancel={() => setShowAdd(false)}
      />
    );
  }

  return (
    <div className="p-4">
      {loading ? (
        <div className="flex justify-center py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
        </div>
      ) : (
        <>
          {vehicles.length > 0 && (
            <div className="space-y-1">
              {vehicles.map((v) => (
                <button
                  key={v.id}
                  onClick={() => onSelect(v)}
                  className="flex w-full items-center justify-between rounded-lg bg-white p-3 text-left shadow-sm hover:bg-gray-50"
                >
                  <div className="flex items-center gap-2">
                    <Car className="h-5 w-5 text-gray-400" />
                    <span className="font-medium text-gray-900">
                      {[v.color, v.year, v.make, v.model].filter(Boolean).join(' ') || 'Unknown Vehicle'}
                    </span>
                  </div>
                  <ChevronRight className="h-4 w-4 text-gray-400" />
                </button>
              ))}
            </div>
          )}

          <button
            onClick={() => setShowAdd(true)}
            className="mt-3 flex w-full items-center gap-2 rounded-lg border border-dashed border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600"
          >
            <Plus className="h-4 w-4" />
            Add New Vehicle
          </button>

          <button
            onClick={onSkip}
            className="mt-2 w-full rounded-lg px-3 py-2 text-sm text-gray-500 hover:bg-gray-100"
          >
            Skip — no vehicle
          </button>
        </>
      )}
    </div>
  );
}

// ─── Quick Add Vehicle ───────────────────────────────────────────────────────

function QuickAddVehicle({
  customerId,
  onCreated,
  onCancel,
}: {
  customerId: string;
  onCreated: (v: VehicleResult) => void;
  onCancel: () => void;
}) {
  const [year, setYear] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [color, setColor] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await posFetch(`/api/pos/customers/${customerId}/vehicles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vehicle_type: 'standard',
          year: year || null,
          make: make.trim() || null,
          model: model.trim() || null,
          color: color.trim() || null,
        }),
      });
      if (res.ok) {
        const { data } = await res.json();
        onCreated(data);
      }
    } catch (err) {
      console.error('Failed to create vehicle:', err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-4">
      <h3 className="mb-3 text-sm font-medium text-gray-700">Add Vehicle</h3>
      <div className="grid grid-cols-2 gap-3">
        <input
          type="text"
          value={year}
          onChange={(e) => setYear(e.target.value)}
          placeholder="Year"
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          autoFocus
        />
        <input
          type="text"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          placeholder="Color"
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <input
          type="text"
          value={make}
          onChange={(e) => setMake(e.target.value)}
          placeholder="Make"
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <input
          type="text"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder="Model"
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>
      <div className="mt-4 flex gap-2">
        <button
          onClick={onCancel}
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Creating...' : 'Add & Select'}
        </button>
      </div>
    </div>
  );
}

// ─── Service Step ────────────────────────────────────────────────────────────

function ServiceStep({
  selectedServices,
  onToggle,
  onSubmit,
  creating,
}: {
  selectedServices: JobServiceSnapshot[];
  onToggle: (svc: JobServiceSnapshot) => void;
  onSubmit: () => void;
  creating: boolean;
}) {
  const [services, setServices] = useState<ServiceResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    async function fetchServices() {
      try {
        const res = await posFetch('/api/pos/services');
        if (res.ok) {
          const { data } = await res.json();
          setServices(data ?? []);
        }
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    }
    fetchServices();
  }, []);

  const filtered = services.filter(
    (s) =>
      !searchQuery.trim() ||
      s.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  function getServicePrice(svc: ServiceResult): number {
    if (svc.flat_price != null) return Number(svc.flat_price);
    if (svc.pricing && svc.pricing.length > 0) {
      return Number(svc.pricing[0].price);
    }
    return 0;
  }

  const selectedTotal = selectedServices.reduce((sum, s) => sum + s.price, 0);

  return (
    <div className="flex h-full flex-col">
      <div className="p-4 pb-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search services..."
            className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-4 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-28">
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          </div>
        ) : (
          <div className="space-y-1">
            {filtered.map((svc) => {
              const isSelected = selectedServices.some((s) => s.id === svc.id);
              const price = getServicePrice(svc);

              return (
                <button
                  key={svc.id}
                  onClick={() => onToggle({ id: svc.id, name: svc.name, price })}
                  className={cn(
                    'flex w-full items-center justify-between rounded-lg p-3 text-left transition-colors',
                    isSelected
                      ? 'bg-blue-50 ring-1 ring-blue-200'
                      : 'bg-white shadow-sm hover:bg-gray-50'
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-900">{svc.name}</p>
                    <p className="text-sm text-gray-500">
                      ${price.toFixed(2)}
                      {svc.pricing_model !== 'flat' && ' (starting)'}
                    </p>
                  </div>
                  {isSelected && (
                    <div className="ml-2 flex h-6 w-6 items-center justify-center rounded-full bg-blue-600">
                      <Check className="h-4 w-4 text-white" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Fixed bottom bar */}
      <div className="fixed bottom-14 left-0 right-0 border-t border-gray-200 bg-white px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">
              {selectedServices.length} service{selectedServices.length !== 1 ? 's' : ''} selected
            </p>
            <p className="text-lg font-semibold text-gray-900">
              ${selectedTotal.toFixed(2)}
            </p>
          </div>
          <button
            onClick={onSubmit}
            disabled={selectedServices.length === 0 || creating}
            className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {creating ? 'Creating...' : 'Create Job'}
          </button>
        </div>
      </div>
    </div>
  );
}
