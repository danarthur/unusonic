'use client';

import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';

/** Skeleton shown while node details load (Suspense fallback) */
export function NetworkDetailSheetSkeleton() {
  const router = useRouter();

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-[var(--color-obsidian)]/50 backdrop-blur-sm"
        onClick={() => router.push('/network')}
        aria-hidden
      />
    <motion.div
      role="dialog"
      aria-modal
      aria-busy
      aria-label="Loading"
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="
        fixed inset-y-0 right-0 z-50 flex flex-col h-dvh w-[85vw] max-w-[85vw] md:w-[600px] md:max-w-[600px]
        bg-[var(--color-glass-surface)] backdrop-blur-xl
        border-l border-[var(--color-mercury)] shadow-2xl
      "
    >
      <header className="flex shrink-0 items-center gap-3 border-b border-[var(--color-mercury)] px-4 py-3 md:px-5 md:py-3">
        <div className="h-6 w-40 rounded-lg bg-white/10 animate-pulse" />
        <div className="ml-auto h-8 w-8 rounded-lg bg-white/10 animate-pulse" />
      </header>

      <div className="flex-1 overflow-y-auto flex flex-col min-h-0">
        {/* Identity header skeleton */}
        <div className="px-4 py-4 md:px-5 md:py-4 space-y-4">
          <div className="flex items-center gap-4">
            <div className="size-14 rounded-xl bg-white/10 animate-pulse shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-24 rounded bg-white/10 animate-pulse" />
              <div className="h-3 w-32 rounded bg-white/5 animate-pulse" />
            </div>
          </div>
        </div>
        <div className="h-px bg-[var(--color-mercury)]" />

        {/* Tab strip skeleton */}
        <div className="border-b border-[var(--color-mercury)] px-4 md:px-5">
          <div className="flex gap-6 h-12 items-center">
            <div className="h-4 w-16 rounded bg-white/10 animate-pulse" />
            <div className="h-4 w-12 rounded bg-white/10 animate-pulse" />
            <div className="h-4 w-14 rounded bg-white/10 animate-pulse" />
          </div>
        </div>

        {/* Content skeleton */}
        <div className="flex-1 p-4 md:p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="liquid-card rounded-2xl p-4 h-32 animate-pulse bg-white/5" />
            <div className="liquid-card rounded-2xl p-4 md:col-span-2 h-32 animate-pulse bg-white/5" />
          </div>
        </div>
      </div>
    </motion.div>
    </>
  );
}
