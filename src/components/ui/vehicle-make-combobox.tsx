'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils/cn';
import { ChevronDown } from 'lucide-react';
import type { VehicleCategory } from '@/lib/utils/vehicle-categories';

interface VehicleMake {
  id: string;
  name: string;
}

interface VehicleMakeComboboxProps {
  value: string;
  onChange: (value: string) => void;
  category?: VehicleCategory;
  className?: string;
  disabled?: boolean;
  id?: string;
  hasError?: boolean;
}

// Cache per category
const cachedMakesByCategory: Record<string, VehicleMake[]> = {};

export function VehicleMakeCombobox({
  value,
  onChange,
  category = 'automobile',
  className,
  disabled,
  id,
  hasError,
}: VehicleMakeComboboxProps) {
  const [makes, setMakes] = useState<VehicleMake[]>(cachedMakesByCategory[category] ?? []);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState(value || '');
  const [isOtherMode, setIsOtherMode] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const prevCategoryRef = useRef(category);

  // Clear selection when category changes
  useEffect(() => {
    if (prevCategoryRef.current !== category) {
      prevCategoryRef.current = category;
      onChange('');
      setSearch('');
      setIsOtherMode(false);
    }
  }, [category, onChange]);

  // Check if current value needs "Other" mode based on makes list
  function detectOtherMode(currentValue: string, makesList: VehicleMake[]) {
    if (currentValue && makesList.length > 0) {
      const inList = makesList.some((m) => m.name.toLowerCase() === currentValue.toLowerCase());
      if (!inList) {
        setIsOtherMode(true);
        setSearch(currentValue);
      } else {
        setIsOtherMode(false);
      }
    }
  }

  // Fetch makes for current category
  useEffect(() => {
    if (cachedMakesByCategory[category]) {
      const cached = cachedMakesByCategory[category];
      setMakes(cached);
      // Re-check Other mode when cached makes are set (value may already be populated)
      detectOtherMode(value, cached);
      return;
    }
    fetch(`/api/vehicle-makes?category=${category}`)
      .then((res) => res.json())
      .then((data) => {
        const list = data.makes ?? [];
        cachedMakesByCategory[category] = list;
        setMakes(list);
        // Check Other mode after fetch completes — value may have been set before makes loaded
        detectOtherMode(value, list);
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  // Sync search field when value prop changes externally
  useEffect(() => {
    setSearch(value || '');
    // If the value is set to something not in the makes list, enter other mode
    if (value && makes.length > 0) {
      const inList = makes.some((m) => m.name.toLowerCase() === value.toLowerCase());
      if (!inList) {
        setIsOtherMode(true);
      } else {
        setIsOtherMode(false);
      }
    } else if (!value) {
      setIsOtherMode(false);
    }
  }, [value, makes]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        if (!isOtherMode) {
          // If user cleared the field, commit the clear
          if (!search.trim()) {
            onChange('');
            return;
          }
          // If user typed something not in the list, revert to current value
          const match = makes.find((m) => m.name.toLowerCase() === search.toLowerCase());
          if (!match) {
            setSearch(value || '');
          }
        }
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [makes, search, value, isOtherMode, onChange]);

  const filtered = search
    ? makes.filter((m) => m.name.toLowerCase().includes(search.toLowerCase()))
    : makes;

  function handleSelect(name: string) {
    setSearch(name);
    onChange(name);
    setOpen(false);
    setIsOtherMode(false);
  }

  function handleSelectOther() {
    setIsOtherMode(true);
    setOpen(false);
    setSearch('');
    onChange('');
    // Focus the input after switching to other mode
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function handleBackToList() {
    setIsOtherMode(false);
    setSearch(value || '');
    onChange('');
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const newValue = e.target.value;
    setSearch(newValue);
    if (isOtherMode) {
      // In "Other" mode, directly set the value
      onChange(newValue);
    } else {
      if (!open) setOpen(true);
      // If user clears the input, clear the selection
      if (!newValue) {
        onChange('');
      }
    }
  }

  function handleInputFocus() {
    if (!isOtherMode) {
      setOpen(true);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      setOpen(false);
      // If user cleared input, commit the clear; otherwise revert to value
      if (!isOtherMode && search.trim()) {
        setSearch(value || '');
      } else if (!search.trim()) {
        onChange('');
      }
      inputRef.current?.blur();
    }
    if (e.key === 'Enter' && !isOtherMode) {
      e.preventDefault();
      // Auto-select first match
      if (filtered.length === 1) {
        handleSelect(filtered[0].name);
      } else {
        const exact = filtered.find((m) => m.name.toLowerCase() === search.toLowerCase());
        if (exact) handleSelect(exact.name);
      }
    }
  }

  // Other mode: free text input
  if (isOtherMode) {
    return (
      <div ref={containerRef}>
        <input
          ref={inputRef}
          id={id}
          type="text"
          value={search}
          onChange={handleInputChange}
          disabled={disabled}
          placeholder="Enter make name..."
          autoComplete="off"
          className={cn(
            'flex h-9 w-full rounded-md border border-ui-input-border bg-ui-input-bg px-3 py-1 text-sm text-ui-text shadow-sm transition-colors placeholder:text-ui-placeholder focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-ring focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50',
            hasError && 'border-red-500 focus-visible:ring-red-500',
            className
          )}
        />
        <button
          type="button"
          onClick={handleBackToList}
          className="mt-1 text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
        >
          Back to list
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          type="text"
          value={search}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder="Search makes..."
          autoComplete="off"
          className={cn(
            'flex h-9 w-full rounded-md border border-ui-input-border bg-ui-input-bg px-3 py-1 pr-8 text-sm text-ui-text shadow-sm transition-colors placeholder:text-ui-placeholder focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-ring focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50',
            hasError && 'border-red-500 focus-visible:ring-red-500',
            className
          )}
        />
        <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-ui-placeholder" />
      </div>

      {open && (
        <div className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-md border border-ui-input-border bg-ui-input-bg shadow-lg">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-xs text-ui-placeholder">
              No matching makes found.
            </div>
          ) : (
            filtered.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => handleSelect(m.name)}
                className={cn(
                  'flex w-full items-center px-3 py-1.5 text-left text-sm hover:bg-ui-ring/10 transition-colors',
                  m.name === value && 'font-medium text-ui-ring'
                )}
              >
                {m.name}
              </button>
            ))
          )}
          {/* Always show "Other" at the bottom */}
          <button
            type="button"
            onClick={handleSelectOther}
            className="flex w-full items-center border-t border-ui-input-border px-3 py-1.5 text-left text-sm text-ui-placeholder hover:bg-ui-ring/10 transition-colors"
          >
            Other (type custom make)
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Generate year options from (currentYear + 2) down to 1980.
 * Used by operator-facing surfaces (POS vehicle dialog, admin Customers
 * vehicle inline form). Wide range to cover classics without forcing
 * operators into a write-in path.
 */
export function getVehicleYearOptions(): number[] {
  const max = new Date().getFullYear() + 2;
  const years: number[] = [];
  for (let y = max; y >= 1980; y--) {
    years.push(y);
  }
  return years;
}

// #132 Issue 2 — supersedes #131's dropdown+Other design.
// Operator reconsidered: replace the year dropdown entirely with a single
// 4-digit text input on customer-facing vehicle forms. Allowed values
// must match `/^(19|20)\d{2}$/` (1900–2099, integer). The "19/20" prefix
// rule IS the range constraint — no separate numeric bounds needed.
//
// The #131 helper `getCustomerVehicleYearOptions()` and constants
// `CUSTOMER_VEHICLE_YEAR_INPUT_MIN`/`_MAX` were removed as dead code.
// The wide-range `getVehicleYearOptions()` above stays — operator surfaces
// (POS, admin) are out of scope per Memory #19's "DRY within trust
// boundary" finding.

/**
 * Validate a customer-entered vehicle year against the #132 text-input rule.
 * Returns `null` when valid; an error message when not.
 * Rule: 4-digit integer with prefix "19" or "20" (range 1900–2099 inclusive).
 */
export function validateCustomerVehicleYear(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return 'Year is required';
  if (!/^\d{4}$/.test(trimmed)) return 'Year must be 4 digits';
  if (!/^(19|20)\d{2}$/.test(trimmed)) return 'Year must start with 19 or 20';
  return null;
}

/**
 * Title-case a vehicle field value (Model, Color).
 */
export function titleCaseField(value: string): string {
  if (!value?.trim()) return '';
  return value
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}
