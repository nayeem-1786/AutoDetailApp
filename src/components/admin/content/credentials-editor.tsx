'use client';

import { useState, useEffect } from 'react';
import { Award, ExternalLink } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { adminFetch } from '@/lib/utils/admin-fetch';
import Link from 'next/link';

// ---------------------------------------------------------------------------
// CredentialsEditor — display-only config widget
// Data is managed on /admin/website/credentials, this just shows config options
// ---------------------------------------------------------------------------

export interface CredentialsConfig {
  source: 'credentials_table';
  layout: 'grid' | 'list';
  show_descriptions: boolean;
  max_items: number; // 0 = show all
}

const DEFAULT_CONFIG: CredentialsConfig = {
  source: 'credentials_table',
  layout: 'grid',
  show_descriptions: true,
  max_items: 0,
};

export function parseCredentialsConfig(content: string): CredentialsConfig {
  try {
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.source === 'credentials_table') {
      return {
        source: 'credentials_table',
        layout: parsed.layout === 'list' ? 'list' : 'grid',
        show_descriptions: parsed.show_descriptions ?? true,
        max_items: typeof parsed.max_items === 'number' ? parsed.max_items : 0,
      };
    }
  } catch { /* fallback */ }
  return DEFAULT_CONFIG;
}

export function serializeCredentialsConfig(config: CredentialsConfig): string {
  return JSON.stringify(config);
}

// Keep backward-compatible exports for content-block-editor
export function parseCredentialsContent(content: string): CredentialsConfig {
  return parseCredentialsConfig(content);
}

export function serializeCredentialsContent(config: CredentialsConfig): string {
  return serializeCredentialsConfig(config);
}

interface CredentialsEditorProps {
  value: CredentialsConfig;
  onChange: (config: CredentialsConfig) => void;
}

export function CredentialsEditor({ value, onChange }: CredentialsEditorProps) {
  const [config, setConfig] = useState<CredentialsConfig>(value);
  const [activeCount, setActiveCount] = useState<number | null>(null);

  // Fetch active credential count on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await adminFetch('/api/admin/credentials');
        if (res.ok) {
          const json = await res.json();
          const creds = json.data ?? [];
          setActiveCount(creds.filter((c: { is_active: boolean }) => c.is_active).length);
        }
      } catch { /* ignore */ }
    })();
  }, []);

  const updateConfig = (updates: Partial<CredentialsConfig>) => {
    const next = { ...config, ...updates };
    setConfig(next);
    onChange(next);
  };

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Award className="h-5 w-5 text-gray-500" />
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          Credentials & Awards
        </h3>
      </div>

      {/* Count */}
      <p className="text-sm text-gray-500 dark:text-gray-400">
        {activeCount !== null ? (
          <>Displaying <span className="font-medium text-gray-700 dark:text-gray-300">{activeCount}</span> active credential{activeCount !== 1 ? 's' : ''}</>
        ) : (
          <span className="inline-flex items-center gap-1"><Spinner size="sm" /> Loading...</span>
        )}
      </p>

      {/* Link to admin page */}
      <Link
        href="/admin/website/credentials"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400 transition-colors"
      >
        Manage Credentials
        <ExternalLink className="h-3.5 w-3.5" />
      </Link>

      {/* Display Settings */}
      <div className="border-t border-gray-200 dark:border-gray-700 pt-3 space-y-3">
        <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          Display Settings
        </h4>

        {/* Layout */}
        <div className="flex items-center gap-3">
          <label className="text-sm text-gray-600 dark:text-gray-400 w-28">Layout:</label>
          <div className="flex gap-1">
            {(['grid', 'list'] as const).map((layout) => (
              <button
                key={layout}
                type="button"
                onClick={() => updateConfig({ layout })}
                className={`px-3 py-1 rounded text-sm font-medium capitalize transition-colors ${
                  config.layout === layout
                    ? 'bg-brand-600 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-600'
                }`}
              >
                {layout}
              </button>
            ))}
          </div>
        </div>

        {/* Show descriptions toggle */}
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={config.show_descriptions}
            onChange={(e) => updateConfig({ show_descriptions: e.target.checked })}
            className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
          />
          <span className="text-sm text-gray-600 dark:text-gray-400">Show descriptions</span>
        </label>

        {/* Max items */}
        <div className="flex items-center gap-3">
          <label className="text-sm text-gray-600 dark:text-gray-400 w-28">Max items:</label>
          <input
            type="number"
            min={0}
            value={config.max_items}
            onChange={(e) => updateConfig({ max_items: parseInt(e.target.value) || 0 })}
            className="w-20 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
          />
          <span className="text-xs text-gray-400">0 = show all</span>
        </div>
      </div>
    </div>
  );
}
