'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SearchInput } from '@/components/ui/search-input';
import type { VariableDefinition } from '@/lib/email/variables';

export interface VariableSections {
  required: VariableDefinition[];
  optional: VariableDefinition[];
}

interface VariableInserterProps {
  /** Flat list mode (single-line rows, no headers). Used by email templates. */
  variables?: VariableDefinition[];
  /** Sectioned mode (two-line rows, Required/Optional headers). Used by SMS templates. */
  sections?: VariableSections;
  onInsert: (variable: string) => void;
  label?: string;
}

export function VariableInserter({ variables, sections, onInsert, label = 'Insert Variable' }: VariableInserterProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const matchesSearch = (v: VariableDefinition) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return v.key.toLowerCase().includes(q) || v.description.toLowerCase().includes(q);
  };

  const handleSelect = (key: string) => {
    onInsert(`{${key}}`);
    setOpen(false);
    setSearch('');
  };

  // `sections` takes precedence over `variables` when both are passed.
  const useSections = sections !== undefined;
  const filteredFlat = useSections ? null : (variables ?? []).filter(matchesSearch);
  const filteredRequired = useSections ? sections!.required.filter(matchesSearch) : null;
  const filteredOptional = useSections ? sections!.optional.filter(matchesSearch) : null;
  const totalCount = useSections
    ? (filteredRequired?.length ?? 0) + (filteredOptional?.length ?? 0)
    : (filteredFlat?.length ?? 0);

  return (
    <div className="relative" ref={ref}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setOpen(!open)}
        className="text-xs text-gray-500"
      >
        {'{}'} {label}
        <ChevronDown className="ml-1 h-3 w-3" />
      </Button>

      {open && (
        <div className="absolute right-0 z-50 mt-1 min-w-[280px] max-w-[360px] rounded-lg border border-gray-200 bg-white shadow-lg">
          <div className="border-b border-gray-100 p-2">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search variables..."
              autoFocus
            />
          </div>
          <div className="max-h-72 overflow-y-auto p-1">
            {totalCount === 0 ? (
              <p className="px-3 py-2 text-xs text-gray-400">No variables found</p>
            ) : useSections ? (
              <>
                {filteredRequired!.length > 0 && (
                  <>
                    <div className="px-2 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                      Required
                    </div>
                    {filteredRequired!.map((v) => (
                      <button
                        key={`req-${v.key}`}
                        type="button"
                        onClick={() => handleSelect(v.key)}
                        className="flex w-full flex-col items-start gap-0.5 rounded px-3 py-2 text-left hover:bg-gray-50"
                      >
                        <div className="flex items-center gap-1">
                          <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-xs text-gray-700">
                            {`{${v.key}}`}
                          </code>
                          <span className="text-xs font-semibold text-red-500" aria-label="required">*</span>
                        </div>
                        <span className="break-words text-xs leading-tight text-gray-500">{v.description}</span>
                      </button>
                    ))}
                  </>
                )}
                {filteredOptional!.length > 0 && (
                  <>
                    <div className="px-2 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                      Optional
                    </div>
                    {filteredOptional!.map((v) => (
                      <button
                        key={`opt-${v.key}`}
                        type="button"
                        onClick={() => handleSelect(v.key)}
                        className="flex w-full flex-col items-start gap-0.5 rounded px-3 py-2 text-left hover:bg-gray-50"
                      >
                        <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-xs text-gray-700">
                          {`{${v.key}}`}
                        </code>
                        <span className="break-words text-xs leading-tight text-gray-500">{v.description}</span>
                      </button>
                    ))}
                  </>
                )}
              </>
            ) : (
              filteredFlat!.map((v) => (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => handleSelect(v.key)}
                  className="flex w-full items-center gap-2 rounded px-3 py-1.5 text-left text-sm hover:bg-gray-50"
                >
                  <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-xs text-gray-700">
                    {`{${v.key}}`}
                  </code>
                  <span className="truncate text-xs text-gray-500">{v.description}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
