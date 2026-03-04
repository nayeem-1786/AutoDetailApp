'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { adminFetch } from '@/lib/utils/admin-fetch';

// ─── Types ────────────────────────────────────────────────────────

interface AnalyticsData {
  enrollments: {
    total: number;
    active: number;
    completed: number;
    stopped: number;
    paused: number;
  };
  funnel: Array<{
    step_order: number;
    step_name: string;
    sent: number;
    failed: number;
    skipped: number;
  }>;
  dropoff: Array<{
    reason: string;
    count: number;
  }>;
  conversion: {
    total_enrolled: number;
    purchased: number;
    booked: number;
    conversion_rate: number;
  };
}

interface DripAnalyticsProps {
  sequenceId: string;
}

// ─── Reason labels ────────────────────────────────────────────────

const REASON_LABELS: Record<string, string> = {
  purchased: 'Made a purchase',
  booked: 'Booked an appointment',
  replied: 'Replied to message',
  manual: 'Manually cancelled',
  exit_condition: 'Met exit condition',
  unsubscribed: 'Unsubscribed',
};

// ─── Component ────────────────────────────────────────────────────

export function DripAnalytics({ sequenceId }: DripAnalyticsProps) {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await adminFetch(
          `/api/admin/drip-sequences/${sequenceId}/analytics`,
          { cache: 'no-store' }
        );
        if (!res.ok) {
          const json = await res.json();
          throw new Error(json.error || 'Failed to load analytics');
        }
        const json = await res.json();
        setData(json.data);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to load analytics'
        );
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [sequenceId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        title="Error loading analytics"
        description={error}
      />
    );
  }

  if (!data) {
    return <EmptyState title="No analytics data available" />;
  }

  const { enrollments, funnel, dropoff, conversion } = data;
  const maxSent = Math.max(...funnel.map((f) => f.sent), 1);

  return (
    <div className="space-y-6">
      {/* ── Summary cards ──────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <SummaryCard
          label="Total Enrolled"
          value={enrollments.total}
          color="text-ui-text"
        />
        <SummaryCard
          label="Active"
          value={enrollments.active}
          color="text-green-600"
        />
        <SummaryCard
          label="Completed"
          value={enrollments.completed}
          color="text-blue-600"
        />
        <SummaryCard
          label="Stopped"
          value={enrollments.stopped}
          color="text-amber-600"
        />
        <SummaryCard
          label="Conversion Rate"
          value={`${conversion.conversion_rate}%`}
          color="text-purple-600"
        />
      </div>

      {/* ── Funnel ─────────────────────────────────────────────── */}
      {funnel.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Step Funnel</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {funnel.map((step) => (
              <div key={step.step_order} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-ui-text">
                    {step.step_name}
                  </span>
                  <div className="flex items-center gap-3 text-ui-text-muted">
                    <span>{step.sent} sent</span>
                    {step.failed > 0 && (
                      <span className="text-red-500">
                        {step.failed} failed
                      </span>
                    )}
                    {step.skipped > 0 && (
                      <span className="text-amber-500">
                        {step.skipped} skipped
                      </span>
                    )}
                  </div>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full bg-blue-500 transition-all"
                    style={{
                      width: `${maxSent ? (step.sent / maxSent) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ── Drop-off reasons ───────────────────────────────────── */}
      {dropoff.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Drop-off Reasons</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {dropoff.map((d) => (
              <div
                key={d.reason}
                className="flex items-center justify-between"
              >
                <span className="text-sm text-ui-text">
                  {REASON_LABELS[d.reason] || d.reason}
                </span>
                <Badge>{d.count}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ── Conversions ────────────────────────────────────────── */}
      {(conversion.purchased > 0 || conversion.booked > 0) && (
        <Card>
          <CardHeader>
            <CardTitle>Conversions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600">
                  {conversion.purchased}
                </p>
                <p className="text-xs text-ui-text-muted">Purchased</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-blue-600">
                  {conversion.booked}
                </p>
                <p className="text-xs text-ui-text-muted">Booked</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-purple-600">
                  {conversion.conversion_rate}%
                </p>
                <p className="text-xs text-ui-text-muted">Conversion Rate</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {enrollments.total === 0 && (
        <EmptyState
          title="No enrollments yet"
          description="Analytics will populate once customers are enrolled in this sequence."
        />
      )}
    </div>
  );
}

// ─── Summary Card ─────────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number | string;
  color: string;
}) {
  return (
    <Card>
      <CardContent className="p-4 text-center">
        <p className={`text-2xl font-bold ${color}`}>{value}</p>
        <p className="mt-1 text-xs text-ui-text-muted">{label}</p>
      </CardContent>
    </Card>
  );
}
