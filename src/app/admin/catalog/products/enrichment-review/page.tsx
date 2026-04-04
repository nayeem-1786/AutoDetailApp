'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { adminFetch } from '@/lib/utils/admin-fetch';
import { formatCurrency } from '@/lib/utils/format';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { SearchInput } from '@/components/ui/search-input';
import { Spinner } from '@/components/ui/spinner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Check, X, ChevronDown, ChevronUp, ExternalLink, Sparkles } from 'lucide-react';

interface DraftWithProduct {
  id: string;
  product_id: string;
  short_description: string | null;
  specs: Record<string, unknown> | null;
  source_url: string | null;
  error_message: string | null;
  status: string;
  created_at: string;
  product: {
    name: string;
    description: string | null;
    specs: Record<string, unknown> | null;
    retail_price: number;
    image_url: string | null;
    vendor_name: string | null;
    category_name: string | null;
  };
}

const SPEC_LABELS: Record<string, string> = {
  overview: 'Full Description',
  use_case: 'Use Case',
  key_features: 'Key Features',
  application_method: 'Application Method',
  surface_compatibility: 'Surface Compatibility',
  size_volume: 'Size / Volume',
  dilution_ratio: 'Dilution Ratio',
  coverage_yield: 'Coverage / Yield',
  scent: 'Scent',
  pro_tips: 'Pro Tips',
};

