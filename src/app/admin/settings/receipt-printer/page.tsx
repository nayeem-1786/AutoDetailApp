'use client';

import { useEffect, useState, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { FormField } from '@/components/ui/form-field';
import { Spinner } from '@/components/ui/spinner';
import { Dialog, DialogHeader, DialogTitle, DialogContent, DialogClose } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Upload, Trash2, Image as ImageIcon, Eye } from 'lucide-react';
import { generateReceiptHtml } from '@/app/pos/lib/receipt-template';
import type { MergedReceiptConfig } from '@/lib/data/receipt-config';

interface ReceiptConfigState {
  printer_ip: string;
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
};

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

      setConfig({
        printer_ip: (rc.printer_ip as string) || legacyIp || '',
        override_name: (rc.override_name as string) || '',
        override_phone: (rc.override_phone as string) || '',
        override_address: (rc.override_address as string) || '',
        override_email: (rc.override_email as string) || '',
        override_website: (rc.override_website as string) || '',
        logo_url: (rc.logo_url as string) || '',
        logo_width: (rc.logo_width as number) || 200,
        logo_placement: (rc.logo_placement as ReceiptConfigState['logo_placement']) || 'above_name',
        logo_alignment: (rc.logo_alignment as ReceiptConfigState['logo_alignment']) || 'center',
        custom_text: (rc.custom_text as string) || '',
        custom_text_placement: (rc.custom_text_placement as ReceiptConfigState['custom_text_placement']) || 'below_footer',
      });

      setLoading(false);
    }

    loadSettings();
  }, []);

  function updateConfig<K extends keyof ReceiptConfigState>(key: K, value: ReceiptConfigState[K]) {
    setConfig((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    const supabase = createClient();

    // Build the receipt_config JSONB value — convert empty strings to null
    const configValue = {
      printer_ip: config.printer_ip || null,
      override_name: config.override_name || null,
      override_phone: config.override_phone || null,
      override_address: config.override_address || null,
      override_email: config.override_email || null,
      override_website: config.override_website || null,
      logo_url: config.logo_url || null,
      logo_width: config.logo_width,
      logo_placement: config.logo_placement,
      logo_alignment: config.logo_alignment,
      custom_text: config.custom_text || null,
      custom_text_placement: config.custom_text_placement,
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

    // Validate type and size
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      toast.error('Only PNG, JPG, and WebP files are supported');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Logo must be under 2MB');
      return;
    }

    setUploading(true);

    // Upload via server API route (handles bucket creation + service-role auth)
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

    // Reset file input so re-uploading the same file triggers onChange
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleRemoveLogo() {
    updateConfig('logo_url', '');
  }

  // --- Preview ---
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');

  function handlePreview() {
    // Build a MergedReceiptConfig from current form state + business defaults
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
    };

    // Sample transaction for preview
    const sampleTx = {
      receipt_number: '10042',
      transaction_date: new Date().toISOString(),
      subtotal: 149.99,
      tax_amount: 7.69,
      discount_amount: 0,
      tip_amount: 20.00,
      total_amount: 177.68,
      customer: { first_name: 'John', last_name: 'Doe', phone: '+13105551234' },
      employee: { first_name: 'Joselyn', last_name: 'Reyes' },
      vehicle: { year: 2024, make: 'Toyota', model: 'Camry', color: 'Black' },
      items: [
        { item_name: 'Full Detail — Sedan', quantity: 1, unit_price: 129.99, total_price: 129.99, tax_amount: 0 },
        { item_name: 'Air Freshener', quantity: 2, unit_price: 9.99, total_price: 19.99, tax_amount: 2.05 },
      ] as { item_name: string; quantity: number; unit_price: number; total_price: number; tax_amount: number }[],
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
            label="Printer IP Address"
            description="Star TSP-100 printer IP on local network (e.g. 192.168.1.100)"
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

      {/* Receipt Header Overrides */}
      <Card>
        <CardHeader>
          <CardTitle>Receipt Header</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-500">
            Leave blank to use the value from your Business Profile. Fill in to override on receipts only.
          </p>

          <FormField label="Business Name" htmlFor="override_name">
            <Input
              id="override_name"
              placeholder={defaults.business_name || 'Business Profile value'}
              value={config.override_name}
              onChange={(e) => updateConfig('override_name', e.target.value)}
            />
          </FormField>

          <FormField label="Mobile" htmlFor="override_phone">
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
        </CardContent>
      </Card>

      {/* Logo */}
      <Card>
        <CardHeader>
          <CardTitle>Logo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-500">
            Upload a high-contrast PNG or JPG (max 2MB). Dark logos on white background work best for thermal printing.
          </p>

          <div className="grid gap-6 sm:grid-cols-2">
            {/* Left: logo preview + upload */}
            <div className="space-y-3">
              {config.logo_url ? (
                <div className="space-y-3">
                  <div className="rounded border border-gray-200 bg-gray-50 p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={config.logo_url}
                      alt="Receipt logo preview"
                      style={{ maxWidth: `${config.logo_width}px`, height: 'auto' }}
                    />
                  </div>
                  <div className="flex gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={handleLogoUpload}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                    >
                      <Upload className="mr-1.5 h-4 w-4" />
                      {uploading ? 'Uploading...' : 'Replace Logo'}
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleRemoveLogo}>
                      <Trash2 className="mr-1.5 h-4 w-4" />
                      Remove
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex h-32 items-center justify-center rounded border-2 border-dashed border-gray-300 bg-gray-50">
                    <div className="text-center">
                      <ImageIcon className="mx-auto h-8 w-8 text-gray-400" />
                      <p className="mt-1 text-sm text-gray-400">No logo uploaded</p>
                    </div>
                  </div>
                  <div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={handleLogoUpload}
                    />
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
                </div>
              )}
            </div>

            {/* Right: width, position, alignment */}
            <div className="space-y-4">
              <FormField
                label="Width"
                description="100 – 400 px"
                htmlFor="logo_width"
              >
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

      {/* Custom Text */}
      <Card>
        <CardHeader>
          <CardTitle>Custom Text</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-500">
            Add a disclaimer, promotion, or return policy that prints on every receipt.
          </p>

          <FormField label="Text" htmlFor="custom_text">
            <Textarea
              id="custom_text"
              rows={3}
              placeholder="e.g. All sales final. Thank you for your business!"
              value={config.custom_text}
              onChange={(e) => updateConfig('custom_text', e.target.value)}
            />
          </FormField>

          <FormField label="Placement" htmlFor="custom_text_placement">
            <Select
              id="custom_text_placement"
              value={config.custom_text_placement}
              onChange={(e) => updateConfig('custom_text_placement', e.target.value as ReceiptConfigState['custom_text_placement'])}
            >
              <option value="below_header">Below Header</option>
              <option value="above_footer">Above Footer</option>
              <option value="below_footer">Below Footer</option>
            </Select>
          </FormField>
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
