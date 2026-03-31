'use client';

import React, { useRef, useState } from 'react';
import { ArrowUp, Paperclip, Loader2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/shared/lib/utils';
import { STAGE_MEDIUM, STAGE_LIGHT } from '@/shared/lib/motion-constants';
import AionVoice from '@/app/(dashboard)/(features)/brain/components/AionVoice';
import { useSession } from '@/shared/ui/providers/SessionContext';

type AionInputProps =
  | {
      value: string;
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
      onSubmit?: () => void;
      isExpanded?: boolean;
      isLoading?: boolean;
      placeholder?: string;
      showAttachment?: boolean;
      showVoice?: boolean;
    }
  | {
  input: string;
  setInput: (value: string) => void;
  handleInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  isLoading: boolean;
  onInteraction?: () => void;
    };

export const AionInput: React.FC<AionInputProps> = (props) => {
  const isNewProps = 'value' in props;
  const input = isNewProps ? props.value : props.input;
  const isLoading = isNewProps ? props.isLoading ?? false : props.isLoading;
  const isExpanded = isNewProps ? props.isExpanded : false;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const { sendMessage } = useSession();

  const placeholder = isNewProps ? props.placeholder ?? (attachedFile ? 'Add a note...' : 'Ask Aion...') : (attachedFile ? 'Add a note...' : 'Ask Aion...');
  const showAttachment = isNewProps ? (props.showAttachment ?? true) : true;
  const showVoice = isNewProps ? (props.showVoice ?? true) : true;

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isNewProps) {
      props.onChange(e);
    } else {
      props.handleInputChange(e);
    }
  };

  const setInputValue = (value: string) => {
    if (isNewProps) {
      props.onChange({ target: { value } } as React.ChangeEvent<HTMLInputElement>);
    } else {
      props.setInput(value);
    }
  };

  const notifyInteraction = () => {
    if (isNewProps) {
      props.onSubmit?.();
    } else {
      props.onInteraction?.();
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setAttachedFile(e.target.files[0]);
    }
  };

  const clearAttachment = () => {
    setAttachedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = () => {
    if (!input.trim() && !attachedFile) return;
    // Standalone mode: custom onSubmit only, no chat
    if (isNewProps && props.onSubmit) {
      props.onSubmit();
      return;
    }
    notifyInteraction();
    sendMessage({ text: input, file: attachedFile || undefined });
    setInputValue('');
    clearAttachment();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <motion.div
      layout
      transition={STAGE_MEDIUM}
      className={cn(
        "relative w-full mx-auto flex items-center gap-3 p-2 pr-2 transition-all duration-500 ease-out group",
        "bg-[var(--stage-surface-raised)] border border-[oklch(1_0_0_/_0.10)] focus-within:ring-2 focus-within:ring-[var(--stage-accent)] shadow-[0_4px_24px_-4px_oklch(0_0_0_/_0.35)]",
        isExpanded ? "rounded-[var(--stage-radius-panel)] items-start pt-4 min-h-[120px]" : "rounded-full h-[68px]"
      )}
    >
      {showAttachment && (
        <div className={cn("pl-2", isExpanded && "pt-1")}>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] transition-[filter,color] p-2 rounded-full hover:bg-[oklch(1_0_0_/_0.06)]"
          >
            <Paperclip size={20} strokeWidth={1.5} />
          </button>
        </div>
      )}

      <div className="flex-1 flex flex-col justify-center h-full relative">
        <AnimatePresence>
          {attachedFile && (
            <motion.div
              initial={{ opacity: 0, y: 10, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, y: -10, height: 0 }}
              className="absolute -top-12 left-0 right-0 flex items-center gap-2"
            >
              <span className="rounded-lg px-3 py-1.5 text-xs font-medium text-[var(--stage-text-primary)] bg-[var(--stage-surface)] border border-[oklch(1_0_0_/_0.10)] flex items-center gap-2">
                <span className="truncate max-w-[200px]">{attachedFile.name}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    clearAttachment();
                  }}
                  className="text-[var(--stage-text-secondary)] hover:text-[var(--color-unusonic-error)] transition-colors"
                >
                  <X size={12} strokeWidth={1.5} />
                </button>
              </span>
            </motion.div>
          )}
        </AnimatePresence>

          <input
            value={input}
            onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={attachedFile ? 'Add a note...' : placeholder}
            disabled={isLoading}
          className={cn(
            "w-full bg-transparent border-none outline-none text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] font-sans text-lg h-full py-2 disabled:opacity-50",
            isExpanded && "align-top -mt-1"
          )}
            autoFocus
          autoComplete="off"
          />
        </div>

      <div className={cn("pr-1 flex items-center", isExpanded && "pt-1")}>
        <AnimatePresence mode="wait">
          {isLoading ? (
            <motion.div
              key="loader"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={STAGE_LIGHT}
              className="p-3 rounded-full bg-[oklch(1_0_0_/_0.08)] text-[var(--stage-text-secondary)]"
            >
              <Loader2 size={20} className="animate-spin" strokeWidth={1.5} />
            </motion.div>
          ) : (input.trim() || attachedFile || (isNewProps && props.onSubmit && input.length > 0)) ? (
            <motion.button
              key="submit"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={STAGE_LIGHT}
              type="button"
              onClick={handleSubmit}
              className="p-3 rounded-full bg-[var(--stage-accent)] text-[var(--stage-text-on-accent)] hover:brightness-[1.06] transition-[filter] flex items-center justify-center"
            >
              <ArrowUp size={20} strokeWidth={1.5} />
            </motion.button>
          ) : showVoice ? (
            <motion.div
              key="voice"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={STAGE_LIGHT}
            >
              <AionVoice />
            </motion.div>
          ) : (
            <div key="empty" className="w-14 h-14" />
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};
