'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Monitor, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

interface EmailPreviewProps {
  html: string;
  loading?: boolean;
}

export function EmailPreview({ html, loading }: EmailPreviewProps) {
  const [viewport, setViewport] = useState<'desktop' | 'mobile'>('desktop');
  const [iframeHeight, setIframeHeight] = useState(400);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const adjustHeight = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    try {
      const doc = iframe.contentDocument;
      if (doc?.body) {
        const height = doc.body.scrollHeight;
        setIframeHeight(Math.max(height + 20, 200));
      }
    } catch {
      // Cross-origin safety — fall back to default
    }
  }, []);

  // Re-adjust height when html or viewport changes
  useEffect(() => {
    if (!html) return;
    // Wait for iframe to render
    const timeout = setTimeout(adjustHeight, 150);
    return () => clearTimeout(timeout);
  }, [html, viewport, adjustHeight]);

  return (
    <div className="flex flex-col">
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
      </div>

      {/* Preview frame */}
      <div className="bg-gray-100 p-4">
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
              ref={iframeRef}
              srcDoc={html}
              className="w-full rounded border border-gray-200 bg-white"
              style={{ height: iframeHeight }}
              title="Email preview"
              sandbox="allow-same-origin"
              onLoad={adjustHeight}
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
