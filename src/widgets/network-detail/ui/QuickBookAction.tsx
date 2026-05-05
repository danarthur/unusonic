'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CalendarPlus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/shared/ui/button';
import { STAGE_MEDIUM } from '@/shared/lib/motion-constants';
import { getActiveDealsForBooking, type BookableDeal } from './quick-book-actions';
import { addManualDealCrew } from '@/app/(dashboard)/(features)/events/actions/deal-crew';

interface QuickBookActionProps {
  entityId: string;
  entityName: string;
}

export function QuickBookAction({ entityId, entityName }: QuickBookActionProps) {
  const [expanded, setExpanded] = React.useState(false);
  const [deals, setDeals] = React.useState<BookableDeal[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [selectedDealId, setSelectedDealId] = React.useState('');
  const [roleNote, setRoleNote] = React.useState('');
  const [assigning, setAssigning] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [conflict, setConflict] = React.useState<string | null>(null);
  const [pendingConfirm, setPendingConfirm] = React.useState(false);

  const handleOpen = React.useCallback(async () => {
    setExpanded(true);
    setError(null);
    setConflict(null);
    setPendingConfirm(false);
    setLoading(true);
    try {
      const result = await getActiveDealsForBooking();
      setDeals(result);
      if (result.length > 0 && !selectedDealId) {
        setSelectedDealId(result[0].id);
      }
    } catch {
      setError('Failed to load deals');
    } finally {
      setLoading(false);
    }
  }, [selectedDealId]);

  const handleCancel = React.useCallback(() => {
    setExpanded(false);
    setError(null);
    setConflict(null);
    setPendingConfirm(false);
  }, []);

  const handleAssign = React.useCallback(async () => {
    if (!selectedDealId) return;

    setAssigning(true);
    setError(null);

    const result = await addManualDealCrew(
      selectedDealId,
      entityId,
      roleNote.trim() || undefined,
    );

    setAssigning(false);

    if (!result.success) {
      setError(result.error);
      return;
    }

    // If there's a conflict and we haven't shown the warning yet, show it
    if (result.conflict && !pendingConfirm) {
      setConflict(result.conflict);
      setPendingConfirm(true);
      // The assignment already went through (upsert), so we show the warning
      // but also indicate success
      const selectedDeal = deals.find((d) => d.id === selectedDealId);
      toast.success(`${entityName} added to ${selectedDeal?.title ?? 'deal'}`, {
        description: result.conflict,
      });
      setExpanded(false);
      setSelectedDealId('');
      setRoleNote('');
      setConflict(null);
      setPendingConfirm(false);
      return;
    }

    const selectedDeal = deals.find((d) => d.id === selectedDealId);
    toast.success(`${entityName} added to ${selectedDeal?.title ?? 'deal'}`);
    setExpanded(false);
    setSelectedDealId('');
    setRoleNote('');
  }, [selectedDealId, entityId, entityName, roleNote, deals, pendingConfirm]);

  const formatDate = (date: string | null) => {
    if (!date) return '';
    try {
      return new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return '';
    }
  };

  return (
    <div>
      <AnimatePresence mode="wait">
        {!expanded ? (
          <motion.div
            key="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={STAGE_MEDIUM}
          >
            <Button
              variant="outline"
              size="sm"
              onClick={handleOpen}
              className="gap-1.5"
            >
              <CalendarPlus className="size-3.5" strokeWidth={1.5} />
              Book on show
            </Button>
          </motion.div>
        ) : (
          <motion.div
            key="form"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={STAGE_MEDIUM}
            className="rounded-xl border border-[var(--stage-edge-subtle)] bg-[var(--stage-surface-elevated)] p-4 space-y-3"
            data-surface="elevated"
          >
            <h3 className="text-[length:var(--stage-data-size)] font-medium text-[var(--stage-text-primary)]">
              Book {entityName} on a show
            </h3>

            {loading ? (
              <p className="text-[length:var(--stage-label-size)] text-[var(--stage-text-secondary)]">Loading deals...</p>
            ) : deals.length === 0 ? (
              <p className="text-[length:var(--stage-label-size)] text-[var(--stage-text-secondary)]">No active deals in this workspace.</p>
            ) : (
              <>
                <div className="space-y-1">
                  <label
                    htmlFor="quick-book-deal"
                    className="stage-label text-[var(--stage-text-secondary)]"
                  >
                    Show
                  </label>
                  <select
                    id="quick-book-deal"
                    value={selectedDealId}
                    onChange={(e) => setSelectedDealId(e.target.value)}
                    className="stage-input w-full py-1.5 text-sm"
                  >
                    {deals.map((deal) => (
                      <option key={deal.id} value={deal.id}>
                        {deal.title}
                        {deal.proposed_date ? ` — ${formatDate(deal.proposed_date)}` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label
                    htmlFor="quick-book-role"
                    className="stage-label text-[var(--stage-text-secondary)]"
                  >
                    Role (optional)
                  </label>
                  <input
                    id="quick-book-role"
                    type="text"
                    value={roleNote}
                    onChange={(e) => setRoleNote(e.target.value)}
                    placeholder="e.g. A1, LD, Stagehand"
                    className="stage-input w-full py-1.5 text-sm"
                  />
                </div>

                {conflict && (
                  <p className="text-[length:var(--stage-label-size)] text-[var(--color-unusonic-warning)]">{conflict}</p>
                )}
              </>
            )}

            {error && (
              <p role="alert" className="text-[length:var(--stage-label-size)] text-[var(--color-unusonic-error)]">{error}</p>
            )}

            <div className="flex items-center gap-2 pt-1">
              {deals.length > 0 && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleAssign}
                  disabled={assigning || !selectedDealId}
                >
                  {assigning ? 'Assigning...' : 'Assign'}
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={handleCancel}>
                Cancel
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
