'use client';

import { useState, useMemo } from 'react';
import { SearchInput } from '@/components/ui/search-input';
import { Spinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import type { Conversation, ConversationStatus } from '@/lib/supabase/types';
import { ConversationRow } from './conversation-row';

type FilterTab = 'all' | 'unread' | 'unknown' | 'customers';

export type StatusCounts = Record<ConversationStatus, number>;

interface ConversationListProps {
  conversations: Conversation[];
  selectedId: string | null;
  onSelect: (conversation: Conversation) => void;
  loading: boolean;
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: ConversationStatus;
  onStatusFilterChange: (status: ConversationStatus) => void;
  statusCounts: StatusCounts;
}

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'unknown', label: 'Unknown' },
  { key: 'customers', label: 'Customers' },
];

const STATUS_PILLS: {
  value: ConversationStatus;
  label: string;
  active: string;
  inactive: string;
}[] = [
  {
    value: 'open',
    label: 'Open',
    active: 'bg-green-500 text-white',
    inactive: 'bg-green-100 text-green-800',
  },
  {
    value: 'closed',
    label: 'Closed',
    active: 'bg-yellow-500 text-white',
    inactive: 'bg-yellow-100 text-yellow-800',
  },
  {
    value: 'archived',
    label: 'Archived',
    active: 'bg-gray-500 text-white',
    inactive: 'bg-gray-100 text-gray-600',
  },
];

export function ConversationList({
  conversations,
  selectedId,
  onSelect,
  loading,
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  statusCounts,
}: ConversationListProps) {
  const [filter, setFilter] = useState<FilterTab>('all');

  const filtered = useMemo(() => {
    // Sub-filter tabs only apply when viewing open conversations
    if (statusFilter !== 'open') return conversations;
    let result = conversations;
    if (filter === 'unread') {
      result = result.filter((c) => c.unread_count > 0);
    } else if (filter === 'unknown') {
      result = result.filter((c) => !c.customer_id);
    } else if (filter === 'customers') {
      result = result.filter((c) => c.customer_id);
    }
    return result;
  }, [conversations, filter, statusFilter]);

  const emptyDescription = statusFilter === 'open'
    ? filter !== 'all'
      ? 'No conversations match this filter.'
      : 'Conversations will appear here when customers text your business number.'
    : `No ${statusFilter} conversations.`;

  return (
    <div className="flex h-full flex-col">
      {/* Status pills + Search */}
      <div className="space-y-2 border-b border-gray-200 p-3">
        <div className="flex gap-2">
          {STATUS_PILLS.map((pill) => (
            <button
              key={pill.value}
              onClick={() => onStatusFilterChange(pill.value)}
              className={cn(
                'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
                statusFilter === pill.value ? pill.active : pill.inactive
              )}
            >
              {pill.label} ({statusCounts[pill.value]})
            </button>
          ))}
        </div>
        <SearchInput
          value={search}
          onChange={onSearchChange}
          placeholder="Search by name or phone..."
          className="w-full"
        />
      </div>

      {/* Filter tabs — only shown for open conversations */}
      {statusFilter === 'open' && (
        <div className="flex gap-1 border-b border-gray-200 px-3 py-2">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                filter === tab.key
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner size="md" />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={MessageSquare}
            title="No conversations"
            description={emptyDescription}
          />
        ) : (
          <div className="space-y-0.5 p-2">
            {filtered.map((conversation) => (
              <ConversationRow
                key={conversation.id}
                conversation={conversation}
                isSelected={selectedId === conversation.id}
                onClick={() => onSelect(conversation)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