export default function EnrichmentReviewPage() {
  const router = useRouter();
  const supabase = createClient();

  const [drafts, setDrafts] = useState<DraftWithProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('pending');

  // Editable state per draft
  const [editedDescriptions, setEditedDescriptions] = useState<Record<string, string>>({});
  const [editedSpecs, setEditedSpecs] = useState<Record<string, Record<string, unknown>>>({});

  useEffect(() => {
    loadDrafts();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadDrafts() {
    setLoading(true);
    const { data, error } = await supabase
      .from('product_enrichment_drafts')
      .select(`
        id, product_id, short_description, specs, source_url, error_message, status, created_at,
        products!inner ( name, description, specs, retail_price, image_url,
          vendors ( name ),
          product_categories ( name )
        )
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Failed to load drafts:', error);
      toast.error('Failed to load enrichment drafts');
      setLoading(false);
      return;
    }

    const mapped: DraftWithProduct[] = (data ?? []).map((d: Record<string, unknown>) => {
      const product = d.products as Record<string, unknown>;
      return {
        id: d.id as string,
        product_id: d.product_id as string,
        short_description: d.short_description as string | null,
        specs: d.specs as Record<string, unknown> | null,
        source_url: d.source_url as string | null,
        error_message: d.error_message as string | null,
        status: d.status as string,
        created_at: d.created_at as string,
        product: {
          name: product.name as string,
          description: product.description as string | null,
          specs: product.specs as Record<string, unknown> | null,
          retail_price: product.retail_price as number,
          image_url: product.image_url as string | null,
          vendor_name: (product.vendors as { name: string } | null)?.name ?? null,
          category_name: (product.product_categories as { name: string } | null)?.name ?? null,
        },
      };
    });

    setDrafts(mapped);
    setLoading(false);
  }

  // Filter drafts
  const filtered = drafts.filter((d) => {
    if (statusFilter && d.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!d.product.name.toLowerCase().includes(q) &&
          !(d.product.vendor_name ?? '').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const pendingCount = drafts.filter(d => d.status === 'pending').length;
  const appliedCount = drafts.filter(d => d.status === 'applied').length;
  const rejectedCount = drafts.filter(d => d.status === 'rejected').length;
  const errorCount = drafts.filter(d => d.error_message).length;

  async function handleApply(draftId: string) {
    setApplying(true);
    const editedDesc = editedDescriptions[draftId];
    const editedSpec = editedSpecs[draftId];

    const res = await adminFetch('/api/admin/cms/products/ai-enrich/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actions: [{
          draftId,
          action: 'apply',
          applyDescription: true,
          applySpecs: true,
          specOverrides: editedSpec,
          ...(editedDesc !== undefined ? { descriptionOverride: editedDesc } : {}),
        }],
      }),
    });

    if (res.ok) {
      setDrafts(prev => prev.map(d => d.id === draftId ? { ...d, status: 'applied' } : d));
      toast.success('Enrichment applied');
    } else {
      toast.error('Failed to apply enrichment');
    }
    setApplying(false);
  }

  async function handleReject(draftId: string) {
    const res = await adminFetch('/api/admin/cms/products/ai-enrich/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actions: [{ draftId, action: 'reject' }] }),
    });

    if (res.ok) {
      setDrafts(prev => prev.map(d => d.id === draftId ? { ...d, status: 'rejected' } : d));
      toast.success('Draft rejected');
    }
  }

  async function handleBulkApplyAll() {
    setApplying(true);
    const pendingDrafts = drafts.filter(d => d.status === 'pending' && !d.error_message);
    const actions = pendingDrafts.map(d => ({
      draftId: d.id,
      action: 'apply' as const,
      applyDescription: true,
      applySpecs: true,
      specOverrides: editedSpecs[d.id],
    }));

    const res = await adminFetch('/api/admin/cms/products/ai-enrich/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actions }),
    });

    if (res.ok) {
      const data = await res.json();
      setDrafts(prev => prev.map(d => {
        if (pendingDrafts.some(pd => pd.id === d.id)) return { ...d, status: 'applied' };
        return d;
      }));
      toast.success(`Applied ${data.applied} enrichments`);
    } else {
      toast.error('Bulk apply failed');
    }
    setApplying(false);
  }

  async function handleBulkRejectAll() {
    const pendingDrafts = drafts.filter(d => d.status === 'pending');
    const actions = pendingDrafts.map(d => ({ draftId: d.id, action: 'reject' as const }));

    const res = await adminFetch('/api/admin/cms/products/ai-enrich/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actions }),
    });

    if (res.ok) {
      setDrafts(prev => prev.map(d => {
        if (pendingDrafts.some(pd => pd.id === d.id)) return { ...d, status: 'rejected' };
        return d;
      }));
      toast.success('All pending drafts rejected');
    }
  }

  function renderSpecValue(value: unknown): string {
    if (Array.isArray(value)) return value.join(', ');
    if (typeof value === 'string') return value;
    return String(value ?? '');
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Enrichment Review"
        description={`${pendingCount} pending · ${appliedCount} applied · ${rejectedCount} rejected${errorCount > 0 ? ` · ${errorCount} errors` : ''}`}
        action={
          <Button variant="outline" onClick={() => router.push('/admin/catalog/products')}>
            Back to Products
          </Button>
        }
      />

      {/* Bulk actions + filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:flex-wrap">
        <SearchInput value={search} onChange={setSearch} placeholder="Search by name or vendor..." className="w-full sm:w-64" />
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-full sm:w-40">
          <option value="">All Statuses</option>
          <option value="pending">Pending ({pendingCount})</option>
          <option value="applied">Applied ({appliedCount})</option>
          <option value="rejected">Rejected ({rejectedCount})</option>
        </Select>
        {pendingCount > 0 && (
          <div className="flex gap-2 sm:ml-auto">
            <Button size="sm" onClick={handleBulkApplyAll} disabled={applying}>
              <Check className="h-4 w-4" />
              Apply All Pending ({pendingCount})
            </Button>
            <Button size="sm" variant="outline" onClick={handleBulkRejectAll} disabled={applying}>
              <X className="h-4 w-4" />
              Reject All
            </Button>
          </div>
        )}
      </div>

      {/* Draft list */}
      {filtered.length === 0 ? (
        <p className="text-center text-sm text-gray-500 py-8">No enrichment drafts found.</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((draft) => {
            const isExpanded = expandedId === draft.id;
            const statusBadge = draft.status === 'applied' ? 'success'
              : draft.status === 'rejected' ? 'destructive'
              : draft.error_message ? 'destructive'
              : 'warning';
            const statusLabel = draft.status === 'applied' ? 'Applied'
              : draft.status === 'rejected' ? 'Rejected'
              : draft.error_message ? 'Error'
              : 'Pending Review';

            return (
              <Card key={draft.id}>
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : draft.id)}
                  className="w-full text-left"
                >
                  <CardHeader className="py-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        {draft.product.image_url && (
                          <img src={draft.product.image_url} alt="" className="h-10 w-10 rounded object-cover flex-shrink-0" />
                        )}
                        <div className="min-w-0">
                          <CardTitle className="text-sm truncate">{draft.product.name}</CardTitle>
                          <p className="text-xs text-gray-500">
                            {draft.product.vendor_name ?? 'No vendor'} · {draft.product.category_name ?? 'No category'} · {formatCurrency(draft.product.retail_price)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Badge variant={statusBadge}>{statusLabel}</Badge>
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </div>
                    </div>
                  </CardHeader>
                </button>

                {isExpanded && (
                  <CardContent className="pt-0 space-y-4">
                    {draft.error_message && (
                      <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                        Error: {draft.error_message}
                      </div>
                    )}

                    {/* Source URL */}
                    {draft.source_url && (
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-gray-500">Source:</span>
                        <a href={draft.source_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline flex items-center gap-1">
                          {draft.source_url.replace(/^https?:\/\//, '').slice(0, 60)}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    )}

                    {/* Side-by-side: Short Description */}
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <p className="text-xs font-medium text-gray-500 mb-1">Current Short Description</p>
                        <p className="text-sm text-gray-700 bg-gray-50 rounded p-2 min-h-[40px]">
                          {draft.product.description || <span className="text-gray-400 italic">Empty</span>}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-blue-600 mb-1 flex items-center gap-1">
                          <Sparkles className="h-3 w-3" /> AI Short Description
                        </p>
                        {draft.status === 'pending' ? (
                          <Textarea
                            className="text-sm"
                            rows={2}
                            defaultValue={draft.short_description ?? ''}
                            onChange={(e) => setEditedDescriptions(prev => ({ ...prev, [draft.id]: e.target.value }))}
                          />
                        ) : (
                          <p className="text-sm text-gray-700 bg-blue-50 rounded p-2">{draft.short_description || 'None'}</p>
                        )}
                      </div>
                    </div>

                    {/* Side-by-side: Specs */}
                    {draft.specs && (
                      <div>
                        <p className="text-xs font-medium text-blue-600 mb-2 flex items-center gap-1">
                          <Sparkles className="h-3 w-3" /> AI Specs
                        </p>
                        <div className="grid gap-2">
                          {Object.entries(draft.specs).map(([key, value]) => {
                            if (!value || (Array.isArray(value) && value.length === 0)) return null;
                            const currentVal = draft.product.specs?.[key];
                            return (
                              <div key={key} className="grid gap-2 md:grid-cols-[150px_1fr_1fr] text-sm items-start">
                                <span className="font-medium text-gray-600 text-xs">{SPEC_LABELS[key] || key}</span>
                                <span className="text-gray-500 bg-gray-50 rounded px-2 py-1 text-xs">
                                  {currentVal ? renderSpecValue(currentVal) : <span className="text-gray-300 italic">Empty</span>}
                                </span>
                                <span className="text-gray-800 bg-blue-50 rounded px-2 py-1 text-xs">
                                  {renderSpecValue(value)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Actions */}
                    {draft.status === 'pending' && (
                      <div className="flex gap-2 pt-2 border-t">
                        <Button size="sm" onClick={() => handleApply(draft.id)} disabled={applying}>
                          <Check className="h-4 w-4" />
                          Apply
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleReject(draft.id)} disabled={applying}>
                          <X className="h-4 w-4" />
                          Reject
                        </Button>
                        <Link href={`/admin/catalog/products/${draft.product_id}`} className="ml-auto">
                          <Button size="sm" variant="ghost">Edit Product</Button>
                        </Link>
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
