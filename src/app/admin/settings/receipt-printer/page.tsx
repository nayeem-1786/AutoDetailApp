'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { FormField } from '@/components/ui/form-field';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogHeader, DialogTitle, DialogContent, DialogClose } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Upload, Trash2, Image as ImageIcon, Eye, Plus, X, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { generateReceiptHtml } from '@/app/pos/lib/receipt-template';
import type { MergedReceiptConfig, CustomTextZone } from '@/lib/data/receipt-config';

const SHORTCODES = [
  '{customer_name}', '{customer_first_name}', '{customer_type}', '{customer_phone}',
  '{customer_email}', '{customer_since}', '{staff_name}', '{staff_first_name}',
  '{receipt_number}', '{transaction_date}', '{total_amount}', '{vehicle}',
  '{business_name}', '{business_phone}', '{business_email}', '{business_website}',
] as const;

interface ReceiptConfigState {
  printer_ip: string;
  print_server_url: string;
  override_name: string;
  override_phone: string;
  override_address: string;
  override_email: string;
  override_website: string;
  logo_url: string;
  logo_width: number;
  logo_placement: 'above_name' | 'below_name' | 'above_footer';
  logo_alignment: 'left' | 'center' | 'right';
  custom_text: string;
  custom_text_placement: 'below_header' | 'above_footer' | 'below_footer';
  custom_text_zones: CustomTextZone[];
}

interface BusinessDefaults {
  business_name: string;
  business_phone: string;
  business_address: string;
  business_email: string;
  business_website: string;
}

const INITIAL_CONFIG: ReceiptConfigState = {
  printer_ip: '',
  print_server_url: '',
  override_name: '',
  override_phone: '',
  override_address: '',
  override_email: '',
  override_website: '',
  logo_url: '',
  logo_width: 200,
  logo_placement: 'above_name',
  logo_alignment: 'center',
  custom_text: '',
  custom_text_placement: 'below_footer',
  custom_text_zones: [],
};

// Default zones for fresh installs
const DEFAULT_ZONES: CustomTextZone[] = [
  {
    id: 'default-footer-1',
    placement: 'below_footer',
    content: 'Thank you for your business!\nYour Service Advisor, {staff_first_name}, Thanks You!',
    enabled: true,
  },
  {
    id: 'default-footer-2',
    placement: 'below_footer',
    content: 'Tell Us About Your Recent Visit\nLeave us a Review on Yelp or Google!',
    enabled: true,
  },
];

