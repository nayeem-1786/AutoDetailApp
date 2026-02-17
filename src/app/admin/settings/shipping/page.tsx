'use client';

import { useEffect, useState, useCallback } from 'react';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { FormField } from '@/components/ui/form-field';
import { Switch } from '@/components/ui/switch';
import { Spinner } from '@/components/ui/spinner';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { adminFetch } from '@/lib/utils/admin-fetch';
import {
  Truck,
  CheckCircle2,
  XCircle,
  RefreshCw,
  ExternalLink,
  Eye,
  EyeOff,
  MapPin,
} from 'lucide-react';
import type { CarrierAccountInfo } from '@/lib/utils/shipping-types';

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
  'DC',
] as const;

// Common service levels offered by major carriers
const COMMON_SERVICE_LEVELS = [
  { token: 'usps_ground_advantage', label: 'USPS Ground Advantage' },
  { token: 'usps_priority', label: 'USPS Priority Mail' },
  { token: 'usps_priority_express', label: 'USPS Priority Mail Express' },
  { token: 'ups_ground', label: 'UPS Ground' },
  { token: 'ups_3_day_select', label: 'UPS 3 Day Select' },
  { token: 'ups_second_day_air', label: 'UPS 2nd Day Air' },
  { token: 'ups_next_day_air_saver', label: 'UPS Next Day Air Saver' },
  { token: 'ups_next_day_air', label: 'UPS Next Day Air' },
  { token: 'fedex_ground', label: 'FedEx Ground' },
  { token: 'fedex_home_delivery', label: 'FedEx Home Delivery' },
  { token: 'fedex_express_saver', label: 'FedEx Express Saver' },
  { token: 'fedex_2_day', label: 'FedEx 2Day' },
  { token: 'fedex_standard_overnight', label: 'FedEx Standard Overnight' },
  { token: 'fedex_priority_overnight', label: 'FedEx Priority Overnight' },
] as const;

interface ShippingFormData {
  shippo_api_key_live: string;
  shippo_api_key_test: string;
  shippo_mode: 'test' | 'live';
  ship_from_name: string;
  ship_from_company: string;
  ship_from_street1: string;
  ship_from_street2: string;
  ship_from_city: string;
  ship_from_state: string;
  ship_from_zip: string;
  ship_from_country: string;
  ship_from_phone: string;
  ship_from_email: string;
  default_parcel_length: string;
  default_parcel_width: string;
  default_parcel_height: string;
  default_parcel_distance_unit: string;
  default_parcel_weight: string;
  default_parcel_mass_unit: string;
  offer_free_shipping: boolean;
  free_shipping_threshold: string;
  flat_rate_enabled: boolean;
  flat_rate_amount: string;
  enabled_carriers: string[];
  enabled_service_levels: string[];
  handling_fee_type: 'none' | 'flat' | 'percent';
  handling_fee_amount: string;
  show_estimated_delivery: boolean;
  show_carrier_logo: boolean;
  sort_rates_by: 'price' | 'speed';
  local_pickup_enabled: boolean;
  local_pickup_address: string;
  local_pickup_instructions: string;
}

const DEFAULTS: ShippingFormData = {
  shippo_api_key_live: '',
  shippo_api_key_test: '',
  shippo_mode: 'test',
  ship_from_name: '',
  ship_from_company: '',
  ship_from_street1: '',
  ship_from_street2: '',
  ship_from_city: '',
  ship_from_state: 'CA',
  ship_from_zip: '',
  ship_from_country: 'US',
  ship_from_phone: '',
  ship_from_email: '',
  default_parcel_length: '10',
  default_parcel_width: '8',
  default_parcel_height: '4',
  default_parcel_distance_unit: 'in',
  default_parcel_weight: '1',
  default_parcel_mass_unit: 'lb',
  offer_free_shipping: false,
  free_shipping_threshold: '0',
  flat_rate_enabled: false,
  flat_rate_amount: '0',
  enabled_carriers: [],
  enabled_service_levels: [],
  handling_fee_type: 'none',
  handling_fee_amount: '0',
  show_estimated_delivery: true,
  show_carrier_logo: true,
  sort_rates_by: 'price',
  local_pickup_enabled: true,
  local_pickup_address: '',
  local_pickup_instructions: '',
};

