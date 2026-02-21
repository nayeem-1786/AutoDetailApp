'use client';

import { WifiOff } from 'lucide-react';

export default function PosOfflinePage() {
  return (
    <div className="flex h-screen items-center justify-center bg-gray-50 dark:bg-gray-800">
      <div className="max-w-md px-6 text-center">
        <WifiOff className="mx-auto mb-4 h-16 w-16 text-gray-400 dark:text-gray-500" />
        <h1 className="mb-2 text-2xl font-bold text-gray-900 dark:text-gray-100">
          You&apos;re Offline
        </h1>
        <p className="mb-6 text-gray-600 dark:text-gray-400">
          The POS needs an internet connection to load for the first time. Once
          loaded, you can process cash transactions while offline.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="min-h-[44px] rounded-lg bg-black px-6 py-3 font-medium text-white"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}