function PrintServerTestButton({ url, type }: { url: string; type: 'connection' | 'print' }) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  async function handleTest() {
    setStatus('loading');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    try {
      if (type === 'connection') {
        const res = await fetch(`${url}/health`, { signal: controller.signal });
        clearTimeout(timeout);
        if (res.ok) {
          setStatus('success');
          toast.success('Print server connected');
        } else {
          setStatus('error');
          toast.error('Print server returned an error');
        }
      } else {
        const res = await fetch(`${url}/test`, {
          method: 'POST',
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (res.ok) {
          setStatus('success');
          toast.success('Test receipt sent to printer');
        } else {
          setStatus('error');
          toast.error('Test print failed');
        }
      }
    } catch {
      clearTimeout(timeout);
      setStatus('error');
      toast.error('Print server unreachable — check URL and that server is running');
    }

    // Reset icon after 3 seconds
    setTimeout(() => setStatus('idle'), 3000);
  }

  return (
    <Button variant="outline" size="sm" onClick={handleTest} disabled={status === 'loading'}>
      {status === 'loading' ? (
        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
      ) : status === 'success' ? (
        <CheckCircle2 className="mr-1.5 h-4 w-4 text-green-500" />
      ) : status === 'error' ? (
        <XCircle className="mr-1.5 h-4 w-4 text-red-500" />
      ) : null}
      {type === 'connection' ? 'Test Connection' : 'Test Print'}
    </Button>
  );
}

export default function ReceiptPrinterPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [config, setConfig] = useState<ReceiptConfigState>(INITIAL_CONFIG);
  const [defaults, setDefaults] = useState<BusinessDefaults>({
    business_name: '',
    business_phone: '',
    business_address: '',
    business_email: '',
    business_website: '',
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const zoneTextareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});

  useEffect(() => {
    async function loadSettings() {
      const supabase = createClient();

      const { data, error } = await supabase
        .from('business_settings')
        .select('key, value')
        .in('key', [
          'receipt_config',
          'business_name',
          'business_phone',
          'business_address',
          'business_email',
          'business_website',
          'star_printer_ip',
        ]);

      if (error) {
        toast.error('Failed to load settings', { description: error.message });
        setLoading(false);
        return;
      }

      const settings: Record<string, unknown> = {};
      for (const row of data || []) {
        settings[row.key] = row.value;
      }

      // Parse business address for display
      const rawAddr = settings.business_address;
      const addr =
        typeof rawAddr === 'object' && rawAddr !== null
          ? (rawAddr as { line1: string; city: string; state: string; zip: string })
          : null;
      const formattedAddress = addr
        ? `${addr.line1}, ${addr.city}, ${addr.state} ${addr.zip}`
        : '';

      // Format phone for display
      const rawPhone = (settings.business_phone as string) || '';
      const displayPhone = rawPhone
        ? rawPhone.replace('+1', '(').replace(/(\d{3})(\d{3})(\d{4})/, '$1) $2-$3')
        : '';

      setDefaults({
        business_name: (settings.business_name as string) || '',
        business_phone: displayPhone,
        business_address: formattedAddress,
        business_email: (settings.business_email as string) || '',
        business_website: (settings.business_website as string) || '',
      });

      // Parse receipt_config
      const raw = settings.receipt_config;
      const rc = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};

      // Legacy migration: if star_printer_ip exists and receipt_config has no printer_ip
      const legacyIp = (settings.star_printer_ip as string) || '';

      // Parse zones
      let zones: CustomTextZone[] = Array.isArray(rc.custom_text_zones)
        ? (rc.custom_text_zones as CustomTextZone[])
        : [];

      // Migrate legacy single custom_text to zones
      const legacyText = (rc.custom_text as string) || '';
      if (zones.length === 0 && legacyText) {
        zones = [{
          id: 'migrated-1',
          placement: (rc.custom_text_placement as CustomTextZone['placement']) || 'below_footer',
          content: legacyText,
          enabled: true,
        }];
      }

      // Default zones for fresh installs
      if (zones.length === 0 && !legacyText) {
        zones = DEFAULT_ZONES;
      }

      setConfig({
        printer_ip: (rc.printer_ip as string) || legacyIp || '',
        print_server_url: (rc.print_server_url as string) || '',
        override_name: (rc.override_name as string) || '',
        override_phone: (rc.override_phone as string) || '',
        override_address: (rc.override_address as string) || '',
        override_email: (rc.override_email as string) || '',
        override_website: (rc.override_website as string) || '',
        logo_url: (rc.logo_url as string) || '',
        logo_width: (rc.logo_width as number) || 200,
        logo_placement: (rc.logo_placement as ReceiptConfigState['logo_placement']) || 'above_name',
        logo_alignment: (rc.logo_alignment as ReceiptConfigState['logo_alignment']) || 'center',
        custom_text: legacyText,
        custom_text_placement: (rc.custom_text_placement as ReceiptConfigState['custom_text_placement']) || 'below_footer',
        custom_text_zones: zones,
      });

      setLoading(false);
    }

    loadSettings();
  }, []);

  function updateConfig<K extends keyof ReceiptConfigState>(key: K, value: ReceiptConfigState[K]) {
    setConfig((prev) => ({ ...prev, [key]: value }));
  }

  // --- Zone management ---
  const updateZone = useCallback((zoneId: string, updates: Partial<CustomTextZone>) => {
    setConfig((prev) => ({
      ...prev,
      custom_text_zones: prev.custom_text_zones.map(z =>
        z.id === zoneId ? { ...z, ...updates } : z
      ),
    }));
  }, []);

  function addZone() {
    const newZone: CustomTextZone = {
      id: `zone-${Date.now()}`,
      placement: 'below_footer',
      content: '',
      enabled: true,
    };
    setConfig((prev) => ({
      ...prev,
      custom_text_zones: [...prev.custom_text_zones, newZone],
    }));
  }

  function removeZone(zoneId: string) {
    setConfig((prev) => ({
      ...prev,
      custom_text_zones: prev.custom_text_zones.filter(z => z.id !== zoneId),
    }));
  }

  function insertShortcode(zoneId: string, shortcode: string) {
    const textarea = zoneTextareaRefs.current[zoneId];
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentContent = config.custom_text_zones.find(z => z.id === zoneId)?.content || '';
    const newContent = currentContent.slice(0, start) + shortcode + currentContent.slice(end);

    updateZone(zoneId, { content: newContent });

    // Restore cursor position after React re-render
    requestAnimationFrame(() => {
      const newPos = start + shortcode.length;
      textarea.focus();
      textarea.setSelectionRange(newPos, newPos);
    });
  }

  async function handleSave() {
    setSaving(true);
    const supabase = createClient();

    // Sync legacy custom_text from first zone for backward compat
    const firstEnabledZone = config.custom_text_zones.find(z => z.enabled && z.content.trim());

    const configValue = {
      printer_ip: config.printer_ip || null,
      print_server_url: config.print_server_url || null,
      override_name: config.override_name || null,
      override_phone: config.override_phone || null,
      override_address: config.override_address || null,
      override_email: config.override_email || null,
      override_website: config.override_website || null,
      logo_url: config.logo_url || null,
      logo_width: config.logo_width,
      logo_placement: config.logo_placement,
      logo_alignment: config.logo_alignment,
      custom_text: firstEnabledZone?.content || null,
      custom_text_placement: firstEnabledZone?.placement || config.custom_text_placement,
      custom_text_zones: config.custom_text_zones,
    };

    const { error } = await supabase
      .from('business_settings')
      .upsert(
        {
          key: 'receipt_config',
          value: configValue as unknown,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'key' }
      );

    if (error) {
      toast.error('Failed to save receipt config', { description: error.message });
    } else {
      toast.success('Receipt settings saved');
    }
    setSaving(false);
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      toast.error('Only PNG, JPG, and WebP files are supported');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Logo must be under 2MB');
      return;
    }

    setUploading(true);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/admin/receipt-logo', {
        method: 'POST',
        body: formData,
      });
      const json = await res.json();

      if (!res.ok) {
        toast.error('Failed to upload logo', { description: json.error });
        setUploading(false);
        return;
      }

      updateConfig('logo_url', json.url);
      toast.success('Logo uploaded');
    } catch {
      toast.error('Failed to upload logo');
    }
    setUploading(false);

    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleRemoveLogo() {
    updateConfig('logo_url', '');
  }

  // --- Preview ---
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');

  function handlePreview() {
    const merged: MergedReceiptConfig = {
      name: config.override_name || defaults.business_name || 'Your Business Name',
      phone: config.override_phone || defaults.business_phone || '(310) 555-1234',
      address: config.override_address || defaults.business_address || '123 Main St, City, ST 00000',
      email: config.override_email || defaults.business_email || null,
      website: config.override_website || defaults.business_website || null,
      logo_url: config.logo_url || null,
      logo_width: config.logo_width,
      logo_placement: config.logo_placement,
      logo_alignment: config.logo_alignment,
      custom_text: config.custom_text || null,
      custom_text_placement: config.custom_text_placement,
      custom_text_zones: config.custom_text_zones,
    };

    const sampleTx = {
      receipt_number: '10042',
      transaction_date: new Date().toISOString(),
      subtotal: 149.99,
      tax_amount: 7.69,
      discount_amount: 0,
      tip_amount: 20.00,
      total_amount: 177.68,
      customer: {
        first_name: 'Jane',
        last_name: 'Smith',
        phone: '(310) 555-0100',
        email: 'jane@example.com',
        customer_type: 'enthusiast',
        created_at: '2023-06-15T00:00:00Z',
      },
      employee: { first_name: 'Joselyn', last_name: 'Reyes' },
      vehicle: { year: 2027, make: 'Honda', model: 'Accord', color: 'Silver' },
      items: [
        { item_name: 'Full Detail — Sedan', quantity: 1, unit_price: 129.99, total_price: 129.99, tax_amount: 0, item_type: 'service' },
        { item_name: 'Air Freshener', quantity: 2, unit_price: 9.99, total_price: 19.99, tax_amount: 2.05, item_type: 'product' },
      ] as { item_name: string; quantity: number; unit_price: number; total_price: number; tax_amount: number; item_type?: string }[],
      payments: [
        { method: 'card', amount: 177.68, tip_amount: 20.00, card_brand: 'Visa', card_last_four: '4242' },
      ] as { method: string; amount: number; tip_amount: number; card_brand?: string | null; card_last_four?: string | null }[],
    };

    const html = generateReceiptHtml(sampleTx, merged);
    setPreviewHtml(html);
    setPreviewOpen(true);
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Receipt Printer" description="Configure receipt printer and receipt branding." />
        <div className="flex items-center justify-center py-12">
          <Spinner size="lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Receipt Printer"
        description="Configure receipt printer connection, branding overrides, logo, and custom text."
      />

      {/* Printer Connection */}
      <Card>
        <CardHeader>
          <CardTitle>Printer Connection</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <FormField
            label="Print Server URL"
            description="URL of the local print server running on the shop PC (e.g. http://192.168.1.174:8080)"
            htmlFor="print_server_url"
          >
            <Input
              id="print_server_url"
              placeholder="http://192.168.1.174:8080"
              value={config.print_server_url}
              onChange={(e) => updateConfig('print_server_url', e.target.value)}
            />
          </FormField>

          {config.print_server_url && (
            <div className="flex gap-2">
              <PrintServerTestButton url={config.print_server_url} type="connection" />
              <PrintServerTestButton url={config.print_server_url} type="print" />
            </div>
          )}

          <FormField
            label="Printer IP Address (Legacy)"
            description="Star TSP-100 WebPRNT IP — used for direct browser printing. Leave blank if using Print Server above."
            htmlFor="printer_ip"
          >
            <Input
              id="printer_ip"
              placeholder="192.168.1.100"
              value={config.printer_ip}
              onChange={(e) => updateConfig('printer_ip', e.target.value)}
            />
          </FormField>
        </CardContent>
      </Card>

      {/* Receipt Header & Logo */}
      <Card>
        <CardHeader>
          <CardTitle>Receipt Header & Logo</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-gray-500">
            Configure receipt branding. Leave blank to use your Business Profile values.
          </p>

          <div className="grid grid-cols-8 gap-6">
            {/* Left — Override text inputs */}
            <div className="col-span-8 space-y-4 md:col-span-3">
              <FormField label="Business Name" htmlFor="override_name">
                <Input
                  id="override_name"
                  placeholder={defaults.business_name || 'Business Profile value'}
                  value={config.override_name}
                  onChange={(e) => updateConfig('override_name', e.target.value)}
                />
              </FormField>

              <FormField label="Phone" htmlFor="override_phone">
                <Input
                  id="override_phone"
                  placeholder={defaults.business_phone || 'Business Profile value'}
                  value={config.override_phone}
                  onChange={(e) => updateConfig('override_phone', e.target.value)}
                />
              </FormField>

              <FormField label="Address" htmlFor="override_address">
                <Input
                  id="override_address"
                  placeholder={defaults.business_address || 'Business Profile value'}
                  value={config.override_address}
                  onChange={(e) => updateConfig('override_address', e.target.value)}
                />
              </FormField>

              <FormField label="Email" htmlFor="override_email">
                <Input
                  id="override_email"
                  type="email"
                  placeholder={defaults.business_email || 'Business Profile value'}
                  value={config.override_email}
                  onChange={(e) => updateConfig('override_email', e.target.value)}
                />
              </FormField>

              <FormField label="Website" htmlFor="override_website">
                <Input
                  id="override_website"
                  placeholder={defaults.business_website || 'Business Profile value'}
                  value={config.override_website}
                  onChange={(e) => updateConfig('override_website', e.target.value)}
                />
              </FormField>
            </div>

            {/* Middle — Logo preview + upload */}
            <div className="col-span-8 flex flex-col items-center justify-center md:col-span-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={handleLogoUpload}
              />
              {config.logo_url ? (
                <div className="w-full space-y-3 text-center">
                  <div className="flex min-h-[200px] w-full items-center justify-center rounded border border-gray-200 bg-gray-50 p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={config.logo_url}
                      alt="Receipt logo preview"
                      className="max-h-full max-w-full object-contain"
                      style={{ maxWidth: `${config.logo_width}px` }}
                    />
                  </div>
                  <div className="flex justify-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                    >
                      <Upload className="mr-1.5 h-4 w-4" />
                      {uploading ? 'Uploading...' : 'Replace'}
                    </Button>
                    <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700" onClick={handleRemoveLogo}>
                      <Trash2 className="mr-1.5 h-4 w-4" />
                      Remove
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="w-full space-y-3 text-center">
                  <div className="flex min-h-[200px] w-full items-center justify-center rounded border-2 border-dashed border-gray-300 bg-gray-50">
                    <div className="text-center">
                      <ImageIcon className="mx-auto h-8 w-8 text-gray-400" />
                      <p className="mt-1 text-sm text-gray-400">No logo</p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                  >
                    <Upload className="mr-1.5 h-4 w-4" />
                    {uploading ? 'Uploading...' : 'Upload Logo'}
                  </Button>
                </div>
              )}
              <p className="mt-3 text-xs text-muted-foreground">
                Upload a high-contrast PNG or JPG (max 2MB).<br />
                Dark logos on white background work best for thermal printing.
              </p>
            </div>

            {/* Right — Logo controls */}
            <div className="col-span-8 space-y-4 md:col-span-2">
              <FormField label="Width" htmlFor="logo_width">
                <div className="flex items-center gap-3">
                  <Input
                    id="logo_width"
                    type="range"
                    min={100}
                    max={400}
                    step={10}
                    value={config.logo_width}
                    onChange={(e) => updateConfig('logo_width', Number(e.target.value))}
                    className="flex-1"
                  />
                  <span className="w-12 text-right text-sm font-medium text-gray-700">{config.logo_width}px</span>
                </div>
              </FormField>

              <FormField label="Position" htmlFor="logo_placement">
                <Select
                  id="logo_placement"
                  value={config.logo_placement}
                  onChange={(e) => updateConfig('logo_placement', e.target.value as ReceiptConfigState['logo_placement'])}
                >
                  <option value="above_name">Above Business Name</option>
                  <option value="below_name">Below Business Name</option>
                  <option value="above_footer">Above Footer</option>
                </Select>
              </FormField>

              <FormField label="Alignment" htmlFor="logo_alignment">
                <Select
                  id="logo_alignment"
                  value={config.logo_alignment}
                  onChange={(e) => updateConfig('logo_alignment', e.target.value as ReceiptConfigState['logo_alignment'])}
                >
                  <option value="left">Left</option>
                  <option value="center">Center</option>
                  <option value="right">Right</option>
                </Select>
              </FormField>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Custom Text Zones */}
      <Card>
        <CardHeader>
          <CardTitle>Custom Text Zones</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-500">
            Add text blocks that appear on every receipt. Use {'{shortcodes}'} to insert dynamic data. You can add multiple zones at different positions.
          </p>

          {config.custom_text_zones.length === 0 && (
            <p className="text-sm italic text-gray-400">No zones configured. Add one below.</p>
          )}

          <div className="space-y-4">
            {config.custom_text_zones.map((zone, index) => (
              <div
                key={zone.id}
                className={`rounded-lg border p-4 ${zone.enabled ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50 opacity-60'}`}
              >
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-gray-700">Zone {index + 1}</span>
                    <Switch
                      checked={zone.enabled}
                      onCheckedChange={(checked) => updateZone(zone.id, { enabled: checked })}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeZone(zone.id)}
                    className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-red-500"
                    title="Remove zone"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="mb-3">
                  <label className="mb-1 block text-xs font-medium text-gray-500">Placement</label>
                  <Select
                    value={zone.placement}
                    onChange={(e) => updateZone(zone.id, { placement: e.target.value as CustomTextZone['placement'] })}
                  >
                    <option value="below_header">Below Header</option>
                    <option value="above_footer">Above Footer</option>
                    <option value="below_footer">Below Footer</option>
                  </Select>
                </div>

                <div className="mb-2">
                  <label className="mb-1 block text-xs font-medium text-gray-500">Content</label>
                  <Textarea
                    ref={(el) => { zoneTextareaRefs.current[zone.id] = el; }}
                    rows={3}
                    className="font-mono text-sm"
                    placeholder="e.g. Thank you, {customer_first_name}!"
                    value={zone.content}
                    onChange={(e) => updateZone(zone.id, { content: e.target.value })}
                  />
                </div>

                {/* Shortcode chips */}
                <div className="flex flex-wrap gap-1">
                  {SHORTCODES.map((sc) => (
                    <button
                      key={sc}
                      type="button"
                      onClick={() => insertShortcode(zone.id, sc)}
                      className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs text-gray-500 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600"
                    >
                      {sc}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <Button variant="outline" size="sm" onClick={addZone}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add Zone
          </Button>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={handlePreview}>
          <Eye className="mr-1.5 h-4 w-4" />
          Preview Receipt
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogClose onClose={() => setPreviewOpen(false)} />
        <DialogHeader>
          <DialogTitle>Receipt Preview</DialogTitle>
        </DialogHeader>
        <DialogContent className="max-h-[70vh] overflow-y-auto">
          <p className="mb-3 text-xs text-gray-500">
            This is a sample receipt using your current settings. Save changes first to apply to real receipts.
          </p>
          <div
            className="rounded border border-gray-200 bg-gray-50 p-2"
            dangerouslySetInnerHTML={{ __html: previewHtml }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
