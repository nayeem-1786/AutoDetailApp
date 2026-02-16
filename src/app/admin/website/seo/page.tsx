'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { adminFetch } from '@/lib/utils/admin-fetch';
import { ContentBlockEditor } from '@/components/admin/content/content-block-editor';
import type { PageSeo } from '@/lib/supabase/types';
import {
  Search,
  FileText,
  ChevronDown,
  ChevronRight,
  Check,
  X,
  RotateCcw,
  Sparkles,
  Globe,
  Save,
  ExternalLink,
  Plus,
  Minus,
  Bot,
  Wand2,
  ArrowRight,
  CheckSquare,
  Square,
  AlertCircle,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// AI SEO Result Type (mirrors server-side)
// ---------------------------------------------------------------------------

interface AiSeoResult {
  seo_title: string;
  meta_description: string;
  meta_keywords: string;
  focus_keyword: string;
  og_title: string;
  og_description: string;
  suggestions: string[];
}

interface AiPageResult {
  pagePath: string;
  generated: AiSeoResult;
  current: {
    seo_title: string | null;
    meta_description: string | null;
    meta_keywords: string | null;
    focus_keyword: string | null;
    og_title: string | null;
    og_description: string | null;
  };
  status: 'success' | 'error';
  error?: string;
  selected?: boolean;
  edited?: AiSeoResult; // admin-edited version
}

// ---------------------------------------------------------------------------
// SEO Score Calculation
// ---------------------------------------------------------------------------

function calculateSeoScore(page: PageSeo): number {
  let score = 0;

  // Title length 50-60: +20pts
  const titleLen = (page.seo_title ?? '').length;
  if (titleLen >= 50 && titleLen <= 60) score += 20;
  else if (titleLen > 0 && titleLen < 70) score += 10;

  // Description length 150-160: +20pts
  const descLen = (page.meta_description ?? '').length;
  if (descLen >= 150 && descLen <= 160) score += 20;
  else if (descLen > 0 && descLen < 200) score += 10;

  const fk = (page.focus_keyword ?? '').toLowerCase().trim();
  if (fk) {
    // Focus keyword in title: +20pts
    if ((page.seo_title ?? '').toLowerCase().includes(fk)) score += 20;

    // Focus keyword in description: +15pts
    if ((page.meta_description ?? '').toLowerCase().includes(fk)) score += 15;

    // Focus keyword in URL: +10pts
    if (page.page_path.toLowerCase().includes(fk.replace(/\s+/g, '-'))) score += 10;
  }

  // Has OG image: +10pts
  if (page.og_image_url) score += 10;

  // Has internal links: +5pts
  if (page.internal_links && page.internal_links.length > 0) score += 5;

  return score;
}

function getScoreVariant(score: number): 'success' | 'warning' | 'destructive' {
  if (score >= 80) return 'success';
  if (score >= 50) return 'warning';
  return 'destructive';
}

function getScoreLabel(score: number): string {
  if (score >= 80) return 'Good';
  if (score >= 50) return 'Needs Work';
  return 'Poor';
}

// ---------------------------------------------------------------------------
// Page Type Labels
// ---------------------------------------------------------------------------

const PAGE_TYPE_LABELS: Record<string, string> = {
  homepage: 'Homepage',
  service_category: 'Service Category',
  service_detail: 'Service Detail',
  product_category: 'Product Category',
  product_detail: 'Product Detail',
  gallery: 'Gallery',
  booking: 'Booking',
  city_landing: 'City Landing',
  custom: 'Custom',
};

const PAGE_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'All Types' },
  ...Object.entries(PAGE_TYPE_LABELS).map(([value, label]) => ({ value, label })),
];

const SCORE_FILTER_OPTIONS = [
  { value: '', label: 'All Scores' },
  { value: 'good', label: 'Good (80+)' },
  { value: 'needs-work', label: 'Needs Work (50-79)' },
  { value: 'poor', label: 'Poor (0-49)' },
];

const KEYWORD_FILTER_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'has', label: 'Has Focus Keyword' },
  { value: 'missing', label: 'Missing Focus Keyword' },
];

const ROBOTS_OPTIONS = [
  'index,follow',
  'noindex,nofollow',
  'noindex,follow',
  'index,nofollow',
];

// ---------------------------------------------------------------------------
// Character Count Badge
// ---------------------------------------------------------------------------

