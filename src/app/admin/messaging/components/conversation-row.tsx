'use client';

import { cn } from '@/lib/utils/cn';
import { formatPhone } from '@/lib/utils/format';
import type { Conversation } from '@/lib/supabase/types';
import { Phone, Bot } from 'lucide-react';

interface ConversationRowProps {
  conversation: Conversation;
  isSelected: boolean;
  onClick: () => void;
}

function formatRelativeTime(date: string): string {
  const now = new Date();
  const d = new Date(date);
  const diffMs = now.getTime() - d.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMinutes < 1) return 'Now';
  if (diffMinutes < 60) return `${diffMinutes}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function ConversationRow({ conversation, isSelected, onClick }: ConversationRowProps) {
  const customer = conversation.customer;
  const displayName = customer
    ? (customer.last_name ? `${customer.first_name} ${customer.last_name}` : customer.first_name)
    : formatPhone(conversation.phone_number);
  const initials = customer
    ? (customer.last_name ? `${customer.first_name[0]}${customer.last_name[0]}` : customer.first_name[0])
    : null;

  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-start gap-3 rounded-md px-3 py-3 text-left transition-colors',
        isSelected
          ? 'bg-blue-50 text-gray-900'
          : 'hover:bg-gray-50'
      )}
    >
      {/* Avatar */}
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-200 text-sm font-medium text-gray-600">
        {initials || <Phone className="h-4 w-4" />}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className={cn(
            'truncate text-sm',
            conversation.unread_count > 0 ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'
          )}>
            {displayName}
          </span>
          <div className="flex shrink-0 items-center gap-1.5">
            {conversation.is_ai_enabled && (
              <Bot className="h-3.5 w-3.5 text-purple-500" />
            )}
            {conversation.last_message_at && (
              <span className="text-xs text-gray-400">
                {formatRelativeTime(conversation.last_message_at)}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between gap-2">
          <p className={cn(
            'truncate text-xs',
            conversation.unread_count > 0 ? 'font-medium text-gray-600' : 'text-gray-400'
          )}>
            {conversation.last_message_preview || 'No messages yet'}
          </p>
          {conversation.unread_count > 0 && (
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-medium text-white">
              {conversation.unread_count > 9 ? '9+' : conversation.unread_count}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
