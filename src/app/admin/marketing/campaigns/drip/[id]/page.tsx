'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { DripBuilder } from '../_components/drip-builder';
import { DripEnrollmentsTable } from '../_components/drip-enrollments-table';
import { DripAnalytics } from '../_components/drip-analytics';
import { adminFetch } from '@/lib/utils/admin-fetch';

// ─── Types ────────────────────────────────────────────────────────

interface DripSequenceWithSteps {
  id: string;
  name: string;
  description: string | null;
  trigger_condition: string;
  trigger_value: Record<string, unknown> | null;
  stop_conditions: {
    on_purchase: boolean;
    on_booking: boolean;
    on_reply: boolean;
  };
  nurture_sequence_id: string | null;
  is_active: boolean;
  audience_filters: Record<string, unknown> | null;
  steps: Array<Record<string, unknown>>;
}

// ─── Component ────────────────────────────────────────────────────

export default function EditDripSequencePage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [sequence, setSequence] = useState<DripSequenceWithSteps | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('builder');

  useEffect(() => {
    async function load() {
      try {
        const res = await adminFetch(
          `/api/admin/drip-sequences/${id}`,
          { cache: 'no-store' }
        );

        if (!res.ok) {
          if (res.status === 404) {
            toast.error('Sequence not found');
            router.push('/admin/marketing/campaigns');
            return;
          }
          const json = await res.json();
          toast.error(json.error || 'Failed to load sequence');
          return;
        }

        const json = await res.json();
        setSequence(json.data);
      } catch {
        toast.error('Failed to load sequence');
      } finally {
        setLoading(false);
      }
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

  if (!sequence) {
    return null;
  }

  return (
    <div className="space-y-6">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="builder">Builder</TabsTrigger>
          <TabsTrigger value="enrollments">Enrollments</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="builder">
          <DripBuilder initialData={sequence} />
        </TabsContent>

        <TabsContent value="enrollments">
          <DripEnrollmentsTable sequenceId={id} />
        </TabsContent>

        <TabsContent value="analytics">
          <DripAnalytics sequenceId={id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
