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
import { ArrowUp, ArrowDown, Trash2, Plus } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import type { FavoriteItem, FavoriteActionType, FavoriteColor } from '@/app/pos/types';

const SETTINGS_KEY = 'pos_favorites';

const COLOR_OPTIONS: FavoriteColor[] = ['blue', 'green', 'red', 'purple', 'orange', 'amber', 'teal', 'pink'];
const TYPE_OPTIONS: { value: FavoriteActionType; label: string }[] = [
  { value: 'product', label: 'Product' },
  { value: 'service', label: 'Service' },
  { value: 'custom_amount', label: 'Custom Amount' },
  { value: 'customer_lookup', label: 'Customer Lookup' },
  { value: 'discount', label: 'Discount' },
  { value: 'surcharge', label: 'Surcharge (% of sale)' },
];

const COLOR_CLASSES: Record<FavoriteColor, string> = {
  blue: 'bg-blue-500',
  green: 'bg-green-500',
  red: 'bg-red-500',
  purple: 'bg-purple-500',
  orange: 'bg-orange-500',
  amber: 'bg-amber-500',
  teal: 'bg-teal-500',
  pink: 'bg-pink-500',
};

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
  const [newReferenceId, setNewReferenceId] = useState('');
  const [newPercentage, setNewPercentage] = useState('');

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
      ...(newType === 'surcharge' ? { percentage: parsedPct } : {}),
    };

    setFavorites([...favorites, item]);
    setNewLabel('');
    setNewReferenceId('');
    setNewPercentage('');
    setNewType('product');
    setNewColor('blue');
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

                <FormField label="Color">
                  <div className="flex flex-wrap gap-2 pt-1">
                    {COLOR_OPTIONS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setNewColor(c)}
                        className={cn(
                          'h-8 w-8 rounded-full border-2 transition-all',
                          COLOR_CLASSES[c],
                          newColor === c ? 'border-gray-900 ring-2 ring-gray-300' : 'border-transparent'
                        )}
                        title={c}
                      />
                    ))}
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
                return (
                  <div
                    key={fav.id}
                    className="flex items-center gap-3 rounded-lg border border-gray-200 px-4 py-3"
                  >
                    {/* Color swatch */}
                    <div className={cn('h-6 w-6 shrink-0 rounded-full', COLOR_CLASSES[fav.color])} />

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

                    {/* Reorder + delete */}
                    <div className="flex shrink-0 items-center gap-1">
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
