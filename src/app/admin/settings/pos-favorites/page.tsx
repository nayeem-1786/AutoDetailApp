'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { FormField } from '@/components/ui/form-field';
import { Spinner } from '@/components/ui/spinner';
import { ArrowUp, ArrowDown, Trash2, Plus, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import type { FavoriteItem, FavoriteActionType, FavoriteColor, FavoriteColorShade } from '@/app/pos/types';

const SETTINGS_KEY = 'pos_favorites';

const COLOR_OPTIONS: { value: FavoriteColor; label: string }[] = [
  { value: 'red', label: 'Red' },
  { value: 'orange', label: 'Orange' },
  { value: 'fuchsia', label: 'Fuchsia' },
  { value: 'lime', label: 'Lime' },
  { value: 'cyan', label: 'Cyan' },
  { value: 'rose', label: 'Rose' },
  { value: 'teal', label: 'Teal' },
  { value: 'blue', label: 'Blue' },
  { value: 'indigo', label: 'Indigo' },
  { value: 'purple', label: 'Purple' },
  { value: 'pink', label: 'Pink' },
  { value: 'slate', label: 'Slate' },
];
const SHADE_OPTIONS: { value: FavoriteColorShade; label: string }[] = [
  { value: 10, label: '10%' },
  { value: 25, label: '25%' },
  { value: 40, label: '40%' },
  { value: 60, label: '60%' },
  { value: 80, label: '80%' },
  { value: 100, label: '100%' },
];
const TYPE_OPTIONS: { value: FavoriteActionType; label: string }[] = [
  { value: 'product', label: 'Product' },
  { value: 'service', label: 'Service' },
  { value: 'custom_amount', label: 'Custom Amount' },
  { value: 'customer_lookup', label: 'Customer Lookup' },
  { value: 'discount', label: 'Discount' },
  { value: 'surcharge', label: 'Surcharge (% of sale)' },
];

// Explicit Tailwind class map — every color × shade combo as full strings for JIT detection
const BG_CLASSES: Record<string, string> = {
  'red-10': 'bg-red-100', 'red-25': 'bg-red-200', 'red-40': 'bg-red-300', 'red-60': 'bg-red-400', 'red-80': 'bg-red-500', 'red-100': 'bg-red-600',
  'orange-10': 'bg-orange-100', 'orange-25': 'bg-orange-200', 'orange-40': 'bg-orange-300', 'orange-60': 'bg-orange-400', 'orange-80': 'bg-orange-500', 'orange-100': 'bg-orange-600',
  'fuchsia-10': 'bg-fuchsia-100', 'fuchsia-25': 'bg-fuchsia-200', 'fuchsia-40': 'bg-fuchsia-300', 'fuchsia-60': 'bg-fuchsia-400', 'fuchsia-80': 'bg-fuchsia-500', 'fuchsia-100': 'bg-fuchsia-600',
  'lime-10': 'bg-lime-100', 'lime-25': 'bg-lime-200', 'lime-40': 'bg-lime-300', 'lime-60': 'bg-lime-400', 'lime-80': 'bg-lime-500', 'lime-100': 'bg-lime-600',
  'cyan-10': 'bg-cyan-100', 'cyan-25': 'bg-cyan-200', 'cyan-40': 'bg-cyan-300', 'cyan-60': 'bg-cyan-400', 'cyan-80': 'bg-cyan-500', 'cyan-100': 'bg-cyan-600',
  'rose-10': 'bg-rose-100', 'rose-25': 'bg-rose-200', 'rose-40': 'bg-rose-300', 'rose-60': 'bg-rose-400', 'rose-80': 'bg-rose-500', 'rose-100': 'bg-rose-600',
  'teal-10': 'bg-teal-100', 'teal-25': 'bg-teal-200', 'teal-40': 'bg-teal-300', 'teal-60': 'bg-teal-400', 'teal-80': 'bg-teal-500', 'teal-100': 'bg-teal-600',
  'blue-10': 'bg-blue-100', 'blue-25': 'bg-blue-200', 'blue-40': 'bg-blue-300', 'blue-60': 'bg-blue-400', 'blue-80': 'bg-blue-500', 'blue-100': 'bg-blue-600',
  'indigo-10': 'bg-indigo-100', 'indigo-25': 'bg-indigo-200', 'indigo-40': 'bg-indigo-300', 'indigo-60': 'bg-indigo-400', 'indigo-80': 'bg-indigo-500', 'indigo-100': 'bg-indigo-600',
  'purple-10': 'bg-purple-100', 'purple-25': 'bg-purple-200', 'purple-40': 'bg-purple-300', 'purple-60': 'bg-purple-400', 'purple-80': 'bg-purple-500', 'purple-100': 'bg-purple-600',
  'pink-10': 'bg-pink-100', 'pink-25': 'bg-pink-200', 'pink-40': 'bg-pink-300', 'pink-60': 'bg-pink-400', 'pink-80': 'bg-pink-500', 'pink-100': 'bg-pink-600',
  'slate-10': 'bg-slate-100', 'slate-25': 'bg-slate-200', 'slate-40': 'bg-slate-300', 'slate-60': 'bg-slate-400', 'slate-80': 'bg-slate-500', 'slate-100': 'bg-slate-600',
};


function getBgClass(color: FavoriteColor, shade: number = 80): string {
  return BG_CLASSES[`${color}-${shade}`] ?? BG_CLASSES[`${color}-80`] ?? 'bg-blue-500';
}

const TYPE_BADGES: Record<FavoriteActionType, { label: string; className: string }> = {
  product: { label: 'Product', className: 'bg-blue-100 text-blue-700' },
  service: { label: 'Service', className: 'bg-purple-100 text-purple-700' },
  custom_amount: { label: 'Custom', className: 'bg-amber-100 text-amber-700' },
  customer_lookup: { label: 'Customer', className: 'bg-green-100 text-green-700' },
  discount: { label: 'Discount', className: 'bg-red-100 text-red-700' },
  surcharge: { label: 'Surcharge', className: 'bg-orange-100 text-orange-700' },
};

interface CatalogItem {
  id: string;
  name: string;
}

export default function PosFavoritesPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [products, setProducts] = useState<CatalogItem[]>([]);
  const [services, setServices] = useState<CatalogItem[]>([]);

  // Add form state
  const [showAdd, setShowAdd] = useState(false);
  const [newType, setNewType] = useState<FavoriteActionType>('product');
  const [newLabel, setNewLabel] = useState('');
  const [newColor, setNewColor] = useState<FavoriteColor>('blue');
  const [newShade, setNewShade] = useState<FavoriteColorShade>(80);
  const [newReferenceId, setNewReferenceId] = useState('');
  const [newPercentage, setNewPercentage] = useState('');

  // Edit form state
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [editType, setEditType] = useState<FavoriteActionType>('product');
  const [editLabel, setEditLabel] = useState('');
  const [editColor, setEditColor] = useState<FavoriteColor>('blue');
  const [editShade, setEditShade] = useState<FavoriteColorShade>(80);
  const [editReferenceId, setEditReferenceId] = useState('');
  const [editPercentage, setEditPercentage] = useState('');

  useEffect(() => {
    async function load() {
      const supabase = createClient();

      const [settingsRes, productsRes, servicesRes] = await Promise.all([
        supabase.from('business_settings').select('value').eq('key', SETTINGS_KEY).single(),
        supabase.from('products').select('id, name').eq('is_active', true).order('name'),
        supabase.from('services').select('id, name').eq('is_active', true).order('name'),
      ]);

      if (settingsRes.data) {
        try {
          const parsed = typeof settingsRes.data.value === 'string'
            ? JSON.parse(settingsRes.data.value)
            : settingsRes.data.value;
          if (Array.isArray(parsed)) setFavorites(parsed);
        } catch {
          // no-op
        }
      }

      if (productsRes.data) setProducts(productsRes.data);
      if (servicesRes.data) setServices(servicesRes.data);
      setLoading(false);
    }
    load();
  }, []);

  async function handleSave() {
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from('business_settings')
      .upsert(
        {
          key: SETTINGS_KEY,
          value: favorites as unknown,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'key' }
      );

    if (error) {
      toast.error('Failed to save favorites');
    } else {
      toast.success('POS favorites saved');
    }
    setSaving(false);
  }

  function moveUp(index: number) {
    if (index === 0) return;
    const next = [...favorites];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    setFavorites(next);
  }

  function moveDown(index: number) {
    if (index >= favorites.length - 1) return;
    const next = [...favorites];
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    setFavorites(next);
  }

  function removeFavorite(index: number) {
    setFavorites(favorites.filter((_, i) => i !== index));
  }

  function handleAdd() {
    if (!newLabel.trim()) {
      toast.error('Label is required');
      return;
    }
    if ((newType === 'product' || newType === 'service') && !newReferenceId) {
      toast.error(`Select a ${newType}`);
      return;
    }
    const parsedPct = parseFloat(newPercentage);
    if (newType === 'surcharge' && (!parsedPct || parsedPct <= 0 || parsedPct > 100)) {
      toast.error('Enter a valid percentage (1–100)');
      return;
    }

    const item: FavoriteItem = {
      id: typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('').replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5'),
      type: newType,
      referenceId: (newType === 'product' || newType === 'service') ? newReferenceId : null,
      label: newLabel.trim(),
      color: newColor,
      colorShade: newShade,
      ...(newType === 'surcharge' ? { percentage: parsedPct } : {}),
    };

    setFavorites([...favorites, item]);
    setNewLabel('');
    setNewReferenceId('');
    setNewPercentage('');
    setNewType('product');
    setNewColor('blue');
    setNewShade(80);
    setShowAdd(false);
  }

  // Auto-fill label when selecting a product/service
  function handleReferenceChange(id: string) {
    setNewReferenceId(id);
    const items = newType === 'product' ? products : services;
    const found = items.find((i) => i.id === id);
    if (found && !newLabel) {
      setNewLabel(found.name);
    }
  }

  function startEdit(index: number) {
    const fav = favorites[index];
    setEditIndex(index);
    setEditType(fav.type);
    setEditLabel(fav.label);
    setEditColor(fav.color);
    setEditShade(fav.colorShade ?? 80);
    setEditReferenceId(fav.referenceId ?? '');
    setEditPercentage(fav.percentage != null ? String(fav.percentage) : '');
    setShowAdd(false);
  }

  function cancelEdit() {
    setEditIndex(null);
  }

  function handleEditReferenceChange(id: string) {
    setEditReferenceId(id);
    const items = editType === 'product' ? products : services;
    const found = items.find((i) => i.id === id);
    if (found && !editLabel) {
      setEditLabel(found.name);
    }
  }

  function handleSaveEdit() {
    if (editIndex === null) return;
    if (!editLabel.trim()) {
      toast.error('Label is required');
      return;
    }
    if ((editType === 'product' || editType === 'service') && !editReferenceId) {
      toast.error(`Select a ${editType}`);
      return;
    }
    const parsedPct = parseFloat(editPercentage);
    if (editType === 'surcharge' && (!parsedPct || parsedPct <= 0 || parsedPct > 100)) {
      toast.error('Enter a valid percentage (1–100)');
      return;
    }

    const updated: FavoriteItem = {
      id: favorites[editIndex].id,
      type: editType,
      referenceId: (editType === 'product' || editType === 'service') ? editReferenceId : null,
      label: editLabel.trim(),
      color: editColor,
      colorShade: editShade,
      ...(editType === 'surcharge' ? { percentage: parsedPct } : {}),
    };

    setFavorites(favorites.map((f, i) => (i === editIndex ? updated : f)));
    setEditIndex(null);
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="POS Favorites" description="Configure quick-action tiles on the POS Favorites tab." />
        <div className="flex items-center justify-center py-12">
          <Spinner size="lg" />
        </div>
      </div>
    );
  }

  const needsReference = newType === 'product' || newType === 'service';
  const referenceOptions = newType === 'product' ? products : services;

  return (
    <div className="space-y-6">
      <PageHeader
        title="POS Favorites"
        description="Configure quick-action tiles that appear on the POS Favorites tab."
      />

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Favorite Tiles</CardTitle>
            <Button onClick={() => setShowAdd(!showAdd)} variant={showAdd ? 'outline' : 'default'}>
              <Plus className="h-4 w-4" />
              {showAdd ? 'Cancel' : 'Add Favorite'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Add form */}
          {showAdd && (
            <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50/50 p-4">
              <h4 className="mb-3 text-sm font-semibold text-gray-900">New Favorite</h4>
              <div className="grid gap-4 md:grid-cols-2">
                <FormField label="Type" htmlFor="fav-type">
                  <Select
                    id="fav-type"
                    value={newType}
                    onChange={(e) => {
                      setNewType(e.target.value as FavoriteActionType);
                      setNewReferenceId('');
                      setNewLabel('');
                      setNewPercentage('');
                    }}
                  >
                    {TYPE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </Select>
                </FormField>

                {needsReference && (
                  <FormField label={newType === 'product' ? 'Product' : 'Service'} htmlFor="fav-ref">
                    <Select
                      id="fav-ref"
                      value={newReferenceId}
                      onChange={(e) => handleReferenceChange(e.target.value)}
                    >
                      <option value="">Select...</option>
                      {referenceOptions.map((item) => (
                        <option key={item.id} value={item.id}>{item.name}</option>
                      ))}
                    </Select>
                  </FormField>
                )}

                {newType === 'surcharge' && (
                  <FormField label="Percentage (%)" htmlFor="fav-pct">
                    <Input
                      id="fav-pct"
                      type="number"
                      min="0.1"
                      max="100"
                      step="0.1"
                      value={newPercentage}
                      onChange={(e) => setNewPercentage(e.target.value)}
                      placeholder="e.g. 5"
                    />
                  </FormField>
                )}

                <FormField label="Label" htmlFor="fav-label">
                  <Input
                    id="fav-label"
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    placeholder="Tile label"
                  />
                </FormField>

                <FormField label="Color & Shade">
                  <div className="flex items-center gap-3">
                    <div className="flex gap-1">
                      {COLOR_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setNewColor(opt.value)}
                          className={cn(
                            'h-6 w-6 rounded-full border-2 transition-all',
                            getBgClass(opt.value, newShade),
                            newColor === opt.value ? 'border-gray-900 ring-2 ring-gray-300' : 'border-transparent'
                          )}
                          title={opt.label}
                        />
                      ))}
                    </div>
                    <Select
                      id="fav-shade"
                      value={String(newShade)}
                      onChange={(e) => setNewShade(Number(e.target.value) as FavoriteColorShade)}
                      className="w-20 shrink-0"
                    >
                      {SHADE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </Select>
                  </div>
                </FormField>
              </div>

              <div className="mt-4 flex justify-end">
                <Button onClick={handleAdd}>Add</Button>
              </div>
            </div>
          )}

          {/* Current favorites list */}
          {favorites.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-sm text-gray-400">
              No favorites configured yet. Click &quot;Add Favorite&quot; to get started.
            </div>
          ) : (
            <div className="space-y-2">
              {favorites.map((fav, idx) => {
                const badge = TYPE_BADGES[fav.type];
                const isEditing = editIndex === idx;

                if (isEditing) {
                  const editNeedsReference = editType === 'product' || editType === 'service';
                  const editReferenceOptions = editType === 'product' ? products : services;

                  return (
                    <div
                      key={fav.id}
                      className="rounded-lg border border-amber-200 bg-amber-50/50 p-4"
                    >
                      <h4 className="mb-3 text-sm font-semibold text-gray-900">Edit Favorite</h4>
                      <div className="grid gap-4 md:grid-cols-2">
                        <FormField label="Type" htmlFor={`edit-type-${idx}`}>
                          <Select
                            id={`edit-type-${idx}`}
                            value={editType}
                            onChange={(e) => {
                              setEditType(e.target.value as FavoriteActionType);
                              setEditReferenceId('');
                              setEditLabel('');
                              setEditPercentage('');
                            }}
                          >
                            {TYPE_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </Select>
                        </FormField>

                        {editNeedsReference && (
                          <FormField label={editType === 'product' ? 'Product' : 'Service'} htmlFor={`edit-ref-${idx}`}>
                            <Select
                              id={`edit-ref-${idx}`}
                              value={editReferenceId}
                              onChange={(e) => handleEditReferenceChange(e.target.value)}
                            >
                              <option value="">Select...</option>
                              {editReferenceOptions.map((item) => (
                                <option key={item.id} value={item.id}>{item.name}</option>
                              ))}
                            </Select>
                          </FormField>
                        )}

                        {editType === 'surcharge' && (
                          <FormField label="Percentage (%)" htmlFor={`edit-pct-${idx}`}>
                            <Input
                              id={`edit-pct-${idx}`}
                              type="number"
                              min="0.1"
                              max="100"
                              step="0.1"
                              value={editPercentage}
                              onChange={(e) => setEditPercentage(e.target.value)}
                              placeholder="e.g. 5"
                            />
                          </FormField>
                        )}

                        <FormField label="Label" htmlFor={`edit-label-${idx}`}>
                          <Input
                            id={`edit-label-${idx}`}
                            value={editLabel}
                            onChange={(e) => setEditLabel(e.target.value)}
                            placeholder="Tile label"
                          />
                        </FormField>

                        <FormField label="Color & Shade">
                          <div className="flex items-center gap-3">
                            <div className="flex gap-1">
                              {COLOR_OPTIONS.map((opt) => (
                                <button
                                  key={opt.value}
                                  type="button"
                                  onClick={() => setEditColor(opt.value)}
                                  className={cn(
                                    'h-6 w-6 rounded-full border-2 transition-all',
                                    getBgClass(opt.value, editShade),
                                    editColor === opt.value ? 'border-gray-900 ring-2 ring-gray-300' : 'border-transparent'
                                  )}
                                  title={opt.label}
                                />
                              ))}
                            </div>
                            <Select
                              id={`edit-shade-${idx}`}
                              value={String(editShade)}
                              onChange={(e) => setEditShade(Number(e.target.value) as FavoriteColorShade)}
                              className="w-20 shrink-0"
                            >
                              {SHADE_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                            </Select>
                          </div>
                        </FormField>
                      </div>

                      <div className="mt-4 flex justify-end gap-2">
                        <Button variant="outline" onClick={cancelEdit}>Cancel</Button>
                        <Button onClick={handleSaveEdit}>Save</Button>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={fav.id}
                    className="flex items-center gap-3 rounded-lg border border-gray-200 px-4 py-3"
                  >
                    {/* Color swatch */}
                    <div className={cn('h-6 w-6 shrink-0 rounded-full', getBgClass(fav.color, fav.colorShade))} />

                    {/* Label */}
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900">
                      {fav.label}
                      {fav.type === 'surcharge' && fav.percentage != null && (
                        <span className="ml-1.5 text-xs font-normal text-gray-500">({fav.percentage}%)</span>
                      )}
                    </span>

                    {/* Type badge */}
                    <span className={cn('shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium', badge.className)}>
                      {badge.label}
                    </span>

                    {/* Edit + Reorder + delete */}
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        onClick={() => startEdit(idx)}
                        className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => moveUp(idx)}
                        disabled={idx === 0}
                        className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-30"
                      >
                        <ArrowUp className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => moveDown(idx)}
                        disabled={idx === favorites.length - 1}
                        className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-30"
                      >
                        <ArrowDown className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => removeFavorite(idx)}
                        className="rounded p-1 text-red-400 hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Save */}
          <div className="mt-6 flex justify-end border-t border-gray-200 pt-4">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save Favorites'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
