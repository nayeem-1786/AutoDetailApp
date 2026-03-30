'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/lib/auth/auth-provider';
import { adminFetch } from '@/lib/utils/admin-fetch';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { MessageSquareOff } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { useFeatureFlag } from '@/lib/hooks/use-feature-flag';
import { FEATURE_FLAGS } from '@/lib/utils/constants';
import { usePermission } from '@/lib/hooks/use-permission';
import { Spinner } from '@/components/ui/spinner';
import type { Conversation, ConversationStatus, Message } from '@/lib/supabase/types';
import { ConversationList } from './components/conversation-list';
import type { StatusCounts } from './components/conversation-list';
import { ThreadView } from './components/thread-view';

function deduplicateMessages(messages: Message[]): Message[] {
  const seen = new Map<string, Message>();
  for (const msg of messages) {
    seen.set(msg.id, msg);
  }
  return Array.from(seen.values());
}

function sortConversationsByRecent(convs: Conversation[]): Conversation[] {
  return [...convs].sort((a, b) => {
    const aTime = a.last_message_at || a.created_at;
    const bTime = b.last_message_at || b.created_at;
    return new Date(bTime).getTime() - new Date(aTime).getTime();
  });
}

/** Polling intervals (ms) */
const POLL_MESSAGES_MS = 5_000;
const POLL_CONVERSATIONS_MS = 10_000;

