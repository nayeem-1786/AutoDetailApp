'use client';

import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Spinner } from '@/components/ui/spinner';
import { ImageUploadField } from '@/components/admin/image-upload-field';
import { adminFetch } from '@/lib/utils/admin-fetch';
import {
  Save, Plus, Trash2, GripVertical, ChevronUp, ChevronDown,
  Truck, Shield, Leaf, Star, Phone, Mail, MapPin, Clock, Globe,
  MessageCircle, Heart, Award, ThumbsUp, Calendar, CreditCard,
  Wrench, Zap, type LucideIcon,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Icon catalog — matches the ICON_MAP in the public homepage
// ---------------------------------------------------------------------------

const ICON_OPTIONS: { name: string; icon: LucideIcon }[] = [
  { name: 'Truck', icon: Truck },
  { name: 'Shield', icon: Shield },
  { name: 'Leaf', icon: Leaf },
  { name: 'Star', icon: Star },
  { name: 'Phone', icon: Phone },
  { name: 'Mail', icon: Mail },
  { name: 'MapPin', icon: MapPin },
  { name: 'Clock', icon: Clock },
  { name: 'Globe', icon: Globe },
  { name: 'MessageCircle', icon: MessageCircle },
  { name: 'Heart', icon: Heart },
  { name: 'Award', icon: Award },
  { name: 'ThumbsUp', icon: ThumbsUp },
  { name: 'Calendar', icon: Calendar },
  { name: 'CreditCard', icon: CreditCard },
  { name: 'Wrench', icon: Wrench },
  { name: 'Zap', icon: Zap },
];

const ICON_MAP: Record<string, LucideIcon> = Object.fromEntries(
  ICON_OPTIONS.map((o) => [o.name, o.icon])
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Differentiator {
  icon: string;
  title: string;
  description: string;
}

interface HomepageSettingsState {
  differentiators: Differentiator[];
  googlePlaceId: string;
  ctaBeforeImage: string;
  ctaAfterImage: string;
  teamHeading: string;
  credentialsHeading: string;
  heroTagline: string;
  ctaTitle: string;
  ctaDescription: string;
  ctaButtonText: string;
  servicesDescription: string;
  servicesPageDescription: string;
}

const DEFAULTS: HomepageSettingsState = {
  differentiators: [
    { icon: 'Truck', title: 'Mobile Service', description: 'We come to your home or office throughout the South Bay area.' },
    { icon: 'Shield', title: 'Ceramic Pro Certified', description: 'Professional-grade coatings for lasting protection.' },
    { icon: 'Leaf', title: 'Eco-Friendly Products', description: 'Premium products that are safe for your vehicle and the environment.' },
  ],
  googlePlaceId: '',
  ctaBeforeImage: '',
  ctaAfterImage: '',
  teamHeading: 'Meet the Team',
  credentialsHeading: 'Credentials & Awards',
  heroTagline: '',
  ctaTitle: '',
  ctaDescription: '',
  ctaButtonText: '',
  servicesDescription: '',
  servicesPageDescription: '',
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function HomepageSettingsPage() {
  const [settings, setSettings] = useState<HomepageSettingsState>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await adminFetch('/api/admin/cms/homepage-settings');
      if (!res.ok) throw new Error('Failed');
      const { data } = await res.json();

      setSettings({
        differentiators: Array.isArray(data.homepage_differentiators) && data.homepage_differentiators.length > 0
          ? data.homepage_differentiators
          : DEFAULTS.differentiators,
        googlePlaceId: data.google_place_id || '',
        ctaBeforeImage: data.homepage_cta_before_image || '',
        ctaAfterImage: data.homepage_cta_after_image || '',
        teamHeading: data.homepage_team_heading || 'Meet the Team',
        credentialsHeading: data.homepage_credentials_heading || 'Credentials & Awards',
        heroTagline: data.homepage_hero_tagline || '',
        ctaTitle: data.homepage_cta_title || '',
        ctaDescription: data.homepage_cta_description || '',
        ctaButtonText: data.homepage_cta_button_text || '',
        servicesDescription: data.homepage_services_description || '',
        servicesPageDescription: data.services_page_description || '',
      });
    } catch {
      toast.error('Failed to load homepage settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    // Validate differentiators
    for (const d of settings.differentiators) {
      if (!d.title.trim()) {
        toast.error('All differentiators must have a title');
        return;
      }
    }

    setSaving(true);
    try {
      const res = await adminFetch('/api/admin/cms/homepage-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          homepage_differentiators: settings.differentiators,
          google_place_id: settings.googlePlaceId || null,
          homepage_cta_before_image: settings.ctaBeforeImage || null,
          homepage_cta_after_image: settings.ctaAfterImage || null,
          homepage_team_heading: settings.teamHeading || 'Meet the Team',
          homepage_credentials_heading: settings.credentialsHeading || 'Credentials & Awards',
          homepage_hero_tagline: settings.heroTagline || null,
          homepage_cta_title: settings.ctaTitle || null,
          homepage_cta_description: settings.ctaDescription || null,
          homepage_cta_button_text: settings.ctaButtonText || null,
          homepage_services_description: settings.servicesDescription || null,
          services_page_description: settings.servicesPageDescription || null,
        }),
      });
      if (!res.ok) throw new Error('Failed');
      toast.success('Homepage settings saved');
    } catch {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  // Differentiator helpers
  const updateDiff = (idx: number, field: keyof Differentiator, value: string) => {
    setSettings((prev) => {
      const next = [...prev.differentiators];
      next[idx] = { ...next[idx], [field]: value };
      return { ...prev, differentiators: next };
    });
  };

  const addDiff = () => {
    setSettings((prev) => ({
      ...prev,
      differentiators: [...prev.differentiators, { icon: 'Star', title: '', description: '' }],
    }));
  };

  const removeDiff = (idx: number) => {
    setSettings((prev) => ({
      ...prev,
      differentiators: prev.differentiators.filter((_, i) => i !== idx),
    }));
  };

  const moveDiff = (idx: number, dir: -1 | 1) => {
    setSettings((prev) => {
      const arr = [...prev.differentiators];
      const target = idx + dir;
      if (target < 0 || target >= arr.length) return prev;
      [arr[idx], arr[target]] = [arr[target], arr[idx]];
      return { ...prev, differentiators: arr };
    });
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
        title="Homepage Settings"
        description="Manage hero content, CTA defaults, section copy, differentiators, and review links."
        action={
          <Button onClick={save} disabled={saving}>
            {saving ? <><Spinner size="sm" /> Saving...</> : <><Save className="mr-2 h-4 w-4" /> Save</>}
          </Button>
        }
      />

      {/* Hero Settings */}
      <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Hero Settings</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Main tagline displayed on the homepage hero section.
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Hero Tagline
          </label>
          <Textarea
            value={settings.heroTagline}
            onChange={(e) => setSettings((prev) => ({ ...prev, heroTagline: e.target.value }))}
            className="mt-1 text-sm"
            rows={2}
            placeholder="Expert ceramic coatings, paint correction, and premium detailing. We bring showroom results directly to your doorstep."
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <ImageUploadField
            value={settings.ctaBeforeImage}
            onChange={(url) => setSettings((prev) => ({ ...prev, ctaBeforeImage: url }))}
            folder="homepage"
            label="CTA Before Image"
          />
          <ImageUploadField
            value={settings.ctaAfterImage}
            onChange={(url) => setSettings((prev) => ({ ...prev, ctaAfterImage: url }))}
            folder="homepage"
            label="CTA After Image"
          />
        </div>
      </div>

      {/* CTA Defaults */}
      <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">CTA Defaults</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Default call-to-action shown across the site. Individual pages can override via content blocks.
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            CTA Title
          </label>
          <Input
            value={settings.ctaTitle}
            onChange={(e) => setSettings((prev) => ({ ...prev, ctaTitle: e.target.value }))}
            className="mt-1 text-sm"
            placeholder="Ready to Transform Your Vehicle?"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            CTA Description
          </label>
          <Textarea
            value={settings.ctaDescription}
            onChange={(e) => setSettings((prev) => ({ ...prev, ctaDescription: e.target.value }))}
            className="mt-1 text-sm"
            rows={2}
            placeholder="Book your appointment today and experience the difference professional detailing makes."
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            CTA Button Text
          </label>
          <Input
            value={settings.ctaButtonText}
            onChange={(e) => setSettings((prev) => ({ ...prev, ctaButtonText: e.target.value }))}
            className="mt-1 text-sm"
            placeholder="Book Your Detail"
          />
        </div>
      </div>

      {/* Section Content */}
      <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Section Content</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Marketing copy for the services sections and section headings.
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Services Description (Homepage)
          </label>
          <Textarea
            value={settings.servicesDescription}
            onChange={(e) => setSettings((prev) => ({ ...prev, servicesDescription: e.target.value }))}
            className="mt-1 text-sm"
            rows={2}
            placeholder="From express washes to multi-year ceramic coating packages..."
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Shown under &ldquo;Our Services&rdquo; on the homepage.
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Services Description (Listing Page)
          </label>
          <Textarea
            value={settings.servicesPageDescription}
            onChange={(e) => setSettings((prev) => ({ ...prev, servicesPageDescription: e.target.value }))}
            className="mt-1 text-sm"
            rows={2}
            placeholder="From express washes to multi-year ceramic coating packages..."
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Shown in the header of the /services page.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Team Section Heading
            </label>
            <Input
              value={settings.teamHeading}
              onChange={(e) => setSettings((prev) => ({ ...prev, teamHeading: e.target.value }))}
              className="mt-1"
              placeholder="Meet the Team"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Credentials Section Heading
            </label>
            <Input
              value={settings.credentialsHeading}
              onChange={(e) => setSettings((prev) => ({ ...prev, credentialsHeading: e.target.value }))}
              className="mt-1"
              placeholder="Credentials & Awards"
            />
          </div>
        </div>
      </div>

      {/* Differentiators — "Why Choose Us" */}
      <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Why Choose Us — Differentiators
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              3 items displayed with icons in a row on the homepage.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={addDiff}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Add
          </Button>
        </div>

        <div className="space-y-3">
          {settings.differentiators.map((diff, idx) => {
            const SelectedIcon = ICON_MAP[diff.icon] || Star;
            return (
              <div
                key={idx}
                className="flex gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-600 dark:bg-gray-700/50"
              >
                {/* Reorder handle */}
                <div className="flex flex-col items-center justify-center gap-0.5 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => moveDiff(idx, -1)}
                    disabled={idx === 0}
                    className="rounded p-0.5 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-30"
                  >
                    <ChevronUp className="h-3.5 w-3.5 text-gray-500" />
                  </button>
                  <GripVertical className="h-4 w-4 text-gray-400" />
                  <button
                    type="button"
                    onClick={() => moveDiff(idx, 1)}
                    disabled={idx === settings.differentiators.length - 1}
                    className="rounded p-0.5 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-30"
                  >
                    <ChevronDown className="h-3.5 w-3.5 text-gray-500" />
                  </button>
                </div>

                {/* Icon selector */}
                <div className="flex-shrink-0">
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Icon</label>
                  <div className="relative">
                    <select
                      value={diff.icon}
                      onChange={(e) => updateDiff(idx, 'icon', e.target.value)}
                      className="block w-32 rounded-md border border-gray-300 bg-white pl-9 pr-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
                    >
                      {ICON_OPTIONS.map((opt) => (
                        <option key={opt.name} value={opt.name}>{opt.name}</option>
                      ))}
                    </select>
                    <SelectedIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 pointer-events-none" />
                  </div>
                </div>

                {/* Title + description */}
                <div className="flex-1 min-w-0 space-y-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Title</label>
                    <Input
                      value={diff.title}
                      onChange={(e) => updateDiff(idx, 'title', e.target.value)}
                      placeholder="e.g. Mobile Service"
                      className="text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Description</label>
                    <Input
                      value={diff.description}
                      onChange={(e) => updateDiff(idx, 'description', e.target.value)}
                      placeholder="Short description..."
                      className="text-sm"
                    />
                  </div>
                </div>

                {/* Delete */}
                <div className="flex-shrink-0 flex items-start">
                  <button
                    type="button"
                    onClick={() => removeDiff(idx)}
                    className="rounded-md p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors mt-5"
                    title="Remove differentiator"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}

          {settings.differentiators.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">No differentiators. Click Add to create one.</p>
          )}
        </div>
      </div>

      {/* Google Place ID */}
      <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800 space-y-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Google Reviews</h3>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Google Place ID
          </label>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 mb-1.5">
            Used for the &ldquo;See all reviews on Google&rdquo; link. Find yours at{' '}
            <a
              href="https://developers.google.com/maps/documentation/places/web-service/place-id"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-600 hover:underline"
            >
              Google Place ID Finder
            </a>.
          </p>
          <Input
            value={settings.googlePlaceId}
            onChange={(e) => setSettings((prev) => ({ ...prev, googlePlaceId: e.target.value }))}
            placeholder="e.g. ChIJ..."
            className="font-mono text-sm"
          />
        </div>
      </div>

    </div>
  );
}
