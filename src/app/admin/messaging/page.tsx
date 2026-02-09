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

export default function MessagingPage() {
  useAuth(); // auth context guard

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesCache, setMessagesCache] = useState<Record<string, Message[]>>({});
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [search, setSearch] = useState('');
  const [mobileView, setMobileView] = useState<'list' | 'thread'>('list');
  const searchDebounceRef = useRef<NodeJS.Timeout>(null);
  const supabase = createClient();

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

  // Fetch messages for active conversation
  const fetchMessages = useCallback(async (conversationId: string) => {
    // Check cache first
    if (messagesCache[conversationId]) {
      setMessages(messagesCache[conversationId]);
      return;
    }

    setLoadingMessages(true);
    try {
      const res = await adminFetch(`/api/messaging/conversations/${conversationId}/messages`);
      if (res.ok) {
        const { data } = await res.json();
        setMessages(data || []);
        setMessagesCache((prev) => ({ ...prev, [conversationId]: data || [] }));
      }
    } catch {
      toast.error('Failed to load messages');
    } finally {
      setLoadingMessages(false);
    }
  }, [messagesCache]);

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

        // Add to messages
        setMessages((prev) => [...prev, newMessage]);
        setMessagesCache((prev) => ({
          ...prev,
          [activeConversation.id]: [...(prev[activeConversation.id] || []), newMessage],
        }));

        // Update conversation preview
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

        if (json.warning) {
          toast.error(json.warning);
        } else {
          toast.success('Message sent');
        }
      } else {
        const json = await res.json();
        toast.error(json.error || 'Failed to send message');
        throw new Error(json.error);
      }
    },
    [activeConversation]
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
  useEffect(() => {
    if (!activeConversation) return;

    const channel = supabase
      .channel(`messages:${activeConversation.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${activeConversation.id}`,
        },
        (payload: { new: Record<string, unknown> }) => {
          const newMsg = payload.new as unknown as Message;
          // Don't add duplicates (our own sent messages are already in state)
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
          setMessagesCache((prev) => {
            const existing = prev[activeConversation.id] || [];
            if (existing.some((m) => m.id === newMsg.id)) return prev;
            return { ...prev, [activeConversation.id]: [...existing, newMsg] };
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeConversation, supabase]);

  // Realtime: conversation updates (new conversations, unread changes)
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
            const newConv = payload.new as unknown as Conversation;
            setConversations((prev) => {
              if (prev.some((c) => c.id === newConv.id)) return prev;
              return [newConv, ...prev];
            });
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as unknown as Conversation;
            setConversations((prev) =>
              prev.map((c) =>
                c.id === updated.id ? { ...c, ...updated } : c
              )
            );
            // Update active conversation if it's the one being updated
            if (activeConversation?.id === updated.id) {
              setActiveConversation((prev) =>
                prev ? { ...prev, ...updated } : prev
              );
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, activeConversation?.id]);

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
