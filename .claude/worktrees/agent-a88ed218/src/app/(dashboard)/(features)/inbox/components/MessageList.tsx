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
        <div className="text-center text-stone-700 mt-20 font-light italic">
          "Ready for input, {SITE_CONFIG.owner}."
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
                ? 'bg-stone-900 text-stone-200 border border-stone-800'
                : 'text-stone-400'
            }`}
          >
            {message.role === 'assistant' && (
              <span className="text-xs text-stone-600 uppercase tracking-widest block mb-1">
                ION
              </span>
            )}
            {message.content}
          </div>
        </div>
      ))}
      {isLoading && (
        <div className="flex items-start">
          <div className="max-w-[80%] rounded-lg px-5 py-3 text-sm text-stone-400">
            <span className="text-xs text-stone-600 uppercase tracking-widest block mb-1">
              ION
            </span>
            <span className="inline-block w-2 h-2 bg-stone-600 rounded-full animate-pulse" />
          </div>
        </div>
      )}
    </div>
  );
}