function CharCount({ length, min, max }: { length: number; min: number; max: number }) {
  const isGood = length >= min && length <= max;
  const isOver = length > max;
  return (
    <span
      className={`text-xs font-medium ${
        isGood
          ? 'text-green-600'
          : isOver
            ? 'text-red-500'
            : length > 0
              ? 'text-amber-500'
              : 'text-gray-400'
      }`}
    >
      {length}/{max}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Focus Keyword Check
// ---------------------------------------------------------------------------

function KeywordCheck({ present, label }: { present: boolean; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      {present ? (
        <Check className="h-3.5 w-3.5 text-green-500" />
      ) : (
        <X className="h-3.5 w-3.5 text-red-400" />
      )}
      <span className={present ? 'text-green-700' : 'text-gray-500'}>{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SERP Preview
// ---------------------------------------------------------------------------

function SerpPreview({
  title,
  url,
  description,
}: {
  title: string;
  url: string;
  description: string;
}) {
  const displayUrl = `smartdetailsautospa.com${url}`;
  return (
    <div className="rounded-md border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
        Google SERP Preview
      </p>
      <div className="space-y-0.5">
        <p className="text-lg text-blue-700 dark:text-blue-400 leading-tight truncate cursor-pointer hover:underline">
          {title || 'Page Title'}
        </p>
        <p className="text-sm text-green-700 dark:text-green-400">{displayUrl}</p>
        <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
          {description || 'Meta description will appear here...'}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Internal Links Editor
// ---------------------------------------------------------------------------

function InternalLinksEditor({
  links,
  onChange,
}: {
  links: Array<{ text: string; url: string }>;
  onChange: (links: Array<{ text: string; url: string }>) => void;
}) {
  const addLink = () => {
    onChange([...links, { text: '', url: '' }]);
  };

  const removeLink = (idx: number) => {
    onChange(links.filter((_, i) => i !== idx));
  };

  const updateLink = (idx: number, field: 'text' | 'url', value: string) => {
    const updated = links.map((l, i) => (i === idx ? { ...l, [field]: value } : l));
    onChange(updated);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Internal Links
        </label>
        <button
          type="button"
          onClick={addLink}
          className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
        >
          <Plus className="h-3 w-3" />
          Add Link
        </button>
      </div>
      {links.length === 0 && (
        <p className="text-xs text-gray-400 italic">No internal links configured</p>
      )}
      {links.map((link, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Link text"
            value={link.text}
            onChange={(e) => updateLink(idx, 'text', e.target.value)}
            className="flex-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
          />
          <input
            type="text"
            placeholder="/path/to/page"
            value={link.url}
            onChange={(e) => updateLink(idx, 'url', e.target.value)}
            className="flex-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
          />
          <button
            type="button"
            onClick={() => removeLink(idx)}
            className="p-1 text-gray-400 hover:text-red-500"
          >
            <Minus className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline Page Editor
// ---------------------------------------------------------------------------

function PageEditor({
  page,
  onSave,
  onCancel,
}: {
  page: PageSeo;
  onSave: (updates: Partial<PageSeo>) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    seo_title: page.seo_title ?? '',
    meta_description: page.meta_description ?? '',
    meta_keywords: page.meta_keywords ?? '',
    focus_keyword: page.focus_keyword ?? '',
    canonical_url: page.canonical_url ?? '',
    robots_directive: page.robots_directive ?? 'index,follow',
    og_title: page.og_title ?? '',
    og_description: page.og_description ?? '',
    og_image_url: page.og_image_url ?? '',
    internal_links: (page.internal_links ?? []) as Array<{ text: string; url: string }>,
  });
  const [saving, setSaving] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [aiModified, setAiModified] = useState(false);

  // Store original values for revert
  const [originalForm] = useState({ ...form });

  const handleAiOptimize = async () => {
    setAiGenerating(true);
    try {
      const res = await adminFetch('/api/admin/cms/seo/ai-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'single', pagePath: page.page_path }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'AI generation failed');
      }
      const { data } = await res.json();
      const gen = data.generated as AiSeoResult;
      setForm((prev) => ({
        ...prev,
        seo_title: gen.seo_title || prev.seo_title,
        meta_description: gen.meta_description || prev.meta_description,
        meta_keywords: gen.meta_keywords || prev.meta_keywords,
        focus_keyword: gen.focus_keyword || prev.focus_keyword,
        og_title: gen.og_title || prev.og_title,
        og_description: gen.og_description || prev.og_description,
      }));
      setAiSuggestions(gen.suggestions || []);
      setAiModified(true);
      toast.success('AI optimization applied — review and save');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'AI generation failed');
    } finally {
      setAiGenerating(false);
    }
  };

  const handleRevert = () => {
    setForm((prev) => ({
      ...prev,
      seo_title: originalForm.seo_title,
      meta_description: originalForm.meta_description,
      meta_keywords: originalForm.meta_keywords,
      focus_keyword: originalForm.focus_keyword,
      og_title: originalForm.og_title,
      og_description: originalForm.og_description,
    }));
    setAiModified(false);
    setAiSuggestions([]);
  };

  const fk = form.focus_keyword.toLowerCase().trim();
  const fkInTitle = fk ? form.seo_title.toLowerCase().includes(fk) : false;
  const fkInDesc = fk ? form.meta_description.toLowerCase().includes(fk) : false;
  const fkInUrl = fk ? page.page_path.toLowerCase().includes(fk.replace(/\s+/g, '-')) : false;

  // Live SEO score
  const liveScore = useMemo(() => {
    let s = 0;
    const tLen = form.seo_title.length;
    if (tLen >= 50 && tLen <= 60) s += 20;
    else if (tLen > 0 && tLen < 70) s += 10;

    const dLen = form.meta_description.length;
    if (dLen >= 150 && dLen <= 160) s += 20;
    else if (dLen > 0 && dLen < 200) s += 10;

    if (fk) {
      if (fkInTitle) s += 20;
      if (fkInDesc) s += 15;
      if (fkInUrl) s += 10;
    }
    if (form.og_image_url) s += 10;
    if (form.internal_links.length > 0) s += 5;
    return s;
  }, [form, fk, fkInTitle, fkInDesc, fkInUrl]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        seo_title: form.seo_title || null,
        meta_description: form.meta_description || null,
        meta_keywords: form.meta_keywords || null,
        focus_keyword: form.focus_keyword || null,
        canonical_url: form.canonical_url || null,
        robots_directive: form.robots_directive,
        og_title: form.og_title || null,
        og_description: form.og_description || null,
        og_image_url: form.og_image_url || null,
        internal_links: form.internal_links.length > 0 ? form.internal_links : null,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-5 space-y-5">
      {/* Live Score + AI Optimize */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            SEO Score:
          </span>
          <Badge variant={getScoreVariant(liveScore)}>
            {liveScore}/100 — {getScoreLabel(liveScore)}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {aiModified && (
            <Button variant="outline" size="sm" onClick={handleRevert}>
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Revert
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleAiOptimize}
            disabled={aiGenerating}
          >
            {aiGenerating ? (
              <Spinner size="sm" className="mr-1.5" />
            ) : (
              <Wand2 className="mr-1.5 h-3.5 w-3.5" />
            )}
            AI Optimize
          </Button>
        </div>
      </div>

      {/* AI Modified Banner */}
      {aiModified && (
        <div className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20 px-4 py-2.5 text-sm text-amber-800 dark:text-amber-200">
          Fields updated by AI — review changes and click Save to apply.
        </div>
      )}

      {/* AI Suggestions */}
      {aiSuggestions.length > 0 && (
        <div className="rounded-md border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20 p-4">
          <p className="text-xs font-semibold text-blue-800 dark:text-blue-200 uppercase tracking-wider mb-2">
            AI Recommendations
          </p>
          <ul className="space-y-1">
            {aiSuggestions.map((suggestion, i) => (
              <li key={i} className="text-sm text-blue-700 dark:text-blue-300 flex items-start gap-2">
                <ArrowRight className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                {suggestion}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* SEO Title */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            SEO Title
          </label>
          <CharCount length={form.seo_title.length} min={50} max={60} />
        </div>
        <input
          type="text"
          value={form.seo_title}
          onChange={(e) => setForm((prev) => ({ ...prev, seo_title: e.target.value }))}
          placeholder="Enter an SEO title (50-60 characters ideal)"
          className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
        />
      </div>

      {/* SERP Preview */}
      <SerpPreview
        title={form.seo_title || page.seo_title || 'Page Title'}
        url={page.page_path}
        description={form.meta_description || page.meta_description || ''}
      />

      {/* Meta Description */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Meta Description
          </label>
          <CharCount length={form.meta_description.length} min={150} max={160} />
        </div>
        <textarea
          value={form.meta_description}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, meta_description: e.target.value }))
          }
          placeholder="Enter a meta description (150-160 characters ideal)"
          rows={3}
          className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
        />
      </div>

      {/* Focus Keyword */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Focus Keyword
        </label>
        <input
          type="text"
          value={form.focus_keyword}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, focus_keyword: e.target.value }))
          }
          placeholder="Enter a focus keyword"
          className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
        />
        {fk && (
          <div className="mt-2 flex flex-wrap gap-3">
            <KeywordCheck present={fkInTitle} label="In title" />
            <KeywordCheck present={fkInDesc} label="In description" />
            <KeywordCheck present={fkInUrl} label="In URL" />
          </div>
        )}
      </div>

      {/* Meta Keywords */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Meta Keywords
        </label>
        <input
          type="text"
          value={form.meta_keywords}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, meta_keywords: e.target.value }))
          }
          placeholder="keyword1, keyword2, keyword3"
          className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
        />
      </div>

      {/* Two-column grid for smaller fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Canonical URL */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Canonical URL
          </label>
          <input
            type="text"
            value={form.canonical_url}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, canonical_url: e.target.value }))
            }
            placeholder="https://smartdetailsautospa.com/..."
            className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
          />
        </div>

        {/* Robots Directive */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Robots Directive
          </label>
          <select
            value={form.robots_directive}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, robots_directive: e.target.value }))
            }
            className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
          >
            {ROBOTS_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* OpenGraph */}
      <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
        <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
          Open Graph
        </h4>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              OG Title (falls back to SEO title)
            </label>
            <input
              type="text"
              value={form.og_title}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, og_title: e.target.value }))
              }
              placeholder={form.seo_title || 'Same as SEO title'}
              className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              OG Description (falls back to meta description)
            </label>
            <textarea
              value={form.og_description}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, og_description: e.target.value }))
              }
              placeholder={form.meta_description || 'Same as meta description'}
              rows={2}
              className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              OG Image URL
            </label>
            <input
              type="text"
              value={form.og_image_url}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, og_image_url: e.target.value }))
              }
              placeholder="https://..."
              className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
            />
          </div>
        </div>
      </div>

      {/* Internal Links */}
      <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
        <InternalLinksEditor
          links={form.internal_links}
          onChange={(links) => setForm((prev) => ({ ...prev, internal_links: links }))}
        />
      </div>

      {/* Page Content Blocks */}
      <PageContentSection pagePath={page.page_path} pageType={page.page_type ?? 'custom'} />

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 border-t border-gray-200 dark:border-gray-700 pt-4">
        <Button variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? <Spinner size="sm" className="mr-2" /> : <Save className="mr-2 h-4 w-4" />}
          Save Changes
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page Content Section — collapsible content blocks editor within PageEditor
// ---------------------------------------------------------------------------

