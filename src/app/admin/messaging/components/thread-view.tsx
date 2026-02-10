'use client';

import { useEffect, useRef, useState } from 'react';
import { Spinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  MessageSquare,
  ArrowLeft,
  ExternalLink,
  Bot,
  MoreVertical,
  X as XIcon,
  Archive,
  RotateCcw,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { formatPhone, formatCurrency } from '@/lib/utils/format';
import { adminFetch } from '@/lib/utils/admin-fetch';
import type { Conversation, Message } from '@/lib/supabase/types';
import { MessageBubble } from './message-bubble';
import { ReplyInput } from './reply-input';
import Link from 'next/link';

interface ConversationSummary {
  customer: { name: string; phone: string; type: string } | null;
  vehicle: { year: string; make: string; model: string; color: string } | null;
  latestQuote: {
    quote_number: string;
    status: string;
    total_amount: number;
    services: string[];
    created_at: string;
    sent_at: string | null;
    viewed_at: string | null;
    accepted_at: string | null;
  } | null;
}

interface ThreadViewProps {
  conversation: Conversation | null;
  messages: Message[];
  loading: boolean;
  onSend: (message: string) => Promise<void>;
  onBack?: () => void;
  onUpdateConversation: (updates: Record<string, unknown>) => Promise<void>;
}

export function ThreadView({
  conversation,
  messages,
  loading,
  onSend,
  onBack,
  onUpdateConversation,
}: ThreadViewProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [summary, setSummary] = useState<ConversationSummary | null>(null);

  // Fetch summary when conversation changes
  useEffect(() => {
    if (!conversation) {
      setSummary(null);
      return;
    }
    let cancelled = false;
    async function fetchSummary() {
      try {
        const res = await adminFetch(`/api/admin/messaging/${conversation!.id}/summary`);
        if (res.ok && !cancelled) {
          setSummary(await res.json());
        }
      } catch {
        // Summary is non-critical, fail silently
      }
    }
    setSummary(null);
    fetchSummary();
    return () => { cancelled = true; };
  }, [conversation?.id]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  if (!conversation) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-50">
        <EmptyState
          icon={MessageSquare}
          title="Select a conversation"
          description="Choose a conversation from the list to view messages."
        />
      </div>
    );
  }

  const customer = conversation.customer;
  const displayName = customer
    ? (customer.last_name ? `${customer.first_name} ${customer.last_name}` : customer.first_name)
    : 'Unknown Number';
  const phoneDisplay = formatPhone(conversation.phone_number);
  const isClosed = conversation.status === 'closed' || conversation.status === 'archived';

  // Group messages by date
  const groupedMessages: { date: string; messages: Message[] }[] = [];
  let lastDate = '';
  for (const msg of messages) {
    const date = new Date(msg.created_at).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
    if (date !== lastDate) {
      groupedMessages.push({ date, messages: [msg] });
      lastDate = date;
    } else {
      groupedMessages[groupedMessages.length - 1].messages.push(msg);
    }
  }

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-gray-200 px-4 py-3">
        {onBack && (
          <Button variant="ghost" size="sm" onClick={onBack} className="md:hidden">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-sm font-semibold text-gray-900">
              {displayName}
            </h2>
            {conversation.is_ai_enabled && (
              <Badge variant="secondary" className="text-purple-600">
                <Bot className="mr-1 h-3 w-3" />
                AI Active
              </Badge>
            )}
            <Badge variant={isClosed ? 'default' : 'success'}>
              {conversation.status}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <p className="text-xs text-gray-500">{phoneDisplay}</p>
            {customer && (
              <Link
                href={`/admin/customers/${customer.id}`}
                className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
              >
                View Profile <ExternalLink className="inline h-3 w-3" />
              </Link>
            )}
          </div>
        </div>

        {/* Action menu */}
        <div className="relative" ref={menuRef}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
          {menuOpen && (
            <div className="absolute right-0 top-full z-10 mt-1 w-48 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
              {conversation.is_ai_enabled ? (
                <button
                  onClick={() => {
                    onUpdateConversation({ is_ai_enabled: false });
                    setMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <Bot className="h-4 w-4" />
                  Disable AI Auto-Reply
                </button>
              ) : (
                <button
                  onClick={() => {
                    onUpdateConversation({ is_ai_enabled: true });
                    setMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <Bot className="h-4 w-4" />
                  Enable AI Auto-Reply
                </button>
              )}
              {conversation.status === 'open' ? (
                <>
                  <button
                    onClick={() => {
                      onUpdateConversation({ status: 'closed' });
                      setMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <XIcon className="h-4 w-4" />
                    Close Conversation
                  </button>
                  <button
                    onClick={() => {
                      onUpdateConversation({ status: 'archived' });
                      setMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <Archive className="h-4 w-4" />
                    Archive
                  </button>
                </>
              ) : (
                <button
                  onClick={() => {
                    onUpdateConversation({ status: 'open' });
                    setMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <RotateCcw className="h-4 w-4" />
                  Reopen Conversation
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Summary card */}
      {summary && (
        <div className="border-b border-gray-200 bg-gray-50 px-4 py-2">
          <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700">
            <SummaryCard summary={summary} phoneDisplay={phoneDisplay} />
          </div>
        </div>
      )}

      {/* Messages */}
      <div ref={containerRef} className="flex-1 overflow-y-auto px-4 py-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner size="md" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <p className="text-sm text-gray-400">
              Start of conversation with {displayName}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {groupedMessages.map((group) => (
              <div key={group.date}>
                <div className="mb-3 flex justify-center">
                  <span className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-500">
                    {group.date}
                  </span>
                </div>
                <div className="space-y-2">
                  {group.messages.map((msg) => (
                    <MessageBubble key={msg.id} message={msg} />
                  ))}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Reply input or reopen button */}
      {isClosed ? (
        <div className="border-t border-gray-200 p-3">
          <Button
            variant="outline"
            className="w-full"
            onClick={() => onUpdateConversation({ status: 'open' })}
          >
            <RotateCcw className="h-4 w-4" />
            Reopen Conversation
          </Button>
        </div>
      ) : (
        <ReplyInput onSend={onSend} />
      )}
    </div>
  );
}

function SummaryCard({ summary, phoneDisplay }: { summary: ConversationSummary; phoneDisplay: string }) {
  const { customer, vehicle, latestQuote } = summary;
  const hasCustomerName = customer?.name && customer.name.trim().length > 0;

  // Build vehicle string
  const vehicleParts = [vehicle?.year, vehicle?.make, vehicle?.model, vehicle?.color]
    .filter(Boolean);
  const vehicleStr = vehicleParts.length > 0 ? vehicleParts.join(' ') : '';

  // Build quote status text
  let quoteStatusText = '';
  if (latestQuote) {
    if (latestQuote.accepted_at) {
      quoteStatusText = 'Accepted \u2713';
    } else if (latestQuote.viewed_at) {
      const viewedDate = new Date(latestQuote.viewed_at).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric',
      });
      quoteStatusText = `Viewed ${viewedDate}`;
    } else if (latestQuote.sent_at) {
      quoteStatusText = 'Sent \u00b7 Not yet viewed';
    } else {
      quoteStatusText = latestQuote.status.charAt(0).toUpperCase() + latestQuote.status.slice(1);
    }
  }

  const serviceNames = latestQuote?.services?.join(', ') || '';

  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-1.5">
        <span>{hasCustomerName ? customer!.name : phoneDisplay}</span>
        {hasCustomerName && vehicleStr && (
          <>
            <span className="text-gray-400">&middot;</span>
            <span className="text-gray-500">{vehicleStr}</span>
          </>
        )}
      </div>
      {latestQuote && (
        <div className="text-gray-500">
          Quote #{latestQuote.quote_number}: {serviceNames} &mdash; {formatCurrency(latestQuote.total_amount)} ({quoteStatusText})
        </div>
      )}
    </div>
  );
}
