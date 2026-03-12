'use client';

import { useEffect, useState } from 'react';
import { adminFetch } from '@/lib/utils/admin-fetch';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

interface BrandKitSettings {
  primary_color: string;
  accent_color: string;
  text_color: string;
  bg_color: string;
  font_family: string;
  logo_url: string;
  logo_width: number;
  social_google: string;
  social_yelp: string;
  social_instagram: string;
  social_facebook: string;
  footer_text: string;
}

const DEFAULTS: BrandKitSettings = {
  primary_color: '#1a1a2e',
  accent_color: '#CCFF00',
  text_color: '#333333',
  bg_color: '#f5f5f5',
  font_family: 'Arial, Helvetica, sans-serif',
  logo_url: '',
  logo_width: 200,
  social_google: '',
  social_yelp: '',
  social_instagram: '',
  social_facebook: '',
  footer_text: '',
};

const FONT_OPTIONS = [
  'Arial, Helvetica, sans-serif',
  'Georgia, Times, serif',
  'Verdana, Geneva, sans-serif',
  'Tahoma, Geneva, sans-serif',
  '"Times New Roman", Times, serif',
];

export function BrandSettings() {
  const [settings, setSettings] = useState<BrandKitSettings>(DEFAULTS);
  const [initial, setInitial] = useState<BrandKitSettings>(DEFAULTS);
  const [receiptLogoUrl, setReceiptLogoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const isDirty = JSON.stringify(settings) !== JSON.stringify(initial);

  useEffect(() => {
    loadBrandKit();
  }, []);

  async function loadBrandKit() {
    try {
      const res = await adminFetch('/api/admin/email-templates/brand-kit', { cache: 'no-store' });
      const json = await res.json();
      const data = json.data || {};
      const loaded: BrandKitSettings = {
        primary_color: data.primary_color || DEFAULTS.primary_color,
        accent_color: data.accent_color || DEFAULTS.accent_color,
        text_color: data.text_color || DEFAULTS.text_color,
        bg_color: data.bg_color || DEFAULTS.bg_color,
        font_family: data.font_family || DEFAULTS.font_family,
        logo_url: data.logo_url || '',
        logo_width: data.logo_width || 200,
        social_google: data.social_google || '',
        social_yelp: data.social_yelp || '',
        social_instagram: data.social_instagram || '',
        social_facebook: data.social_facebook || '',
        footer_text: data.footer_text || '',
      };
      setSettings(loaded);
      setInitial(loaded);
      setReceiptLogoUrl(json.receipt_logo_url || null);
    } catch {
      // handled
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      await adminFetch('/api/admin/email-templates/brand-kit', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      setInitial({ ...settings });
    } catch {
      // handled
    } finally {
      setSaving(false);
    }
  }

  function updateField<K extends keyof BrandKitSettings>(key: K, value: BrandKitSettings[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner size="lg" />
      </div>
    );
  }

  const effectiveLogoUrl = settings.logo_url || receiptLogoUrl;

  return (
    <div className="space-y-6">
      {/* Colors Card */}
      <Card>
        <CardHeader>
          <CardTitle>Brand Colors</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <ColorField
              label="Primary Color"
              description="Header background and primary buttons"
              value={settings.primary_color}
              onChange={(v) => updateField('primary_color', v)}
            />
            <ColorField
              label="Accent Color"
              description="Secondary buttons and link highlights"
              value={settings.accent_color}
              onChange={(v) => updateField('accent_color', v)}
            />
            <ColorField
              label="Text Color"
              description="Body text color"
              value={settings.text_color}
              onChange={(v) => updateField('text_color', v)}
            />
            <ColorField
              label="Background Color"
              description="Outer email background"
              value={settings.bg_color}
              onChange={(v) => updateField('bg_color', v)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Typography Card */}
      <Card>
        <CardHeader>
          <CardTitle>Typography</CardTitle>
        </CardHeader>
        <CardContent>
          <FormField label="Font Family" htmlFor="font-family" description="Email-safe fonts only">
            <Select
              id="font-family"
              value={settings.font_family}
              onChange={(e) => updateField('font_family', e.target.value)}
            >
              {FONT_OPTIONS.map((font) => (
                <option key={font} value={font}>{font.split(',')[0].replace(/"/g, '')}</option>
              ))}
            </Select>
          </FormField>
        </CardContent>
      </Card>

      {/* Logo Card */}
      <Card>
        <CardHeader>
          <CardTitle>Logo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <FormField label="Logo URL" htmlFor="logo-url" description="Leave empty to use the receipt printer logo">
            <Input
              id="logo-url"
              type="url"
              value={settings.logo_url}
              onChange={(e) => updateField('logo_url', e.target.value)}
              placeholder={receiptLogoUrl || 'https://...'}
            />
          </FormField>
          <FormField label="Logo Width (px)" htmlFor="logo-width">
            <Input
              id="logo-width"
              type="number"
              min={50}
              max={400}
              step={10}
              value={settings.logo_width}
              onChange={(e) => updateField('logo_width', parseInt(e.target.value, 10) || 200)}
            />
          </FormField>
          {effectiveLogoUrl && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <p className="mb-2 text-xs font-medium text-gray-500">Preview</p>
              <img
                src={effectiveLogoUrl}
                alt="Logo preview"
                style={{ maxWidth: settings.logo_width, height: 'auto' }}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Social Links Card */}
      <Card>
        <CardHeader>
          <CardTitle>Social Links</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <FormField label="Google Business URL" htmlFor="social-google">
              <Input
                id="social-google"
                type="url"
                value={settings.social_google}
                onChange={(e) => updateField('social_google', e.target.value)}
                placeholder="https://g.page/..."
              />
            </FormField>
            <FormField label="Yelp Page URL" htmlFor="social-yelp">
              <Input
                id="social-yelp"
                type="url"
                value={settings.social_yelp}
                onChange={(e) => updateField('social_yelp', e.target.value)}
                placeholder="https://yelp.com/biz/..."
              />
            </FormField>
            <FormField label="Instagram URL" htmlFor="social-instagram">
              <Input
                id="social-instagram"
                type="url"
                value={settings.social_instagram}
                onChange={(e) => updateField('social_instagram', e.target.value)}
                placeholder="https://instagram.com/..."
              />
            </FormField>
            <FormField label="Facebook URL" htmlFor="social-facebook">
              <Input
                id="social-facebook"
                type="url"
                value={settings.social_facebook}
                onChange={(e) => updateField('social_facebook', e.target.value)}
                placeholder="https://facebook.com/..."
              />
            </FormField>
          </div>
        </CardContent>
      </Card>

      {/* Footer Text Card */}
      <Card>
        <CardHeader>
          <CardTitle>Footer</CardTitle>
        </CardHeader>
        <CardContent>
          <FormField label="Custom Footer Text" htmlFor="footer-text" description="Optional line shown below business info in email footers">
            <Input
              id="footer-text"
              value={settings.footer_text}
              onChange={(e) => updateField('footer_text', e.target.value)}
              placeholder="e.g., Proudly serving the South Bay since 2020"
            />
          </FormField>
        </CardContent>
      </Card>

      {/* Save button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving || !isDirty}>
          {saving ? <><Spinner size="sm" className="mr-2" /> Saving...</> : 'Save Brand Settings'}
        </Button>
      </div>
    </div>
  );
}

function ColorField({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = label.toLowerCase().replace(/\s+/g, '-');
  return (
    <FormField label={label} htmlFor={id} description={description}>
      <div className="flex items-center gap-3">
        <input
          type="color"
          id={`${id}-picker`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-10 cursor-pointer rounded border border-gray-200"
        />
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#000000"
          className="flex-1 font-mono"
        />
      </div>
    </FormField>
  );
}
