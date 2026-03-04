'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { VariableDefinition } from '@/lib/email/variables';

interface VariableInserterProps {
  variables: VariableDefinition[];
  onInsert: (variable: string) => void;
  label?: string;
}

export function VariableInserter({ variables, onInsert, label = 'Insert Variable' }: VariableInserterProps) {
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

  const filtered = search
    ? variables.filter(
        (v) =>
          v.key.toLowerCase().includes(search.toLowerCase()) ||
          v.description.toLowerCase().includes(search.toLowerCase())
      )
    : variables;

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
        <div className="absolute right-0 z-50 mt-1 w-72 rounded-lg border border-gray-200 bg-white shadow-lg">
          <div className="border-b border-gray-100 p-2">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search variables..."
              className="w-full rounded border border-gray-200 px-2 py-1 text-sm text-base sm:text-sm"
              autoFocus
            />
          </div>
          <div className="max-h-60 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-xs text-gray-400">No variables found</p>
            ) : (
              filtered.map((v) => (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => {
                    onInsert(`{${v.key}}`);
                    setOpen(false);
                    setSearch('');
                  }}
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
