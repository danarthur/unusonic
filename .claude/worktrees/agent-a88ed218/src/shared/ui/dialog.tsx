'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';

interface DialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

function Dialog({ open = false, onOpenChange, children }: DialogProps) {
  return (
    <DialogContext.Provider value={{ open: !!open, onOpenChange: onOpenChange ?? (() => {}) }}>
      {children}
    </DialogContext.Provider>
  );
}

const DialogContext = React.createContext<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
} | null>(null);

function useDialog() {
  const ctx = React.useContext(DialogContext);
  if (!ctx) throw new Error('Dialog components must be used within Dialog');
  return ctx;
}

interface DialogContentProps {
  children: React.ReactNode;
  className?: string;
}

function DialogContent({ children, className }: DialogContentProps) {
  const { open, onOpenChange } = useDialog();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const content = (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            role="presentation"
            className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            onClick={() => onOpenChange(false)}
            aria-hidden
          />
          <motion.div
            role="dialog"
            aria-modal
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className={cn(
              'fixed left-1/2 top-1/2 z-[200] w-full max-w-[calc(100vw-2rem)] max-h-[90vh] -translate-x-1/2 -translate-y-1/2',
              'rounded-xl border border-[var(--color-mercury)] bg-[var(--color-glass-surface)] shadow-2xl',
              'flex flex-col overflow-hidden min-h-0',
              className
            )}
          >
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  if (!mounted || typeof document === 'undefined') {
    return null;
  }
  return createPortal(content, document.body);
}

function DialogHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-center justify-between gap-4 border-b border-[var(--color-mercury)] px-6 py-4', className)}>
      {children}
    </div>
  );
}

function DialogTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <h2 className={cn('text-lg font-medium tracking-tight text-[var(--color-ink)]', className)}>
      {children}
    </h2>
  );
}

function DialogClose({ className }: { className?: string }) {
  const { onOpenChange } = useDialog();
  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn('shrink-0', className)}
      onClick={() => onOpenChange(false)}
      aria-label="Close"
    >
      <X className="size-5" />
    </Button>
  );
}

export { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose };
