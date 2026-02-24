'use client';

import { useEffect, useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { createClient } from '@/lib/supabase/client';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { X, Plus, Search } from 'lucide-react';
import { adminFetch } from '@/lib/utils/admin-fetch';

// --- Auto-Logout Timer ---

const SETTINGS_KEY = 'pos_idle_timeout_minutes';
const DEFAULT_TIMEOUT = 15;

interface TimeoutForm {
  minutes: string;
}

// --- Vehicle Makes ---

interface VehicleMake {
  id: string;
  name: string;
  is_active: boolean;
  sort_order: number;
}

const ACRONYMS = ['BMW', 'GMC', 'RAM', 'BYD', 'MG'];

function titleCaseMake(name: string): string {
  const upper = name.trim().toUpperCase();
  if (ACRONYMS.includes(upper)) return upper;

  return name
    .trim()
    .split(/(\s+|(?<=-)(?=\S)|(?<=\S)(?=-))/g)
    .map((part) => {
      if (/^\s+$/.test(part) || part === '-') return part;
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join('');
}

// --- Page ---

export default function PosSettingsPage() {
  // Auto-Logout state
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<TimeoutForm>({
    defaultValues: { minutes: String(DEFAULT_TIMEOUT) },
  });

  // Vehicle Makes state
  const [makes, setMakes] = useState<VehicleMake[]>([]);
  const [makesLoading, setMakesLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newMakeName, setNewMakeName] = useState('');
  const [addingMake, setAddingMake] = useState(false);
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

  // Load auto-logout setting
  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data } = await supabase
        .from('business_settings')
        .select('value')
        .eq('key', SETTINGS_KEY)
        .single();

      const value =
        data?.value && typeof data.value === 'number' && data.value > 0
          ? data.value
          : DEFAULT_TIMEOUT;

      reset({ minutes: String(value) });
      setLoading(false);
    }
    load();
  }, [reset]);

  // Load vehicle makes
  const loadMakes = useCallback(async () => {
    try {
      const res = await adminFetch('/api/admin/vehicle-makes');
      if (res.ok) {
        const json = await res.json();
        setMakes(json.makes || []);
      }
    } catch {
      // silent
    } finally {
      setMakesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMakes();
  }, [loadMakes]);

  // Auto-logout submit
  async function onSubmit(formData: TimeoutForm) {
    const minutes = parseInt(formData.minutes, 10);
    if (isNaN(minutes) || minutes < 1 || minutes > 480) {
      toast.error('Enter a value between 1 and 480 minutes');
      return;
    }

    setSaving(true);
    const supabase = createClient();

    const { error } = await supabase
      .from('business_settings')
      .upsert(
        {
          key: SETTINGS_KEY,
          value: minutes as unknown,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'key' }
      );

    if (error) {
      toast.error('Failed to save', { description: error.message });
      setSaving(false);
      return;
    }

    toast.success('POS idle timeout updated');
    reset(formData);
    setSaving(false);
  }

  // Vehicle Makes handlers
  async function handleAddMake() {
    const trimmed = newMakeName.trim();
    if (!trimmed) return;

    setAddingMake(true);
    try {
      const res = await adminFetch('/api/admin/vehicle-makes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });

      if (res.status === 409) {
        const json = await res.json();
        toast.error(json.error || 'Duplicate make name');
        return;
      }

      if (!res.ok) {
        const json = await res.json();
        toast.error(json.error || 'Failed to add make');
        return;
      }

      toast.success(`Added "${titleCaseMake(trimmed)}"`);
      setNewMakeName('');
      setShowAddForm(false);
      await loadMakes();
    } finally {
      setAddingMake(false);
    }
  }

  async function handleToggle(make: VehicleMake) {
    setTogglingIds((prev) => new Set(prev).add(make.id));
    try {
      const res = await adminFetch('/api/admin/vehicle-makes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: make.id, is_active: !make.is_active }),
      });

      if (!res.ok) {
        toast.error('Failed to update make');
        return;
      }

      setMakes((prev) =>
        prev.map((m) =>
          m.id === make.id ? { ...m, is_active: !m.is_active } : m
        )
      );
    } finally {
      setTogglingIds((prev) => {
        const next = new Set(prev);
        next.delete(make.id);
        return next;
      });
    }
  }

  async function handleDelete(make: VehicleMake) {
    if (!confirm(`Delete "${make.name}"? This cannot be undone.`)) return;

    setDeletingIds((prev) => new Set(prev).add(make.id));
    try {
      const res = await adminFetch('/api/admin/vehicle-makes', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: make.id }),
      });

      if (res.status === 409) {
        const json = await res.json();
        toast.error(json.error || 'Cannot delete — vehicles exist with this make');
        return;
      }

      if (!res.ok) {
        toast.error('Failed to delete make');
        return;
      }

      toast.success(`Deleted "${make.name}"`);
      setMakes((prev) => prev.filter((m) => m.id !== make.id));
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(make.id);
        return next;
      });
    }
  }

  // Filter makes by search
  const filteredMakes = searchQuery.trim()
    ? makes.filter((m) =>
        m.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : makes;

  const activeCount = makes.filter((m) => m.is_active).length;

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="POS Settings"
          description="Configure POS behavior, auto-logout, and vehicle options."
        />
        <div className="flex items-center justify-center py-12">
          <Spinner size="lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="POS Settings"
        description="Configure POS behavior, auto-logout, and vehicle options."
      />

      {/* Auto-Logout Timer Card */}
      <form onSubmit={handleSubmit(onSubmit)}>
        <Card>
          <CardHeader>
            <CardTitle>POS Auto-Logout Timer</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <FormField
              label="Idle Timeout"
              required
              error={errors.minutes?.message}
              description="The POS will automatically log out after this many minutes of inactivity. Default is 15 minutes."
              htmlFor="minutes"
            >
              <div className="relative max-w-xs">
                <Input
                  id="minutes"
                  type="number"
                  min="1"
                  max="480"
                  step="1"
                  placeholder="15"
                  {...register('minutes', {
                    required: 'Timeout is required',
                    validate: (value) => {
                      const num = parseInt(value, 10);
                      if (isNaN(num)) return 'Must be a number';
                      if (num < 1) return 'Minimum is 1 minute';
                      if (num > 480) return 'Maximum is 480 minutes (8 hours)';
                      return true;
                    },
                  })}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                  min
                </span>
              </div>
            </FormField>

            <div className="flex justify-end border-t border-gray-200 pt-4">
              <Button type="submit" disabled={saving || !isDirty}>
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>

      {/* Vehicle Makes Card */}
      <Card>
        <CardHeader>
          <CardTitle>Vehicle Makes</CardTitle>
          <CardDescription>
            Manage the list of vehicle manufacturers available in dropdowns across POS, admin, and customer portal.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {makesLoading ? (
            <div className="flex items-center justify-center py-8">
              <Spinner size="md" />
            </div>
          ) : (
            <>
              {/* Search + Add row */}
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <Input
                    placeholder="Search makes..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowAddForm(!showAddForm)}
                >
                  <Plus className="mr-1.5 h-4 w-4" />
                  Add Make
                </Button>
              </div>

              {/* Inline Add Form */}
              {showAddForm && (
                <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <Input
                    placeholder="e.g. Rivian"
                    value={newMakeName}
                    onChange={(e) => setNewMakeName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddMake();
                      }
                    }}
                    className="max-w-xs"
                    autoFocus
                  />
                  <Button
                    type="button"
                    size="sm"
                    disabled={addingMake || !newMakeName.trim()}
                    onClick={handleAddMake}
                  >
                    {addingMake ? 'Adding...' : 'Add'}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setShowAddForm(false);
                      setNewMakeName('');
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              )}

              {/* Makes List */}
              <div className="max-h-[400px] divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-200">
                {filteredMakes.length === 0 ? (
                  <div className="py-8 text-center text-sm text-gray-500">
                    {searchQuery.trim()
                      ? 'No makes match your search.'
                      : 'No vehicle makes found.'}
                  </div>
                ) : (
                  filteredMakes.map((make) => (
                    <div
                      key={make.id}
                      className="flex items-center justify-between px-4 py-2.5"
                    >
                      <span
                        className={
                          make.is_active
                            ? 'text-sm text-gray-900'
                            : 'text-sm text-gray-400'
                        }
                      >
                        {make.name}
                      </span>
                      <div className="flex items-center gap-3">
                        <Switch
                          checked={make.is_active}
                          onCheckedChange={() => handleToggle(make)}
                          disabled={togglingIds.has(make.id)}
                        />
                        <button
                          type="button"
                          onClick={() => handleDelete(make)}
                          disabled={deletingIds.has(make.id)}
                          className="rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-red-500 disabled:opacity-50"
                          title={`Delete ${make.name}`}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Counter */}
              <p className="text-xs text-gray-500">
                Showing {makes.length} makes ({activeCount} active)
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
