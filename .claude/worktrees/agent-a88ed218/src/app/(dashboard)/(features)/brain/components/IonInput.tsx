'use client';

import React, { useRef, useState } from 'react';
import { ArrowUp, Paperclip, Loader2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/shared/lib/utils';
import IonVoice from '@/app/(dashboard)/(features)/brain/components/IonVoice';
import { useSession } from '@/shared/ui/providers/SessionContext';

type IonInputProps =
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

export const IonInput: React.FC<IonInputProps> = (props) => {
  const isNewProps = 'value' in props;
  const input = isNewProps ? props.value : props.input;
  const isLoading = isNewProps ? props.isLoading ?? false : props.isLoading;
  const isExpanded = isNewProps ? props.isExpanded : false;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const { sendMessage } = useSession();

  const placeholder = isNewProps ? props.placeholder ?? (attachedFile ? 'Add a note...' : 'Ask Signal...') : (attachedFile ? 'Add a note...' : 'Ask Signal...');
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
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className={cn(
        "relative w-full mx-auto flex items-center gap-3 p-2 pr-2 transition-all duration-500 ease-out group",
        "liquid-panel focus-within:ring-2 focus-within:ring-neon-blue/30",
        isExpanded ? "rounded-3xl items-start pt-4 min-h-[120px]" : "rounded-full h-[68px]"
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
          <motion.button
            type="button"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => fileInputRef.current?.click()}
            className="text-ink-muted hover:text-ink transition-colors p-2 rounded-full hover:bg-stone/20"
          >
            <Paperclip size={20} strokeWidth={2} />
          </motion.button>
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
              <span className="liquid-panel !rounded-lg !px-3 !py-1.5 text-xs font-medium text-ink flex items-center gap-2">
                <span className="truncate max-w-[200px]">{attachedFile.name}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    clearAttachment();
                  }}
                  className="hover:text-red-500 transition-colors"
                >
                  <X size={12} />
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
            "w-full bg-transparent border-none outline-none text-ink placeholder:text-ink-muted/70 font-sans text-lg h-full py-2 disabled:opacity-50",
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
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="p-3 rounded-full bg-stone/20 text-ink-muted"
            >
              <Loader2 size={20} className="animate-spin" />
            </motion.div>
          ) : (input.trim() || attachedFile || (isNewProps && props.onSubmit && input.length > 0)) ? (
            <motion.button
              key="submit"
              initial={{ scale: 0, rotate: -90 }}
              animate={{ scale: 1, rotate: 0 }}
              exit={{ scale: 0, rotate: 90 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              type="button"
              onClick={handleSubmit}
              className="p-3 rounded-full bg-ink text-canvas liquid-levitation hover:bg-walnut transition-colors flex items-center justify-center"
            >
              <ArrowUp size={20} strokeWidth={2.5} />
            </motion.button>
          ) : showVoice ? (
            <motion.div
              key="voice"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
            >
              <IonVoice />
            </motion.div>
          ) : (
            <div key="empty" className="w-14 h-14" />
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};
