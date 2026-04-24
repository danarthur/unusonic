'use client';

import { Message } from '@/shared/lib/types';
import { SITE_CONFIG } from '@/shared/lib/constants';

interface MessageListProps {
  messages: Message[];
  isLoading?: boolean;
}

export function MessageList({ messages, isLoading = false }: MessageListProps) {
  if (messages.length === 0) {
    return (
      <div className="flex-1 w-full max-w-2xl mx-auto px-4 py-12">
        <div className="text-center text-[var(--stage-text-primary)] mt-20 font-light italic">
          &ldquo;Ready for input, {SITE_CONFIG.owner}.&rdquo;
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 w-full max-w-2xl mx-auto overflow-y-auto mb-24 space-y-6 px-4 scrollbar-hide">
      {messages.map((message) => (
        <div
          key={message.id}
          className={`flex flex-col ${
            message.role === 'user' ? 'items-end' : 'items-start'
          }`}
        >
          <div
            className={`max-w-[80%] rounded-lg px-5 py-3 text-sm leading-relaxed ${
              message.role === 'user'
                ? 'bg-[oklch(0.15_0_0)] text-[var(--stage-text-primary)] border border-[oklch(1_0_0/0.08)]'
                : 'text-[var(--stage-text-secondary)]'
            }`}
          >
            {message.role === 'assistant' && (
              <span className="text-xs text-[var(--stage-text-secondary)] uppercase tracking-widest block mb-1">
                Aion
              </span>
            )}
            {message.content}
          </div>
        </div>
      ))}
      {isLoading && (
        <div className="flex items-start">
          <div className="max-w-[80%] rounded-lg px-5 py-3 text-sm text-[var(--stage-text-tertiary)]">
            <span className="text-xs text-[var(--stage-text-secondary)] uppercase tracking-widest block mb-1">
              Aion
            </span>
            <span className="inline-block w-2 h-2 bg-[var(--stage-surface)] rounded-full animate-ping" />
          </div>
        </div>
      )}
    </div>
  );
}

