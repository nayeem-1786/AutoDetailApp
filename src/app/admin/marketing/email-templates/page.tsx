'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/ui/page-header';
import { TemplateList } from './_components/template-list';
import { BrandSettings } from './_components/brand-settings';
import { usePermission } from '@/lib/hooks/use-permission';
import { Spinner } from '@/components/ui/spinner';

const TABS = [
  { key: 'templates', label: 'Templates' },
  { key: 'brand', label: 'Brand Settings' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

export default function EmailTemplatesPage() {
  const { granted: canAccess, loading: permLoading } = usePermission('marketing.campaigns');
  const [activeTab, setActiveTab] = useState<TabKey>('templates');


  if (permLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!canAccess) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <h2 className="text-lg font-semibold text-gray-900">Access Denied</h2>
        <p className="mt-1 text-sm text-gray-500">You don&apos;t have permission to view this page.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Email Templates"
        description="Manage email layouts, templates, and brand settings for all automated and marketing emails."
      />

      {/* Tab bar */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-6">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`whitespace-nowrap border-b-2 px-1 pb-3 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'border-gray-900 text-gray-900'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      {activeTab === 'templates' && <TemplateList />}
      {activeTab === 'brand' && <BrandSettings />}
    </div>
  );
}
