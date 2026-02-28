'use client';

import { useState, useEffect } from 'react';
import { Users, ExternalLink } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { adminFetch } from '@/lib/utils/admin-fetch';
import Link from 'next/link';

// ---------------------------------------------------------------------------
// TeamGridEditor — display-only config widget
// Data is managed on /admin/website/team, this just shows config options
// ---------------------------------------------------------------------------

export interface TeamGridConfig {
  source: 'team_members_table';
  columns: 2 | 3 | 4;
  show_certifications: boolean;
  show_excerpt: boolean;
  max_members: number; // 0 = show all
}

const DEFAULT_CONFIG: TeamGridConfig = {
  source: 'team_members_table',
  columns: 3,
  show_certifications: true,
  show_excerpt: true,
  max_members: 0,
};

export function parseTeamGridConfig(content: string): TeamGridConfig {
  try {
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return {
        source: 'team_members_table',
        columns: [2, 3, 4].includes(parsed.columns) ? parsed.columns : 3,
        show_certifications: parsed.show_certifications ?? true,
        show_excerpt: parsed.show_excerpt ?? true,
        max_members: typeof parsed.max_members === 'number' ? parsed.max_members : 0,
      };
    }
  } catch { /* fallback */ }
  return DEFAULT_CONFIG;
}

export function serializeTeamGridConfig(config: TeamGridConfig): string {
  return JSON.stringify(config);
}

interface TeamGridEditorProps {
  value: string;
  onChange: (content: string) => void;
}

export function TeamGridEditor({ value, onChange }: TeamGridEditorProps) {
  const [config, setConfig] = useState<TeamGridConfig>(() => parseTeamGridConfig(value));
  const [activeCount, setActiveCount] = useState<number | null>(null);

  // Fetch active member count on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await adminFetch('/api/admin/team-members');
        if (res.ok) {
          const json = await res.json();
          const members = json.data ?? [];
          setActiveCount(members.filter((m: { is_active: boolean }) => m.is_active).length);
        }
      } catch { /* ignore */ }
    })();
  }, []);

  const updateConfig = (updates: Partial<TeamGridConfig>) => {
    const next = { ...config, ...updates };
    setConfig(next);
    onChange(serializeTeamGridConfig(next));
  };

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Users className="h-5 w-5 text-gray-500" />
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          Team Members Grid
        </h3>
      </div>

      {/* Count */}
      <p className="text-sm text-gray-500 dark:text-gray-400">
        {activeCount !== null ? (
          <>Displaying <span className="font-medium text-gray-700 dark:text-gray-300">{activeCount}</span> active team member{activeCount !== 1 ? 's' : ''}</>
        ) : (
          <span className="inline-flex items-center gap-1"><Spinner size="sm" /> Loading...</span>
        )}
      </p>

      {/* Link to admin page */}
      <Link
        href="/admin/website/team"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400 transition-colors"
      >
        Manage Team Members
        <ExternalLink className="h-3.5 w-3.5" />
      </Link>

      {/* Display Settings */}
      <div className="border-t border-gray-200 dark:border-gray-700 pt-3 space-y-3">
        <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          Display Settings
        </h4>

        {/* Columns */}
        <div className="flex items-center gap-3">
          <label className="text-sm text-gray-600 dark:text-gray-400 w-28">Columns:</label>
          <div className="flex gap-1">
            {([2, 3, 4] as const).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => updateConfig({ columns: n })}
                className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                  config.columns === n
                    ? 'bg-brand-600 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-600'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* Show certifications toggle */}
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={config.show_certifications}
            onChange={(e) => updateConfig({ show_certifications: e.target.checked })}
            className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
          />
          <span className="text-sm text-gray-600 dark:text-gray-400">Show certifications</span>
        </label>

        {/* Show excerpt toggle */}
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={config.show_excerpt}
            onChange={(e) => updateConfig({ show_excerpt: e.target.checked })}
            className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
          />
          <span className="text-sm text-gray-600 dark:text-gray-400">Show excerpt / bio preview</span>
        </label>

        {/* Max members */}
        <div className="flex items-center gap-3">
          <label className="text-sm text-gray-600 dark:text-gray-400 w-28">Max members:</label>
          <input
            type="number"
            min={0}
            value={config.max_members}
            onChange={(e) => updateConfig({ max_members: parseInt(e.target.value) || 0 })}
            className="w-20 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
          />
          <span className="text-xs text-gray-400">0 = show all</span>
        </div>
      </div>
    </div>
  );
}