function PageContentSection({ pagePath, pageType }: { pagePath: string; pageType: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 mb-3"
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
        Page Content Blocks
      </button>
      {expanded && (
        <ContentBlockEditor
          pagePath={pagePath}
          pageType={pageType}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ai.txt Tab
// ---------------------------------------------------------------------------

function AiTxtTab() {
  const [content, setContent] = useState('');
  const [defaultContent, setDefaultContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await adminFetch('/api/admin/cms/seo/ai-txt');
      if (!res.ok) throw new Error('Failed');
      const { data } = await res.json();
      setContent(data.content);
      setDefaultContent(data.default_content);
    } catch {
      toast.error('Failed to load ai.txt');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await adminFetch('/api/admin/cms/seo/ai-txt', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error('Failed');
      toast.success('ai.txt saved');
    } catch {
      toast.error('Failed to save ai.txt');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              ai.txt Content
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Controls how AI crawlers access your site. Served at /ai.txt
            </p>
          </div>
          <a
            href="/ai.txt"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
          >
            View live
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={18}
          className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-mono dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
        />
        <div className="flex items-center justify-end gap-3 mt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setContent(defaultContent);
              toast.info('Reset to default content. Click Save to apply.');
            }}
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Reset to Default
          </Button>
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? <Spinner size="sm" className="mr-2" /> : <Save className="mr-2 h-4 w-4" />}
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AI Review Modal — shows side-by-side diff for global/batch AI generation
// ---------------------------------------------------------------------------

function AiReviewModal({
  results,
  generating,
  onApply,
  onClose,
}: {
  results: AiPageResult[];
  generating: boolean;
  onApply: (selected: AiPageResult[]) => Promise<void>;
  onClose: () => void;
}) {
  const [items, setItems] = useState<AiPageResult[]>(
    results.map((r) => ({ ...r, selected: r.status === 'success', edited: { ...r.generated } }))
  );
  const [applying, setApplying] = useState(false);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  // Sync new results as they arrive during global generation
  useEffect(() => {
    setItems(
      results.map((r, i) => {
        const existing = items[i];
        if (existing && existing.pagePath === r.pagePath) return existing;
        return { ...r, selected: r.status === 'success', edited: { ...r.generated } };
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results.length]);

  const selectedCount = items.filter((i) => i.selected && i.status === 'success').length;
  const successCount = items.filter((i) => i.status === 'success').length;

  const toggleAll = (checked: boolean) => {
    setItems((prev) =>
      prev.map((i) => (i.status === 'success' ? { ...i, selected: checked } : i))
    );
  };

  const toggleItem = (idx: number) => {
    setItems((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, selected: !item.selected } : item))
    );
  };

  const updateEdited = (idx: number, field: keyof AiSeoResult, value: string) => {
    setItems((prev) =>
      prev.map((item, i) =>
        i === idx && item.edited
          ? { ...item, edited: { ...item.edited, [field]: value } as AiSeoResult }
          : item
      )
    );
  };

  const handleApply = async () => {
    const selected = items.filter((i) => i.selected && i.status === 'success');
    if (selected.length === 0) return;
    setApplying(true);
    try {
      await onApply(selected);
    } finally {
      setApplying(false);
    }
  };

  const SEO_FIELDS: Array<{ key: keyof AiSeoResult; label: string }> = [
    { key: 'seo_title', label: 'SEO Title' },
    { key: 'meta_description', label: 'Meta Description' },
    { key: 'meta_keywords', label: 'Keywords' },
    { key: 'focus_keyword', label: 'Focus Keyword' },
    { key: 'og_title', label: 'OG Title' },
    { key: 'og_description', label: 'OG Description' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 flex max-h-[90vh] w-full max-w-5xl flex-col rounded-xl bg-white shadow-2xl dark:bg-gray-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              AI SEO Review
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {generating
                ? `Generating... ${successCount} of ${items.length} complete`
                : `${successCount} pages generated — ${selectedCount} selected`}
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Progress bar during generation */}
        {generating && (
          <div className="h-1 bg-gray-100 dark:bg-gray-800">
            <div
              className="h-1 bg-blue-500 transition-all duration-500"
              style={{
                width: items.length > 0 ? `${(successCount / items.length) * 100}%` : '0%',
              }}
            />
          </div>
        )}

        {/* Select all / none */}
        <div className="flex items-center gap-4 border-b border-gray-200 dark:border-gray-700 px-6 py-2.5">
          <button
            type="button"
            onClick={() => toggleAll(true)}
            className="text-xs font-medium text-blue-600 hover:text-blue-800"
          >
            Select All
          </button>
          <button
            type="button"
            onClick={() => toggleAll(false)}
            className="text-xs font-medium text-blue-600 hover:text-blue-800"
          >
            Select None
          </button>
          <span className="text-xs text-gray-400">
            {selectedCount} of {successCount} selected
          </span>
        </div>

        {/* Results list */}
        <div className="flex-1 overflow-y-auto px-6 py-3">
          {items.length === 0 && generating && (
            <div className="flex h-40 items-center justify-center">
              <Spinner size="lg" />
            </div>
          )}
          <div className="space-y-2">
            {items.map((item, idx) => {
              const isExpanded = expandedIdx === idx;
              return (
                <div
                  key={item.pagePath}
                  className={`rounded-lg border ${
                    item.status === 'error'
                      ? 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20'
                      : item.selected
                        ? 'border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-900/10'
                        : 'border-gray-200 dark:border-gray-700'
                  }`}
                >
                  {/* Row header */}
                  <div
                    className="flex items-center gap-3 px-4 py-3 cursor-pointer"
                    onClick={() => setExpandedIdx(isExpanded ? null : idx)}
                  >
                    {/* Checkbox */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (item.status === 'success') toggleItem(idx);
                      }}
                      disabled={item.status === 'error'}
                      className="flex-shrink-0"
                    >
                      {item.selected && item.status === 'success' ? (
                        <CheckSquare className="h-5 w-5 text-blue-600" />
                      ) : (
                        <Square className="h-5 w-5 text-gray-300 dark:text-gray-600" />
                      )}
                    </button>

                    {/* Path + status */}
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate block">
                        {item.pagePath}
                      </span>
                      {item.status === 'success' && item.edited && (
                        <span className="text-xs text-gray-500 truncate block">
                          {item.edited.seo_title}
                        </span>
                      )}
                    </div>

                    {/* Status badge */}
                    {item.status === 'error' && (
                      <div className="flex items-center gap-1 text-xs text-red-600">
                        <AlertCircle className="h-3.5 w-3.5" />
                        {item.error || 'Failed'}
                      </div>
                    )}

                    {/* Expand chevron */}
                    {item.status === 'success' && (
                      isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-gray-400" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-gray-400" />
                      )
                    )}
                  </div>

                  {/* Expanded detail with side-by-side diff */}
                  {isExpanded && item.status === 'success' && item.edited && (
                    <div className="border-t border-gray-200 dark:border-gray-700 px-4 py-4 space-y-3">
                      {SEO_FIELDS.map(({ key, label }) => {
                        if (key === 'suggestions') return null;
                        const currentVal =
                          item.current[key as keyof typeof item.current] ?? '';
                        const editedVal = item.edited?.[key] ?? '';
                        const changed = currentVal !== editedVal;
                        return (
                          <div key={key}>
                            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                              {label}
                              {changed && (
                                <span className="ml-2 text-amber-600 normal-case tracking-normal">
                                  changed
                                </span>
                              )}
                            </label>
                            <div className="mt-1 grid grid-cols-1 md:grid-cols-2 gap-2">
                              {/* Current */}
                              <div className="rounded-md bg-gray-100 dark:bg-gray-800 px-3 py-2 text-sm text-gray-600 dark:text-gray-400">
                                <span className="text-[10px] font-medium uppercase tracking-wider text-gray-400 block mb-0.5">
                                  Current
                                </span>
                                {currentVal || (
                                  <span className="italic text-gray-300 dark:text-gray-600">
                                    Empty
                                  </span>
                                )}
                              </div>
                              {/* Generated (editable) */}
                              <div>
                                <span className="text-[10px] font-medium uppercase tracking-wider text-blue-500 block mb-0.5">
                                  AI Generated
                                </span>
                                {key === 'meta_description' || key === 'og_description' ? (
                                  <textarea
                                    value={editedVal as string}
                                    onChange={(e) => updateEdited(idx, key, e.target.value)}
                                    rows={2}
                                    className="block w-full rounded-md border border-blue-200 bg-white px-3 py-2 text-sm dark:border-blue-800 dark:bg-gray-800 dark:text-gray-200"
                                  />
                                ) : (
                                  <input
                                    type="text"
                                    value={editedVal as string}
                                    onChange={(e) => updateEdited(idx, key, e.target.value)}
                                    className="block w-full rounded-md border border-blue-200 bg-white px-3 py-2 text-sm dark:border-blue-800 dark:bg-gray-800 dark:text-gray-200"
                                  />
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      {/* Suggestions */}
                      {item.generated.suggestions?.length > 0 && (
                        <div className="rounded-md bg-blue-50 dark:bg-blue-900/20 p-3">
                          <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-1">
                            AI Recommendations
                          </p>
                          <ul className="space-y-0.5">
                            {item.generated.suggestions.map((s, si) => (
                              <li key={si} className="text-xs text-blue-600 dark:text-blue-400 flex items-start gap-1.5">
                                <ArrowRight className="h-3 w-3 mt-0.5 flex-shrink-0" />
                                {s}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between border-t border-gray-200 dark:border-gray-700 px-6 py-4">
          <Button variant="outline" onClick={onClose} disabled={applying}>
            Cancel
          </Button>
          <div className="flex items-center gap-3">
            <Button
              onClick={handleApply}
              disabled={selectedCount === 0 || applying || generating}
            >
              {applying ? (
                <Spinner size="sm" className="mr-2" />
              ) : (
                <Check className="mr-2 h-4 w-4" />
              )}
              Apply {selectedCount} Page{selectedCount !== 1 ? 's' : ''}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main SEO Dashboard
// ---------------------------------------------------------------------------

export default function SeoDashboardPage() {
  const [pages, setPages] = useState<PageSeo[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoPopulating, setAutoPopulating] = useState(false);
  const [expandedPath, setExpandedPath] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'ai-txt'>('overview');

  // AI global generation state
  const [showAiReviewModal, setShowAiReviewModal] = useState(false);
  const [aiResults, setAiResults] = useState<AiPageResult[]>([]);
  const [aiGeneratingGlobal, setAiGeneratingGlobal] = useState(false);
  const [showAiConfirmDialog, setShowAiConfirmDialog] = useState(false);
  const [aiOverwriteExisting, setAiOverwriteExisting] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPageType, setFilterPageType] = useState('');
  const [filterScore, setFilterScore] = useState('');
  const [filterKeyword, setFilterKeyword] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await adminFetch('/api/admin/cms/seo/pages');
      if (!res.ok) throw new Error('Failed');
      const { data } = await res.json();
      setPages(data ?? []);
    } catch {
      toast.error('Failed to load SEO data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Computed stats
  const stats = useMemo(() => {
    const total = pages.length;
    const withCustom = pages.filter((p) => !p.is_auto_generated).length;
    const missingKeyword = pages.filter(
      (p) => !p.focus_keyword || p.focus_keyword.trim() === ''
    ).length;
    const scores = pages.map(calculateSeoScore);
    const avgScore =
      scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    return { total, withCustom, missingKeyword, avgScore };
  }, [pages]);

  // Filtered pages
  const filteredPages = useMemo(() => {
    let result = pages;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (p) =>
          p.page_path.toLowerCase().includes(q) ||
          (p.seo_title ?? '').toLowerCase().includes(q)
      );
    }

    if (filterPageType) {
      result = result.filter((p) => p.page_type === filterPageType);
    }

    if (filterScore) {
      result = result.filter((p) => {
        const score = calculateSeoScore(p);
        if (filterScore === 'good') return score >= 80;
        if (filterScore === 'needs-work') return score >= 50 && score < 80;
        if (filterScore === 'poor') return score < 50;
        return true;
      });
    }

    if (filterKeyword === 'has') {
      result = result.filter((p) => p.focus_keyword && p.focus_keyword.trim() !== '');
    } else if (filterKeyword === 'missing') {
      result = result.filter((p) => !p.focus_keyword || p.focus_keyword.trim() === '');
    }

    return result;
  }, [pages, searchQuery, filterPageType, filterScore, filterKeyword]);

  const autoPopulate = async () => {
    setAutoPopulating(true);
    try {
      const res = await adminFetch('/api/admin/cms/seo/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error('Failed');
      const { data, message } = await res.json();
      toast.success(message || `Created ${data?.length ?? 0} entries`);
      await load();
    } catch {
      toast.error('Failed to auto-populate');
    } finally {
      setAutoPopulating(false);
    }
  };

  // AI Generate All — opens confirmation then generates
  const handleAiGenerateAll = async () => {
    setShowAiConfirmDialog(false);
    setAiGeneratingGlobal(true);
    setAiResults([]);
    setShowAiReviewModal(true);

    try {
      const res = await adminFetch('/api/admin/cms/seo/ai-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'global',
          overwriteExisting: aiOverwriteExisting,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'AI generation failed');
      }
      const { data } = await res.json();
      const mappedResults: AiPageResult[] = (data.results || []).map((r: AiPageResult) => ({
        ...r,
        selected: r.status === 'success',
        edited: r.status === 'success' ? { ...r.generated } : undefined,
      }));
      setAiResults(mappedResults);
      if (data.errors?.length > 0) {
        toast.warning(`${data.errors.length} page${data.errors.length !== 1 ? 's' : ''} failed`);
      } else {
        toast.success(`AI generated SEO for ${mappedResults.filter((r: AiPageResult) => r.status === 'success').length} pages`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'AI generation failed');
      setShowAiReviewModal(false);
    } finally {
      setAiGeneratingGlobal(false);
    }
  };

  // Apply selected AI results
  const handleAiApply = async (selected: AiPageResult[]) => {
    const payload = selected.map((item) => ({
      pagePath: item.pagePath,
      seo_title: item.edited?.seo_title ?? item.generated.seo_title,
      meta_description: item.edited?.meta_description ?? item.generated.meta_description,
      meta_keywords: item.edited?.meta_keywords ?? item.generated.meta_keywords,
      focus_keyword: item.edited?.focus_keyword ?? item.generated.focus_keyword,
      og_title: item.edited?.og_title ?? item.generated.og_title,
      og_description: item.edited?.og_description ?? item.generated.og_description,
    }));

    try {
      const res = await adminFetch('/api/admin/cms/seo/ai-apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pages: payload }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to apply');
      }
      const { message } = await res.json();
      toast.success(message || `Applied SEO to ${selected.length} pages`);
      setShowAiReviewModal(false);
      setAiResults([]);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to apply AI SEO');
    }
  };

  const savePage = async (pagePath: string, updates: Partial<PageSeo>) => {
    const encoded = encodeURIComponent(pagePath);
    try {
      const res = await adminFetch(`/api/admin/cms/seo/pages/${encoded}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed');
      }
      const { data } = await res.json();
      setPages((prev) =>
        prev.map((p) => (p.page_path === pagePath ? { ...p, ...data } : p))
      );
      setExpandedPath(null);
      toast.success('SEO settings saved');
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to save'
      );
    }
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
        title="SEO Management"
        description="Manage per-page SEO settings, meta tags, and AI crawler access"
        action={
          activeTab === 'overview' ? (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => setShowAiConfirmDialog(true)}
                disabled={aiGeneratingGlobal}
              >
                {aiGeneratingGlobal ? (
                  <Spinner size="sm" className="mr-2" />
                ) : (
                  <Bot className="mr-2 h-4 w-4" />
                )}
                AI Generate All
              </Button>
              <Button onClick={autoPopulate} disabled={autoPopulating}>
                {autoPopulating ? (
                  <Spinner size="sm" className="mr-2" />
                ) : (
                  <Sparkles className="mr-2 h-4 w-4" />
                )}
                Auto-Populate Missing
              </Button>
            </div>
          ) : undefined
        }
      />

      {/* Tab Bar */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="-mb-px flex gap-6">
          {[
            { key: 'overview' as const, label: 'Overview', icon: Globe },
            { key: 'ai-txt' as const, label: 'ai.txt', icon: FileText },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              className={`inline-flex items-center gap-2 border-b-2 px-1 pb-3 text-sm font-medium transition-colors ${
                activeTab === key
                  ? 'border-gray-900 text-gray-900 dark:border-white dark:text-white'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === 'ai-txt' && <AiTxtTab />}

      {activeTab === 'overview' && (
        <>
          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Total Pages" value={stats.total} />
            <StatCard label="Custom SEO" value={stats.withCustom} />
            <StatCard
              label="Missing Keyword"
              value={stats.missingKeyword}
              variant={stats.missingKeyword > 0 ? 'warning' : 'default'}
            />
            <StatCard
              label="Avg SEO Score"
              value={stats.avgScore}
              suffix="/100"
              variant={
                stats.avgScore >= 80
                  ? 'success'
                  : stats.avgScore >= 50
                    ? 'warning'
                    : 'destructive'
              }
            />
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search by path or title..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="block w-full rounded-md border border-gray-300 bg-white pl-9 pr-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
              />
            </div>
            <select
              value={filterPageType}
              onChange={(e) => setFilterPageType(e.target.value)}
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
            >
              {PAGE_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <select
              value={filterScore}
              onChange={(e) => setFilterScore(e.target.value)}
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
            >
              {SCORE_FILTER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <select
              value={filterKeyword}
              onChange={(e) => setFilterKeyword(e.target.value)}
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
            >
              {KEYWORD_FILTER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {(searchQuery || filterPageType || filterScore || filterKeyword) && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setFilterPageType('');
                  setFilterScore('');
                  setFilterKeyword('');
                }}
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                Clear filters
              </button>
            )}
          </div>

          {/* Results count */}
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Showing {filteredPages.length} of {pages.length} pages
          </p>

          {/* Pages Table */}
          {filteredPages.length === 0 ? (
            <div className="rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 p-12 text-center">
              <Globe className="mx-auto h-12 w-12 text-gray-400" />
              <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
                {pages.length === 0
                  ? 'No SEO entries yet. Click "Auto-Populate Missing" to get started.'
                  : 'No pages match your filters.'}
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
              {/* Table Header */}
              <div className="hidden md:grid grid-cols-[3fr_3fr_3fr_2fr_1fr_2fr] gap-2 px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                <span>Page Path</span>
                <span>SEO Title</span>
                <span>Meta Description</span>
                <span>Focus Keyword</span>
                <span>Score</span>
                <span>Last Updated</span>
              </div>

              {/* Table Rows */}
              {filteredPages.map((page) => {
                const score = calculateSeoScore(page);
                const isExpanded = expandedPath === page.page_path;
                return (
                  <div key={page.page_path}>
                    <div
                      className={`grid grid-cols-1 md:grid-cols-[3fr_3fr_3fr_2fr_1fr_2fr] gap-2 px-4 py-3 text-sm cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors border-b border-gray-100 dark:border-gray-700/50 ${
                        isExpanded ? 'bg-gray-50 dark:bg-gray-700/50' : ''
                      }`}
                      onClick={() =>
                        setExpandedPath(isExpanded ? null : page.page_path)
                      }
                    >
                      {/* Page Path */}
                      <div className="flex items-center gap-2 min-w-0">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 flex-shrink-0 text-gray-400" />
                        ) : (
                          <ChevronRight className="h-4 w-4 flex-shrink-0 text-gray-400" />
                        )}
                        <div className="truncate">
                          <span className="font-medium text-gray-900 dark:text-gray-100">
                            {page.page_path}
                          </span>
                          {page.page_type && (
                            <Badge variant="secondary" className="ml-2 text-[10px]">
                              {PAGE_TYPE_LABELS[page.page_type] ?? page.page_type}
                            </Badge>
                          )}
                        </div>
                      </div>

                      {/* SEO Title */}
                      <div className="truncate text-gray-600 dark:text-gray-400 md:block hidden">
                        {page.seo_title || (
                          <span className="italic text-gray-300 dark:text-gray-600">
                            Not set
                          </span>
                        )}
                      </div>

                      {/* Meta Description */}
                      <div className="truncate text-gray-600 dark:text-gray-400 md:block hidden">
                        {page.meta_description ? (
                          <span title={page.meta_description}>
                            {page.meta_description.length > 60
                              ? `${page.meta_description.substring(0, 60)}...`
                              : page.meta_description}
                          </span>
                        ) : (
                          <span className="italic text-gray-300 dark:text-gray-600">
                            Not set
                          </span>
                        )}
                      </div>

                      {/* Focus Keyword */}
                      <div className="md:block hidden">
                        {page.focus_keyword ? (
                          <span className="text-gray-700 dark:text-gray-300">
                            {page.focus_keyword}
                          </span>
                        ) : (
                          <span className="italic text-gray-300 dark:text-gray-600">
                            None
                          </span>
                        )}
                      </div>

                      {/* Score */}
                      <div className="md:block hidden">
                        <Badge variant={getScoreVariant(score)}>
                          {score}
                        </Badge>
                      </div>

                      {/* Last Updated */}
                      <div className="text-xs text-gray-500 dark:text-gray-400 md:block hidden">
                        {page.updated_at
                          ? new Date(page.updated_at).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })
                          : '--'}
                      </div>

                      {/* Mobile summary */}
                      <div className="flex items-center gap-2 md:hidden">
                        <Badge variant={getScoreVariant(score)}>{score}</Badge>
                        {page.focus_keyword && (
                          <span className="text-xs text-gray-500 truncate">
                            {page.focus_keyword}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Expanded Editor */}
                    {isExpanded && (
                      <PageEditor
                        page={page}
                        onSave={(updates) => savePage(page.page_path, updates)}
                        onCancel={() => setExpandedPath(null)}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* AI Confirm Dialog */}
      {showAiConfirmDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-md rounded-xl bg-white p-6 shadow-2xl dark:bg-gray-900">
            <div className="flex items-center gap-3 mb-4">
              <div className="rounded-full bg-blue-100 dark:bg-blue-900/30 p-2">
                <Bot className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                AI SEO Generation
              </h3>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Generate optimized SEO content for all pages using AI. You&apos;ll review and approve
              changes before they&apos;re applied.
            </p>
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 mb-6 cursor-pointer">
              <input
                type="checkbox"
                checked={aiOverwriteExisting}
                onChange={(e) => setAiOverwriteExisting(e.target.checked)}
                className="rounded border-gray-300"
              />
              Overwrite pages with existing custom SEO
            </label>
            <div className="flex items-center justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setShowAiConfirmDialog(false)}
              >
                Cancel
              </Button>
              <Button onClick={handleAiGenerateAll}>
                <Bot className="mr-2 h-4 w-4" />
                Generate
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* AI Review Modal */}
      {showAiReviewModal && (
        <AiReviewModal
          results={aiResults}
          generating={aiGeneratingGlobal}
          onApply={handleAiApply}
          onClose={() => {
            if (!aiGeneratingGlobal) {
              setShowAiReviewModal(false);
              setAiResults([]);
            }
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stat Card Component
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  suffix,
  variant = 'default',
}: {
  label: string;
  value: number;
  suffix?: string;
  variant?: 'default' | 'success' | 'warning' | 'destructive';
}) {
  const valueColor = {
    default: 'text-gray-900 dark:text-gray-100',
    success: 'text-green-600 dark:text-green-400',
    warning: 'text-amber-600 dark:text-amber-400',
    destructive: 'text-red-600 dark:text-red-400',
  }[variant];

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
        {label}
      </p>
      <p className={`mt-1 text-2xl font-bold ${valueColor}`}>
        {value}
        {suffix && <span className="text-sm font-normal text-gray-400 ml-0.5">{suffix}</span>}
      </p>
    </div>
  );
}
