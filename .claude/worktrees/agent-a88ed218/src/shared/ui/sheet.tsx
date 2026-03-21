'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';

interface SheetContextValue {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SheetContext = React.createContext<SheetContextValue | null>(null);

function useSheet() {
  const ctx = React.useContext(SheetContext);
  if (!ctx) throw new Error('Sheet components must be used within Sheet');
  return ctx;
}

interface SheetProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

function Sheet({ open = false, onOpenChange, children }: SheetProps) {
  const [openState, setOpenState] = React.useState(open);
  const isControlled = open !== undefined && onOpenChange !== undefined;
  const isOpen = isControlled ? open : openState;
  const setIsOpen = React.useCallback(
    (v: boolean) => {
      if (!isControlled) setOpenState(v);
      onOpenChange?.(v);
    },
    [isControlled, onOpenChange]
  );
  React.useEffect(() => {
    if (isControlled) setOpenState(open);
  }, [isControlled, open]);
  return (
    <SheetContext.Provider value={{ open: isOpen, onOpenChange: setIsOpen }}>
      {children}
    </SheetContext.Provider>
  );
}

interface SheetTriggerProps {
  asChild?: boolean;
  children: React.ReactNode;
  className?: string;
}

function SheetTrigger({ asChild, children, className }: SheetTriggerProps) {
  const { onOpenChange } = useSheet();
  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<{ onClick?: () => void }>, {
      onClick: () => onOpenChange(true),
    });
  }
  return (
    <button type="button" className={className} onClick={() => onOpenChange(true)}>
      {children}
    </button>
  );
}

interface SheetContentProps {
  children: React.ReactNode;
  className?: string;
  /** 'center' = centered modal (stable). 'left' | 'right' = edge panel (can be flaky in some envs). */
  side?: 'left' | 'right' | 'center';
}

const slideVariants = {
  right: {
    initial: { x: '100%' },
    animate: { x: 0 },
    exit: { x: '100%' },
  },
  left: {
    initial: { x: '-100%' },
    animate: { x: 0 },
    exit: { x: '-100%' },
  },
  center: {
    initial: { opacity: 0, scale: 0.96 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.96 },
  },
};

/** Single portaled root = reliable visibility. Without it, panel can disappear when portaling a fragment. */
function SheetContent({
  children,
  className,
  side = 'center',
}: SheetContentProps) {
  const { open, onOpenChange } = useSheet();
  const variants = slideVariants[side];
  const isCenter = side === 'center';

  const content = open ? (
    <div className="fixed inset-0 z-50 isolate flex items-center justify-center p-4" aria-hidden={false}>
      <AnimatePresence>
        <motion.div
          key="sheet-backdrop"
          role="presentation"
          className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          onClick={() => onOpenChange(false)}
          aria-hidden
        />
        <motion.div
          key="sheet-panel"
          role="dialog"
          aria-modal
          initial={variants.initial}
          animate={variants.animate}
          exit={variants.exit}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className={cn(
            'relative z-[51] flex max-h-[calc(100vh-2rem)] w-full max-w-md flex-col',
            isCenter && 'rounded-2xl border border-[var(--color-mercury)]',
            !isCenter && 'absolute top-0 bottom-0 left-0 right-auto m-0 w-[min(100%,28rem)] rounded-none border-l border-[var(--color-mercury)]',
            !isCenter && side === 'right' && 'left-auto right-0',
            !isCenter && side === 'left' && 'left-0 right-auto',
            'liquid-card shadow-2xl',
            className
          )}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  ) : null;

  if (typeof document === 'undefined') return null;
  return createPortal(content, document.body);
}

function SheetHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-center justify-between gap-4 border-b border-[var(--color-mercury)] px-6 py-5', className)}>
      {children}
    </div>
  );
}

function SheetTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <h2 className={cn('text-lg font-medium tracking-tight text-[var(--color-ink)]', className)}>
      {children}
    </h2>
  );
}

function SheetClose({ className }: { className?: string }) {
  const { onOpenChange } = useSheet();
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

function SheetBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex-1 overflow-y-auto px-6 py-5 pb-8', className)}>
      {children}
    </div>
  );
}

export {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetClose,
  SheetBody,
};