export default function ShippingSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<ShippingFormData>(DEFAULTS);
  const [initial, setInitial] = useState<ShippingFormData>(DEFAULTS);

  // API key visibility
  const [showTestKey, setShowTestKey] = useState(false);
  const [showLiveKey, setShowLiveKey] = useState(false);

  // Test connection
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'untested' | 'success' | 'error'>('untested');
  const [connectionError, setConnectionError] = useState('');

  // Carrier accounts
  const [carriers, setCarriers] = useState<CarrierAccountInfo[]>([]);
  const [loadingCarriers, setLoadingCarriers] = useState(false);

  // Address validation
  const [validatingAddress, setValidatingAddress] = useState(false);
  const [addressValid, setAddressValid] = useState<boolean | null>(null);
  const [addressMessages, setAddressMessages] = useState<string[]>([]);

  const isDirty = JSON.stringify(form) !== JSON.stringify(initial);

  const updateField = useCallback(<K extends keyof ShippingFormData>(key: K, value: ShippingFormData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  // Load settings
  useEffect(() => {
    async function load() {
      try {
        const res = await adminFetch('/api/admin/settings/shipping');
        if (!res.ok) {
          toast.error('Failed to load shipping settings');
          setLoading(false);
          return;
        }
        const { data } = await res.json();
        const loaded: ShippingFormData = {
          shippo_api_key_live: data.shippo_api_key_live || '',
          shippo_api_key_test: data.shippo_api_key_test || '',
          shippo_mode: data.shippo_mode || 'test',
          ship_from_name: data.ship_from_name || '',
          ship_from_company: data.ship_from_company || '',
          ship_from_street1: data.ship_from_street1 || '',
          ship_from_street2: data.ship_from_street2 || '',
          ship_from_city: data.ship_from_city || '',
          ship_from_state: data.ship_from_state || 'CA',
          ship_from_zip: data.ship_from_zip || '',
          ship_from_country: data.ship_from_country || 'US',
          ship_from_phone: data.ship_from_phone || '',
          ship_from_email: data.ship_from_email || '',
          default_parcel_length: String(data.default_parcel_length ?? '10'),
          default_parcel_width: String(data.default_parcel_width ?? '8'),
          default_parcel_height: String(data.default_parcel_height ?? '4'),
          default_parcel_distance_unit: data.default_parcel_distance_unit || 'in',
          default_parcel_weight: String(data.default_parcel_weight ?? '1'),
          default_parcel_mass_unit: data.default_parcel_mass_unit || 'lb',
          offer_free_shipping: data.offer_free_shipping ?? false,
          free_shipping_threshold: String((data.free_shipping_threshold ?? 0) / 100), // cents to dollars
          flat_rate_enabled: data.flat_rate_enabled ?? false,
          flat_rate_amount: String((data.flat_rate_amount ?? 0) / 100), // cents to dollars
          enabled_carriers: Array.isArray(data.enabled_carriers) ? data.enabled_carriers : [],
          enabled_service_levels: Array.isArray(data.enabled_service_levels) ? data.enabled_service_levels : [],
          handling_fee_type: data.handling_fee_type || 'none',
          handling_fee_amount: String(data.handling_fee_amount ?? '0'),
          show_estimated_delivery: data.show_estimated_delivery ?? true,
          show_carrier_logo: data.show_carrier_logo ?? true,
          sort_rates_by: data.sort_rates_by || 'price',
          local_pickup_enabled: data.local_pickup_enabled ?? true,
          local_pickup_address: data.local_pickup_address || '',
          local_pickup_instructions: data.local_pickup_instructions || '',
        };
        setForm(loaded);
        setInitial(loaded);

        // Check if we have a valid API key to show connection status
        const activeKey = loaded.shippo_mode === 'live' ? loaded.shippo_api_key_live : loaded.shippo_api_key_test;
        if (activeKey && !activeKey.includes('••••')) {
          setConnectionStatus('untested');
        } else if (activeKey) {
          // Key exists (masked) — assume configured
          setConnectionStatus('success');
        }
      } catch {
        toast.error('Failed to load shipping settings');
      }
      setLoading(false);
    }
    load();
  }, []);

  // Test connection
  async function handleTestConnection() {
    const apiKey = form.shippo_mode === 'live' ? form.shippo_api_key_live : form.shippo_api_key_test;
    // Send the key if it's a real (non-masked) value, otherwise let the server resolve from DB/env
    const isMaskedOrEmpty = !apiKey || apiKey.includes('••••');

    setTestingConnection(true);
    setConnectionStatus('untested');
    try {
      const res = await adminFetch('/api/admin/settings/shipping/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isMaskedOrEmpty ? { mode: form.shippo_mode } : { apiKey, mode: form.shippo_mode }),
      });
      const json = await res.json();
      if (json.data?.success) {
        setConnectionStatus('success');
        setConnectionError('');
        toast.success('Connection successful');
      } else {
        setConnectionStatus('error');
        setConnectionError(json.data?.error || json.error || 'Connection failed');
        toast.error(json.data?.error || json.error || 'Connection failed');
      }
    } catch {
      setConnectionStatus('error');
      setConnectionError('Network error');
      toast.error('Connection test failed');
    }
    setTestingConnection(false);
  }

  // Load carriers
  async function handleLoadCarriers() {
    setLoadingCarriers(true);
    try {
      const res = await adminFetch('/api/admin/settings/shipping/carriers');
      if (!res.ok) {
        const { error } = await res.json();
        toast.error(error || 'Failed to load carriers');
        setLoadingCarriers(false);
        return;
      }
      const { data } = await res.json();
      setCarriers(data || []);
    } catch {
      toast.error('Failed to load carriers');
    }
    setLoadingCarriers(false);
  }

  // Validate address
  async function handleValidateAddress() {
    if (!form.ship_from_street1 || !form.ship_from_city || !form.ship_from_state || !form.ship_from_zip) {
      toast.error('Fill in the address fields first');
      return;
    }

    setValidatingAddress(true);
    setAddressValid(null);
    setAddressMessages([]);
    try {
      const res = await adminFetch('/api/admin/settings/shipping/validate-address', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          street1: form.ship_from_street1,
          street2: form.ship_from_street2,
          city: form.ship_from_city,
          state: form.ship_from_state,
          zip: form.ship_from_zip,
          country: form.ship_from_country,
        }),
      });
      const { data } = await res.json();
      setAddressValid(data?.isValid ?? false);
      setAddressMessages(data?.messages || []);
      if (data?.isValid) {
        toast.success('Address validated');
      } else {
        toast.error('Address validation issues found');
      }
    } catch {
      toast.error('Address validation failed');
    }
    setValidatingAddress(false);
  }

  // Toggle carrier
  function toggleCarrier(carrier: string) {
    setForm((prev) => {
      const current = prev.enabled_carriers;
      const next = current.includes(carrier)
        ? current.filter((c) => c !== carrier)
        : [...current, carrier];
      return { ...prev, enabled_carriers: next };
    });
  }

  // Toggle service level
  function toggleServiceLevel(token: string) {
    setForm((prev) => {
      const current = prev.enabled_service_levels;
      const next = current.includes(token)
        ? current.filter((t) => t !== token)
        : [...current, token];
      return { ...prev, enabled_service_levels: next };
    });
  }

  // Save
  async function handleSave() {
    setSaving(true);
    try {
      const payload = {
        ...form,
        // Convert dollar amounts to cents for storage
        free_shipping_threshold: Math.round(parseFloat(form.free_shipping_threshold || '0') * 100),
        flat_rate_amount: Math.round(parseFloat(form.flat_rate_amount || '0') * 100),
        // Convert string numbers to actual numbers
        default_parcel_length: parseFloat(form.default_parcel_length) || 10,
        default_parcel_width: parseFloat(form.default_parcel_width) || 8,
        default_parcel_height: parseFloat(form.default_parcel_height) || 4,
        default_parcel_weight: parseFloat(form.default_parcel_weight) || 1,
        handling_fee_amount: parseFloat(form.handling_fee_amount) || 0,
      };

      const res = await adminFetch('/api/admin/settings/shipping', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const { error } = await res.json();
        toast.error(error || 'Failed to save');
        setSaving(false);
        return;
      }

      const { data } = await res.json();

      // Update form with returned (masked) values
      const updated: ShippingFormData = {
        ...form,
        shippo_api_key_live: data.shippo_api_key_live || '',
        shippo_api_key_test: data.shippo_api_key_test || '',
      };
      setForm(updated);
      setInitial(updated);
      toast.success('Shipping settings saved');
    } catch {
      toast.error('Failed to save settings');
    }
    setSaving(false);
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Shipping" description="Configure shipping rates and carrier integrations." />
        <div className="flex items-center justify-center py-12">
          <Spinner size="lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Shipping"
        description="Configure Shippo integration, shipping rates, and carrier preferences."
        action={
          <Button onClick={handleSave} disabled={saving || !isDirty}>
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        }
      />

      {/* Section 1: Shippo API Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5" />
            Shippo API Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Mode toggle */}
          <div className="flex items-center gap-4">
            <Label className="text-sm font-medium text-gray-700">API Mode</Label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => updateField('shippo_mode', 'test')}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  form.shippo_mode === 'test'
                    ? 'bg-yellow-100 text-yellow-800 ring-1 ring-yellow-300'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                Test
              </button>
              <button
                type="button"
                onClick={() => updateField('shippo_mode', 'live')}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  form.shippo_mode === 'live'
                    ? 'bg-green-100 text-green-800 ring-1 ring-green-300'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                Live
              </button>
            </div>
            {form.shippo_mode === 'live' && (
              <Badge variant="warning">Live mode — real charges apply</Badge>
            )}
          </div>

          {/* Test API Key */}
          <FormField
            label="Test API Key"
            htmlFor="shippo_api_key_test"
            description="Used for testing. No real charges."
          >
            <div className="relative">
              <Input
                id="shippo_api_key_test"
                type={showTestKey ? 'text' : 'password'}
                value={form.shippo_api_key_test}
                onChange={(e) => updateField('shippo_api_key_test', e.target.value)}
                placeholder="shippo_test_..."
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowTestKey(!showTestKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showTestKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </FormField>

          {/* Live API Key */}
          <FormField
            label="Live API Key"
            htmlFor="shippo_api_key_live"
            description="Used for production. Real shipping charges."
          >
            <div className="relative">
              <Input
                id="shippo_api_key_live"
                type={showLiveKey ? 'text' : 'password'}
                value={form.shippo_api_key_live}
                onChange={(e) => updateField('shippo_api_key_live', e.target.value)}
                placeholder="shippo_live_..."
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowLiveKey(!showLiveKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showLiveKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </FormField>

          {/* Test Connection + Status */}
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              onClick={handleTestConnection}
              disabled={testingConnection}
            >
              {testingConnection ? (
                <>
                  <Spinner size="sm" /> Testing...
                </>
              ) : (
                'Test Connection'
              )}
            </Button>

            {connectionStatus === 'success' && (
              <div className="flex items-center gap-1.5 text-sm text-green-600">
                <CheckCircle2 className="h-4 w-4" />
                Connected
              </div>
            )}
            {connectionStatus === 'error' && (
              <div className="flex items-center gap-1.5 text-sm text-red-600">
                <XCircle className="h-4 w-4" />
                {connectionError || 'Connection failed'}
              </div>
            )}
          </div>

          <p className="text-xs text-gray-500">
            Get your API key at{' '}
            <a
              href="https://apps.goshippo.com/settings/api"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-800 hover:underline inline-flex items-center gap-1"
            >
              goshippo.com/settings/api
              <ExternalLink className="h-3 w-3" />
            </a>
          </p>
        </CardContent>
      </Card>

      {/* Section 2: Ship-From Address */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Ship-From Address
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <FormField label="Name" htmlFor="ship_from_name" required>
              <Input
                id="ship_from_name"
                value={form.ship_from_name}
                onChange={(e) => updateField('ship_from_name', e.target.value)}
                placeholder="Business Name"
              />
            </FormField>

            <FormField label="Company" htmlFor="ship_from_company">
              <Input
                id="ship_from_company"
                value={form.ship_from_company}
                onChange={(e) => updateField('ship_from_company', e.target.value)}
                placeholder="Company (optional)"
              />
            </FormField>
          </div>

          <FormField label="Street Address" htmlFor="ship_from_street1" required>
            <Input
              id="ship_from_street1"
              value={form.ship_from_street1}
              onChange={(e) => updateField('ship_from_street1', e.target.value)}
              placeholder="123 Main St"
            />
          </FormField>

          <FormField label="Street Address 2" htmlFor="ship_from_street2">
            <Input
              id="ship_from_street2"
              value={form.ship_from_street2}
              onChange={(e) => updateField('ship_from_street2', e.target.value)}
              placeholder="Suite, Unit, etc. (optional)"
            />
          </FormField>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <FormField label="City" htmlFor="ship_from_city" required>
              <Input
                id="ship_from_city"
                value={form.ship_from_city}
                onChange={(e) => updateField('ship_from_city', e.target.value)}
                placeholder="City"
              />
            </FormField>

            <FormField label="State" htmlFor="ship_from_state" required>
              <Select
                id="ship_from_state"
                value={form.ship_from_state}
                onChange={(e) => updateField('ship_from_state', e.target.value)}
              >
                {US_STATES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </Select>
            </FormField>

            <FormField label="ZIP Code" htmlFor="ship_from_zip" required>
              <Input
                id="ship_from_zip"
                value={form.ship_from_zip}
                onChange={(e) => updateField('ship_from_zip', e.target.value)}
                placeholder="90717"
              />
            </FormField>

            <FormField label="Country" htmlFor="ship_from_country">
              <Input
                id="ship_from_country"
                value={form.ship_from_country}
                onChange={(e) => updateField('ship_from_country', e.target.value)}
                disabled
              />
            </FormField>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <FormField label="Phone" htmlFor="ship_from_phone">
              <Input
                id="ship_from_phone"
                value={form.ship_from_phone}
                onChange={(e) => updateField('ship_from_phone', e.target.value)}
                placeholder="(310) 555-1234"
              />
            </FormField>

            <FormField label="Email" htmlFor="ship_from_email">
              <Input
                id="ship_from_email"
                type="email"
                value={form.ship_from_email}
                onChange={(e) => updateField('ship_from_email', e.target.value)}
                placeholder="shipping@example.com"
              />
            </FormField>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={handleValidateAddress}
              disabled={validatingAddress}
            >
              {validatingAddress ? (
                <>
                  <Spinner size="sm" /> Validating...
                </>
              ) : (
                'Validate Address'
              )}
            </Button>

            {addressValid === true && (
              <div className="flex items-center gap-1.5 text-sm text-green-600">
                <CheckCircle2 className="h-4 w-4" />
                Address is valid
              </div>
            )}
            {addressValid === false && (
              <div className="text-sm text-red-600">
                <div className="flex items-center gap-1.5">
                  <XCircle className="h-4 w-4" />
                  Validation issues:
                </div>
                <ul className="ml-6 mt-1 list-disc">
                  {addressMessages.map((msg, i) => (
                    <li key={i}>{msg}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Section 3: Default Package Dimensions */}
      <Card>
        <CardHeader>
          <CardTitle>Default Package Dimensions</CardTitle>
          <p className="text-sm text-gray-500 mt-1">
            Used when products don&apos;t have their own dimensions specified.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <FormField label="Length" htmlFor="default_parcel_length">
              <Input
                id="default_parcel_length"
                type="number"
                step="0.1"
                min="0"
                value={form.default_parcel_length}
                onChange={(e) => updateField('default_parcel_length', e.target.value)}
              />
            </FormField>

            <FormField label="Width" htmlFor="default_parcel_width">
              <Input
                id="default_parcel_width"
                type="number"
                step="0.1"
                min="0"
                value={form.default_parcel_width}
                onChange={(e) => updateField('default_parcel_width', e.target.value)}
              />
            </FormField>

            <FormField label="Height" htmlFor="default_parcel_height">
              <Input
                id="default_parcel_height"
                type="number"
                step="0.1"
                min="0"
                value={form.default_parcel_height}
                onChange={(e) => updateField('default_parcel_height', e.target.value)}
              />
            </FormField>

            <FormField label="Unit" htmlFor="default_parcel_distance_unit">
              <Select
                id="default_parcel_distance_unit"
                value={form.default_parcel_distance_unit}
                onChange={(e) => updateField('default_parcel_distance_unit', e.target.value)}
              >
                <option value="in">inches (in)</option>
                <option value="cm">centimeters (cm)</option>
              </Select>
            </FormField>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
            <FormField label="Weight" htmlFor="default_parcel_weight">
              <Input
                id="default_parcel_weight"
                type="number"
                step="0.1"
                min="0"
                value={form.default_parcel_weight}
                onChange={(e) => updateField('default_parcel_weight', e.target.value)}
              />
            </FormField>

            <FormField label="Weight Unit" htmlFor="default_parcel_mass_unit">
              <Select
                id="default_parcel_mass_unit"
                value={form.default_parcel_mass_unit}
                onChange={(e) => updateField('default_parcel_mass_unit', e.target.value)}
              >
                <option value="lb">pounds (lb)</option>
                <option value="oz">ounces (oz)</option>
                <option value="kg">kilograms (kg)</option>
                <option value="g">grams (g)</option>
              </Select>
            </FormField>
          </div>
        </CardContent>
      </Card>

      {/* Section 4: Carrier & Service Preferences */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Carrier Preferences</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={handleLoadCarriers}
              disabled={loadingCarriers}
            >
              {loadingCarriers ? (
                <>
                  <Spinner size="sm" /> Loading...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4" />
                  {carriers.length > 0 ? 'Refresh' : 'Load'} Carriers
                </>
              )}
            </Button>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Select which carriers to show at checkout. Leave empty to show all available rates.
          </p>
        </CardHeader>
        <CardContent>
          {carriers.length === 0 && !loadingCarriers && (
            <p className="text-sm text-gray-500">
              Click &quot;Load Carriers&quot; to fetch available carrier accounts from Shippo.
            </p>
          )}
          {loadingCarriers && (
            <div className="flex items-center justify-center py-6">
              <Spinner size="md" />
            </div>
          )}
          {carriers.length > 0 && (
            <div className="space-y-3">
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
                <strong>Note:</strong> UPS and FedEx require you to connect your own carrier accounts in the{' '}
                <a
                  href="https://apps.goshippo.com/settings/carriers"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-amber-900"
                >
                  Shippo dashboard
                </a>
                . USPS and DHL Express are available by default through Shippo.
              </div>
              {carriers.map((carrier) => (
                <label
                  key={carrier.objectId}
                  className="flex items-center gap-3 rounded-lg border border-gray-200 p-3 cursor-pointer hover:bg-gray-50 transition-colors"
                >
                  <Checkbox
                    checked={form.enabled_carriers.includes(carrier.carrier)}
                    onChange={() => toggleCarrier(carrier.carrier)}
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">
                        {carrier.carrierName || carrier.carrier}
                      </span>
                      {carrier.isShippoAccount && (
                        <Badge variant="info">Shippo</Badge>
                      )}
                      {carrier.active ? (
                        <Badge variant="success">Active</Badge>
                      ) : (
                        <Badge variant="default">Inactive</Badge>
                      )}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 4b: Service Level Filter */}
      <Card>
        <CardHeader>
          <CardTitle>Service Level Filter</CardTitle>
          <p className="text-sm text-gray-500 mt-1">
            Select which service levels to show at checkout. Leave empty to show all available levels.
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {COMMON_SERVICE_LEVELS.map((level) => (
              <label
                key={level.token}
                className="flex items-center gap-3 rounded-lg border border-gray-200 p-3 cursor-pointer hover:bg-gray-50 transition-colors"
              >
                <Checkbox
                  checked={form.enabled_service_levels.includes(level.token)}
                  onChange={() => toggleServiceLevel(level.token)}
                />
                <span className="text-sm font-medium text-gray-900">
                  {level.label}
                </span>
                <span className="text-xs text-gray-500">{level.token}</span>
              </label>
            ))}
          </div>
          {form.enabled_service_levels.length > 0 && (
            <div className="mt-3 flex items-center gap-2">
              <Badge variant="info">{form.enabled_service_levels.length} selected</Badge>
              <button
                type="button"
                onClick={() => updateField('enabled_service_levels', [])}
                className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
              >
                Clear all
              </button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 5: Pricing & Fees */}
      <Card>
        <CardHeader>
          <CardTitle>Pricing & Fees</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Free Shipping */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium text-gray-700">Free Shipping</Label>
                <p className="text-sm text-gray-500">Offer free shipping on orders above a threshold</p>
              </div>
              <Switch
                checked={form.offer_free_shipping}
                onCheckedChange={(checked) => updateField('offer_free_shipping', checked)}
              />
            </div>
            {form.offer_free_shipping && (
              <FormField
                label="Free shipping on orders over"
                htmlFor="free_shipping_threshold"
              >
                <div className="relative w-48">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                  <Input
                    id="free_shipping_threshold"
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.free_shipping_threshold}
                    onChange={(e) => updateField('free_shipping_threshold', e.target.value)}
                    className="pl-7"
                  />
                </div>
              </FormField>
            )}
          </div>

          <hr className="border-gray-200" />

          {/* Flat Rate */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium text-gray-700">Flat Rate Shipping</Label>
                <p className="text-sm text-gray-500">Charge a single flat rate instead of live carrier rates</p>
              </div>
              <Switch
                checked={form.flat_rate_enabled}
                onCheckedChange={(checked) => updateField('flat_rate_enabled', checked)}
              />
            </div>
            {form.flat_rate_enabled && (
              <FormField label="Flat rate amount" htmlFor="flat_rate_amount">
                <div className="relative w-48">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                  <Input
                    id="flat_rate_amount"
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.flat_rate_amount}
                    onChange={(e) => updateField('flat_rate_amount', e.target.value)}
                    className="pl-7"
                  />
                </div>
              </FormField>
            )}
          </div>

          <hr className="border-gray-200" />

          {/* Handling Fee */}
          <div className="space-y-3">
            <FormField label="Handling Fee" htmlFor="handling_fee_type">
              <Select
                id="handling_fee_type"
                value={form.handling_fee_type}
                onChange={(e) => updateField('handling_fee_type', e.target.value as 'none' | 'flat' | 'percent')}
                className="w-48"
              >
                <option value="none">None</option>
                <option value="flat">Flat fee</option>
                <option value="percent">Percentage</option>
              </Select>
            </FormField>

            {form.handling_fee_type !== 'none' && (
              <FormField
                label={form.handling_fee_type === 'flat' ? 'Fee amount (cents)' : 'Fee percentage (%)'}
                htmlFor="handling_fee_amount"
                description="Added to each shipping rate shown to customers"
              >
                <div className="relative w-48">
                  {form.handling_fee_type === 'flat' && (
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">¢</span>
                  )}
                  <Input
                    id="handling_fee_amount"
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.handling_fee_amount}
                    onChange={(e) => updateField('handling_fee_amount', e.target.value)}
                    className={form.handling_fee_type === 'flat' ? 'pl-7' : ''}
                  />
                  {form.handling_fee_type === 'percent' && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">%</span>
                  )}
                </div>
              </FormField>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Section 6: Display Preferences */}
      <Card>
        <CardHeader>
          <CardTitle>Display Preferences</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium text-gray-700">Show Estimated Delivery</Label>
              <p className="text-sm text-gray-500">Display estimated delivery dates at checkout</p>
            </div>
            <Switch
              checked={form.show_estimated_delivery}
              onCheckedChange={(checked) => updateField('show_estimated_delivery', checked)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium text-gray-700">Show Carrier Logos</Label>
              <p className="text-sm text-gray-500">Display carrier logos next to shipping options</p>
            </div>
            <Switch
              checked={form.show_carrier_logo}
              onCheckedChange={(checked) => updateField('show_carrier_logo', checked)}
            />
          </div>

          <FormField label="Sort Shipping Options By" htmlFor="sort_rates_by">
            <Select
              id="sort_rates_by"
              value={form.sort_rates_by}
              onChange={(e) => updateField('sort_rates_by', e.target.value as 'price' | 'speed')}
              className="w-64"
            >
              <option value="price">Price (cheapest first)</option>
              <option value="speed">Speed (fastest first)</option>
            </Select>
          </FormField>
        </CardContent>
      </Card>

      {/* Section 7: Local Pickup */}
      <Card>
        <CardHeader>
          <CardTitle>Local Pickup</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium text-gray-700">Enable Local Pickup</Label>
              <p className="text-sm text-gray-500">Allow customers to pick up orders at your location</p>
            </div>
            <Switch
              checked={form.local_pickup_enabled}
              onCheckedChange={(checked) => updateField('local_pickup_enabled', checked)}
            />
          </div>

          {form.local_pickup_enabled && (
            <>
              <FormField
                label="Pickup Address"
                htmlFor="local_pickup_address"
                description="Displayed to customers who select pickup"
              >
                <Input
                  id="local_pickup_address"
                  value={form.local_pickup_address}
                  onChange={(e) => updateField('local_pickup_address', e.target.value)}
                  placeholder="123 Main St, Lomita, CA 90717"
                />
              </FormField>

              <FormField
                label="Pickup Instructions"
                htmlFor="local_pickup_instructions"
                description="Additional instructions for pickup customers"
              >
                <Textarea
                  id="local_pickup_instructions"
                  value={form.local_pickup_instructions}
                  onChange={(e) => updateField('local_pickup_instructions', e.target.value)}
                  placeholder="Available Mon-Sat 9am-5pm. Please bring your order confirmation."
                  rows={3}
                />
              </FormField>
            </>
          )}
        </CardContent>
      </Card>

      {/* Bottom save button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving || !isDirty}>
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </div>
  );
}
