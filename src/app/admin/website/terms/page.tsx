'use client';

import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Spinner } from '@/components/ui/spinner';
import { adminFetch } from '@/lib/utils/admin-fetch';
import {
  GripVertical,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  ExternalLink,
} from 'lucide-react';
import Link from 'next/link';

interface TcSection {
  title: string;
  content: string;
  is_active: boolean;
}

export default function TermsEditorPage() {
  const [sections, setSections] = useState<TcSection[]>([]);
  const [effectiveDate, setEffectiveDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await adminFetch('/api/admin/cms/terms');
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      setSections(data.sections ?? []);
      setEffectiveDate(data.effectiveDate ?? '');
    } catch {
      toast.error('Failed to load terms content');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await adminFetch('/api/admin/cms/terms', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sections, effectiveDate }),
      });
      if (!res.ok) throw new Error('Failed to save');
      toast.success('Terms saved');
    } catch {
      toast.error('Failed to save terms');
    } finally {
      setSaving(false);
    }
  };

  const addSection = () => {
    setSections((prev) => [
      ...prev,
      { title: 'New Section', content: '', is_active: true },
    ]);
  };

  const removeSection = (idx: number) => {
    setSections((prev) => prev.filter((_, i) => i !== idx));
  };

  const moveSection = (idx: number, dir: -1 | 1) => {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= sections.length) return;
    setSections((prev) => {
      const arr = [...prev];
      [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
      return arr;
    });
  };

  const updateSection = (idx: number, field: keyof TcSection, value: string | boolean) => {
    setSections((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, [field]: value } : s))
    );
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
        title="Terms & Conditions"
        description="Edit the terms and conditions displayed on the public website"
        action={
          <div className="flex items-center gap-3">
            <Link
              href="/terms"
              target="_blank"
              className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
            >
              <ExternalLink className="h-4 w-4" />
              View Public Page
            </Link>
            <Button onClick={save} disabled={saving}>
              {saving ? <><Spinner size="sm" /> Saving...</> : 'Save Changes'}
            </Button>
          </div>
        }
      />

      {/* Effective Date */}
      <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Effective Date
        </label>
        <Input
          type="date"
          value={effectiveDate}
          onChange={(e) => setEffectiveDate(e.target.value)}
          className="mt-1 max-w-xs"
        />
        <p className="mt-1 text-xs text-gray-500">
          Displayed at the top of the terms page
        </p>
      </div>

      {/* Sections */}
      <div className="space-y-4">
        {sections.map((section, idx) => (
          <div
            key={idx}
            className={`rounded-lg border bg-white dark:bg-gray-800 p-4 ${
              section.is_active
                ? 'border-gray-200 dark:border-gray-700'
                : 'border-gray-100 dark:border-gray-800 opacity-60'
            }`}
          >
            <div className="flex items-start gap-3">
              {/* Reorder */}
              <div className="flex flex-col items-center gap-0.5 pt-1">
                <button
                  type="button"
                  onClick={() => moveSection(idx, -1)}
                  disabled={idx === 0}
                  className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                >
                  <ChevronUp className="h-4 w-4" />
                </button>
                <GripVertical className="h-4 w-4 text-gray-300" />
                <button
                  type="button"
                  onClick={() => moveSection(idx, 1)}
                  disabled={idx === sections.length - 1}
                  className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 space-y-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-400">
                    {idx + 1}
                  </span>
                  <Input
                    value={section.title}
                    onChange={(e) => updateSection(idx, 'title', e.target.value)}
                    className="flex-1 font-medium"
                    placeholder="Section title"
                  />
                </div>
                <textarea
                  value={section.content}
                  onChange={(e) => updateSection(idx, 'content', e.target.value)}
                  rows={4}
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="Section content..."
                />
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 pt-1">
                <Switch
                  checked={section.is_active}
                  onCheckedChange={(val) => updateSection(idx, 'is_active', val)}
                />
                <button
                  type="button"
                  onClick={() => removeSection(idx)}
                  className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add Section */}
      <Button variant="outline" onClick={addSection} className="w-full">
        <Plus className="mr-2 h-4 w-4" />
        Add Section
      </Button>
    </div>
  );
}
