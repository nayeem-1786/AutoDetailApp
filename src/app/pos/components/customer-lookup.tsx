'use client';

import { useState, useRef, useCallback } from 'react';
import { Search, UserPlus, UserX, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatPhone, formatPhoneInput } from '@/lib/utils/format';
import { CustomerTypeBadge } from './customer-type-badge';
import type { Customer } from '@/lib/supabase/types';

interface CustomerLookupProps {
  onSelect: (customer: Customer) => void;
  onGuest: () => void;
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
  const [phoneInput, setPhoneInput] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const searchCustomers = useCallback(async (digits: string) => {
    if (digits.length < 4) {
      setResults([]);
      setSearched(false);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/pos/customers/search?phone=${digits}`);
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

  function handlePhoneChange(value: string) {
    const formatted = formatPhoneInput(value);
    setPhoneInput(formatted);

    const digits = value.replace(/\D/g, '');
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchCustomers(digits), 300);
  }

  function handleSelectResult(result: SearchResult) {
    // Fetch full customer to pass up — the search result has enough for now
    onSelect(result as unknown as Customer);
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Phone input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="tel"
          value={phoneInput}
          onChange={(e) => handlePhoneChange(e.target.value)}
          placeholder="Search by phone..."
          autoFocus
          className="h-10 w-full rounded-md border border-gray-300 bg-white pl-9 pr-3 text-sm focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-200"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-gray-400" />
        )}
      </div>

      {/* Results */}
      {searched && results.length === 0 && (
        <p className="text-center text-sm text-gray-400">No customers found</p>
      )}

      {results.length > 0 && (
        <div className="max-h-48 overflow-y-auto rounded-md border border-gray-200">
          {results.map((r) => (
            <div
              key={r.id}
              className="flex w-full items-center justify-between border-b border-gray-100 px-3 py-2.5 last:border-b-0 hover:bg-gray-50"
            >
              <button
                onClick={() => handleSelectResult(r)}
                className="flex-1 text-left"
              >
                <p className="text-sm font-medium text-gray-900">
                  {r.first_name} {r.last_name}
                </p>
                {r.phone && (
                  <p className="text-xs text-gray-500">
                    {formatPhone(r.phone)}
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
                  <p className="text-xs text-gray-500">
                    {r.visit_count} visit{r.visit_count !== 1 ? 's' : ''}
                  </p>
                  {r.loyalty_points_balance > 0 && (
                    <p className="text-xs text-amber-600">
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
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={onGuest}
        >
          <UserX className="mr-1.5 h-3.5 w-3.5" />
          Guest
        </Button>
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
    </div>
  );
}
