'use client';

import { useEffect, useState, useCallback } from 'react';
import { PageHeader } from '@/components/ui/page-header';
import { Spinner } from '@/components/ui/spinner';
import { adminFetch } from '@/lib/utils/admin-fetch';
import { toast } from 'sonner';
import { PeriodSelector } from './components/period-selector';
import { OverviewKpis } from './components/overview-kpis';
import { ChannelComparison } from './components/channel-comparison';
import { CampaignTable } from './components/campaign-table';
import { AutomationTable } from './components/automation-table';
import { CouponTable } from './components/coupon-table';
import { AudienceHealth } from './components/audience-health';
import { ABTestResults } from './components/ab-test-results';

// -------------------------------------------------------------------------
// Types — match actual API response shape
// -------------------------------------------------------------------------

interface ChannelData {
  sent: number;
  delivered: number;
  deliveryRate: number;
  clicked: number;
  clickRate: number;
  optedOut: number;
  estimatedCost: number;
}

interface OverviewData {
  totalSmsSent: number;
  totalEmailSent: number;
  smsDeliveryRate: number;
  emailDeliveryRate: number;
  overallDeliveryRate: number;
  clickThroughRate: number;
  optOutRate: number;
  revenueAttributed: number;
}

interface AnalyticsData {
  overview: OverviewData;
  channels: {
    sms: ChannelData;
    email: ChannelData;
  };
}

// -------------------------------------------------------------------------
// API response → component data transformer
// -------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function transformApiResponse(json: any): AnalyticsData {
  const smsSent = json?.totalSent?.sms ?? 0;
  const emailSent = json?.totalSent?.email ?? 0;
  const smsDelivRate = json?.deliveryRate?.sms ?? 0;
  const emailDelivRate = json?.deliveryRate?.email ?? 0;
  const smsClickRate = json?.clickRate?.sms ?? 0;
  const emailClickRate = json?.clickRate?.email ?? 0;
  const optOutRate = json?.optOutRate ?? 0;
  const attributedRevenue = json?.attributedRevenue ?? 0;

  // Derive absolute counts from rates
  const smsDelivered = smsSent > 0 ? Math.round(smsSent * smsDelivRate / 100) : 0;
  const emailDelivered = emailSent > 0 ? Math.round(emailSent * emailDelivRate / 100) : 0;
  const smsClicked = smsDelivered > 0 ? Math.round(smsDelivered * smsClickRate / 100) : 0;
  const emailClicked = emailDelivered > 0 ? Math.round(emailDelivered * emailClickRate / 100) : 0;

  const totalSent = smsSent + emailSent;
  const totalDelivered = smsDelivered + emailDelivered;
  const totalClicked = smsClicked + emailClicked;

  const overallDeliveryRate = totalSent > 0
    ? Math.round((totalDelivered / totalSent) * 1000) / 10
    : 0;
  const clickThroughRate = totalDelivered > 0
    ? Math.round((totalClicked / totalDelivered) * 1000) / 10
    : 0;

  return {
    overview: {
      totalSmsSent: smsSent,
      totalEmailSent: emailSent,
      smsDeliveryRate: smsDelivRate,
      emailDeliveryRate: emailDelivRate,
      overallDeliveryRate,
      clickThroughRate,
      optOutRate,
      revenueAttributed: attributedRevenue,
    },
    channels: {
      sms: {
        sent: smsSent,
        delivered: smsDelivered,
        deliveryRate: smsDelivRate,
        clicked: smsClicked,
        clickRate: smsClickRate,
        optedOut: 0,
        estimatedCost: Math.round(smsSent * 0.0079 * 100) / 100,
      },
      email: {
        sent: emailSent,
        delivered: emailDelivered,
        deliveryRate: emailDelivRate,
        clicked: emailClicked,
        clickRate: emailClickRate,
        optedOut: 0,
        estimatedCost: 0,
      },
    },
  };
}

// -------------------------------------------------------------------------
// Empty state defaults
// -------------------------------------------------------------------------

const EMPTY_CHANNEL: ChannelData = {
  sent: 0,
  delivered: 0,
  deliveryRate: 0,
  clicked: 0,
  clickRate: 0,
  optedOut: 0,
  estimatedCost: 0,
};

const EMPTY_DATA: AnalyticsData = {
  overview: {
    totalSmsSent: 0,
    totalEmailSent: 0,
    smsDeliveryRate: 0,
    emailDeliveryRate: 0,
    overallDeliveryRate: 0,
    clickThroughRate: 0,
    optOutRate: 0,
    revenueAttributed: 0,
  },
  channels: {
    sms: { ...EMPTY_CHANNEL },
    email: { ...EMPTY_CHANNEL },
  },
};

// -------------------------------------------------------------------------
// Page Component
// -------------------------------------------------------------------------

export default function MarketingAnalyticsPage() {
  const [period, setPeriod] = useState('30d');
  const [data, setData] = useState<AnalyticsData>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = useCallback(async (selectedPeriod: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminFetch(
        `/api/admin/marketing/analytics?period=${encodeURIComponent(selectedPeriod)}`
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({ error: 'Failed to load analytics' }));
        throw new Error(json.error || `HTTP ${res.status}`);
      }
      const json = await res.json();
      setData(transformApiResponse(json));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load analytics';
      setError(message);
      toast.error(message);
      setData(EMPTY_DATA);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAnalytics(period);
  }, [period, fetchAnalytics]);

  function handlePeriodChange(newPeriod: string) {
    setPeriod(newPeriod);
  }

  // Error state
  if (error && !loading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Marketing Analytics"
          action={<PeriodSelector value={period} onChange={handlePeriodChange} />}
        />
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <h3 className="text-lg font-medium text-gray-900">Unable to load analytics</h3>
          <p className="mt-1 text-sm text-gray-500">{error}</p>
          <button
            onClick={() => fetchAnalytics(period)}
            className="mt-4 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Initial full-page loading state
  if (loading && data === EMPTY_DATA) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Marketing Analytics"
          action={<PeriodSelector value={period} onChange={handlePeriodChange} />}
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
        title="Marketing Analytics"
        action={<PeriodSelector value={period} onChange={handlePeriodChange} />}
      />

      {/* Overview KPIs */}
      <OverviewKpis data={data.overview} loading={loading} />

      {/* Channel Comparison */}
      <ChannelComparison channels={data.channels} loading={loading} />

      {/* Campaign Performance */}
      <CampaignTable period={period} />

      {/* Automation Performance */}
      <AutomationTable period={period} />

      {/* Coupon Performance */}
      <CouponTable period={period} />

      {/* Audience Health */}
      <AudienceHealth period={period} />

      {/* A/B Test Results */}
      <ABTestResults period={period} />
    </div>
  );
}
