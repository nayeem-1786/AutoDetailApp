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
 * Notification bar: voice channel messages and non-SMS system events.
 * Centered, no bubble, small gray text.
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
      <div className="max-w-[85%] rounded-md bg-gray-50 px-3 py-1.5">
        <div className="flex items-center justify-center gap-1.5">
          {isVoice && <Phone className="h-3 w-3 shrink-0 text-gray-400" />}
          <p className="text-center text-xs text-gray-500 whitespace-pre-wrap break-words">
            {isVoice && message.voice_duration_seconds != null && (
              <span className="font-medium text-gray-600">
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
  // Notification bars: voice channel OR system messages that aren't SMS
  const isNotification =
    message.channel === 'voice' ||
    (message.sender_type === 'system' && message.channel !== 'sms');

  if (isNotification) {
    return <NotificationBar message={message} />;
  }

  // Chat bubbles: all SMS messages (including system-sent SMS)
  const isOutbound = message.direction === 'outbound';
  const isAi = message.sender_type === 'ai';
  const isSystemSms = message.sender_type === 'system' && message.channel === 'sms';
  const isFailed = message.status === 'failed';

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
              Auto
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
