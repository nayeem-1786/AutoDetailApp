'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/lib/auth/auth-provider';
import { adminFetch } from '@/lib/utils/admin-fetch';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { PageHeader } from '@/components/ui/page-header';
import type { Conversation, Message } from '@/lib/supabase/types';
import { ConversationList } from './components/conversation-list';
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

export default function MessagingPage() {
  const { employee } = useAuth();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesCache, setMessagesCache] = useState<Record<string, Message[]>>({});
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [search, setSearch] = useState('');
  const [mobileView, setMobileView] = useState<'list' | 'thread'>('list');
  const searchDebounceRef = useRef<NodeJS.Timeout>(null);
  const activeConversationIdRef = useRef<string | null>(null);
  const supabase = createClient();

  // Keep ref in sync so Realtime handlers always have the latest value
  useEffect(() => {
    activeConversationIdRef.current = activeConversation?.id || null;
  }, [activeConversation?.id]);

  // Fetch conversations
  const fetchConversations = useCallback(async (searchTerm?: string) => {
    try {
      const params = new URLSearchParams({ status: 'open' });
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

  // Initial load
  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Debounced search
  useEffect(() => {
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }
    if (search.length === 0 || search.length >= 2) {
      searchDebounceRef.current = setTimeout(() => {
        setLoadingConversations(true);
        fetchConversations(search);
      }, 300);
    }
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [search, fetchConversations]);

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
        setActiveConversation(data);
        setConversations((prev) =>
          prev.map((c) => (c.id === data.id ? data : c))
        );
        toast.success('Conversation updated');
      } else {
        const json = await res.json();
        toast.error(json.error || 'Failed to update conversation');
      }
    },
    [activeConversation]
  );

  // Realtime: new messages for active conversation
  // Uses activeConversation?.id (primitive) to avoid tearing down the channel on object ref changes
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
      .subscribe((status, err) => {
        if (status === 'CHANNEL_ERROR') {
          console.error('[Messaging] Messages channel error:', err);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConversation?.id]);

  // Realtime: conversation updates (new conversations, unread changes)
  // Stable subscription — never tears down except on unmount. Uses ref for active conversation ID.
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
      .subscribe((status, err) => {
        if (status === 'CHANNEL_ERROR') {
          console.error('[Messaging] Conversations channel error:', err);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleBack = () => {
    setMobileView('list');
  };

  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col">
      <PageHeader title="Messaging" />

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
