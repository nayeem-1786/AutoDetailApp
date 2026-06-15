'use client';

import { cn } from '@/lib/utils/cn';
import type { Message } from '@/lib/supabase/types';
import { AlertCircle, Phone, MessageSquare, Bot } from 'lucide-react';

interface MessageBubbleProps {
  message: Message;
}

function formatMessageTime(date: string): string {
  const d = new Date(date);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

/**
 * Override map for notification type labels (Issue 46, 2026-05-26). Used
 * when the generic snake_case → Title Case transform produces a misleading
 * or imprecise label.
 *
 * The `send_quote_sms` route at
 * `src/app/api/voice-agent/send-quote-sms/route.ts` is invoked by two
 * distinct agent paths:
 *
 *   1. SMS-AI v2 agent — `src/lib/sms-ai/tool-dispatcher.ts`
 *      `callSendQuoteSms` passes `source: 'sms_agent'` in the request
 *      body. Route branches notificationType → `'sms_agent_quote_sent'`.
 *
 *   2. ElevenLabs voice-agent webhook — does NOT pass `source`. Route
 *      defaults notificationType → `'voice_quote_sent'`. The voice
 *      post-call confirmation path at
 *      `src/lib/services/voice-post-call.ts:676` is genuinely voice-only
 *      and also writes `'voice_quote_sent'` directly.
 *
 * The two notificationType values are STABLE machine identifiers
 * persisted in `messages.metadata` for dedup (`src/lib/sms/dedup.ts`)
 * and audit consistency. Only the operator-facing Admin Messages log
 * labels change here — customer-facing SMS bodies never contained these
 * strings.
 *
 * Initial Issue 46 fix (commit 9a6fb0a6) was a channel-NEUTRAL
 * `"Agent Quote Sent"` label. This refinement (2026-05-26) makes the
 * labels channel-AWARE so operators can distinguish at a glance which
 * agent path triggered a quote.
 *
 * Add new overrides here when generic title-casing produces wrong labels.
 */
const NOTIFICATION_LABEL_OVERRIDES: Record<string, string> = {
  voice_quote_sent: 'Voice Agent Quote Sent',
  sms_agent_quote_sent: 'SMS Agent Quote Sent',
};

/**
 * Format a `metadata.notificationType` machine string for operator display.
 *
 * `null`/`undefined`/empty → returns `null` (caller renders bare "Auto" badge).
 * Defensive: any future notificationType missing from the override map falls
 * back to generic snake_case → Title Case rather than crashing or bleeding
 * raw snake_case through to the UI.
 */
function formatNotificationLabel(notificationType: string | null | undefined): string | null {
  if (!notificationType) return null;
  return (
    NOTIFICATION_LABEL_OVERRIDES[notificationType] ??
    notificationType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

/**
 * Notification bar: voice channel messages and system status-marker events.
 * Centered, no bubble, small gray text. Voice messages render call duration.
 *
 * Status markers reach this branch via the `isStatusMarker` predicate in
 * MessageBubble — system-sent rows with NO `metadata.notificationType`
 * (reactivation banner, auto-close banner). Customer-facing system SMS
 * (payment links, receipts, job-complete, etc.) carry a notificationType
 * and route to ChatBubble instead — see Session #154 fix.
 */
function NotificationBar({ message }: { message: Message }) {
  const isVoice = message.channel === 'voice';

  // Strip the "Phone call (X:XX)\n" prefix from body when we render duration separately
  let displayBody = message.body;
  if (isVoice && message.voice_duration_seconds != null) {
    displayBody = displayBody.replace(/^Phone call\s*\(\d+:\d+\)\s*\n?/, '');
  }

  return (
    <div className="flex justify-center py-1.5">
      <div className="max-w-[85%] rounded-md bg-gray-50 px-3 py-1.5 dark:bg-gray-800">
        <div className="flex items-center justify-center gap-1.5">
          {isVoice ? (
            <Phone className="h-3 w-3 shrink-0 text-gray-400" />
          ) : (
            <MessageSquare className="h-3 w-3 shrink-0 text-blue-400" />
          )}
          <p className="text-center text-xs text-gray-500 dark:text-gray-400 whitespace-pre-wrap break-words">
            {isVoice && message.voice_duration_seconds != null && (
              <span className="font-medium text-gray-600 dark:text-gray-300">
                Phone call ({formatDuration(message.voice_duration_seconds)})
                {displayBody ? ' — ' : ''}
              </span>
            )}
            {displayBody}
          </p>
          <span className="shrink-0 text-[10px] text-gray-400">{formatMessageTime(message.created_at)}</span>
        </div>
      </div>
    </div>
  );
}

export function MessageBubble({ message }: MessageBubbleProps) {
  // Predicate-based routing (Session #154, 2026-06-14):
  //
  //   - Voice-channel messages → NotificationBar (always; centered marker
  //     for call-summary entries).
  //   - System-sent SMS WITHOUT `metadata.notificationType` → NotificationBar
  //     (status markers: reactivation banner, auto-close banner, etc.).
  //   - System-sent SMS WITH `metadata.notificationType` → ChatBubble
  //     (customer-facing notifications: payment links, receipts, job-complete,
  //     appointment-confirmed, agent quote sends, etc.). Renders full body
  //     with no truncation; "Auto · {label}" badge surfaces the trigger.
  //   - Inbound + staff + AI → ChatBubble (unchanged).
  //
  // The `metadata.notificationType` predicate mirrors the load-bearing
  // contract codified in Session #150 at
  // `src/lib/utils/conversation-helpers.ts:259-269` and the AI-context
  // filter at `src/app/api/webhooks/twilio/inbound/route.ts:540-545`:
  // presence = customer-facing notification (AI sees, customer received);
  // absence = internal status marker (AI ignores, operator-visible only).
  //
  // Pre-#154 ALL `sender_type='system'` SMS rendered as centered NotificationBar
  // with a 120-char substring truncation — payment-link URLs >120 chars
  // displayed as "smartdetailsautospa.com/pay/abc..." (truncated mid-URL),
  // and the operator could not retrieve the full URL from the thread view.
  // Routing the customer-facing subset to ChatBubble eliminates the
  // truncation AND restores the chat-bubble system variant first added in
  // commit 11d4ad00c (2026-03-26) that 08532a933 (2026-03-30) inadvertently
  // orphaned when introducing the unified-system-SMS UI for status markers.
  const isStatusMarker =
    message.sender_type === 'system' && !message.metadata?.notificationType;
  const isNotification = message.channel === 'voice' || isStatusMarker;

  if (isNotification) {
    return <NotificationBar message={message} />;
  }

  // Chat bubbles: all SMS messages (including notification-bearing system SMS)
  const isOutbound = message.direction === 'outbound';
  const isAi = message.sender_type === 'ai';
  const isSystemSms = message.sender_type === 'system' && message.channel === 'sms';
  const isFailed = message.status === 'failed';
  const notifLabel = isSystemSms
    ? formatNotificationLabel(message.metadata?.notificationType)
    : null;

  const senderName = isOutbound
    ? isSystemSms
      ? null
      : isAi
        ? 'AI'
        : message.sender
          ? (message.sender.last_name ? `${message.sender.first_name} ${message.sender.last_name}` : message.sender.first_name)
          : 'Staff'
    : null;

  return (
    <div className={cn('flex', isOutbound ? 'justify-end' : 'justify-start')}>
      <div className={cn('max-w-[75%] space-y-1', isOutbound ? 'items-end' : 'items-start')}>
        <div
          className={cn(
            'rounded-2xl px-3 py-2 text-sm',
            isOutbound
              ? isAi
                ? 'bg-purple-600 text-white'
                : isSystemSms
                  ? 'bg-blue-500 text-white'
                  : 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-900'
          )}
        >
          {isAi && isOutbound && (
            <span className="mb-0.5 block text-xs font-medium opacity-75">AI</span>
          )}
          {isSystemSms && isOutbound && (
            <span className="mb-0.5 flex items-center gap-1 text-xs font-medium opacity-75">
              <Bot className="h-3 w-3" />
              {notifLabel ? `Auto · ${notifLabel}` : 'Auto'}
            </span>
          )}
          <p className="whitespace-pre-wrap break-words">{message.body}</p>
        </div>
        <div className={cn('flex items-center gap-1.5', isOutbound ? 'justify-end' : 'justify-start')}>
          {isFailed && (
            <span className="flex items-center gap-0.5 text-xs text-red-500">
              <AlertCircle className="h-3 w-3" />
              Failed
            </span>
          )}
          {senderName && (
            <span className="text-xs text-gray-400">{senderName}</span>
          )}
          <span className="text-xs text-gray-400">{formatMessageTime(message.created_at)}</span>
          <MessageSquare className="h-3 w-3 text-gray-300" />
        </div>
      </div>
    </div>
  );
}
