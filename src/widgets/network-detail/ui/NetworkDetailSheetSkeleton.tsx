'use client';

import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';

/** Skeleton shown while node details load (Suspense fallback) */
export function NetworkDetailSheetSkeleton() {
  const router = useRouter();

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-[oklch(0.12_0_0/0.5)]"
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
        rounded-l-2xl bg-[var(--stage-surface-raised)]        border-l border-[oklch(1_0_0_/_0.08)] shadow-2xl
      "
    >
      <header className="flex shrink-0 items-center gap-3 border-b border-[oklch(1_0_0_/_0.08)] px-4 py-3 md:px-5 md:py-3">
        <div className="h-6 w-40 rounded-lg bg-[oklch(1_0_0/0.1)] stage-skeleton" />
        <div className="ml-auto h-8 w-8 rounded-lg bg-[oklch(1_0_0/0.1)] stage-skeleton" />
      </header>

      <div className="flex-1 overflow-y-auto flex flex-col min-h-0">
        {/* Identity header skeleton */}
        <div className="px-4 py-4 md:px-5 md:py-4 space-y-4">
          <div className="flex items-center gap-4">
            <div className="size-14 rounded-xl bg-[oklch(1_0_0/0.1)] stage-skeleton shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-24 rounded bg-[oklch(1_0_0/0.1)] stage-skeleton" />
              <div className="h-3 w-32 rounded bg-[oklch(1_0_0/0.05)] stage-skeleton" />
            </div>
          </div>
        </div>
        <div className="h-px bg-[oklch(1_0_0_/_0.08)]" />

        {/* Tab strip skeleton */}
        <div className="border-b border-[oklch(1_0_0_/_0.08)] px-4 md:px-5">
          <div className="flex gap-6 h-12 items-center">
            <div className="h-4 w-16 rounded bg-[oklch(1_0_0/0.1)] stage-skeleton" />
            <div className="h-4 w-12 rounded bg-[oklch(1_0_0/0.1)] stage-skeleton" />
            <div className="h-4 w-14 rounded bg-[oklch(1_0_0/0.1)] stage-skeleton" />
          </div>
        </div>

        {/* Content skeleton */}
        <div className="flex-1 p-4 md:p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="stage-panel rounded-2xl p-4 h-32 stage-skeleton bg-[oklch(1_0_0/0.05)]" />
            <div className="stage-panel rounded-2xl p-4 md:col-span-2 h-32 stage-skeleton bg-[oklch(1_0_0/0.05)]" />
          </div>
        </div>
      </div>
    </motion.div>
    </>
  );
}
