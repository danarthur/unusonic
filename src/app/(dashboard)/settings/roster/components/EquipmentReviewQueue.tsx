'use client';

import * as React from 'react';
import { useState, useEffect, useCallback, useTransition } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, XCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import {
  getPendingEquipmentForWorkspace,
  reviewCrewEquipment,
  type PendingEquipmentItem,
} from '@/features/talent-management/api/crew-equipment-actions';
import { createClient } from '@/shared/api/supabase/client';

// =============================================================================
// Category badge colors
// =============================================================================

const CATEGORY_LABELS: Record<string, string> = {
  audio: 'Audio',
  lighting: 'Lighting',
  video: 'Video',
  staging: 'Staging',
  power: 'Power',
  misc: 'Misc',
};

// =============================================================================
// EquipmentReviewQueue
// =============================================================================

export function EquipmentReviewQueue() {
  const [items, setItems] = useState<PendingEquipmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [isPending, startTransition] = useTransition();
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});

  const fetchItems = useCallback(async () => {
    const data = await getPendingEquipmentForWorkspace();
    setItems(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // Resolve signed URLs for items with photos
  useEffect(() => {
    const itemsWithPhotos = items.filter((i) => i.photo_url && !photoUrls[i.id]);
    if (itemsWithPhotos.length === 0) return;

    const supabase = createClient();
    Promise.all(
      itemsWithPhotos.map(async (item) => {
        const { data } = await supabase.storage
          .from('workspace-files')
          .createSignedUrl(item.photo_url!, 60 * 30);
        return { id: item.id, url: data?.signedUrl ?? null };
      })
    ).then((results) => {
      setPhotoUrls((prev) => {
        const next = { ...prev };
        for (const r of results) {
          if (r.url) next[r.id] = r.url;
        }
        return next;
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  const handleApprove = useCallback(
    (id: string) => {
      // Optimistic removal
      setItems((prev) => prev.filter((i) => i.id !== id));
      startTransition(async () => {
        const result = await reviewCrewEquipment({
          crew_equipment_id: id,
          decision: 'approved',
        });
        if (!result.ok) {
          toast.error(result.error);
          await fetchItems();
        } else {
          toast.success('Equipment approved');
        }
      });
    },
    [fetchItems]
  );

  const handleReject = useCallback(
    (id: string) => {
      const reason = rejectReason.trim() || undefined;
      // Optimistic removal
      setItems((prev) => prev.filter((i) => i.id !== id));
      setRejectingId(null);
      setRejectReason('');
      startTransition(async () => {
        const result = await reviewCrewEquipment({
          crew_equipment_id: id,
          decision: 'rejected',
          rejection_reason: reason,
        });
        if (!result.ok) {
          toast.error(result.error);
          await fetchItems();
        } else {
          toast.success('Equipment rejected');
        }
      });
    },
    [rejectReason, fetchItems]
  );

  const handleApproveAllFromEntity = useCallback(
    (entityId: string) => {
      const entityItems = items.filter((i) => i.entity_id === entityId);
      // Optimistic removal
      setItems((prev) => prev.filter((i) => i.entity_id !== entityId));
      startTransition(async () => {
        const results = await Promise.all(
          entityItems.map((item) =>
            reviewCrewEquipment({ crew_equipment_id: item.id, decision: 'approved' })
          )
        );
        const failures = results.filter((r) => !r.ok);
        if (failures.length > 0) {
          toast.error(`${failures.length} item(s) failed to approve`);
          await fetchItems();
        } else {
          toast.success(`Approved ${entityItems.length} item(s)`);
        }
      });
    },
    [items, fetchItems]
  );

  // Group items by entity
  const grouped = React.useMemo(() => {
    const map = new Map<string, { entityName: string; items: PendingEquipmentItem[] }>();
    for (const item of items) {
      const existing = map.get(item.entity_id);
      if (existing) {
        existing.items.push(item);
      } else {
        map.set(item.entity_id, { entityName: item.entity_name, items: [item] });
      }
    }
    return Array.from(map.entries()).map(([entityId, group]) => ({
      entityId,
      ...group,
    }));
  }, [items]);

  if (loading) {
    return (
      <div className="py-4 text-center">
        <p className="text-xs text-[var(--stage-text-tertiary)]">Loading pending items...</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <p className="text-xs text-[var(--stage-text-tertiary)] py-2">
        No equipment pending review
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <AnimatePresence initial={false}>
        {grouped.map((group) => (
          <motion.div
            key={group.entityId}
            layout
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={STAGE_LIGHT}
            className="rounded-xl border border-[oklch(1_0_0/0.06)] bg-[var(--ctx-well)] overflow-hidden"
          >
            {/* Entity header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-[oklch(1_0_0/0.06)]">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-[var(--stage-text-primary)]">
                  {group.entityName}
                </span>
                <span className="text-label tabular-nums text-[var(--stage-text-tertiary)]">
                  {group.items.length} item{group.items.length !== 1 ? 's' : ''}
                </span>
              </div>
              {group.items.length > 1 && (
                <button
                  type="button"
                  onClick={() => handleApproveAllFromEntity(group.entityId)}
                  disabled={isPending}
                  className="text-label font-medium text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] transition-colors focus:outline-none disabled:opacity-45"
                >
                  Approve all
                </button>
              )}
            </div>

            {/* Equipment items */}
            <ul className="divide-y divide-[oklch(1_0_0/0.04)]">
              {group.items.map((item) => (
                <li key={item.id} className="px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {/* Photo thumbnail */}
                      {photoUrls[item.id] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={photoUrls[item.id]}
                          alt=""
                          className="size-8 rounded object-cover shrink-0 border border-[oklch(1_0_0/0.08)]"
                        />
                      ) : (
                        <div className="size-8 rounded bg-[oklch(1_0_0/0.04)] shrink-0 flex items-center justify-center">
                          <span className="text-label text-[var(--stage-text-tertiary)]">
                            {item.category.charAt(0).toUpperCase()}
                          </span>
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm text-[var(--stage-text-primary)] truncate">
                          {item.name}
                        </p>
                        <span className="text-label text-[var(--stage-text-tertiary)] uppercase tracking-wider">
                          {CATEGORY_LABELS[item.category] ?? item.category}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleApprove(item.id)}
                        disabled={isPending}
                        className="p-1 rounded text-[var(--stage-text-tertiary)] hover:text-[var(--color-unusonic-success)] transition-colors focus:outline-none disabled:opacity-45"
                        aria-label={`Approve ${item.name}`}
                      >
                        <CheckCircle2 className="size-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setRejectingId(rejectingId === item.id ? null : item.id)
                        }
                        disabled={isPending}
                        className="p-1 rounded text-[var(--stage-text-tertiary)] hover:text-[var(--color-unusonic-error)] transition-colors focus:outline-none disabled:opacity-45"
                        aria-label={`Reject ${item.name}`}
                      >
                        <XCircle className="size-4" />
                      </button>
                    </div>
                  </div>

                  {/* Inline reject reason */}
                  <AnimatePresence>
                    {rejectingId === item.id && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={STAGE_LIGHT}
                        className="overflow-hidden"
                      >
                        <div className="flex gap-2 mt-2">
                          <input
                            autoFocus
                            type="text"
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleReject(item.id);
                              if (e.key === 'Escape') {
                                setRejectingId(null);
                                setRejectReason('');
                              }
                            }}
                            placeholder="Reason (optional)"
                            className="flex-1 text-xs bg-[var(--stage-surface-base)] border border-[oklch(1_0_0/0.06)] px-2.5 py-1.5 text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] outline-none focus-visible:border-[oklch(1_0_0/0.15)]"
                            style={{ borderRadius: 'var(--stage-radius-input, 6px)' }}
                          />
                          <button
                            type="button"
                            onClick={() => handleReject(item.id)}
                            className="text-label font-medium text-[var(--color-unusonic-error)] hover:text-[var(--color-unusonic-error)]/80 transition-colors focus:outline-none"
                          >
                            Reject
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </li>
              ))}
            </ul>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
