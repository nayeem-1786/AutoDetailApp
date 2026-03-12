'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { adminFetch } from '@/lib/utils/admin-fetch';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { Select } from '@/components/ui/select';
import type { EmailLayout, HeaderConfig, FooterConfig } from '@/lib/email/types';

export default function LayoutEditorPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [layout, setLayout] = useState<EmailLayout | null>(null);
  const [initial, setInitial] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string>('');
  const [previewLoading, setPreviewLoading] = useState(false);

  const isDirty = layout ? JSON.stringify({
    color_overrides: layout.color_overrides,
    header_config: layout.header_config,
    footer_config: layout.footer_config,
    description: layout.description,
  }) !== initial : false;

  useEffect(() => {
    loadLayout();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function loadLayout() {
    try {
      const res = await adminFetch(`/api/admin/email-templates/layouts/${id}`, { cache: 'no-store' });
      const json = await res.json();
      const data = json.data as EmailLayout;
      setLayout(data);
      setInitial(JSON.stringify({
        color_overrides: data.color_overrides,
        header_config: data.header_config,
        footer_config: data.footer_config,
        description: data.description,
      }));
    } catch {
      // handled
    } finally {
      setLoading(false);
    }
  }

  const loadPreview = useCallback(async () => {
    if (!layout) return;
    setPreviewLoading(true);
    try {
      // Use a dummy template ID — preview endpoint supports passing blocks directly
      const res = await adminFetch(`/api/admin/email-templates/${id}/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body_blocks: [
            { id: 'h1', type: 'heading', data: { text: 'Sample Email', level: 1 } },
            { id: 'p1', type: 'text', data: { content: 'This is a preview of the **{business_name}** email layout. Content blocks will appear here with your brand colors and settings.', align: 'left' } },
            { id: 'b1', type: 'button', data: { text: 'Call to Action', url: '#', color: 'primary', align: 'center' } },
            { id: 'd1', type: 'divider', data: { style: 'solid' } },
            { id: 'p2', type: 'text', data: { content: 'Thank you for your business!', align: 'center' } },
          ],
          layout_id: layout.id,
          subject: 'Layout Preview',
        }),
      });
      const json = await res.json();
      setPreviewHtml(json.html || '');
    } catch {
      // handled
    } finally {
      setPreviewLoading(false);
    }
  }, [layout, id]);

  useEffect(() => {
    if (layout) loadPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout?.id]); // Only on initial load

  async function handleSave() {
    if (!layout) return;
    setSaving(true);
    try {
      await adminFetch(`/api/admin/email-templates/layouts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          color_overrides: layout.color_overrides,
          header_config: layout.header_config,
          footer_config: layout.footer_config,
          description: layout.description,
        }),
      });
      setInitial(JSON.stringify({
        color_overrides: layout.color_overrides,
        header_config: layout.header_config,
        footer_config: layout.footer_config,
        description: layout.description,
      }));
      // Refresh preview with saved settings
      loadPreview();
    } catch {
      // handled
    } finally {
      setSaving(false);
    }
  }

  function updateColorOverride(key: string, value: string) {
    if (!layout) return;
    const overrides = { ...layout.color_overrides };
    if (value) {
      overrides[key] = value;
    } else {
      delete overrides[key];
    }
    setLayout({ ...layout, color_overrides: overrides });
  }

  function updateHeaderConfig<K extends keyof HeaderConfig>(key: K, value: HeaderConfig[K]) {
    if (!layout) return;
    setLayout({ ...layout, header_config: { ...layout.header_config, [key]: value } });
  }

  function updateFooterConfig<K extends keyof FooterConfig>(key: K, value: FooterConfig[K]) {
    if (!layout) return;
    setLayout({ ...layout, footer_config: { ...layout.footer_config, [key]: value } });
  }

  if (loading || !layout) {
    return (
      <div className="space-y-6">
        <PageHeader title="Edit Layout" />
        <div className="flex items-center justify-center py-20">
          <Spinner size="lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Edit Layout: ${layout.name}`}
        description={layout.description || undefined}
        action={
          <Button variant="outline" onClick={() => router.push('/admin/marketing/email-templates/layouts')}>
            Back to Layouts
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left: Settings */}
        <div className="space-y-6">
          {/* Color Overrides */}
          <Card>
            <CardHeader>
              <CardTitle>Color Overrides</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-gray-500">
                Leave empty to inherit from Brand Kit. Only set overrides for this specific layout.
              </p>
              {['primary_color', 'accent_color', 'text_color', 'bg_color'].map((key) => (
                <div key={key} className="flex items-center gap-3">
                  <label className="w-32 text-sm text-gray-600">
                    {key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                  </label>
                  <input
                    type="color"
                    value={layout.color_overrides[key] || '#ffffff'}
                    onChange={(e) => updateColorOverride(key, e.target.value)}
                    className="h-8 w-8 cursor-pointer rounded border border-gray-200"
                  />
                  <Input
                    value={layout.color_overrides[key] || ''}
                    onChange={(e) => updateColorOverride(key, e.target.value)}
                    placeholder="Inherit from Brand Kit"
                    className="flex-1 font-mono text-sm"
                  />
                  {layout.color_overrides[key] && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => updateColorOverride(key, '')}
                      className="text-xs text-gray-400"
                    >
                      Clear
                    </Button>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Header Config */}
          <Card>
            <CardHeader>
              <CardTitle>Header Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-sm text-gray-600">Show Logo</label>
                <Switch
                  checked={layout.header_config.show_logo}
                  onCheckedChange={(v) => updateHeaderConfig('show_logo', v)}
                />
              </div>
              <FormField label="Logo Position" htmlFor="logo-position">
                <Select
                  id="logo-position"
                  value={layout.header_config.logo_position}
                  onChange={(e) => updateHeaderConfig('logo_position', e.target.value as 'left' | 'center')}
                >
                  <option value="center">Center</option>
                  <option value="left">Left</option>
                </Select>
              </FormField>
              <div className="flex items-center justify-between">
                <label className="text-sm text-gray-600">Show Title</label>
                <Switch
                  checked={layout.header_config.show_title}
                  onCheckedChange={(v) => updateHeaderConfig('show_title', v)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Footer Config */}
          <Card>
            <CardHeader>
              <CardTitle>Footer Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-sm text-gray-600">Show Social Links</label>
                <Switch
                  checked={layout.footer_config.show_social}
                  onCheckedChange={(v) => updateFooterConfig('show_social', v)}
                />
              </div>
              <div className="flex items-center justify-between">
                <label className="text-sm text-gray-600">Compact Footer</label>
                <Switch
                  checked={layout.footer_config.compact}
                  onCheckedChange={(v) => updateFooterConfig('compact', v)}
                />
              </div>
              <FormField label="Custom Footer Text" htmlFor="footer-custom-text">
                <Input
                  id="footer-custom-text"
                  value={layout.footer_config.custom_text || ''}
                  onChange={(e) => updateFooterConfig('custom_text', e.target.value)}
                  placeholder="Optional layout-specific footer text"
                />
              </FormField>
            </CardContent>
          </Card>

          {/* Save */}
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={loadPreview} disabled={previewLoading}>
              {previewLoading ? 'Loading...' : 'Refresh Preview'}
            </Button>
            <Button onClick={handleSave} disabled={saving || !isDirty}>
              {saving ? <><Spinner size="sm" className="mr-2" /> Saving...</> : 'Save Changes'}
            </Button>
          </div>
        </div>

        {/* Right: Live Preview */}
        <div className="sticky top-6">
          <Card>
            <CardHeader>
              <CardTitle>Preview</CardTitle>
            </CardHeader>
            <CardContent>
              {previewLoading ? (
                <div className="flex items-center justify-center py-20">
                  <Spinner size="lg" />
                </div>
              ) : previewHtml ? (
                <iframe
                  srcDoc={previewHtml}
                  className="h-[600px] w-full rounded border border-gray-200"
                  title="Layout preview"
                  sandbox="allow-same-origin"
                />
              ) : (
                <div className="flex items-center justify-center py-20 text-sm text-gray-400">
                  No preview available
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
