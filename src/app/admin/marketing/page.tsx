'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { CAMPAIGN_STATUS_LABELS } from '@/lib/utils/constants';
import { formatDate } from '@/lib/utils/format';
import { Ticket, Send, Zap, ShieldCheck } from 'lucide-react';

interface DashboardStats {
  activeCoupons: number;
  campaignsSentThisMonth: number;
  activeRules: number;
  recentCampaigns: {
    id: string;
    name: string;
    status: string;
    channel: string;
    recipient_count: number;
    sent_at: string | null;
    created_at: string;
  }[];
}

export default function MarketingIndexPage() {
  const router = useRouter();
  const supabase = createClient();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      const [couponsRes, campaignsRes, rulesRes, recentRes] = await Promise.all([
        supabase.from('coupons').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('campaigns').select('id', { count: 'exact', head: true }).eq('status', 'sent').gte('sent_at', startOfMonth),
        supabase.from('lifecycle_rules').select('id', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('campaigns').select('id, name, status, channel, recipient_count, sent_at, created_at').order('created_at', { ascending: false }).limit(5),
      ]);

      setStats({
        activeCoupons: couponsRes.count ?? 0,
        campaignsSentThisMonth: campaignsRes.count ?? 0,
        activeRules: rulesRes.count ?? 0,
        recentCampaigns: recentRes.data ?? [],
      });
      setLoading(false);
    }
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  const quickLinks = [
    { label: 'Coupons', description: 'Create and manage discount codes', href: '/admin/marketing/coupons', icon: Ticket },
    { label: 'Automations', description: 'Lifecycle marketing rules', href: '/admin/marketing/automations', icon: Zap },
    { label: 'Campaigns', description: 'Send SMS and email campaigns', href: '/admin/marketing/campaigns', icon: Send },
    { label: 'Compliance', description: 'Consent audit log', href: '/admin/marketing/compliance', icon: ShieldCheck },
  ];

  const statusVariant = (status: string) => {
    switch (status) {
      case 'sent': return 'success';
      case 'draft': return 'secondary';
      case 'scheduled': return 'info';
      case 'sending': return 'warning';
      case 'cancelled': return 'destructive';
      default: return 'default';
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Marketing" description="Coupons, campaigns, and customer engagement" />

      {/* Stats cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-gray-500">Active Coupons</div>
            <div className="mt-1 text-3xl font-bold text-gray-900">{stats?.activeCoupons ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-gray-500">Campaigns This Month</div>
            <div className="mt-1 text-3xl font-bold text-gray-900">{stats?.campaignsSentThisMonth ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-gray-500">Active Automations</div>
            <div className="mt-1 text-3xl font-bold text-gray-900">{stats?.activeRules ?? 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Quick links */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {quickLinks.map((link) => {
          const Icon = link.icon;
          return (
            <button
              key={link.href}
              onClick={() => router.push(link.href)}
              className="rounded-lg border border-gray-200 bg-white p-4 text-left transition-colors hover:bg-gray-50"
            >
              <Icon className="h-5 w-5 text-gray-400" />
              <h3 className="mt-2 font-medium text-gray-900">{link.label}</h3>
              <p className="mt-1 text-sm text-gray-500">{link.description}</p>
            </button>
          );
        })}
      </div>

      {/* Recent campaigns */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Campaigns</CardTitle>
        </CardHeader>
        <CardContent>
          {stats?.recentCampaigns.length === 0 ? (
            <p className="text-sm text-gray-500">No campaigns yet.</p>
          ) : (
            <div className="space-y-3">
              {stats?.recentCampaigns.map((c) => (
                <button
                  key={c.id}
                  onClick={() => router.push(`/admin/marketing/campaigns/${c.id}`)}
                  className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left transition-colors hover:bg-gray-50"
                >
                  <div>
                    <span className="text-sm font-medium text-gray-900">{c.name}</span>
                    <span className="ml-2 text-xs text-gray-500">
                      {c.sent_at ? formatDate(c.sent_at) : formatDate(c.created_at)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">
                      {c.recipient_count} recipients
                    </span>
                    <Badge variant={statusVariant(c.status) as 'default' | 'success' | 'info' | 'warning' | 'destructive' | 'secondary'}>
                      {CAMPAIGN_STATUS_LABELS[c.status] || c.status}
                    </Badge>
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
