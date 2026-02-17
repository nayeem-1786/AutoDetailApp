'use client';

import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { adminFetch } from '@/lib/utils/admin-fetch';
import {
  RotateCcw, Save, Palette, Type, RectangleHorizontal,
  Square, Sparkles, ChevronDown,
} from 'lucide-react';
import type { SiteThemeSettings } from '@/lib/supabase/types';
import { ColorField } from './_components/color-field';
import { ThemePreview } from './_components/theme-preview';
import {
  THEME_DEFAULTS,
  FONT_OPTIONS,
  WEIGHT_OPTIONS,
  RADIUS_OPTIONS,
  PADDING_OPTIONS,
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

  const load = useCallback(async () => {
    try {
      const res = await adminFetch('/api/admin/cms/site-theme');
      if (!res.ok) throw new Error('Failed');
      const { data } = await res.json();
      if (data) {
        setThemeId(data.id);
        setFormData(data);
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
        description="Customize your site's appearance — colors, typography, buttons, and more"
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setResetOpen(true)}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Reset to Default
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Spinner size="sm" /> : <Save className="mr-2 h-4 w-4" />}
              Save Changes
            </Button>
          </div>
        }
      />

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
              <TabsTrigger value="borders">
                <Square className="mr-1.5 h-4 w-4" /> Borders & Spacing
              </TabsTrigger>
            </TabsList>

            {/* ─── COLORS TAB ─── */}
            <TabsContent value="colors">
              <div className="space-y-6">
                {/* Mode */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Mode</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-3">
                      <Label htmlFor="mode-toggle" className="text-sm">Dark Mode</Label>
                      <Switch
                        id="mode-toggle"
                        checked={formData.mode !== 'light'}
                        onCheckedChange={(checked) => updateField('mode', checked ? 'dark' : 'light')}
                      />
                    </div>
                  </CardContent>
                </Card>

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

                {/* Status Colors */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Status Colors</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-4 sm:grid-cols-3">
                      <ColorField label="Success" value={getVal('color_success')} defaultValue={THEME_DEFAULTS.color_success} onChange={(v) => updateField('color_success', v)} />
                      <ColorField label="Warning" value={getVal('color_warning')} defaultValue={THEME_DEFAULTS.color_warning} onChange={(v) => updateField('color_warning', v)} />
                      <ColorField label="Error" value={getVal('color_error')} defaultValue={THEME_DEFAULTS.color_error} onChange={(v) => updateField('color_error', v)} />
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* ─── TYPOGRAPHY TAB ─── */}
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

                {/* Font Sizes */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Font Sizes</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-4 sm:grid-cols-2">
                      {[
                        { key: 'font_h1_size', label: 'H1 Size' },
                        { key: 'font_h2_size', label: 'H2 Size' },
                        { key: 'font_h3_size', label: 'H3 Size' },
                        { key: 'font_body_size', label: 'Body Size' },
                        { key: 'font_small_size', label: 'Small Text' },
                        { key: 'font_base_size', label: 'Base Font Size' },
                      ].map(({ key, label }) => (
                        <div key={key}>
                          <Label className="text-sm mb-1.5 block">{label}</Label>
                          <div className="flex items-center gap-2">
                            <Input
                              value={getVal(key as keyof typeof THEME_DEFAULTS) ?? THEME_DEFAULTS[key as keyof typeof THEME_DEFAULTS]}
                              onChange={(e) => updateField(key, e.target.value || null)}
                              className="w-28"
                              placeholder={THEME_DEFAULTS[key as keyof typeof THEME_DEFAULTS]}
                            />
                            {getVal(key as keyof typeof THEME_DEFAULTS) !== null && (
                              <button
                                type="button"
                                onClick={() => updateField(key, null)}
                                className="p-1 text-gray-400 hover:text-gray-600"
                                title="Reset to default"
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Font Weights */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Font Weights</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <Label className="text-sm mb-1.5 block">Heading Weight</Label>
                        <Select
                          value={getVal('font_heading_weight') ?? THEME_DEFAULTS.font_heading_weight}
                          onChange={(e) => updateField('font_heading_weight', e.target.value === THEME_DEFAULTS.font_heading_weight ? null : e.target.value)}
                        >
                          {WEIGHT_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </Select>
                      </div>
                      <div>
                        <Label className="text-sm mb-1.5 block">Body Weight</Label>
                        <Select
                          value={getVal('font_body_weight') ?? THEME_DEFAULTS.font_body_weight}
                          onChange={(e) => updateField('font_body_weight', e.target.value === THEME_DEFAULTS.font_body_weight ? null : e.target.value)}
                        >
                          {WEIGHT_OPTIONS.filter((o) => ['300', '400', '500'].includes(o.value)).map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </Select>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Line Height */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Line Height</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-4">
                      <input
                        type="range"
                        min="1.0"
                        max="2.5"
                        step="0.1"
                        value={getVal('font_line_height') ?? THEME_DEFAULTS.font_line_height}
                        onChange={(e) => updateField('font_line_height', e.target.value === THEME_DEFAULTS.font_line_height ? null : e.target.value)}
                        className="flex-1"
                      />
                      <span className="text-sm font-mono text-gray-600 w-10 text-right">
                        {getVal('font_line_height') ?? THEME_DEFAULTS.font_line_height}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* ─── BUTTONS TAB ─── */}
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
                      <div>
                        <Label className="text-sm mb-1.5 block">Padding</Label>
                        <Select
                          value={getVal('btn_primary_padding') ?? THEME_DEFAULTS.btn_primary_padding}
                          onChange={(e) => updateField('btn_primary_padding', e.target.value === THEME_DEFAULTS.btn_primary_padding ? null : e.target.value)}
                        >
                          {PADDING_OPTIONS.map((opt) => (
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
                          padding: getVal('btn_primary_padding') ?? THEME_DEFAULTS.btn_primary_padding,
                        }}
                      >
                        Primary Button
                      </button>
                    </div>
                  </CardContent>
                </Card>

                {/* Secondary Button */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Secondary / Ghost Button</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <ColorField label="Background" value={getVal('btn_secondary_bg')} defaultValue={THEME_DEFAULTS.btn_secondary_bg} onChange={(v) => updateField('btn_secondary_bg', v)} />
                      <ColorField label="Text Color" value={getVal('btn_secondary_text')} defaultValue={THEME_DEFAULTS.btn_secondary_text} onChange={(v) => updateField('btn_secondary_text', v)} />
                      <ColorField label="Border Color" value={getVal('btn_secondary_border')} defaultValue={THEME_DEFAULTS.btn_secondary_border} onChange={(v) => updateField('btn_secondary_border', v)} />
                      <div>
                        <Label className="text-sm mb-1.5 block">Border Radius</Label>
                        <Select
                          value={getVal('btn_secondary_radius') ?? THEME_DEFAULTS.btn_secondary_radius}
                          onChange={(e) => updateField('btn_secondary_radius', e.target.value === THEME_DEFAULTS.btn_secondary_radius ? null : e.target.value)}
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
                          backgroundColor: getVal('btn_secondary_bg') ?? THEME_DEFAULTS.btn_secondary_bg,
                          color: getVal('btn_secondary_text') ?? THEME_DEFAULTS.btn_secondary_text,
                          border: `1px solid ${getVal('btn_secondary_border') ?? THEME_DEFAULTS.btn_secondary_border}`,
                          borderRadius: getVal('btn_secondary_radius') ?? THEME_DEFAULTS.btn_secondary_radius,
                        }}
                      >
                        Secondary Button
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

            {/* ─── BORDERS & SPACING TAB ─── */}
            <TabsContent value="borders">
              <div className="space-y-6">
                {/* Border Radius */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Border Radius</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <Label className="text-sm mb-1.5 block">Default Radius</Label>
                        <Select
                          value={getVal('border_radius') ?? THEME_DEFAULTS.border_radius}
                          onChange={(e) => updateField('border_radius', e.target.value === THEME_DEFAULTS.border_radius ? null : e.target.value)}
                        >
                          {RADIUS_OPTIONS.filter((o) => o.value !== '9999px').map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </Select>
                        <div
                          className="mt-2 h-12 w-20 border-2 border-gray-300"
                          style={{ borderRadius: getVal('border_radius') ?? THEME_DEFAULTS.border_radius }}
                        />
                      </div>
                      <div>
                        <Label className="text-sm mb-1.5 block">Card Radius</Label>
                        <Select
                          value={getVal('border_card_radius') ?? THEME_DEFAULTS.border_card_radius}
                          onChange={(e) => updateField('border_card_radius', e.target.value === THEME_DEFAULTS.border_card_radius ? null : e.target.value)}
                        >
                          {RADIUS_OPTIONS.filter((o) => o.value !== '9999px').map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </Select>
                        <div
                          className="mt-2 h-12 w-20 border-2 border-gray-300"
                          style={{ borderRadius: getVal('border_card_radius') ?? THEME_DEFAULTS.border_card_radius }}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Border Width */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Border Width</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Select
                      value={getVal('border_width') ?? THEME_DEFAULTS.border_width}
                      onChange={(e) => updateField('border_width', e.target.value === THEME_DEFAULTS.border_width ? null : e.target.value)}
                      className="w-full sm:w-48"
                    >
                      <option value="0">None</option>
                      <option value="1px">Thin (1px)</option>
                      <option value="2px">Medium (2px)</option>
                      <option value="3px">Thick (3px)</option>
                    </Select>
                  </CardContent>
                </Card>

                {/* Spacing */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Spacing</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-4 sm:grid-cols-3">
                      <div>
                        <Label className="text-sm mb-1.5 block">Section Padding</Label>
                        <Select
                          value={getVal('spacing_section_padding') ?? THEME_DEFAULTS.spacing_section_padding}
                          onChange={(e) => updateField('spacing_section_padding', e.target.value === THEME_DEFAULTS.spacing_section_padding ? null : e.target.value)}
                        >
                          <option value="3rem">Compact (3rem)</option>
                          <option value="6rem">Normal (6rem)</option>
                          <option value="8rem">Spacious (8rem)</option>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-sm mb-1.5 block">Card Padding</Label>
                        <Select
                          value={getVal('spacing_card_padding') ?? THEME_DEFAULTS.spacing_card_padding}
                          onChange={(e) => updateField('spacing_card_padding', e.target.value === THEME_DEFAULTS.spacing_card_padding ? null : e.target.value)}
                        >
                          <option value="1rem">Tight (1rem)</option>
                          <option value="1.5rem">Normal (1.5rem)</option>
                          <option value="2rem">Roomy (2rem)</option>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-sm mb-1.5 block">Header Height</Label>
                        <Input
                          value={getVal('spacing_header_height') ?? THEME_DEFAULTS.spacing_header_height}
                          onChange={(e) => updateField('spacing_header_height', e.target.value || null)}
                          placeholder={THEME_DEFAULTS.spacing_header_height}
                          className="w-28"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
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
