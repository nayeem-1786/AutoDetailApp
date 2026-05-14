'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Search, X, Package } from 'lucide-react';
import { formatCurrency, formatMoney } from '@/lib/utils/format';

interface SearchResult {
  id: string;
  name: string;
  slug: string;
  image_url: string | null;
  retail_price_cents: number;
  effective_price: number;
  is_on_sale: boolean;
  category_name: string;
  category_slug: string;
}

interface ProductSearchProps {
  /** When set, searches are scoped to this category by default */
  categorySlug?: string;
  categoryName?: string;
}

export function ProductSearch({ categorySlug, categoryName }: ProductSearchProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [searchAll, setSearchAll] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  const effectiveCategory = categorySlug && !searchAll ? categorySlug : '';

  const doSearch = useCallback(async (q: string, cat: string) => {
    if (q.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }

    setLoading(true);
    try {
      const params = new URLSearchParams({ q });
      if (cat) params.set('category', cat);
      const res = await fetch(`/api/public/products/search?${params}`);
      if (res.ok) {
        const { data } = await res.json();
        setResults(data);
        setOpen(true);
        setActiveIndex(-1);
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(() => {
      doSearch(query, effectiveCategory);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, effectiveCategory, doSearch]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function handleSelect(result: SearchResult) {
    router.push(`/products/${result.category_slug}/${result.slug}`);
    setOpen(false);
    setQuery('');
  }

  function handleClear() {
    setQuery('');
    setResults([]);
    setOpen(false);
    setActiveIndex(-1);
    inputRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open || results.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1));
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      handleSelect(results[activeIndex]);
    } else if (e.key === 'Escape') {
      setOpen(false);
      setActiveIndex(-1);
    }
  }

  function handleToggleSearchAll() {
    const next = !searchAll;
    setSearchAll(next);
    // Re-search immediately with the new scope
    if (query.length >= 2) {
      doSearch(query, categorySlug && !next ? categorySlug : '');
    }
  }

  const hasQuery = query.length > 0;

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Search input */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-site-text-faint" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => { if (results.length > 0) setOpen(true); }}
          onKeyDown={handleKeyDown}
          placeholder={
            categorySlug && !searchAll
              ? `Search in ${categoryName || 'this category'}...`
              : 'Search products...'
          }
          className="w-full rounded-xl border border-site-border bg-brand-surface py-3 pl-12 pr-12 text-base text-site-text placeholder:text-site-text-faint focus:border-accent-ui focus:outline-none focus:ring-1 focus:ring-accent-ui transition-colors"
        />
        {hasQuery && (
          <button
            onClick={handleClear}
            className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full p-1 text-site-text-faint hover:text-site-text transition-colors"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        {loading && (
          <div className="absolute right-12 top-1/2 -translate-y-1/2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent-ui border-t-transparent" />
          </div>
        )}
      </div>

      {/* Category scope toggle */}
      {categorySlug && hasQuery && (
        <button
          onClick={handleToggleSearchAll}
          className="mt-2 text-xs text-accent-ui hover:text-accent-brand transition-colors"
        >
          {searchAll ? `Search only in ${categoryName || 'this category'}` : 'Search all products'}
        </button>
      )}

      {/* Results dropdown */}
      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-[400px] overflow-y-auto rounded-xl border border-site-border bg-brand-surface shadow-xl">
          {results.length > 0 ? (
            <ul role="listbox">
              {results.map((result, i) => (
                <li key={result.id} role="option" aria-selected={i === activeIndex}>
                  <button
                    onClick={() => handleSelect(result)}
                    onMouseEnter={() => setActiveIndex(i)}
                    className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${
                      i === activeIndex
                        ? 'bg-accent-ui/10'
                        : 'hover:bg-brand-surface-alt'
                    }`}
                  >
                    {/* Thumbnail */}
                    <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-brand-surface-alt">
                      {result.image_url ? (
                        <Image
                          src={result.image_url}
                          alt={result.name}
                          fill
                          sizes="48px"
                          className="object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <Package className="h-5 w-5 text-site-text-faint" />
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-site-text">
                        {result.name}
                      </p>
                      <p className="text-xs text-site-text-muted">
                        {result.category_name}
                      </p>
                    </div>

                    {/* Price */}
                    <div className="shrink-0 text-right">
                      {result.is_on_sale ? (
                        <>
                          <span className="text-xs text-site-text-faint line-through">
                            {formatCurrency(result.retail_price_cents)}
                          </span>
                          <span className="ml-1.5 text-sm font-bold text-accent-brand">
                            {formatCurrency(result.effective_price)}
                          </span>
                        </>
                      ) : (
                        <span className="text-sm font-bold text-accent-brand">
                          {formatCurrency(result.retail_price_cents)}
                        </span>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-4 py-8 text-center text-sm text-site-text-muted">
              No results found for &ldquo;{query}&rdquo;
            </div>
          )}
        </div>
      )}
    </div>
  );
}
