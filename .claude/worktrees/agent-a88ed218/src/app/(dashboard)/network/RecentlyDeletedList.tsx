'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { ChevronDown, RotateCcw } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { restoreGhostRelationship } from '@/features/network-data';
import type { DeletedRelationship } from '@/features/network-data';
import { toast } from 'sonner';
import { cn } from '@/shared/lib/utils';

interface RecentlyDeletedListProps {
  deletedRelationships: DeletedRelationship[];
  sourceOrgId: string;
}

export function RecentlyDeletedList({ deletedRelationships, sourceOrgId }: RecentlyDeletedListProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = React.useState(false);

  if (deletedRelationships.length === 0) return null;

  const handleRestore = (relationshipId: string) => {
    startTransition(async () => {
      const result = await restoreGhostRelationship(relationshipId, sourceOrgId);
      if (result.ok) {
        toast.success('Connection restored.');
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <div className="border-t border-[var(--color-mercury)]/60 pt-4 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 py-2 text-left hover:text-[var(--color-ink)] transition-colors"
      >
        <span className="text-xs font-medium uppercase tracking-widest text-[var(--color-ink-muted)]">
          Recently deleted ({deletedRelationships.length}) — restore within 30 days
        </span>
        <ChevronDown
          className={cn('size-4 text-[var(--color-ink-muted)] transition-transform shrink-0', open && 'rotate-180')}
        />
      </button>
      {open && (
        <div className="pt-3 space-y-2">
          <ul className="space-y-2">
            {deletedRelationships.map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-[var(--color-mercury)]/60 bg-white/[0.03] px-3 py-2"
              >
                <span className="text-sm text-[var(--color-ink)] truncate min-w-0">{d.targetName}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleRestore(d.id)}
                  disabled={isPending || !d.canRestore}
                  className="shrink-0 gap-1.5 border-[var(--color-silk)]/40 text-[var(--color-silk)]"
                >
                  <RotateCcw className="size-3.5" />
                  Restore
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
