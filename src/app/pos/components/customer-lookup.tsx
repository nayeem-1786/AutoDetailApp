'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Search, UserPlus, UserX, Loader2 } from 'lucide-react';
import { posFetch } from '../lib/pos-fetch';
import { Button } from '@/components/ui/button';
import { formatPhone } from '@/lib/utils/format';
import { useEnterSubmit } from '@/lib/hooks/use-enter-submit';
import { CustomerTypeBadge } from './customer-type-badge';
import { CustomerCompleteProfileDialog } from './customer-complete-profile-dialog';
import type { Customer } from '@/lib/supabase/types';

interface CustomerLookupProps {
  onSelect: (customer: Customer) => void;
  onGuest?: () => void;
  onCreateNew: () => void;
}

interface SearchResult {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  loyalty_points_balance: number;
  visit_count: number;
  tags: string[];
  customer_type: import('@/lib/supabase/types').CustomerType | null;
}

export function CustomerLookup({
  onSelect,
  onGuest,
  onCreateNew,
}: CustomerLookupProps) {
  const [searchInput, setSearchInput] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [incompleteCustomer, setIncompleteCustomer] = useState<Customer | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input after Dialog animation completes (autoFocus alone is unreliable inside Radix Dialog)
  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(timer);
  }, []);

  const searchCustomers = useCallback(async (query: string) => {
    if (query.length < 2) {
      setResults([]);
      setSearched(false);
      return;
    }

    setLoading(true);
    try {
      const res = await posFetch(`/api/pos/customers/search?q=${encodeURIComponent(query)}`);
      const json = await res.json();
      setResults(json.data ?? []);
      setSearched(true);
    } catch {
      setResults([]);
      setSearched(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const enterSubmit = useEnterSubmit(() => {
    clearTimeout(debounceRef.current);
    searchCustomers(searchInput.trim());
  }, searchInput.trim().length >= 2);

  function handleInputChange(value: string) {
    setSearchInput(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchCustomers(value.trim()), 300);
  }

  function handleSelectResult(result: SearchResult) {
    const customer = result as unknown as Customer;
    // Intercept if missing required profile data
    if (!result.first_name?.trim() || !result.last_name?.trim() || !result.customer_type) {
      setIncompleteCustomer(customer);
      return;
    }
    onSelect(customer);
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
        <input
          ref={inputRef}
          type="text"
          inputMode="search"
          value={searchInput}
          onChange={(e) => handleInputChange(e.target.value)}
          {...enterSubmit}
          placeholder="Search by name, phone, or email"
          autoFocus
          className="h-10 w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 pl-9 pr-3 text-sm text-gray-900 dark:text-gray-100 focus:border-gray-400 dark:focus:border-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-200 dark:focus:ring-gray-700"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-gray-400 dark:text-gray-500" />
        )}
      </div>

      {/* Results */}
      {searched && results.length === 0 && (
        <p className="text-center text-sm text-gray-400 dark:text-gray-500">No customers found</p>
      )}

      {results.length > 0 && (
        <div className="max-h-48 overflow-y-auto rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
          {results.map((r) => (
            <div
              key={r.id}
              className="flex w-full items-center justify-between border-b border-gray-100 dark:border-gray-800 px-3 py-2.5 last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              <button
                onClick={() => handleSelectResult(r)}
                className="flex-1 text-left"
              >
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {r.phone ? formatPhone(r.phone) : 'No phone'}
                </p>
                {(r.first_name || r.last_name) && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {r.first_name} {r.last_name}
                  </p>
                )}
              </button>
              <div className="flex items-center gap-2">
                <CustomerTypeBadge
                  customerId={r.id}
                  customerType={r.customer_type}
                  onTypeChanged={(newType) => {
                    setResults((prev) =>
                      prev.map((item) =>
                        item.id === r.id ? { ...item, customer_type: newType } : item
                      )
                    );
                  }}
                />
                <button
                  onClick={() => handleSelectResult(r)}
                  className="text-right"
                >
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {r.visit_count} visit{r.visit_count !== 1 ? 's' : ''}
                  </p>
                  {r.loyalty_points_balance > 0 && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      {r.loyalty_points_balance} pts
                    </p>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2">
        {onGuest && (
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={onGuest}
          >
            <UserX className="mr-1.5 h-3.5 w-3.5" />
            Guest
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={onCreateNew}
        >
          <UserPlus className="mr-1.5 h-3.5 w-3.5" />
          New Customer
        </Button>
      </div>

      {/* Complete profile modal for customers missing name/type */}
      <CustomerCompleteProfileDialog
        open={!!incompleteCustomer}
        customer={incompleteCustomer}
        onComplete={(updatedCustomer) => {
          setIncompleteCustomer(null);
          onSelect(updatedCustomer);
        }}
        onClose={() => setIncompleteCustomer(null)}
      />
    </div>
  );
}
