'use client';

import { useState } from 'react';
import { JobQueue } from './components/job-queue';
import { WalkInFlow } from './components/walk-in-flow';
import { JobDetail } from './components/job-detail';

type View =
  | { mode: 'queue' }
  | { mode: 'walkin' }
  | { mode: 'detail'; jobId: string };

export default function JobsPage() {
  const [view, setView] = useState<View>({ mode: 'queue' });
  const [refreshKey, setRefreshKey] = useState(0);

  if (view.mode === 'walkin') {
    return (
      <WalkInFlow
        onBack={() => setView({ mode: 'queue' })}
        onCreated={(jobId) => {
          setRefreshKey((k) => k + 1);
          setView({ mode: 'detail', jobId });
        }}
      />
    );
  }

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
      onNewWalkIn={() => setView({ mode: 'walkin' })}
      onSelectJob={(jobId) => setView({ mode: 'detail', jobId })}
    />
  );
}
