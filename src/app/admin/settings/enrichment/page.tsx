'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { adminFetch } from '@/lib/utils/admin-fetch';
import { formatDate } from '@/lib/utils/format';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Sparkles, ArrowLeft, ExternalLink, RotateCcw } from 'lucide-react';

interface BatchRecord {
  id: string;
  status: string;
  total_requests: number;
  succeeded: number;
  errored: number;
  created_at: string;
  completed_at: string | null;
}

interface DraftCounts {
  pending: number;
  errors: number;
  applied: number;
  rejected: number;
  total: number;
}

export default function EnrichmentSettingsPage() {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [batch, setBatch] = useState<BatchRecord | null>(null);
  const [batchStatus, setBatchStatus] = useState<string | null>(null); // anthropic status during polling
  const [batchCounts, setBatchCounts] = useState<{ processing: number; succeeded: number; errored: number; total: number }>({ processing: 0, succeeded: 0, errored: 0, total: 0 });
  const [draftCounts, setDraftCounts] = useState<DraftCounts>({ pending: 0, errors: 0, applied: 0, rejected: 0, total: 0 });
  const [submitting, setSubmitting] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [retrySonnet, setRetrySonnet] = useState(false);
  const [enrichableCount, setEnrichableCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load draft counts
  async function loadDraftCounts() {
    const { data } = await supabase
      .from('product_enrichment_drafts')
      .select('status, error_message');

    if (data) {
      const drafts = data as Array<{ status: string; error_message: string | null }>;
      const pending = drafts.filter(d => d.status === 'pending' && !d.error_message).length;
      const errors = drafts.filter(d => d.status === 'pending' && d.error_message).length;
      const applied = drafts.filter(d => d.status === 'applied').length;
      const rejected = drafts.filter(d => d.status === 'rejected').length;
      setDraftCounts({ pending, errors, applied, rejected, total: drafts.length });
    }
  }

  // Poll batch status
  const startPolling = useCallback((batchId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);

    // Immediate first poll
    (async () => {
      try {
        const res = await adminFetch(`/api/admin/cms/products/ai-enrich/status?batchId=${batchId}`);
        if (!res.ok) return;
        const data = await res.json();
        setBatchStatus(data.anthropicStatus ?? data.status);
        setBatchCounts({
          processing: data.requestCounts?.processing ?? 0,
          succeeded: data.requestCounts?.succeeded ?? 0,
          errored: data.requestCounts?.errored ?? 0,
          total: data.totalRequests ?? 0,
        });
        if (data.anthropicStatus === 'ended' || data.status === 'completed') return;
      } catch { /* will retry on interval */ }
    })();

    pollRef.current = setInterval(async () => {
      try {
        const res = await adminFetch(`/api/admin/cms/products/ai-enrich/status?batchId=${batchId}`);
        if (!res.ok) return;
        const data = await res.json();
        setBatchStatus(data.anthropicStatus ?? data.status);
        setBatchCounts({
          processing: data.requestCounts?.processing ?? 0,
          succeeded: data.requestCounts?.succeeded ?? 0,
          errored: data.requestCounts?.errored ?? 0,
          total: data.totalRequests ?? 0,
        });

        if (data.anthropicStatus === 'ended' || data.status === 'completed') {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
        }
      } catch { /* silently retry */ }
    }, 30_000);
  }, []);

  useEffect(() => {
    async function init() {
      // Load most recent batch
      const { data: batchData } = await supabase
        .from('enrichment_batches')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (batchData) {
        setBatch(batchData as BatchRecord);
        if (batchData.status === 'submitted' || batchData.status === 'processing') {
          startPolling(batchData.id);
        }
      }

      // Load draft counts
      await loadDraftCounts();

      // Compute actual enrichable count (active products minus already-enriched)
      const [activeRes, enrichedRes] = await Promise.all([
        supabase.from('products').select('id', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('product_enrichment_drafts').select('product_id').in('status', ['applied', 'pending']),
      ]);
      const activeCount = activeRes.count ?? 0;
      const enrichedIds = new Set((enrichedRes.data ?? []).map((d: { product_id: string }) => d.product_id));
      setSkippedCount(enrichedIds.size);
      setEnrichableCount(activeCount - enrichedIds.size);

      setLoading(false);
    }

    init();

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Submit new batch
  async function handleSubmit() {
    setShowConfirm(false);
    setSubmitting(true);

    try {
      const res = await adminFetch('/api/admin/cms/products/ai-enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'all' }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Failed to submit batch');
        return;
      }

      if (data.totalProducts === 0) {
        toast.info(data.message || 'All products already enriched or pending review.');
        return;
      }

      const newBatch: BatchRecord = {
        id: data.batchId,
        status: 'submitted',
        total_requests: data.totalProducts,
        succeeded: 0,
        errored: 0,
        created_at: new Date().toISOString(),
        completed_at: null,
      };

      setBatch(newBatch);
      setBatchStatus('submitted');
      setBatchCounts({ processing: data.totalProducts, succeeded: 0, errored: 0, total: data.totalProducts });
      toast.success(`Batch submitted! ${data.totalProducts} products queued.${data.skipped ? ` ${data.skipped} skipped.` : ''}`);

      startPolling(data.batchId);
    } catch {
      toast.error('Failed to submit enrichment batch');
    } finally {
      setSubmitting(false);
    }
  }

  // Process results
  async function handleProcessResults() {
    if (!batch) return;
    setProcessing(true);

    try {
      const res = await adminFetch('/api/admin/cms/products/ai-enrich/results', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId: batch.id }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Failed to process results');
        return;
      }

      setBatch(prev => prev ? { ...prev, status: 'completed', succeeded: data.succeeded, errored: data.errored, completed_at: new Date().toISOString() } : null);
      setBatchStatus('completed');
      toast.success(`Results processed! ${data.succeeded} enriched, ${data.errored} errors.`);

      // Refresh draft counts
      await loadDraftCounts();
    } catch {
      toast.error('Failed to process enrichment results');
    } finally {
      setProcessing(false);
    }
  }

  // Retry errors with Sonnet
  async function handleRetrySonnet() {
    setRetrySonnet(true);

    try {
      // Fetch product IDs with error drafts
      const { data: errorDrafts } = await supabase
        .from('product_enrichment_drafts')
        .select('id, product_id')
        .eq('status', 'pending')
        .not('error_message', 'is', null);

      if (!errorDrafts || errorDrafts.length === 0) {
        toast.info('No error drafts to retry.');
        return;
      }

      const productIds = errorDrafts.map((d: { product_id: string }) => d.product_id);
      const draftIds = errorDrafts.map((d: { id: string }) => d.id);

      // Delete error drafts so they don't block the skip filter
      for (let i = 0; i < draftIds.length; i += 100) {
        const chunk = draftIds.slice(i, i + 100);
        await supabase
          .from('product_enrichment_drafts')
          .delete()
          .in('id', chunk);
      }

      // Submit batch with Sonnet model
      const res = await adminFetch('/api/admin/cms/products/ai-enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'selected', productIds, model: 'claude-sonnet-4-20250514' }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Failed to submit retry batch');
        return;
      }

      if (data.totalProducts === 0) {
        toast.info('No products to retry.');
        return;
      }

      const newBatch: BatchRecord = {
        id: data.batchId,
        status: 'submitted',
        total_requests: data.totalProducts,
        succeeded: 0,
        errored: 0,
        created_at: new Date().toISOString(),
        completed_at: null,
      };

      setBatch(newBatch);
      setBatchStatus('submitted');
      setBatchCounts({ processing: data.totalProducts, succeeded: 0, errored: 0, total: data.totalProducts });
      toast.success(`Retrying ${data.totalProducts} products with Sonnet model`);

      startPolling(data.batchId);
      await loadDraftCounts();
    } catch {
      toast.error('Failed to submit Sonnet retry batch');
    } finally {
      setRetrySonnet(false);
    }
  }

  const isActive = batch && (batch.status === 'submitted' || batch.status === 'processing') && batchStatus !== 'ended';
  const isEnded = batchStatus === 'ended' && batch?.status !== 'completed';
  const isCompleted = batch?.status === 'completed';

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Product Enrichment"
        description="Enrich product descriptions and specs using AI web research via Anthropic's Batch API."
        action={
          <Link href="/admin/settings">
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4" />
              Back to Settings
            </Button>
          </Link>
        }
      />

      {/* Section A: Batch Status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Batch Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!batch && (
            <p className="text-sm text-gray-500">No enrichment batches submitted yet.</p>
          )}

          {isActive && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-gray-700">
                  {batchStatus === 'submitted' && 'Batch submitted. Waiting for processing to start...'}
                  {(batchStatus === 'processing' || batchStatus === 'in_progress') && `Enrichment in progress... ${batchCounts.succeeded + batchCounts.errored}/${batchCounts.total} complete`}
                </span>
              </div>
              {batchCounts.total > 0 && (
                <div className="h-2 w-full rounded-full bg-gray-200 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-blue-500 transition-all duration-300"
                    style={{ width: `${Math.round(((batchCounts.succeeded + batchCounts.errored) / batchCounts.total) * 100)}%` }}
                  />
                </div>
              )}
              <p className="text-xs text-gray-500">Polling every 30 seconds. You can close this page and come back later.</p>
            </div>
          )}

          {isEnded && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-green-700">
                  Batch complete! {batchCounts.succeeded + batchCounts.errored}/{batchCounts.total} processed.
                </span>
                <Button onClick={handleProcessResults} disabled={processing}>
                  {processing ? <><Spinner className="h-4 w-4" /> Processing...</> : 'Process Results'}
                </Button>
              </div>
            </div>
          )}

          {isCompleted && (
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-700">
                <span className="font-medium">Last batch completed</span>
                {batch.completed_at && <span className="text-gray-500"> on {formatDate(batch.completed_at)}</span>}
                <span className="text-gray-500"> — {batch.succeeded} succeeded, {batch.errored} errors</span>
              </div>
              <Badge variant="success">Completed</Badge>
            </div>
          )}

          {batch && (batch.status === 'failed' || batch.status === 'canceled') && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-700">
                Batch {batch.status}{batch.completed_at && ` on ${formatDate(batch.completed_at)}`}
              </span>
              <Badge variant="destructive">{batch.status === 'failed' ? 'Failed' : 'Canceled'}</Badge>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section B: Submit New Batch */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Submit New Batch</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-500">
            Submit all active products for AI enrichment. The system uses Anthropic&apos;s Batch API with
            web search to research each product on vendor websites and extract descriptions and specs.
            Products that already have applied or pending drafts are automatically skipped.
          </p>
          <div className="flex items-center gap-3">
            <Button
              onClick={() => {
                if (enrichableCount <= 0) {
                  toast.info('All products are already enriched or pending review.');
                  return;
                }
                setShowConfirm(true);
              }}
              disabled={submitting || !!isActive}
            >
              <Sparkles className="h-4 w-4" />
              {isActive ? 'Batch in Progress...' : submitting ? 'Submitting...' : 'AI Enrich Products'}
            </Button>
            {draftCounts.errors > 0 && !isActive && (
              <Button
                variant="outline"
                onClick={handleRetrySonnet}
                disabled={retrySonnet || submitting}
              >
                <RotateCcw className="h-4 w-4" />
                {retrySonnet ? 'Submitting...' : `Retry ${draftCounts.errors} Errors (Sonnet)`}
              </Button>
            )}
            {isActive && (
              <span className="text-xs text-gray-500">Wait for the current batch to finish before submitting another.</span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Section C: Draft Summary & Review */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Enrichment Drafts</CardTitle>
            {draftCounts.total > 0 && (
              <Link href="/admin/catalog/products/enrichment-review">
                <Button>
                  <ExternalLink className="h-4 w-4" />
                  Review Drafts
                </Button>
              </Link>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {draftCounts.total === 0 ? (
            <p className="text-sm text-gray-500">No enrichment drafts yet. Submit a batch to get started.</p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {draftCounts.pending > 0 && (
                <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2">
                  <Badge variant="warning">{draftCounts.pending}</Badge>
                  <span className="text-sm text-amber-800">drafts ready for review</span>
                </div>
              )}
              {draftCounts.errors > 0 && (
                <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2">
                  <Badge variant="destructive">{draftCounts.errors}</Badge>
                  <span className="text-sm text-red-800">failed enrichments</span>
                </div>
              )}
              {draftCounts.applied > 0 && (
                <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-2">
                  <Badge variant="success">{draftCounts.applied}</Badge>
                  <span className="text-sm text-green-800">applied</span>
                </div>
              )}
              {draftCounts.rejected > 0 && (
                <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-2">
                  <Badge variant="secondary">{draftCounts.rejected}</Badge>
                  <span className="text-sm text-gray-600">rejected</span>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={showConfirm}
        onOpenChange={setShowConfirm}
        title="AI Enrich Products"
        description={`Submit ${enrichableCount} product${enrichableCount !== 1 ? 's' : ''} for AI enrichment?${skippedCount > 0 ? ` (${skippedCount} already enriched will be skipped.)` : ''} This runs in the background via Anthropic's batch API — you can close this page and come back later. Results typically ready within 1 hour and are saved as drafts for your review.`}
        confirmLabel="Submit Batch"
        onConfirm={handleSubmit}
      />
    </div>
  );
}
