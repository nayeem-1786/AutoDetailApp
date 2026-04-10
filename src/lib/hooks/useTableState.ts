'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FilterValue = string | boolean | string[];

export interface SortState {
  column: string;
  direction: 'asc' | 'desc';
}

export interface TableState {
  /** Current search input (immediate, pre-debounce) */
  search: string;
  /** Debounced search value (use this for filtering/querying) */
  debouncedSearch: string;
  /** Active filters keyed by name */
  filters: Record<string, FilterValue>;
  /** Active sort column + direction, or null */
  sort: SortState | null;
  /** Current page (1-indexed) */
  page: number;
  /** Page size */
  pageSize: number;
}

export interface UseTableStateOptions {
  /** Default filter values (restored on reset) */
  defaultFilters?: Record<string, FilterValue>;
  /** Default page size (default: 25) */
  defaultPageSize?: number;
  /** Debounce delay in ms for search (default: 300) */
  debounceMs?: number;
}

export interface UseTableStateReturn extends TableState {
  setSearch: (value: string) => void;
  setFilter: (key: string, value: FilterValue) => void;
  setFilters: (filters: Record<string, FilterValue>) => void;
  setSort: (sort: SortState | null) => void;
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
  /** Reset search, filters, sort, and page to defaults */
  reset: () => void;
}

// ---------------------------------------------------------------------------
// URL param helpers
// ---------------------------------------------------------------------------

const FILTER_PREFIX = 'filter_';

function parseFiltersFromParams(
  params: URLSearchParams,
  defaults: Record<string, FilterValue>
): Record<string, FilterValue> {
  const filters: Record<string, FilterValue> = { ...defaults };

  params.forEach((value, key) => {
    if (!key.startsWith(FILTER_PREFIX)) return;
    const filterKey = key.slice(FILTER_PREFIX.length);

    // Detect type from defaults, fall back to string
    const defaultVal = defaults[filterKey];
    if (typeof defaultVal === 'boolean') {
      filters[filterKey] = value === 'true';
    } else if (Array.isArray(defaultVal)) {
      filters[filterKey] = value.split(',').filter(Boolean);
    } else {
      filters[filterKey] = value;
    }
  });

  return filters;
}

function filtersToParams(
  filters: Record<string, FilterValue>,
  defaults: Record<string, FilterValue>
): Record<string, string> {
  const params: Record<string, string> = {};

  for (const [key, value] of Object.entries(filters)) {
    const defaultVal = defaults[key];
    // Skip values that match the default
    if (JSON.stringify(value) === JSON.stringify(defaultVal)) continue;
    // Skip empty/falsy values
    if (value === '' || value === false) continue;
    if (Array.isArray(value) && value.length === 0) continue;

    const paramKey = `${FILTER_PREFIX}${key}`;
    if (typeof value === 'boolean') {
      params[paramKey] = String(value);
    } else if (Array.isArray(value)) {
      params[paramKey] = value.join(',');
    } else {
      params[paramKey] = value;
    }
  }

  return params;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useTableState(options: UseTableStateOptions = {}): UseTableStateReturn {
  const {
    defaultFilters = {},
    defaultPageSize = 25,
    debounceMs = 300,
  } = options;

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isInitialMount = useRef(true);

  // Parse initial state from URL on mount
  const initialState = useMemo(() => {
    const q = searchParams.get('q') || '';
    const sortCol = searchParams.get('sort');
    const sortDir = searchParams.get('dir') as 'asc' | 'desc' | null;
    const page = parseInt(searchParams.get('page') || '1', 10) || 1;
    const size = parseInt(searchParams.get('size') || String(defaultPageSize), 10) || defaultPageSize;
    const filters = parseFiltersFromParams(searchParams, defaultFilters);
    const sort: SortState | null = sortCol && sortDir ? { column: sortCol, direction: sortDir } : null;

    return { search: q, filters, sort, page, size };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only on mount

  const [search, setSearchRaw] = useState(initialState.search);
  const [debouncedSearch, setDebouncedSearch] = useState(initialState.search);
  const [filters, setFiltersState] = useState<Record<string, FilterValue>>(initialState.filters);
  const [sort, setSortState] = useState<SortState | null>(initialState.sort);
  const [page, setPageState] = useState(initialState.page);
  const [pageSize, setPageSizeState] = useState(initialState.size);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), debounceMs);
    return () => clearTimeout(timer);
  }, [search, debounceMs]);

  // Sync state to URL (skip initial mount to avoid double-navigation)
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    const params = new URLSearchParams();

    if (debouncedSearch) params.set('q', debouncedSearch);
    if (sort) {
      params.set('sort', sort.column);
      params.set('dir', sort.direction);
    }
    if (page > 1) params.set('page', String(page));
    if (pageSize !== defaultPageSize) params.set('size', String(pageSize));

    const filterParams = filtersToParams(filters, defaultFilters);
    for (const [key, value] of Object.entries(filterParams)) {
      params.set(key, value);
    }

    const qs = params.toString();
    const target = qs ? `${pathname}?${qs}` : pathname;

    router.replace(target, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, filters, sort, page, pageSize, pathname]);

  // Reset page to 1 when search or filters change
  const resetPageOnChange = useRef(false);
  useEffect(() => {
    if (resetPageOnChange.current) {
      setPageState(1);
    }
    resetPageOnChange.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, filters, sort]);

  const setSearch = useCallback((value: string) => {
    setSearchRaw(value);
  }, []);

  const setFilter = useCallback((key: string, value: FilterValue) => {
    setFiltersState((prev) => ({ ...prev, [key]: value }));
  }, []);

  const setFilters = useCallback((newFilters: Record<string, FilterValue>) => {
    setFiltersState(newFilters);
  }, []);

  const setSort = useCallback((newSort: SortState | null) => {
    setSortState(newSort);
  }, []);

  const setPage = useCallback((newPage: number) => {
    setPageState(newPage);
  }, []);

  const setPageSize = useCallback((size: number) => {
    setPageSizeState(size);
    setPageState(1); // Reset to page 1 on size change
  }, []);

  const reset = useCallback(() => {
    setSearchRaw('');
    setDebouncedSearch('');
    setFiltersState({ ...defaultFilters });
    setSortState(null);
    setPageState(1);
    setPageSizeState(defaultPageSize);
  }, [defaultFilters, defaultPageSize]);

  return {
    search,
    debouncedSearch,
    filters,
    sort,
    page,
    pageSize,
    setSearch,
    setFilter,
    setFilters,
    setSort,
    setPage,
    setPageSize,
    reset,
  };
}
