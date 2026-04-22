'use client';

import React, { useRef, useState, useCallback } from 'react';
import { ArrowUp, Paperclip, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/shared/lib/utils';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import AionVoice from '@/app/(dashboard)/(features)/aion/components/AionVoice';
import { useSession } from '@/shared/ui/providers/SessionContext';
import { AionMark } from '@/shared/ui/branding/aion-mark';

type AionInputProps =
  | {
      value: string;
      onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
      onSubmit?: () => void;
      isLoading?: boolean;
      placeholder?: string;
      showAttachment?: boolean;
      showVoice?: boolean;
      workspaceId?: string;
    }
  | {
      input: string;
      setInput: (value: string) => void;
      handleInputChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
      isLoading: boolean;
      onInteraction?: () => void;
      workspaceId?: string;
    };

export const AionInput: React.FC<AionInputProps> = (props) => {
  const isNewProps = 'value' in props;
  const input = isNewProps ? props.value : props.input;
  const isLoading = isNewProps ? props.isLoading ?? false : props.isLoading;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const { sendMessage, sendChatMessage } = useSession();
  const workspaceId = 'workspaceId' in props ? props.workspaceId : undefined;

  const placeholder = isNewProps
    ? props.placeholder ?? (attachedFile ? 'Add a note...' : 'Ask Aion...')
    : (attachedFile ? 'Add a note...' : 'Ask Aion...');
  const showAttachment = isNewProps ? (props.showAttachment ?? true) : true;
  const showVoice = isNewProps ? (props.showVoice ?? true) : true;
  const hasContent = !!(input.trim() || attachedFile);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (isNewProps) {
      props.onChange(e);
    } else {
      props.handleInputChange(e as any);
    }
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [isNewProps, props]);

  const setInputValue = useCallback((value: string) => {
    if (isNewProps) {
      props.onChange({ target: { value } } as React.ChangeEvent<HTMLTextAreaElement>);
    } else {
      props.setInput(value);
    }
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [isNewProps, props]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setAttachedFile(e.target.files[0]);
    }
  };

  const clearAttachment = () => {
    setAttachedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = useCallback(() => {
    if (!hasContent) return;
    if (isNewProps && props.onSubmit) {
      props.onSubmit();
      return;
    }
    if (!isNewProps) props.onInteraction?.();
    if (workspaceId) {
      sendChatMessage({ text: input, workspaceId });
    } else {
      sendMessage({ text: input, file: attachedFile || undefined });
    }
    setInputValue('');
    clearAttachment();
  }, [hasContent, input, attachedFile, workspaceId, isNewProps, props, sendChatMessage, sendMessage, setInputValue]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Shared button dimensions for symmetry
  const btnClass = 'p-2 rounded-[6px] flex items-center justify-center transition-colors duration-[80ms]';

  return (
    <div className="relative w-full mx-auto">
      {/* Attachment tray — visually connected to the input */}
      <AnimatePresence>
        {attachedFile && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={STAGE_LIGHT}
            className="overflow-hidden"
          >
            <div className="aion-input-strip rounded-t-[10px] rounded-b-none px-4 pt-3 pb-2 !shadow-none !border-b-0">
              <span className="inline-flex items-center gap-2 rounded-[var(--stage-radius-input,6px)] px-2.5 py-1.5 text-xs font-medium text-[var(--stage-text-primary)] bg-[oklch(1_0_0_/_0.06)]">
                <span className="truncate max-w-[200px]">{attachedFile.name}</span>
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); clearAttachment(); }}
                  className="text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-primary)] transition-colors duration-[80ms]"
                  aria-label="Remove attachment"
                >
                  <X size={12} strokeWidth={1.5} />
                </button>
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Channel strip container */}
      <div
        className={cn(
          'aion-input-strip',
          'flex items-end px-2 py-2',
          attachedFile ? 'rounded-b-[10px] rounded-t-none' : 'rounded-[10px]',
        )}
      >
        {/* Left module: attach */}
        {showAttachment ? (
          <>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className={cn(btnClass, 'shrink-0 text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0_/_0.06)]')}
              aria-label="Attach file"
            >
              <Paperclip size={18} strokeWidth={1.5} />
            </button>
          </>
        ) : (
          <div className="w-[34px] shrink-0" />
        )}

        {/* Center: textarea — py matches button height so single-row aligns */}
        <textarea
          ref={textareaRef}
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={isLoading}
          rows={1}
          className={cn(
            'flex-1 min-w-0 bg-transparent border-none outline-none resize-none',
            'text-[var(--stage-text-primary)] text-[length:var(--stage-input-font-size,14px)]',
            'placeholder:text-[var(--stage-text-secondary)]',
            'font-sans px-2 leading-[34px]',
            'disabled:opacity-[0.45]',
            '[field-sizing:content]',
          )}
          style={{ maxHeight: 160 }}
          autoComplete="off"
        />

        {/* Right module: voice (mobile only) + send.
            Phase 2 Sprint 3 §3.3: voice input ships on mobile only. Desktop
            mic was cut — Salesforce Einstein Voice was retired in 2020 for
            the reason owners don't talk at a laptop. `md:hidden` hides it
            at ≥768px; the send button is the sole composer action on desktop. */}
        {showVoice && !isLoading && (
          <div className={cn(
            'shrink-0 transition-[width,opacity] duration-[120ms] overflow-hidden',
            'md:hidden',  // mobile-only mount
            hasContent ? 'w-0 opacity-0' : 'w-[34px] opacity-100',
          )}>
            <AionVoice />
          </div>
        )}

        {isLoading ? (
          <div className={cn(btnClass, 'shrink-0')}>
            <AionMark size={18} status="thinking" />
          </div>
        ) : (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!hasContent}
            className={cn(
              btnClass,
              'shrink-0 transition-colors duration-[120ms] ease-out',
              hasContent
                ? 'bg-[var(--stage-text-primary)] text-[var(--stage-void)]'
                : 'bg-transparent text-[oklch(0.30_0_0)] cursor-default',
            )}
            aria-label="Send message"
          >
            <ArrowUp size={18} strokeWidth={2} />
          </button>
        )}
      </div>
    </div>
  );
};
