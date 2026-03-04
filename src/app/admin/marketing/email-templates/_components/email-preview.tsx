'use client';

import { useState } from 'react';
import { Monitor, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

interface EmailPreviewProps {
  html: string;
  loading?: boolean;
  onRefresh?: () => void;
}

export function EmailPreview({ html, loading, onRefresh }: EmailPreviewProps) {
  const [viewport, setViewport] = useState<'desktop' | 'mobile'>('desktop');

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2">
        <div className="flex gap-1">
          <Button
            type="button"
            variant={viewport === 'desktop' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setViewport('desktop')}
            className="h-7 px-2"
          >
            <Monitor className="mr-1 h-3.5 w-3.5" />
            Desktop
          </Button>
          <Button
            type="button"
            variant={viewport === 'mobile' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setViewport('mobile')}
            className="h-7 px-2"
          >
            <Smartphone className="mr-1 h-3.5 w-3.5" />
            Mobile
          </Button>
        </div>
        {onRefresh && (
          <Button type="button" variant="ghost" size="sm" onClick={onRefresh} disabled={loading} className="h-7 text-xs">
            {loading ? 'Loading...' : 'Refresh'}
          </Button>
        )}
      </div>

      {/* Preview frame */}
      <div className="flex-1 overflow-auto bg-gray-100 p-4">
        <div
          className="mx-auto transition-all duration-200"
          style={{ maxWidth: viewport === 'mobile' ? 375 : 700 }}
        >
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Spinner size="lg" />
            </div>
          ) : html ? (
            <iframe
              srcDoc={html}
              className="w-full rounded border border-gray-200 bg-white"
              style={{ height: viewport === 'mobile' ? 667 : 800 }}
              title="Email preview"
              sandbox="allow-same-origin"
            />
          ) : (
            <div className="flex items-center justify-center rounded border border-dashed border-gray-300 bg-white py-20">
              <p className="text-sm text-gray-400">Add blocks to see a preview</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
