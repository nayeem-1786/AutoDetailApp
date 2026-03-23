'use client';

import { CampaignWizard } from '../_components/campaign-wizard';
import { usePermission } from '@/lib/hooks/use-permission';
import { Spinner } from '@/components/ui/spinner';
import { PageHeader } from '@/components/ui/page-header';

export default function NewCampaignPage() {
  const { granted: canManageCampaigns, loading: permLoading } = usePermission('marketing.campaigns');

  if (permLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!canManageCampaigns) {
    return (
      <div>
        <PageHeader title="Create Campaign" />
        <div className="mt-12 flex flex-col items-center justify-center text-center">
          <p className="text-lg font-medium text-gray-900">Access Denied</p>
          <p className="mt-1 text-sm text-gray-500">You do not have permission to manage campaigns.</p>
        </div>
      </div>
    );
  }

  return <CampaignWizard />;
}
