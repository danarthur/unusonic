'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { useModalLayer } from '@/shared/lib/use-modal-layer';
import { STAGE_HEAVY } from '@/shared/lib/motion-constants';
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

const DialogTitleIdContext = React.createContext<string | undefined>(undefined);

function useDialog() {
  const ctx = React.useContext(DialogContext);
  if (!ctx) throw new Error('Dialog components must be used within Dialog');
  return ctx;
}

interface DialogContentProps {
  children: React.ReactNode;
  className?: string;
  /** Use when there is no visible `DialogTitle` — sets `aria-label` on the dialog surface. */
  ariaLabel?: string;
}

function DialogContent({ children, className, ariaLabel }: DialogContentProps) {
  const { open, onOpenChange } = useDialog();
  const [mounted, setMounted] = React.useState(false);
  const titleId = React.useId();
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  useModalLayer({
    open,
    onClose: () => onOpenChange(false),
    containerRef,
  });

  const content = (
    <DialogTitleIdContext.Provider value={titleId}>
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              role="presentation"
              className="fixed inset-0 z-[200] stage-scrim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              onClick={() => onOpenChange(false)}
              aria-hidden
            />
            <motion.div
              ref={containerRef}
              role="dialog"
              aria-modal
              aria-label={ariaLabel}
              aria-labelledby={ariaLabel ? undefined : titleId}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={STAGE_HEAVY}
              className={cn(
                'fixed left-1/2 top-1/2 z-[200] w-full max-w-[calc(100vw-2rem)] max-h-[90vh] -translate-x-1/2 -translate-y-1/2',
                'stage-overlay',
                'flex flex-col overflow-hidden min-h-0 outline-none',
                className
              )}
            >
              {children}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </DialogTitleIdContext.Provider>
  );

  if (!mounted || typeof document === 'undefined') {
    return null;
  }
  return createPortal(content, document.body);
}

function DialogHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-center justify-between gap-4 border-b border-[oklch(1_0_0_/_0.06)] px-6 py-4', className)}>
      {children}
    </div>
  );
}

function DialogTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  const titleId = React.useContext(DialogTitleIdContext);
  return (
    <h2 id={titleId} className={cn('text-lg font-medium tracking-tight text-[var(--stage-text-primary)]', className)}>
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
      <X className="size-5" strokeWidth={1.5} />
    </Button>
  );
}

export { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose };
