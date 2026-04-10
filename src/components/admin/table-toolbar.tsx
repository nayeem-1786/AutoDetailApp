'use client';

import { SearchInput } from '@/components/ui/search-input';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RotateCcw } from 'lucide-react';
import type { UseTableStateReturn, FilterValue } from '@/lib/hooks/useTableState';
import type { LucideIcon } from 'lucide-react';

// ---------------------------------------------------------------------------
// Config types
// ---------------------------------------------------------------------------

export interface FilterConfig {
  key: string;
  label: string;
  type: 'select' | 'boolean-toggle';
  /** Options for 'select' type */
  options?: { label: string; value: string }[];
}

export interface QuickFilterConfig {
  label: string;
  icon?: LucideIcon;
  /** Filter values to apply when clicked */
  filter: Record<string, FilterValue>;
  /** If true, clears all other filters first (e.g. "Missing Images") */
  clearOthers?: boolean;
  /** Determines if chip shows as active based on current filters */
  isActive: (currentFilters: Record<string, FilterValue>) => boolean;
}

export interface TableToolbarConfig {
  searchPlaceholder?: string;
  searchEnabled?: boolean;
  filters?: FilterConfig[];
  quickFilters?: QuickFilterConfig[];
}

export interface TableToolbarProps {
  state: UseTableStateReturn;
  config: TableToolbarConfig;
  /** Default filter values — used by reset and clearOthers quick filters */
  defaultFilters?: Record<string, FilterValue>;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TableToolbar({ state, config, defaultFilters = {} }: TableToolbarProps) {
  const {
    searchPlaceholder = 'Search...',
    searchEnabled = true,
    filters = [],
    quickFilters = [],
  } = config;

  const hasActiveFilters = (() => {
    for (const [key, value] of Object.entries(state.filters)) {
      const defaultVal = defaultFilters[key];
      if (JSON.stringify(value) !== JSON.stringify(defaultVal)) return true;
    }
    return !!state.search;
  })();

  function handleQuickFilter(qf: QuickFilterConfig) {
    if (qf.clearOthers) {
      state.setFilters({ ...defaultFilters, ...qf.filter });
      state.setSearch('');
    } else {
      // Toggle: if already active, revert to defaults for those keys
      const isCurrentlyActive = qf.isActive(state.filters);
      if (isCurrentlyActive) {
        const reverted = { ...state.filters };
        for (const key of Object.keys(qf.filter)) {
          reverted[key] = defaultFilters[key] ?? '';
        }
        state.setFilters(reverted);
      } else {
        state.setFilters({ ...state.filters, ...qf.filter });
      }
    }
  }

  return (
    <div className="space-y-3">
      {/* Row 1: Search + Filter dropdowns + Boolean toggles + Reset */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
        {searchEnabled && (
          <SearchInput
            value={state.search}
            onChange={state.setSearch}
            placeholder={searchPlaceholder}
            className="w-full sm:w-64"
          />
        )}

        {filters.map((f) => {
          if (f.type === 'select' && f.options) {
            return (
              <Select
                key={f.key}
                value={(state.filters[f.key] as string) || ''}
                onChange={(e) => state.setFilter(f.key, e.target.value)}
                className="w-full sm:w-44"
              >
                {f.options.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>
            );
          }

          if (f.type === 'boolean-toggle') {
            const id = `toolbar-toggle-${f.key}`;
            return (
              <div key={f.key} className="flex items-center gap-2">
                <Switch
                  id={id}
                  checked={state.filters[f.key] === true}
                  onCheckedChange={(checked) => state.setFilter(f.key, checked)}
                />
                <Label htmlFor={id}>{f.label}</Label>
              </div>
            );
          }

          return null;
        })}

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={state.reset}
            className="text-xs text-ui-text-muted hover:text-ui-text sm:ml-auto"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </Button>
        )}
      </div>

      {/* Row 2: Quick filter chips */}
      {quickFilters.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {quickFilters.map((qf) => {
            const active = qf.isActive(state.filters);
            const Icon = qf.icon;
            return (
              <button
                key={qf.label}
                type="button"
                onClick={() => handleQuickFilter(qf)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  active
                    ? 'border-blue-300 bg-blue-50 text-blue-700'
                    : 'border-ui-border bg-ui-bg text-ui-text-muted hover:bg-ui-bg-hover hover:text-ui-text'
                }`}
              >
                {Icon && <Icon className="h-3 w-3" />}
                {qf.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
