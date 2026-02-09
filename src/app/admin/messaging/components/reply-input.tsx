'use client';

import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Send } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';

interface ReplyInputProps {
  onSend: (message: string) => Promise<void>;
  disabled?: boolean;
  maxLength?: number;
}

export function ReplyInput({ onSend, disabled, maxLength = 1600 }: ReplyInputProps) {
  const [value, setValue] = useState('');
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    const maxHeight = 3 * 24; // ~3 lines
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
  }, []);

  const handleSend = async () => {
    const trimmed = value.trim();
    if (!trimmed || sending) return;

    setSending(true);
    try {
      await onSend(trimmed);
      setValue('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const remaining = maxLength - value.length;

  return (
    <div className="border-t border-gray-200 bg-white p-3">
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            adjustHeight();
          }}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          disabled={disabled || sending}
          maxLength={maxLength}
          rows={1}
          className="flex-1 resize-none rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
        />
        <Button
          size="sm"
          onClick={handleSend}
          disabled={!value.trim() || sending || disabled}
          className="h-9 w-9 shrink-0 p-0"
        >
          {sending ? <Spinner size="sm" className="text-white" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
      {value.length > maxLength * 0.8 && (
        <p className={`mt-1 text-right text-xs ${remaining < 0 ? 'text-red-500' : 'text-gray-400'}`}>
          {remaining} characters remaining
        </p>
      )}
    </div>
  );
}
