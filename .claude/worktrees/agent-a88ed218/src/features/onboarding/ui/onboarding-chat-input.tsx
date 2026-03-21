/**
 * OnboardingChatInput
 * Chat-style input matching IonInput visual language. No SessionContext required.
 * Uses data-lpignore / data-form-type / data-1p-ignore so password-manager
 * extensions don’t overlay the field and block typing (if typing fails, try incognito).
 * @module features/onboarding/ui/onboarding-chat-input
 */

'use client';

import { useRef } from 'react';
import { motion } from 'framer-motion';
import { ArrowUp, Loader2 } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

interface OnboardingChatInputProps {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSubmit: () => void;
  placeholder?: string;
  isLoading?: boolean;
  disabled?: boolean;
  /** Input type (e.g. 'password' for password fields) */
  type?: 'text' | 'email' | 'password';
}

export function OnboardingChatInput({
  value,
  onChange,
  onSubmit,
  placeholder = 'Type your reply…',
  isLoading = false,
  disabled = false,
  type = 'text',
}: OnboardingChatInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const canSubmit = value.trim().length > 0 && !isLoading && !disabled;

  const handleSubmit = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && canSubmit) {
      e.preventDefault();
      onSubmit();
    }
  };

  return (
    <div
      role="group"
      aria-label={placeholder}
      className={cn(
        'liquid-glass-input w-full mx-auto h-[68px] cursor-text block'
      )}
      onClick={() => inputRef.current?.focus()}
    >
      <div
        className={cn(
          'liquid-glass-input-inner flex items-center gap-3 pl-5 pr-2 py-2'
        )}
      >
      <div className="flex-1 min-w-0 flex flex-col justify-center h-full min-h-0">
        <input
          ref={inputRef}
          type={type}
          value={value}
          onChange={onChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled || isLoading}
          readOnly={false}
          autoComplete="off"
          data-lpignore="true"
          data-form-type="other"
          data-1p-ignore
          className={cn(
            'w-full min-w-0 bg-transparent border-none outline-none text-ink placeholder:text-ink-muted/70 cursor-text caret-[var(--color-silk)]',
            'font-sans text-lg h-full min-h-[2rem] py-2 px-2 disabled:opacity-50'
          )}
        />
      </div>

      <div className="pr-1 flex items-center shrink-0" onClick={(e) => e.stopPropagation()}>
        {isLoading ? (
          <div className="p-3 rounded-full bg-ink/10 text-ink-muted">
            <Loader2 size={20} className="animate-spin" />
          </div>
        ) : canSubmit ? (
          <motion.button
            type="button"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleSubmit}
            className="p-3 rounded-full bg-ink text-canvas liquid-levitation hover:bg-walnut transition-colors flex items-center justify-center"
          >
            <ArrowUp size={20} strokeWidth={2.5} />
          </motion.button>
        ) : (
          <div className="w-14 h-14" />
        )}
      </div>
      </div>
    </div>
  );
}
