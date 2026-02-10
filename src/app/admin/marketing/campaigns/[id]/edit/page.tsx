'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Spinner } from '@/components/ui/spinner';
import { CampaignWizard, type InitialCampaignData } from '../../_components/campaign-wizard';

export default function EditCampaignPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [campaign, setCampaign] = useState<InitialCampaignData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/marketing/campaigns/${id}`);
      if (res.ok) {
        const { data } = await res.json();
        if (!['draft', 'scheduled'].includes(data.status)) {
          toast.error('Only draft or scheduled campaigns can be edited');
          router.push(`/admin/marketing/campaigns/${id}`);
          return;
        }
        setCampaign({
          id: data.id,
          name: data.name,
          channel: data.channel,
          audience_filters: data.audience_filters ?? {},
          sms_template: data.sms_template,
          email_subject: data.email_subject,
          email_template: data.email_template,
          coupon_id: data.coupon_id,
          scheduled_at: data.scheduled_at,
          variants: data.variants ?? null,
          auto_select_winner: data.auto_select_winner ?? false,
          auto_select_after_hours: data.auto_select_after_hours ?? null,
        });
      } else {
        toast.error('Campaign not found');
        router.push('/admin/marketing/campaigns');
      }
      setLoading(false);
    }
    load();
  }, [id, router]);

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

  return <CampaignWizard initialData={campaign} />;
}
