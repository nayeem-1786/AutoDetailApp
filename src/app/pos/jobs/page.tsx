'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { JobQueue } from './components/job-queue';
import { JobDetail } from './components/job-detail';

type View =
  | { mode: 'queue' }
  | { mode: 'detail'; jobId: string };

export default function JobsPage() {
  const router = useRouter();
  const [view, setView] = useState<View>({ mode: 'queue' });
  const [refreshKey, setRefreshKey] = useState(0);

  if (view.mode === 'detail') {
    return (
      <JobDetail
        jobId={view.jobId}
        onBack={() => {
          setRefreshKey((k) => k + 1);
          setView({ mode: 'queue' });
        }}
      />
    );
  }

  return (
    <JobQueue
      key={refreshKey}
      onNewWalkIn={() => router.push('/pos/quotes?mode=builder&walkIn=true')}
      onSelectJob={(jobId) => setView({ mode: 'detail', jobId })}
    />
  );
}
