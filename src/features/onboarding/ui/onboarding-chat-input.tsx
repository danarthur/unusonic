/**
 * OnboardingChatInput
 * Chat-style input matching AionInput visual language. No SessionContext required.
 * Uses data-lpignore / data-form-type / data-1p-ignore so password-manager
 * extensions don’t overlay the field and block typing (if typing fails, try incognito).
 * @module features/onboarding/ui/onboarding-chat-input
 */

'use client';

import { useRef } from 'react';
import { motion } from 'framer-motion';
import { ArrowUp, Loader2 } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';

interface OnboardingChatInputProps {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSubmit: () => void;
  placeholder?: string;
  isLoading?: boolean;
  disabled?: boolean;
  /** Input type (e.g. 'password' for password fields) */
  type?: 'text' | 'email' | 'password';
  /** Hide the submit arrow button (e.g. when an external CTA handles the action) */
  hideSubmit?: boolean;
}

export function OnboardingChatInput({
  value,
  onChange,
  onSubmit,
  placeholder = 'Type your reply…',
  isLoading = false,
  disabled = false,
  type = 'text',
  hideSubmit = false,
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
            'w-full min-w-0 bg-transparent border-none outline-none text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)]/70 cursor-text caret-[var(--stage-accent)]',
            'font-sans text-lg h-full min-h-[2rem] py-2 px-2 disabled:opacity-50'
          )}
        />
      </div>

      {!hideSubmit && (
        <div className="pr-1 flex items-center shrink-0" onClick={(e) => e.stopPropagation()}>
          {isLoading ? (
            <div
              role="status"
              aria-busy={true}
              aria-label="Submitting…"
              className="p-3 rounded-full bg-[oklch(1_0_0_/_0.08)] text-[var(--stage-text-secondary)]"
            >
              <Loader2 size={20} className="animate-spin" strokeWidth={1.5} />
            </div>
          ) : canSubmit ? (
            <motion.button
              type="button"
              transition={STAGE_LIGHT}
              onClick={handleSubmit}
              aria-busy={isLoading}
              aria-label="Submit"
              className="p-3 rounded-full bg-[var(--stage-accent)] text-[var(--stage-text-on-accent)] hover:brightness-[1.06] transition-[filter] flex items-center justify-center"
            >
              <ArrowUp size={20} strokeWidth={1.5} />
            </motion.button>
          ) : (
            <div className="w-14 h-14" />
          )}
        </div>
      )}
      </div>
    </div>
  );
}
