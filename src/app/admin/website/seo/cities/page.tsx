'use client';

import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { adminFetch } from '@/lib/utils/admin-fetch';
import {
  Plus,
  Pencil,
  Trash2,
  ExternalLink,
  X,
} from 'lucide-react';
import type { CityLandingPage } from '@/lib/supabase/types';

// ---------------------------------------------------------------------------
// Slug generator — lowercase, hyphenated, ASCII-only
// ---------------------------------------------------------------------------

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// ---------------------------------------------------------------------------
// Form type
// ---------------------------------------------------------------------------

interface CityFormData {
  city_name: string;
  slug: string;
  state: string;
  distance_miles: string;
  heading: string;
  intro_text: string;
  focus_keywords: string;
  meta_title: string;
  meta_description: string;
  is_active: boolean;
}

const emptyForm: CityFormData = {
  city_name: '',
  slug: '',
  state: 'CA',
  distance_miles: '',
  heading: '',
  intro_text: '',
  focus_keywords: '',
  meta_title: '',
  meta_description: '',
  is_active: true,
};

function cityToForm(city: CityLandingPage): CityFormData {
  return {
    city_name: city.city_name,
    slug: city.slug,
    state: city.state,
    distance_miles: city.distance_miles != null ? String(city.distance_miles) : '',
    heading: city.heading ?? '',
    intro_text: city.intro_text ?? '',
    focus_keywords: city.focus_keywords ?? '',
    meta_title: city.meta_title ?? '',
    meta_description: city.meta_description ?? '',
    is_active: city.is_active,
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CitiesAdminPage() {
  const [cities, setCities] = useState<CityLandingPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CityFormData>(emptyForm);
  const [saving, setSaving] = useState(false);

  // -----------------------------------------------------------------------
  // Data loading
  // -----------------------------------------------------------------------

  const loadCities = useCallback(async () => {
    try {
      const res = await adminFetch('/api/admin/cms/seo/cities');
      if (!res.ok) throw new Error('Failed to load');
      const json = await res.json();
      setCities(json.data ?? []);
    } catch {
      toast.error('Failed to load cities');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCities();
  }, [loadCities]);

  // -----------------------------------------------------------------------
  // Auto-generate slug from city name
  // -----------------------------------------------------------------------

  const handleNameChange = (name: string) => {
    setForm((prev) => ({
      ...prev,
      city_name: name,
      slug: editingId ? prev.slug : toSlug(name),
    }));
  };

  // -----------------------------------------------------------------------
  // Open dialog
  // -----------------------------------------------------------------------

  const openAddDialog = () => {
    setEditingId(null);
    setForm(emptyForm);
    setShowDialog(true);
  };

  const openEditDialog = (city: CityLandingPage) => {
    setEditingId(city.id);
    setForm(cityToForm(city));
    setShowDialog(true);
  };

  // -----------------------------------------------------------------------
  // Save (create or update)
  // -----------------------------------------------------------------------

  const handleSave = async () => {
    if (!form.city_name.trim() || !form.slug.trim() || !form.state.trim()) {
      toast.error('City name, slug, and state are required');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        city_name: form.city_name.trim(),
        slug: form.slug.trim(),
        state: form.state.trim(),
        distance_miles: form.distance_miles ? parseFloat(form.distance_miles) : null,
        heading: form.heading.trim() || null,
        intro_text: form.intro_text.trim() || null,
        focus_keywords: form.focus_keywords.trim() || null,
        meta_title: form.meta_title.trim() || null,
        meta_description: form.meta_description.trim() || null,
        is_active: form.is_active,
      };

      const url = editingId
        ? `/api/admin/cms/seo/cities/${editingId}`
        : '/api/admin/cms/seo/cities';
      const method = editingId ? 'PATCH' : 'POST';

      const res = await adminFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || 'Failed to save');
      }

      toast.success(editingId ? 'City updated' : 'City created');
      setShowDialog(false);
      loadCities();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save city');
    } finally {
      setSaving(false);
    }
  };

  // -----------------------------------------------------------------------
  // Toggle active
  // -----------------------------------------------------------------------

  const toggleActive = async (id: string, isActive: boolean) => {
    // Optimistic update
    setCities((prev) =>
      prev.map((c) => (c.id === id ? { ...c, is_active: isActive } : c))
    );
    try {
      const res = await adminFetch(`/api/admin/cms/seo/cities/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: isActive }),
      });
      if (!res.ok) throw new Error('Failed');
    } catch {
      // Revert
      setCities((prev) =>
        prev.map((c) => (c.id === id ? { ...c, is_active: !isActive } : c))
      );
      toast.error('Failed to update status');
    }
  };

  // -----------------------------------------------------------------------
  // Delete
  // -----------------------------------------------------------------------

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    try {
      const res = await adminFetch(`/api/admin/cms/seo/cities/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed');
      setCities((prev) => prev.filter((c) => c.id !== id));
      toast.success('City deleted');
    } catch {
      toast.error('Failed to delete city');
    }
  };

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

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
        title="City Landing Pages"
        description="Manage SEO landing pages for service areas"
        action={
          <Button onClick={openAddDialog}>
            <Plus className="mr-2 h-4 w-4" />
            Add City
          </Button>
        }
      />

      {/* Table */}
      {cities.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-gray-300 p-12 text-center">
          <p className="text-sm text-gray-500">No city landing pages yet</p>
          <Button variant="outline" onClick={openAddDialog} className="mt-4">
            <Plus className="mr-2 h-4 w-4" />
            Create First City
          </Button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  City Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Slug
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Distance
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Status
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-900">
              {cities.map((city) => (
                <tr key={city.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="whitespace-nowrap px-4 py-3">
                    <button
                      type="button"
                      onClick={() => openEditDialog(city)}
                      className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline"
                    >
                      {city.city_name}, {city.state}
                    </button>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <code className="text-xs text-gray-500 dark:text-gray-400">
                      /areas/{city.slug}
                    </code>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                    {city.distance_miles != null
                      ? `${city.distance_miles} mi`
                      : '--'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={city.is_active}
                        onCheckedChange={(val) => toggleActive(city.id, val)}
                      />
                      <Badge variant={city.is_active ? 'success' : 'default'}>
                        {city.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <a
                        href={`/areas/${city.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 text-gray-400 hover:text-brand-600 transition-colors"
                        title="Preview page"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                      <button
                        type="button"
                        onClick={() => openEditDialog(city)}
                        className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors"
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(city.id, city.city_name)}
                        className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add / Edit Dialog (overlay) */}
      {showDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl bg-white dark:bg-gray-800 shadow-xl">
            {/* Dialog header */}
            <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {editingId ? 'Edit City' : 'Add City'}
              </h2>
              <button
                type="button"
                onClick={() => setShowDialog(false)}
                className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Dialog body */}
            <div className="space-y-4 px-6 py-5">
              {/* City Name + State */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    City Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.city_name}
                    onChange={(e) => handleNameChange(e.target.value)}
                    placeholder="e.g. Torrance"
                    className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    State <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.state}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, state: e.target.value }))
                    }
                    placeholder="CA"
                    maxLength={2}
                    className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
                  />
                </div>
              </div>

              {/* Slug + Distance */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    URL Slug <span className="text-red-500">*</span>
                  </label>
                  <div className="mt-1 flex items-center rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700">
                    <span className="px-3 text-sm text-gray-400">/areas/</span>
                    <input
                      type="text"
                      value={form.slug}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, slug: toSlug(e.target.value) }))
                      }
                      className="block w-full border-0 bg-transparent px-0 py-2 text-sm dark:text-gray-200 focus:ring-0"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Distance (mi)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={form.distance_miles}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        distance_miles: e.target.value,
                      }))
                    }
                    placeholder="e.g. 3.5"
                    className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
                  />
                </div>
              </div>

              {/* Heading */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Page Heading
                </label>
                <input
                  type="text"
                  value={form.heading}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, heading: e.target.value }))
                  }
                  placeholder="Auto-generated if blank: Mobile Auto Detailing in {City}, {State}"
                  className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
                />
              </div>

              {/* Intro Text */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Intro Text
                </label>
                <textarea
                  rows={3}
                  value={form.intro_text}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, intro_text: e.target.value }))
                  }
                  placeholder="Introductory paragraph about the city. Auto-generated if blank."
                  className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
                />
              </div>

              {/* SEO Section */}
              <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                  SEO Settings
                </h3>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Meta Title
                    </label>
                    <input
                      type="text"
                      value={form.meta_title}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          meta_title: e.target.value,
                        }))
                      }
                      placeholder="Auto-generated if blank"
                      className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
                    />
                    <p className="mt-1 text-xs text-gray-400">
                      {form.meta_title.length}/60 characters
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Meta Description
                    </label>
                    <textarea
                      rows={2}
                      value={form.meta_description}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          meta_description: e.target.value,
                        }))
                      }
                      placeholder="Auto-generated if blank"
                      className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
                    />
                    <p className="mt-1 text-xs text-gray-400">
                      {form.meta_description.length}/160 characters
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Focus Keywords
                    </label>
                    <input
                      type="text"
                      value={form.focus_keywords}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          focus_keywords: e.target.value,
                        }))
                      }
                      placeholder="e.g. auto detailing torrance, car wash torrance"
                      className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
                    />
                    <p className="mt-1 text-xs text-gray-400">
                      Comma-separated keywords
                    </p>
                  </div>
                </div>
              </div>

              {/* Active toggle */}
              <div className="flex items-center gap-3 border-t border-gray-200 dark:border-gray-700 pt-4">
                <Switch
                  checked={form.is_active}
                  onCheckedChange={(val) =>
                    setForm((prev) => ({ ...prev, is_active: val }))
                  }
                />
                <label className="text-sm text-gray-700 dark:text-gray-300">
                  Active (visible on public site)
                </label>
              </div>
            </div>

            {/* Dialog footer */}
            <div className="flex items-center justify-end gap-3 border-t border-gray-200 dark:border-gray-700 px-6 py-4">
              <Button
                variant="outline"
                onClick={() => setShowDialog(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? (
                  <>
                    <Spinner size="sm" className="mr-2" />
                    Saving...
                  </>
                ) : editingId ? (
                  'Save Changes'
                ) : (
                  'Create City'
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
