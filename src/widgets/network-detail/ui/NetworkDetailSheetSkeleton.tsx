'use client';

import { useRouter } from 'next/navigation';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetClose,
} from '@/shared/ui/sheet';

/** Skeleton shown while node details load (Suspense fallback) */
export function NetworkDetailSheetSkeleton() {
  const router = useRouter();

  return (
    <Sheet open onOpenChange={(open) => { if (!open) router.push('/network'); }}>
      <SheetContent
        side="right"
        ariaLabel="Loading"
        className="w-[min(100%,37.5rem)] rounded-l-[var(--stage-radius-panel,12px)] bg-[var(--stage-surface)]"
      >
        <SheetHeader>
          <div className="h-6 w-40 rounded-lg bg-[var(--stage-surface-elevated)] stage-skeleton" />
          <SheetClose />
        </SheetHeader>

        <div className="flex-1 overflow-y-auto flex flex-col min-h-0">
          {/* Identity header skeleton */}
          <div className="px-6 py-5 space-y-4 border-b border-[var(--stage-edge-subtle)]">
            <div className="flex items-center gap-4">
              <div className="size-14 rounded-xl bg-[var(--stage-surface-elevated)] stage-skeleton shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-24 rounded bg-[var(--stage-surface-elevated)] stage-skeleton" />
                <div className="h-3 w-32 rounded bg-[var(--stage-surface-elevated)] stage-skeleton" />
              </div>
            </div>
          </div>

          {/* Tab strip skeleton */}
          <div className="border-b border-[var(--stage-edge-subtle)] px-6">
            <div className="flex gap-6 h-12 items-center">
              <div className="h-4 w-16 rounded bg-[var(--stage-surface-elevated)] stage-skeleton" />
              <div className="h-4 w-12 rounded bg-[var(--stage-surface-elevated)] stage-skeleton" />
              <div className="h-4 w-14 rounded bg-[var(--stage-surface-elevated)] stage-skeleton" />
            </div>
          </div>

          {/* Content skeleton */}
          <div className="flex-1 px-6 py-5 space-y-4">
            <div className="space-y-4">
              <div className="rounded-xl border border-[var(--stage-edge-subtle)] bg-[var(--stage-surface-elevated)] p-4 h-24 stage-skeleton" />
              <div className="rounded-xl border border-[var(--stage-edge-subtle)] bg-[var(--stage-surface-elevated)] p-4 h-32 stage-skeleton" />
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