export default function MessagingPage() {
  const { employee } = useAuth();
  const { enabled: twoWaySmsEnabled, loading: flagLoading } = useFeatureFlag(FEATURE_FLAGS.TWO_WAY_SMS);
  const { granted: canAccessMessaging, loading: permLoading } = usePermission('marketing.two_way_sms');

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [_messagesCache, setMessagesCache] = useState<Record<string, Message[]>>({});
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ConversationStatus>('open');
  const [statusCounts, setStatusCounts] = useState<StatusCounts>({ open: 0, closed: 0, archived: 0 });
  const [mobileView, setMobileView] = useState<'list' | 'thread'>('list');
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const searchDebounceRef = useRef<NodeJS.Timeout>(null);
  const activeConversationIdRef = useRef<string | null>(null);
  const searchRef = useRef(search);
  const statusFilterRef = useRef(statusFilter);
  const supabase = createClient();

  // Keep refs in sync so polling/Realtime handlers always have the latest values
  useEffect(() => {
    activeConversationIdRef.current = activeConversation?.id || null;
  }, [activeConversation?.id]);

  useEffect(() => {
    searchRef.current = search;
  }, [search]);

  useEffect(() => {
    statusFilterRef.current = statusFilter;
  }, [statusFilter]);

  // Fetch status counts for pills
  const fetchStatusCounts = useCallback(async () => {
    try {
      const res = await adminFetch('/api/messaging/conversations/counts');
      if (res.ok) {
        const { data } = await res.json();
        setStatusCounts(data);
      }
    } catch {
      // Silent fail — counts are non-critical
    }
  }, []);

  // Fetch conversations
  const fetchConversations = useCallback(async (searchTerm?: string, status?: ConversationStatus) => {
    try {
      const params = new URLSearchParams({ status: status || 'open' });
      if (searchTerm && searchTerm.length >= 2) {
        params.set('search', searchTerm);
      }
      const res = await adminFetch(`/api/messaging/conversations?${params}`);
      if (res.ok) {
        const { data } = await res.json();
        setConversations(data || []);
      }
    } catch {
      toast.error('Failed to load conversations');
    } finally {
      setLoadingConversations(false);
    }
  }, []);

  // Initial load + refetch when status filter changes
  useEffect(() => {
    setLoadingConversations(true);
    fetchConversations(search, statusFilter);
    fetchStatusCounts();
  }, [fetchConversations, fetchStatusCounts, statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced search
  useEffect(() => {
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }
    if (search.length === 0 || search.length >= 2) {
      searchDebounceRef.current = setTimeout(() => {
        setLoadingConversations(true);
        fetchConversations(search, statusFilter);
      }, 300);
    }
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [search, fetchConversations, statusFilter]);

  // Fetch messages for active conversation (always fetches fresh)
  const fetchMessages = useCallback(async (conversationId: string) => {
    setLoadingMessages(true);
    try {
      const res = await adminFetch(`/api/messaging/conversations/${conversationId}/messages`);
      if (res.ok) {
        const { data } = await res.json();
        const dedupedData = deduplicateMessages(data || []);
        setMessages(dedupedData);
        setMessagesCache((prev) => ({ ...prev, [conversationId]: dedupedData }));
      }
    } catch {
      toast.error('Failed to load messages');
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  // Silent poll: refetch messages without loading spinner, merge with existing state
  const pollMessages = useCallback(async () => {
    const conversationId = activeConversationIdRef.current;
    if (!conversationId) return;
    if (document.visibilityState !== 'visible') return;

    try {
      const res = await adminFetch(`/api/messaging/conversations/${conversationId}/messages`);
      if (res.ok) {
        const { data } = await res.json();
        const freshMessages = deduplicateMessages(data || []);
        setMessages((prev) => {
          // Merge: keep optimistic messages, add any new from server
          const merged = deduplicateMessages([...prev, ...freshMessages]);
          // Only update if there's actually a change (avoid unnecessary re-renders)
          if (merged.length === prev.length && merged.every((m, i) => m.id === prev[i]?.id)) {
            return prev;
          }
          return merged;
        });
      }
    } catch {
      // Silent fail — polling is best-effort
    }
  }, []);

  // Silent poll: refetch conversations without loading spinner
  const pollConversations = useCallback(async () => {
    if (document.visibilityState !== 'visible') return;

    try {
      const params = new URLSearchParams({ status: statusFilterRef.current || 'open' });
      const currentSearch = searchRef.current;
      if (currentSearch && currentSearch.length >= 2) {
        params.set('search', currentSearch);
      }
      const res = await adminFetch(`/api/messaging/conversations?${params}`);
      if (res.ok) {
        const { data } = await res.json();
        setConversations(data || []);
        // Update active conversation if it's in the new data
        const activeId = activeConversationIdRef.current;
        if (activeId) {
          const updated = (data || []).find((c: Conversation) => c.id === activeId);
          if (updated) {
            setActiveConversation((prev) => prev ? { ...prev, ...updated } : prev);
          }
        }
      }
    } catch {
      // Silent fail
    }
    // Also refresh counts
    fetchStatusCounts();
  }, [fetchStatusCounts]);

  // Mark conversation as read
  const markAsRead = useCallback(async (conversationId: string) => {
    try {
      await adminFetch(`/api/messaging/conversations/${conversationId}/read`, {
        method: 'PATCH',
      });
      // Update local state
      setConversations((prev) =>
        prev.map((c) =>
          c.id === conversationId ? { ...c, unread_count: 0 } : c
        )
      );
    } catch {
      // Silent fail
    }
  }, []);

  // Select conversation
  const handleSelectConversation = useCallback(
    (conversation: Conversation) => {
      setActiveConversation(conversation);
      fetchMessages(conversation.id);
      if (conversation.unread_count > 0) {
        markAsRead(conversation.id);
      }
      setMobileView('thread');
    },
    [fetchMessages, markAsRead]
  );

  // Send message
  const handleSendMessage = useCallback(
    async (body: string) => {
      if (!activeConversation) return;

      // Optimistic message with sender data so the name renders immediately
      const optimisticId = `optimistic-${Date.now()}`;
      const optimisticMsg: Message = {
        id: optimisticId,
        conversation_id: activeConversation.id,
        direction: 'outbound',
        body,
        media_url: null,
        sender_type: 'staff',
        sent_by: employee?.id || null,
        twilio_sid: null,
        status: 'sent',
        channel: 'sms',
        voice_duration_seconds: null,
        metadata: null,
        created_at: new Date().toISOString(),
        sender: employee
          ? { id: employee.id, first_name: employee.first_name, last_name: employee.last_name } as Message['sender']
          : undefined,
      };

      setMessages((prev) => deduplicateMessages([...prev, optimisticMsg]));
      setMessagesCache((prev) => ({
        ...prev,
        [activeConversation.id]: deduplicateMessages([...(prev[activeConversation.id] || []), optimisticMsg]),
      }));

      // Update conversation preview immediately
      setConversations((prev) =>
        prev.map((c) =>
          c.id === activeConversation.id
            ? {
                ...c,
                last_message_at: new Date().toISOString(),
                last_message_preview: body.slice(0, 100),
              }
            : c
        )
      );

      const res = await adminFetch(
        `/api/messaging/conversations/${activeConversation.id}/messages`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body }),
        }
      );

      if (res.ok) {
        const json = await res.json();
        const newMessage = json.data as Message;

        // Replace optimistic message with real one (also deduplicates against Realtime)
        setMessages((prev) => {
          const without = prev.filter((m) => m.id !== optimisticId);
          return deduplicateMessages([...without, newMessage]);
        });
        setMessagesCache((prev) => {
          const existing = (prev[activeConversation.id] || []).filter((m) => m.id !== optimisticId);
          return { ...prev, [activeConversation.id]: deduplicateMessages([...existing, newMessage]) };
        });

        if (json.warning) {
          toast.error(json.warning);
        } else {
          toast.success('Message sent');
        }
      } else {
        // Remove optimistic message on failure
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
        setMessagesCache((prev) => {
          const existing = (prev[activeConversation.id] || []).filter((m) => m.id !== optimisticId);
          return { ...prev, [activeConversation.id]: existing };
        });
        const json = await res.json();
        toast.error(json.error || 'Failed to send message');
        throw new Error(json.error);
      }
    },
    [activeConversation, employee]
  );

  // Update conversation (status, AI toggle, etc.)
  const handleUpdateConversation = useCallback(
    async (updates: Record<string, unknown>) => {
      if (!activeConversation) return;

      const res = await adminFetch(
        `/api/messaging/conversations/${activeConversation.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        }
      );

      if (res.ok) {
        const { data } = await res.json();
        // If the conversation status changed, it may no longer belong in the current list
        if (updates.status && updates.status !== statusFilter) {
          setConversations((prev) => prev.filter((c) => c.id !== data.id));
          setActiveConversation(null);
          setMessages([]);
          fetchStatusCounts();
        } else {
          setActiveConversation(data);
          setConversations((prev) =>
            prev.map((c) => (c.id === data.id ? data : c))
          );
        }
        toast.success('Conversation updated');
      } else {
        const json = await res.json();
        toast.error(json.error || 'Failed to update conversation');
      }
    },
    [activeConversation, statusFilter, fetchStatusCounts]
  );

  // ---------------------------------------------------------------------------
  // Realtime: new messages for active conversation
  // Uses activeConversation?.id (primitive) to avoid tearing down the channel on object ref changes
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const conversationId = activeConversation?.id;
    if (!conversationId) return;

    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload: { new: Record<string, unknown> }) => {
          const newMsg = payload.new as unknown as Message;
          setMessages((prev) => deduplicateMessages([...prev, newMsg]));
          setMessagesCache((prev) => ({
            ...prev,
            [conversationId]: deduplicateMessages([...(prev[conversationId] || []), newMsg]),
          }));
        }
      )
      .subscribe((status: string, err?: Error) => {
        if (status === 'SUBSCRIBED') {
          setRealtimeConnected(true);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('[Messaging] Messages channel error:', status, err);
          setRealtimeConnected(false);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConversation?.id]);

  // ---------------------------------------------------------------------------
  // Realtime: conversation updates (new conversations, unread changes)
  // Stable subscription — never tears down except on unmount. Uses ref for active conversation ID.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const channel = supabase
      .channel('conversations-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversations',
        },
        (payload: { eventType: string; new: Record<string, unknown> }) => {
          if (payload.eventType === 'INSERT') {
            // Fetch full conversation list to get customer joins for the new conversation
            fetchConversations();
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as unknown as Conversation;
            setConversations((prev) => {
              const mapped = prev.map((c) =>
                c.id === updated.id ? { ...c, ...updated } : c
              );
              return sortConversationsByRecent(mapped);
            });
            // Update active conversation if it's the one being updated
            if (activeConversationIdRef.current === updated.id) {
              setActiveConversation((prev) =>
                prev ? { ...prev, ...updated } : prev
              );
            }
            // Invalidate messages cache for non-active conversations so next view fetches fresh
            if (activeConversationIdRef.current !== updated.id) {
              setMessagesCache((prev) => {
                if (!prev[updated.id]) return prev;
                const next = { ...prev };
                delete next[updated.id];
                return next;
              });
            }
          }
        }
      )
      .subscribe((status: string, err?: Error) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('[Messaging] Conversations channel error:', status, err);
          setRealtimeConnected(false);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------------------
  // Polling: always-on baseline. Realtime provides bonus instant delivery
  // when it works, but polling runs continuously regardless.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const msgInterval = setInterval(pollMessages, POLL_MESSAGES_MS);
    const convInterval = setInterval(pollConversations, POLL_CONVERSATIONS_MS);

    return () => {
      clearInterval(msgInterval);
      clearInterval(convInterval);
    };
  }, [pollMessages, pollConversations]);

  const handleStatusFilterChange = useCallback((status: ConversationStatus) => {
    setStatusFilter(status);
    setActiveConversation(null);
    setMessages([]);
    setMobileView('list');
  }, []);

  const handleBack = () => {
    setMobileView('list');
  };

  // Permission gate
  if (permLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!canAccessMessaging) {
    return (
      <div>
        <PageHeader title="Messaging" />
        <div className="mt-12 flex flex-col items-center justify-center text-center">
          <p className="text-lg font-medium text-gray-900">Access Denied</p>
          <p className="mt-1 text-sm text-gray-500">You do not have permission to access messaging.</p>
        </div>
      </div>
    );
  }

  // Gate: show disabled state if two_way_sms feature flag is off
  if (!flagLoading && !twoWaySmsEnabled) {
    return (
      <div className="flex h-[calc(100vh-7rem)] flex-col">
        <PageHeader title="Messaging" />
        <div className="mt-4 flex flex-1 items-center justify-center rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="text-center px-6">
            <MessageSquareOff className="mx-auto h-12 w-12 text-gray-300" />
            <h2 className="mt-4 text-lg font-semibold text-gray-900">Two-Way SMS Messaging is Disabled</h2>
            <p className="mt-2 text-sm text-gray-500 max-w-md">
              Enable the Two-Way SMS feature flag to receive and respond to customer SMS messages,
              use the AI auto-responder, and generate auto-quotes.
            </p>
            <a
              href="/admin/settings/feature-toggles"
              className="mt-4 inline-flex items-center gap-2 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 transition-colors"
            >
              Go to Feature Toggles
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col">
      <PageHeader title="Messaging" />

      {/* Polling indicator */}
      {!realtimeConnected && activeConversation && (
        <div className="px-4 pb-1">
          <p className="text-xs text-gray-400">Live updates unavailable — refreshing automatically</p>
        </div>
      )}

      <div className="mt-4 flex flex-1 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        {/* Left Panel - Conversation List */}
        <div
          className={`w-full border-r border-gray-200 md:w-80 lg:w-96 md:block ${
            mobileView === 'list' ? 'block' : 'hidden'
          }`}
        >
          <ConversationList
            conversations={conversations}
            selectedId={activeConversation?.id || null}
            onSelect={handleSelectConversation}
            loading={loadingConversations}
            search={search}
            onSearchChange={setSearch}
            statusFilter={statusFilter}
            onStatusFilterChange={handleStatusFilterChange}
            statusCounts={statusCounts}
          />
        </div>

        {/* Right Panel - Thread View */}
        <div
          className={`flex-1 md:block ${
            mobileView === 'thread' ? 'block' : 'hidden'
          }`}
        >
          <ThreadView
            conversation={activeConversation}
            messages={messages}
            loading={loadingMessages}
            onSend={handleSendMessage}
            onBack={handleBack}
            onUpdateConversation={handleUpdateConversation}
          />
        </div>
      </div>
    </div>
  );
}
