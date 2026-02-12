'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import { CAMPAIGN_STATUS_LABELS, CAMPAIGN_CHANNEL_LABELS } from '@/lib/utils/constants';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { ArrowLeft, Pencil, ChevronLeft, ChevronRight, BarChart3 } from 'lucide-react';
import { usePermission } from '@/lib/hooks/use-permission';

interface CampaignDetail {
  id: string;
  name: string;
  description: string | null;
  channel: string;
  status: string;
  audience_filters: Record<string, unknown>;
  sms_template: string | null;
  email_subject: string | null;
  email_template: string | null;
  coupon_id: string | null;
  scheduled_at: string | null;
  sent_at: string | null;
  recipient_count: number;
  delivered_count: number;
  opened_count: number;
  clicked_count: number;
  redeemed_count: number;
  revenue_attributed: number;
  created_at: string;
  total_recipients: number;
}

interface Recipient {
  id: string;
  customer_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  channel: string;
  coupon_code: string | null;
  delivered: boolean;
  opened_at: string | null;
  clicked_at: string | null;
  sent_at: string;
}

const PAGE_SIZE = 20;

export default function CampaignDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const { granted: canManageCampaigns } = usePermission('marketing.campaigns');

  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [loading, setLoading] = useState(true);

  // Recipient list state
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [recipientTotal, setRecipientTotal] = useState(0);
  const [recipientPage, setRecipientPage] = useState(1);
  const [loadingRecipients, setLoadingRecipients] = useState(false);

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/marketing/campaigns/${id}`);
      if (res.ok) {
        const { data } = await res.json();
        setCampaign(data);
      }
      setLoading(false);
    }
    load();
  }, [id]);

  const loadRecipients = useCallback(async (page: number) => {
    setLoadingRecipients(true);
    try {
      const res = await fetch(`/api/marketing/campaigns/${id}/recipients?page=${page}&limit=${PAGE_SIZE}`);
      if (res.ok) {
        const { data, total } = await res.json();
        setRecipients(data);
        setRecipientTotal(total);
        setRecipientPage(page);
      }
    } catch {
      // silent fail — section just stays empty
    }
    setLoadingRecipients(false);
  }, [id]);

  // Load recipients once campaign is loaded and has been sent
  useEffect(() => {
    if (campaign && campaign.recipient_count > 0) {
      loadRecipients(1);
    }
  }, [campaign, loadRecipients]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!campaign) {
    return <p className="py-12 text-center text-gray-500">Campaign not found.</p>;
  }

  const statusVariant = campaign.status === 'sent' ? 'success' : campaign.status === 'draft' ? 'secondary' : campaign.status === 'scheduled' ? 'info' : campaign.status === 'sending' ? 'warning' : 'destructive';

  const totalPages = Math.ceil(recipientTotal / PAGE_SIZE);

  return (
    <div className="space-y-6">
      <PageHeader
        title={campaign.name}
        action={
          <div className="flex gap-2">
            {['sent', 'completed'].includes(campaign.status) && (
              <Button onClick={() => router.push(`/admin/marketing/campaigns/${id}/analytics`)}>
                <BarChart3 className="h-4 w-4" />
                View Analytics
              </Button>
            )}
            {canManageCampaigns && ['draft', 'scheduled'].includes(campaign.status) && (
              <Button onClick={() => router.push(`/admin/marketing/campaigns/${id}/edit`)}>
                <Pencil className="h-4 w-4" />
                {campaign.status === 'draft' ? 'Resume Editing' : 'Edit'}
              </Button>
            )}
            <Button variant="outline" onClick={() => router.push('/admin/marketing/campaigns')}>
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          </div>
        }
      />

      {/* Campaign info */}
      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-sm text-gray-500">Channel</p>
          <Badge variant="info" className="mt-1">{CAMPAIGN_CHANNEL_LABELS[campaign.channel] || campaign.channel}</Badge>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-sm text-gray-500">Status</p>
          <Badge variant={statusVariant} className="mt-1">{CAMPAIGN_STATUS_LABELS[campaign.status] || campaign.status}</Badge>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-sm text-gray-500">Sent</p>
          <p className="mt-1 font-medium">{campaign.sent_at ? formatDate(campaign.sent_at) : '--'}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-sm text-gray-500">Created</p>
          <p className="mt-1 font-medium">{formatDate(campaign.created_at)}</p>
        </div>
      </div>

      {/* Performance metrics */}
      <Card>
        <CardHeader>
          <CardTitle>Performance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <div>
              <p className="text-sm text-gray-500">Recipients</p>
              <p className="text-2xl font-bold">{campaign.recipient_count}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Delivered</p>
              <p className="text-2xl font-bold">{campaign.delivered_count}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Opened</p>
              <p className="text-2xl font-bold">{campaign.opened_count}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Clicked</p>
              <p className="text-2xl font-bold">{campaign.clicked_count}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Redeemed</p>
              <p className="text-2xl font-bold">{campaign.redeemed_count}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Revenue</p>
              <p className="text-2xl font-bold">{formatCurrency(campaign.revenue_attributed)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Message preview */}
      {campaign.sms_template && (
        <Card>
          <CardHeader>
            <CardTitle>SMS Message</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border border-gray-200 bg-gray-50 p-4">
              <p className="whitespace-pre-wrap text-sm">{campaign.sms_template}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {campaign.email_template && (
        <Card>
          <CardHeader>
            <CardTitle>Email Message</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border border-gray-200 bg-gray-50 p-4">
              {campaign.email_subject && (
                <p className="mb-2 text-sm font-medium">Subject: {campaign.email_subject}</p>
              )}
              <p className="whitespace-pre-wrap text-sm">{campaign.email_template}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recipient list */}
      {campaign.recipient_count > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recipients ({recipientTotal})</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingRecipients && recipients.length === 0 ? (
              <div className="flex justify-center py-8">
                <Spinner />
              </div>
            ) : recipients.length === 0 ? (
              <p className="py-4 text-center text-sm text-gray-500">No recipients found.</p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 text-left text-xs font-medium uppercase text-gray-500">
                        <th className="pb-2 pr-4">Customer</th>
                        <th className="pb-2 pr-4">Contact</th>
                        <th className="pb-2 pr-4">Channel</th>
                        <th className="pb-2 pr-4">Delivered</th>
                        <th className="pb-2 pr-4">Opened</th>
                        <th className="pb-2 pr-4">Clicked</th>
                        <th className="pb-2 pr-4">Coupon</th>
                        <th className="pb-2">Sent</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {recipients.map((r) => (
                        <tr key={r.id} className="hover:bg-gray-50">
                          <td className="py-2.5 pr-4 font-medium text-gray-900">{r.name}</td>
                          <td className="py-2.5 pr-4 text-gray-500">
                            {r.phone && <div>{r.phone}</div>}
                            {r.email && <div>{r.email}</div>}
                          </td>
                          <td className="py-2.5 pr-4">
                            <Badge variant="info">
                              {CAMPAIGN_CHANNEL_LABELS[r.channel] || r.channel}
                            </Badge>
                          </td>
                          <td className="py-2.5 pr-4">
                            <Badge variant={r.delivered ? 'success' : 'destructive'}>
                              {r.delivered ? 'Yes' : 'Failed'}
                            </Badge>
                          </td>
                          <td className="py-2.5 pr-4 text-gray-500">
                            {r.opened_at ? '\u2713' : '\u2014'}
                          </td>
                          <td className="py-2.5 pr-4 text-gray-500">
                            {r.clicked_at ? '\u2713' : '\u2014'}
                          </td>
                          <td className="py-2.5 pr-4 font-mono text-xs text-gray-500">
                            {r.coupon_code || '--'}
                          </td>
                          <td className="py-2.5 text-gray-500">
                            {r.sent_at ? formatDate(r.sent_at) : '--'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="mt-4 flex items-center justify-between border-t border-gray-200 pt-4">
                    <p className="text-xs text-gray-500">
                      Showing {(recipientPage - 1) * PAGE_SIZE + 1}–{Math.min(recipientPage * PAGE_SIZE, recipientTotal)} of {recipientTotal}
                    </p>
                    <div className="flex gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={recipientPage <= 1 || loadingRecipients}
                        onClick={() => loadRecipients(recipientPage - 1)}
                      >
                        <ChevronLeft className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={recipientPage >= totalPages || loadingRecipients}
                        onClick={() => loadRecipients(recipientPage + 1)}
                      >
                        <ChevronRight className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
