'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { adminFetch } from '@/lib/utils/admin-fetch';
import { formatDateTime } from '@/lib/utils/format';
import { CAMPAIGN_CHANNEL_LABELS } from '@/lib/utils/constants';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { CampaignSummaryCards } from './campaign-summary-cards';
import { DeliveryFunnel } from './delivery-funnel';
import { RecipientTable } from './recipient-table';
import { VariantComparison } from './variant-comparison';
import { ClickDetails } from './click-details';
import { EngagementTimeline } from './engagement-timeline';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnalyticsResponse = any;

export default function CampaignAnalyticsPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = useCallback(async (page = 1, filter = '') => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ page: String(page), per_page: '25' });
      if (filter) qs.set('filter', filter);
      const res = await adminFetch(`/api/admin/marketing/analytics/campaigns/${id}?${qs}`);
      if (!res.ok) {
        const json = await res.json().catch(() => ({ error: 'Failed to load analytics' }));
        throw new Error(json.error || `HTTP ${res.status}`);
      }
      const json = await res.json();
      setData(json);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load analytics';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const handlePageChange = useCallback((page: number, filter: string) => {
    fetchAnalytics(page, filter);
  }, [fetchAnalytics]);

  // Full-page loading
  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  // Error state
  if (error && !data) {
    return (
      <div className="space-y-6">
        <PageHeader title="Campaign Analytics" />
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <h3 className="text-lg font-medium text-gray-900">Unable to load analytics</h3>
          <p className="mt-1 text-sm text-gray-500">{error}</p>
          <button
            onClick={() => fetchAnalytics()}
            className="mt-4 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const campaign = data.campaign;
  const summary = data.summary ?? {};
  const funnel = data.funnel ?? [];
  const variants = data.variants ?? [];
  const clickDetails = data.clickDetails ?? { byUrl: [], recent: [] };
  const timeline = data.timeline ?? [];
  const recipients = data.recipients ?? { data: [], total: 0, page: 1, perPage: 25 };

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title={campaign?.name ?? 'Campaign Analytics'}
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => router.push(`/admin/marketing/campaigns/${id}`)}>
              Campaign Detail
            </Button>
            <Button variant="outline" onClick={() => router.push('/admin/marketing/campaigns')}>
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          </div>
        }
      />

      {/* Breadcrumbs */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-gray-500">
        <button onClick={() => router.push('/admin/marketing/campaigns')} className="underline decoration-gray-300 underline-offset-2 hover:text-gray-900 hover:decoration-gray-500 transition-colors">Campaigns</button>
        <span className="text-gray-300" aria-hidden="true">/</span>
        <button onClick={() => router.push(`/admin/marketing/campaigns/${id}`)} className="underline decoration-gray-300 underline-offset-2 hover:text-gray-900 hover:decoration-gray-500 transition-colors">{campaign?.name ?? 'Campaign'}</button>
        <span className="text-gray-300" aria-hidden="true">/</span>
        <span className="font-medium text-gray-900" aria-current="page">Analytics</span>
      </nav>

      {/* Campaign meta */}
      <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500">
        <Badge variant="info">{CAMPAIGN_CHANNEL_LABELS[campaign?.channel] ?? campaign?.channel}</Badge>
        {campaign?.sentAt && (
          <span>Sent {formatDateTime(campaign.sentAt)}</span>
        )}
        {!campaign?.sentAt && (
          <span className="text-amber-600">Not sent yet — analytics will appear after sending</span>
        )}
      </div>

      {/* Not sent guard */}
      {!campaign?.sentAt ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-gray-200 bg-white py-16 text-center">
          <h3 className="text-lg font-medium text-gray-900">No analytics available</h3>
          <p className="mt-1 text-sm text-gray-500">Send this campaign first to see performance data.</p>
        </div>
      ) : (
        <>
          {/* Summary KPI cards */}
          <CampaignSummaryCards data={summary} loading={loading} />

          {/* Delivery funnel */}
          <DeliveryFunnel data={funnel} loading={loading} />

          {/* A/B variant comparison (only if variants exist) */}
          <VariantComparison variants={variants} loading={loading} />

          {/* Click details */}
          <ClickDetails byUrl={clickDetails.byUrl} recent={clickDetails.recent} loading={loading} />

          {/* Engagement timeline */}
          <EngagementTimeline data={timeline} loading={loading} />

          {/* Recipient table */}
          <RecipientTable
            campaignId={id}
            initialData={recipients.data}
            initialTotal={recipients.total}
            initialPage={recipients.page}
            perPage={recipients.perPage}
            hasVariants={variants.length > 0}
            loading={loading}
            onPageChange={handlePageChange}
          />
        </>
      )}
    </div>
  );
}
