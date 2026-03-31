'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { useModalLayer } from '@/shared/lib/use-modal-layer';
import { STAGE_HEAVY } from '@/shared/lib/motion-constants';
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

const SheetTitleIdContext = React.createContext<string | undefined>(undefined);

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
  /** Use when there is no visible `SheetTitle` — sets `aria-label` on the sheet surface. */
  ariaLabel?: string;
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
function SheetContent({ children, className, side = 'center', ariaLabel }: SheetContentProps) {
  const { open, onOpenChange } = useSheet();
  const variants = slideVariants[side];
  const isCenter = side === 'center';
  const titleId = React.useId();
  const containerRef = React.useRef<HTMLDivElement>(null);

  useModalLayer({
    open,
    onClose: () => onOpenChange(false),
    containerRef,
  });

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 isolate flex items-center justify-center p-4" aria-hidden={false}>
          <motion.div
            key="sheet-backdrop"
            role="presentation"
            className="absolute inset-0 stage-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            onClick={() => onOpenChange(false)}
            aria-hidden
          />
          <motion.div
            ref={containerRef}
            key="sheet-panel"
            role="dialog"
            aria-modal
            aria-label={ariaLabel}
            aria-labelledby={ariaLabel ? undefined : titleId}
            initial={variants.initial}
            animate={variants.animate}
            exit={variants.exit}
            transition={STAGE_HEAVY}
            className={cn(
              'z-[51] flex flex-col outline-none',
              isCenter && 'relative max-h-[calc(100vh-2rem)] w-full max-w-md stage-overlay',
              !isCenter &&
                'fixed top-0 bottom-0 m-0 w-[min(100%,28rem)] rounded-none border-l border-[oklch(1_0_0_/_0.08)] bg-[var(--stage-surface-raised)] shadow-[0_8px_32px_-4px_oklch(0_0_0_/_0.6)] overflow-hidden',
              !isCenter && side === 'right' && 'right-0',
              !isCenter && side === 'left' && 'left-0',
              className
            )}
          >
            <SheetTitleIdContext.Provider value={titleId}>{children}</SheetTitleIdContext.Provider>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}

function SheetHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-center justify-between gap-4 border-b border-[oklch(1_0_0_/_0.06)] px-6 py-5', className)}>
      {children}
    </div>
  );
}

function SheetTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  const titleId = React.useContext(SheetTitleIdContext);
  return (
    <h2 id={titleId} className={cn('text-lg font-medium tracking-tight text-[var(--stage-text-primary)]', className)}>
      {children}
    </h2>
  );
}

function SheetFooter({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'shrink-0 border-t border-[oklch(1_0_0_/_0.06)] bg-[var(--stage-surface)] px-6 py-5',
        className
      )}
    >
      {children}
    </div>
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
      <X className="size-5" strokeWidth={1.5} />
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
  SheetFooter,
};
