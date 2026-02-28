'use client';

import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { adminFetch } from '@/lib/utils/admin-fetch';
import {
  RotateCcw, Save, Palette, Type, RectangleHorizontal,
  Sparkles, ChevronDown, AlertTriangle, Eye, Download, Upload,
} from 'lucide-react';
import type { SiteThemeSettings } from '@/lib/supabase/types';
import { ColorField } from './_components/color-field';
import { ThemePreview } from './_components/theme-preview';
import {
  THEME_DEFAULTS,
  FONT_OPTIONS,
  RADIUS_OPTIONS,
  SITE_THEME_PRESETS,
} from './_components/theme-defaults';

type FormData = Partial<SiteThemeSettings>;

export default function ThemeSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('colors');
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [themeId, setThemeId] = useState<string | null>(null);
  const [formData, setFormData] = useState<FormData>({});
  const [activeSeasonalTheme, setActiveSeasonalTheme] = useState<{ name: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const [themeRes, seasonalRes] = await Promise.all([
        adminFetch('/api/admin/cms/site-theme'),
        adminFetch('/api/admin/cms/themes'),
      ]);
      if (themeRes.ok) {
        const { data } = await themeRes.json();
        if (data) {
          setThemeId(data.id);
          setFormData(data);
        }
      }
      if (seasonalRes.ok) {
        const { data: themes } = await seasonalRes.json();
        const active = (themes ?? []).find((t: { is_active: boolean }) => t.is_active);
        setActiveSeasonalTheme(active ?? null);
      }
    } catch {
      toast.error('Failed to load theme settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const updateField = (key: string, value: string | null) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const getVal = (key: keyof typeof THEME_DEFAULTS): string | null => {
    return (formData as Record<string, string | null>)[key] ?? null;
  };

  const handlePreview = () => {
    window.open('/?theme_preview=base', '_blank');
  };

  const handleExport = () => {
    const exportData = {
      type: 'base_theme' as const,
      name: (formData as Record<string, unknown>).name ?? 'Custom Theme',
      version: '1.0',
      exportedAt: new Date().toISOString(),
      settings: Object.fromEntries(
        Object.entries(formData).filter(([k]) =>
          k.startsWith('color_') || k.startsWith('font_') ||
          k.startsWith('btn_') || k.startsWith('border_') ||
          k.startsWith('spacing_') || k === 'mode' || k === 'name'
        )
      ),
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `base-theme-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Base theme exported');
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (!data.settings || typeof data.settings !== 'object') {
          toast.error('Invalid theme file: missing settings');
          return;
        }
        if (data.type && data.type !== 'base_theme') {
          toast.error('This file is not a base theme export');
          return;
        }
        const s = data.settings;
        const newData: FormData = { ...formData };
        for (const [key, value] of Object.entries(s)) {
          if (key in THEME_DEFAULTS || key === 'mode' || key === 'name') {
            (newData as Record<string, unknown>)[key] = value;
          }
        }
        setFormData(newData);
        toast.success(`Imported "${data.name ?? 'theme'}" — click Save to apply`);
      } catch {
        toast.error('Failed to parse theme file');
      }
    };
    input.click();
  };

  const handleSave = async () => {
    if (!themeId) return;
    setSaving(true);
    try {
      const res = await adminFetch('/api/admin/cms/site-theme', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: themeId, ...formData, is_active: true }),
      });
      if (!res.ok) {
        const { error } = await res.json();
        throw new Error(error || 'Failed to save');
      }
      const { data } = await res.json();
      setFormData(data);
      toast.success('Theme settings saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save theme settings');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    try {
      const res = await adminFetch('/api/admin/cms/site-theme/reset', { method: 'POST' });
      if (!res.ok) throw new Error('Failed');
      const { data } = await res.json();
      if (data) {
        setThemeId(data.id);
        setFormData(data);
      }
      toast.success('Theme reset to default');
    } catch {
      toast.error('Failed to reset theme');
    } finally {
      setResetOpen(false);
    }
  };

  const applyPreset = (presetIndex: number) => {
    const preset = SITE_THEME_PRESETS[presetIndex];
    if (!preset) return;

    // Start with all nulls (defaults), then apply preset values
    const newData: FormData = { id: themeId ?? undefined };

    // Reset all fields to null first
    for (const key of Object.keys(THEME_DEFAULTS)) {
      (newData as Record<string, unknown>)[key] = null;
    }

    // Apply preset values
    for (const [key, value] of Object.entries(preset.values)) {
      (newData as Record<string, unknown>)[key] = value;
    }

    // Preserve id and metadata
    newData.id = formData.id;
    newData.name = preset.name;

    setFormData(newData);
    setPresetsOpen(false);
    toast.success(`Applied "${preset.name}" preset — click Save to apply`);
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Theme & Style Settings"
        description="These settings control your site's base theme. Active seasonal themes may override some colors."
        action={
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <Button variant="outline" onClick={handlePreview}>
              <Eye className="mr-2 h-4 w-4" />
              Preview
            </Button>
            <Button variant="outline" onClick={handleExport}>
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
            <Button variant="outline" onClick={handleImport}>
              <Upload className="mr-2 h-4 w-4" />
              Import
            </Button>
            <Button variant="outline" onClick={() => setResetOpen(true)}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Reset
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Spinner size="sm" /> : <Save className="mr-2 h-4 w-4" />}
              Save
            </Button>
          </div>
        }
      />

      {/* Seasonal Theme Override Warning */}
      {activeSeasonalTheme && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold text-amber-800">
              Seasonal theme active: &ldquo;{activeSeasonalTheme.name}&rdquo;
            </p>
            <p className="text-sm text-amber-600 mt-1">
              This seasonal theme is overriding some of the colors below. Changes you make here will take effect after the seasonal theme is deactivated.
            </p>
          </div>
          <a
            href="/admin/website/themes"
            className="text-sm font-medium text-amber-700 hover:text-amber-900 underline whitespace-nowrap"
          >
            Manage Seasonal Themes
          </a>
        </div>
      )}

      {/* Presets Dropdown */}
      <div className="relative">
        <Button variant="outline" onClick={() => setPresetsOpen(!presetsOpen)}>
          <Sparkles className="mr-2 h-4 w-4" />
          Quick Presets
          <ChevronDown className="ml-2 h-4 w-4" />
        </Button>
        {presetsOpen && (
          <div className="absolute top-full left-0 mt-1 z-10 w-80 rounded-lg border border-gray-200 bg-white shadow-lg p-2">
            {SITE_THEME_PRESETS.map((preset, i) => (
              <button
                key={preset.name}
                type="button"
                onClick={() => applyPreset(i)}
                className="w-full text-left px-3 py-2 rounded-md hover:bg-gray-50 transition-colors"
              >
                <p className="text-sm font-medium text-gray-900">{preset.name}</p>
                <p className="text-xs text-gray-500">{preset.description}</p>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr,320px]">
        {/* Main Editor */}
        <div>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="colors">
                <Palette className="mr-1.5 h-4 w-4" /> Colors
              </TabsTrigger>
              <TabsTrigger value="typography">
                <Type className="mr-1.5 h-4 w-4" /> Typography
              </TabsTrigger>
              <TabsTrigger value="buttons">
                <RectangleHorizontal className="mr-1.5 h-4 w-4" /> Buttons
              </TabsTrigger>
              {/* Borders & Spacing tab removed — fields exist in DB but are not yet wired to ThemeProvider */}
            </TabsList>

            {/* ─── COLORS TAB ─── */}
            {/* These fields exist in DB but are not yet wired to ThemeProvider. Re-add UI when implemented:
                mode (dark/light toggle), color_success, color_warning, color_error */}
            <TabsContent value="colors">
              <div className="space-y-6">
                {/* Background Colors */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Background Colors</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <ColorField label="Page Background" value={getVal('color_page_bg')} defaultValue={THEME_DEFAULTS.color_page_bg} onChange={(v) => updateField('color_page_bg', v)} />
                      <ColorField label="Card Background" value={getVal('color_card_bg')} defaultValue={THEME_DEFAULTS.color_card_bg} onChange={(v) => updateField('color_card_bg', v)} />
                      <ColorField label="Header Background" value={getVal('color_header_bg')} defaultValue={THEME_DEFAULTS.color_header_bg} onChange={(v) => updateField('color_header_bg', v)} />
                      <ColorField label="Footer Background" value={getVal('color_footer_bg')} defaultValue={THEME_DEFAULTS.color_footer_bg} onChange={(v) => updateField('color_footer_bg', v)} />
                      <ColorField label="Alt Section Background" value={getVal('color_section_alt_bg')} defaultValue={THEME_DEFAULTS.color_section_alt_bg} onChange={(v) => updateField('color_section_alt_bg', v)} />
                    </div>
                  </CardContent>
                </Card>

                {/* Text Colors */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Text Colors</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <ColorField label="Primary Text" value={getVal('color_text_primary')} defaultValue={THEME_DEFAULTS.color_text_primary} onChange={(v) => updateField('color_text_primary', v)} />
                      <ColorField label="Secondary Text" value={getVal('color_text_secondary')} defaultValue={THEME_DEFAULTS.color_text_secondary} onChange={(v) => updateField('color_text_secondary', v)} />
                      <ColorField label="Muted Text" value={getVal('color_text_muted')} defaultValue={THEME_DEFAULTS.color_text_muted} onChange={(v) => updateField('color_text_muted', v)} />
                      <ColorField label="Text on Primary" value={getVal('color_text_on_primary')} defaultValue={THEME_DEFAULTS.color_text_on_primary} onChange={(v) => updateField('color_text_on_primary', v)} />
                    </div>
                  </CardContent>
                </Card>

                {/* Brand Colors */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Brand / Accent Colors</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <ColorField label="Primary Color" value={getVal('color_primary')} defaultValue={THEME_DEFAULTS.color_primary} onChange={(v) => updateField('color_primary', v)} />
                      <ColorField label="Primary Hover" value={getVal('color_primary_hover')} defaultValue={THEME_DEFAULTS.color_primary_hover} onChange={(v) => updateField('color_primary_hover', v)} />
                      <ColorField label="Accent Color" value={getVal('color_accent')} defaultValue={THEME_DEFAULTS.color_accent} onChange={(v) => updateField('color_accent', v)} />
                      <ColorField label="Accent Hover" value={getVal('color_accent_hover')} defaultValue={THEME_DEFAULTS.color_accent_hover} onChange={(v) => updateField('color_accent_hover', v)} />
                    </div>
                  </CardContent>
                </Card>

                {/* Link Colors */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Link Colors</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <ColorField label="Link Color" value={getVal('color_link')} defaultValue={THEME_DEFAULTS.color_link} onChange={(v) => updateField('color_link', v)} />
                      <ColorField label="Link Hover" value={getVal('color_link_hover')} defaultValue={THEME_DEFAULTS.color_link_hover} onChange={(v) => updateField('color_link_hover', v)} />
                    </div>
                  </CardContent>
                </Card>

                {/* Border Colors */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Border Colors</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <ColorField label="Border" value={getVal('color_border')} defaultValue={THEME_DEFAULTS.color_border} onChange={(v) => updateField('color_border', v)} />
                      <ColorField label="Light Border" value={getVal('color_border_light')} defaultValue={THEME_DEFAULTS.color_border_light} onChange={(v) => updateField('color_border_light', v)} />
                      <ColorField label="Divider" value={getVal('color_divider')} defaultValue={THEME_DEFAULTS.color_divider} onChange={(v) => updateField('color_divider', v)} />
                    </div>
                  </CardContent>
                </Card>

              </div>
            </TabsContent>

            {/* ─── TYPOGRAPHY TAB ─── */}
            {/* These fields exist in DB but are not yet wired to ThemeProvider. Re-add UI when implemented:
                font_base_size, font_h1_size, font_h2_size, font_h3_size, font_body_size, font_small_size,
                font_line_height, font_heading_weight, font_body_weight */}
            <TabsContent value="typography">
              <div className="space-y-6">
                {/* Font Families */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Font Families</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <Label className="text-sm mb-1.5 block">Body Font</Label>
                        <Select
                          value={getVal('font_family') ?? THEME_DEFAULTS.font_family}
                          onChange={(e) => updateField('font_family', e.target.value === THEME_DEFAULTS.font_family ? null : e.target.value)}
                        >
                          {FONT_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </Select>
                        <p className="mt-1 text-xs text-gray-400" style={{ fontFamily: getVal('font_family') ?? THEME_DEFAULTS.font_family }}>
                          The quick brown fox jumps over the lazy dog
                        </p>
                      </div>
                      <div>
                        <Label className="text-sm mb-1.5 block">Heading Font</Label>
                        <Select
                          value={getVal('font_heading_family') ?? THEME_DEFAULTS.font_heading_family}
                          onChange={(e) => updateField('font_heading_family', e.target.value === THEME_DEFAULTS.font_heading_family ? null : e.target.value)}
                        >
                          {FONT_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </Select>
                        <p className="mt-1 text-xs text-gray-400" style={{ fontFamily: getVal('font_heading_family') ?? THEME_DEFAULTS.font_heading_family }}>
                          Premium Auto Detailing
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* ─── BUTTONS TAB ─── */}
            {/* These fields exist in DB but are not yet wired to ThemeProvider. Re-add UI when implemented:
                btn_primary_padding, btn_secondary_bg, btn_secondary_text, btn_secondary_border, btn_secondary_radius */}
            <TabsContent value="buttons">
              <div className="space-y-6">
                {/* Primary Button */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Primary Button</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <ColorField label="Background" value={getVal('btn_primary_bg')} defaultValue={THEME_DEFAULTS.btn_primary_bg} onChange={(v) => updateField('btn_primary_bg', v)} />
                      <ColorField label="Text Color" value={getVal('btn_primary_text')} defaultValue={THEME_DEFAULTS.btn_primary_text} onChange={(v) => updateField('btn_primary_text', v)} />
                      <ColorField label="Hover Background" value={getVal('btn_primary_hover_bg')} defaultValue={THEME_DEFAULTS.btn_primary_hover_bg} onChange={(v) => updateField('btn_primary_hover_bg', v)} />
                      <div>
                        <Label className="text-sm mb-1.5 block">Border Radius</Label>
                        <Select
                          value={getVal('btn_primary_radius') ?? THEME_DEFAULTS.btn_primary_radius}
                          onChange={(e) => updateField('btn_primary_radius', e.target.value === THEME_DEFAULTS.btn_primary_radius ? null : e.target.value)}
                        >
                          {RADIUS_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </Select>
                      </div>
                    </div>
                    {/* Preview */}
                    <div className="mt-4 pt-4 border-t border-gray-100">
                      <p className="text-xs text-gray-500 mb-2">Preview:</p>
                      <button
                        className="text-sm px-6 py-2 font-medium transition-colors"
                        style={{
                          backgroundColor: getVal('btn_primary_bg') ?? THEME_DEFAULTS.btn_primary_bg,
                          color: getVal('btn_primary_text') ?? THEME_DEFAULTS.btn_primary_text,
                          borderRadius: getVal('btn_primary_radius') ?? THEME_DEFAULTS.btn_primary_radius,
                        }}
                      >
                        Primary Button
                      </button>
                    </div>
                  </CardContent>
                </Card>

                {/* CTA Button */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">CTA Button</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <ColorField label="Background" value={getVal('btn_cta_bg')} defaultValue={THEME_DEFAULTS.btn_cta_bg} onChange={(v) => updateField('btn_cta_bg', v)} />
                      <ColorField label="Text Color" value={getVal('btn_cta_text')} defaultValue={THEME_DEFAULTS.btn_cta_text} onChange={(v) => updateField('btn_cta_text', v)} />
                      <ColorField label="Hover Background" value={getVal('btn_cta_hover_bg')} defaultValue={THEME_DEFAULTS.btn_cta_hover_bg} onChange={(v) => updateField('btn_cta_hover_bg', v)} />
                      <div>
                        <Label className="text-sm mb-1.5 block">Border Radius</Label>
                        <Select
                          value={getVal('btn_cta_radius') ?? THEME_DEFAULTS.btn_cta_radius}
                          onChange={(e) => updateField('btn_cta_radius', e.target.value === THEME_DEFAULTS.btn_cta_radius ? null : e.target.value)}
                        >
                          {RADIUS_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </Select>
                      </div>
                    </div>
                    {/* Preview */}
                    <div className="mt-4 pt-4 border-t border-gray-100">
                      <p className="text-xs text-gray-500 mb-2">Preview:</p>
                      <button
                        className="text-sm px-6 py-2 font-medium transition-colors"
                        style={{
                          backgroundColor: getVal('btn_cta_bg') ?? THEME_DEFAULTS.btn_cta_bg,
                          color: getVal('btn_cta_text') ?? THEME_DEFAULTS.btn_cta_text,
                          borderRadius: getVal('btn_cta_radius') ?? THEME_DEFAULTS.btn_cta_radius,
                        }}
                      >
                        Call to Action
                      </button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Borders & Spacing tab content removed — fields exist in DB but are not yet wired to ThemeProvider.
                Re-add UI when implemented: border_radius, border_card_radius, border_width,
                spacing_section_padding, spacing_card_padding, spacing_header_height */}
          </Tabs>
        </div>

        {/* Live Preview Panel */}
        <div className="hidden lg:block">
          <div className="sticky top-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-900">Live Preview</h3>
            <ThemePreview formData={formData} />
            <p className="text-xs text-gray-400 text-center">
              Preview updates as you change settings
            </p>
          </div>
        </div>
      </div>

      {/* Reset Confirmation */}
      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Reset to Default"
        description="This will reset ALL theme customizations to the default dark theme. Are you sure?"
        confirmLabel="Reset"
        variant="destructive"
        onConfirm={handleReset}
      />
    </div>
  );
}
