'use client';

import { cn } from '@/lib/utils/cn';
import type { Message } from '@/lib/supabase/types';
import { AlertCircle, Phone, MessageSquare } from 'lucide-react';

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

export function MessageBubble({ message }: MessageBubbleProps) {
  const isVoice = message.channel === 'voice';

  // System messages render differently
  if (message.sender_type === 'system') {
    return (
      <div className="flex justify-center py-1">
        <div className="flex items-center gap-1.5">
          {isVoice && <Phone className="h-3 w-3 text-gray-400" />}
          <p className="text-xs text-gray-400">{message.body}</p>
        </div>
      </div>
    );
  }

  const isOutbound = message.direction === 'outbound';
  const isAi = message.sender_type === 'ai';
  const isFailed = message.status === 'failed';

  const senderName = isOutbound
    ? isAi
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
            isVoice
              ? 'bg-amber-50 text-amber-900 border border-amber-200'
              : isOutbound
                ? isAi
                  ? 'bg-purple-600 text-white'
                  : 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-900'
          )}
        >
          {isAi && isOutbound && !isVoice && (
            <span className="mb-0.5 block text-xs font-medium opacity-75">AI</span>
          )}
          {isVoice && (
            <span className="mb-0.5 flex items-center gap-1 text-xs font-medium text-amber-600">
              <Phone className="h-3 w-3" />
              Voice Call
              {message.voice_duration_seconds != null && (
                <span className="text-amber-500">({formatDuration(message.voice_duration_seconds)})</span>
              )}
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
          {!isVoice && senderName && (
            <span className="text-xs text-gray-400">{senderName}</span>
          )}
          <span className="text-xs text-gray-400">{formatMessageTime(message.created_at)}</span>
          {isVoice ? (
            <Phone className="h-3 w-3 text-amber-400" />
          ) : (
            <MessageSquare className="h-3 w-3 text-gray-300" />
          )}
        </div>
      </div>
    </div>
  );
}
