'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import Link from 'next/link';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetBody,
  SheetFooter,
  SheetClose,
} from '@/shared/ui/sheet';
import { Button } from '@/shared/ui/button';
import { STAGE_MEDIUM } from '@/shared/lib/motion-constants';
import { DraftPreview } from './DraftPreview';
import { CrewPreview } from './CrewPreview';
import type { AionInsight } from '../api/get-brief-and-insights';

// ── Types matching dispatch API response ────────────────────────────────────

type DispatchResponse = {
  status: 'preview' | 'needs_clarification' | 'completed' | 'already_resolved' | 'error';
  resultType?: 'draft' | 'crew_list' | 'crew_assign' | 'message';
  payload?: {
    draft?: string;
    subject?: string;
    channel?: 'sms' | 'email';
    recipientEmail?: string;
    recipientName?: string;
    dealId?: string;
    dealTitle?: string;
    crew?: Array<{
      dealCrewId: string;
      entityId: string | null;
      name: string;
      role: string | null;
      confirmed: boolean;
      email: string | null;
    }>;
    message?: string;
    href?: string;
  };
  clarification?: {
    question: string;
    options: Array<{ label: string; value: string }>;
  };
};

type Phase = 'idle' | 'executing' | 'preview' | 'clarify' | 'confirming' | 'completed' | 'error';

// ── Props ───────────────────────────────────────────────────────────────────

interface ActionFlowSheetProps {
  insight: AionInsight | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  onResolved: (insightId: string) => void;
}

// ── Component ───────────────────────────────────────────────────────────────

export function ActionFlowSheet({
  insight,
  open,
  onOpenChange,
  workspaceId,
  onResolved,
}: ActionFlowSheetProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [response, setResponse] = useState<DispatchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Draft editing state
  const [editedDraft, setEditedDraft] = useState('');
  const [editedSubject, setEditedSubject] = useState('');

  // Crew selection state
  const [selectedCrewIds, setSelectedCrewIds] = useState<string[]>([]);

  // ── Execute on open ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!open || !insight) {
      setPhase('idle');
      return;
    }

    setPhase('executing');
    setResponse(null);
    setError(null);

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch('/api/aion/dispatch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            insightId: insight.id,
            workspaceId,
            action: 'execute',
          }),
        });

        if (cancelled) return;
        const data: DispatchResponse = await res.json();

        if (data.status === 'already_resolved' || (data.status === 'completed')) {
          setPhase('completed');
          setResponse(data);
          return;
        }

        if (data.status === 'error') {
          setPhase('error');
          setError(data.payload?.message ?? 'Something went wrong.');
          return;
        }

        if (data.status === 'needs_clarification') {
          setPhase('clarify');
          setResponse(data);
          return;
        }

        // Preview — populate editing state
        setResponse(data);
        if (data.payload?.draft) setEditedDraft(data.payload.draft);
        if (data.payload?.subject) setEditedSubject(data.payload.subject);
        if (data.payload?.crew) {
          setSelectedCrewIds(data.payload.crew.map((c) => c.dealCrewId));
        }
        setPhase('preview');
      } catch {
        if (!cancelled) {
          setPhase('error');
          setError('Failed to connect to Aion.');
        }
      }
    })();

    return () => { cancelled = true; };
  }, [open, insight, workspaceId]);

  // ── Auto-close on completed ──────────────────────────────────────────────

  useEffect(() => {
    if (phase !== 'completed') return;
    const timer = setTimeout(() => {
      if (insight) onResolved(insight.id);
      onOpenChange(false);
    }, 1500);
    return () => clearTimeout(timer);
  }, [phase, insight, onResolved, onOpenChange]);

  // ── Confirm action ───────────────────────────────────────────────────────

  const handleConfirm = useCallback(async () => {
    if (!insight) return;
    setPhase('confirming');

    try {
      const res = await fetch('/api/aion/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          insightId: insight.id,
          workspaceId,
          action: 'confirm',
          payload: {
            editedDraft: editedDraft || undefined,
            editedSubject: editedSubject || undefined,
            selectedCrewIds: selectedCrewIds.length > 0 ? selectedCrewIds : undefined,
          },
        }),
      });

      const data: DispatchResponse = await res.json();

      if (data.status === 'completed' || data.status === 'already_resolved') {
        setResponse(data);
        setPhase('completed');
      } else if (data.status === 'needs_clarification') {
        setResponse(data);
        setPhase('clarify');
      } else {
        setPhase('error');
        setError(data.payload?.message ?? 'Action failed.');
      }
    } catch {
      setPhase('error');
      setError('Failed to connect to Aion.');
    }
  }, [insight, workspaceId, editedDraft, editedSubject, selectedCrewIds]);

  // ── Render ───────────────────────────────────────────────────────────────

  const resultType = response?.resultType;
  const payload = response?.payload;

  const primaryLabel =
    resultType === 'draft' ? 'Send' :
    resultType === 'crew_list' ? `Confirm ${selectedCrewIds.length}` :
    'Confirm';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" ariaLabel="Aion action">
        <SheetHeader>
          <SheetTitle>{insight?.title ?? 'Aion'}</SheetTitle>
          <SheetClose />
        </SheetHeader>

        <SheetBody>
          <AnimatePresence mode="wait">
            {/* Executing */}
            {(phase === 'executing' || phase === 'confirming') && (
              <motion.div
                key="executing"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={STAGE_MEDIUM}
                className="flex flex-col items-center justify-center gap-3 py-12"
              >
                <Loader2 className="w-6 h-6 text-[var(--stage-text-secondary)] animate-spin" />
                <p className="text-xs text-[var(--stage-text-secondary)]">
                  {phase === 'confirming' ? 'Sending...' : 'Aion is working on this...'}
                </p>
              </motion.div>
            )}

            {/* Preview — Draft */}
            {phase === 'preview' && resultType === 'draft' && payload && (
              <motion.div
                key="draft"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={STAGE_MEDIUM}
              >
                <DraftPreview
                  draft={editedDraft}
                  subject={editedSubject}
                  channel={payload.channel ?? 'email'}
                  recipientEmail={payload.recipientEmail}
                  recipientName={payload.recipientName}
                  dealTitle={payload.dealTitle}
                  onDraftChange={setEditedDraft}
                  onSubjectChange={setEditedSubject}
                />
              </motion.div>
            )}

            {/* Preview — Crew List */}
            {phase === 'preview' && resultType === 'crew_list' && payload?.crew && (
              <motion.div
                key="crew"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={STAGE_MEDIUM}
              >
                <CrewPreview
                  crew={payload.crew}
                  dealTitle={payload.dealTitle}
                  selectedIds={selectedCrewIds}
                  onSelectionChange={setSelectedCrewIds}
                />
              </motion.div>
            )}

            {/* Preview — Crew Assign (navigate to deal) */}
            {phase === 'preview' && resultType === 'crew_assign' && payload && (
              <motion.div
                key="assign"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={STAGE_MEDIUM}
                className="flex flex-col items-center gap-4 py-8"
              >
                <p className="text-sm text-[var(--stage-text-secondary)] text-center">
                  {payload.message}
                </p>
                {payload.href && (
                  <Link
                    href={payload.href}
                    className="text-sm font-medium text-[var(--stage-text-primary)] hover:underline"
                  >
                    Open deal
                  </Link>
                )}
              </motion.div>
            )}

            {/* Clarification */}
            {phase === 'clarify' && response?.clarification && (
              <motion.div
                key="clarify"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={STAGE_MEDIUM}
                className="flex flex-col gap-4 py-4"
              >
                <p className="text-sm text-[var(--stage-text-primary)]">
                  {response.clarification.question}
                </p>
                <div className="flex flex-wrap gap-2">
                  {response.clarification.options.map((opt) => (
                    <Button
                      key={opt.value}
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        if (opt.value === 'navigate' && payload?.href) {
                          window.location.href = payload.href;
                        } else {
                          onOpenChange(false);
                        }
                      }}
                    >
                      {opt.label}
                    </Button>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Completed */}
            {phase === 'completed' && (
              <motion.div
                key="completed"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={STAGE_MEDIUM}
                className="flex flex-col items-center gap-3 py-12"
              >
                <CheckCircle2 className="w-8 h-8 text-[var(--color-unusonic-success)]" strokeWidth={1.5} />
                <p className="text-sm text-[var(--stage-text-primary)]">
                  {payload?.message ?? 'Done.'}
                </p>
              </motion.div>
            )}

            {/* Error */}
            {phase === 'error' && (
              <motion.div
                key="error"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={STAGE_MEDIUM}
                className="flex flex-col items-center gap-3 py-12"
              >
                <AlertCircle className="w-8 h-8 text-[var(--color-unusonic-error)]" strokeWidth={1.5} />
                <p className="text-sm text-[var(--stage-text-secondary)]">{error}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </SheetBody>

        {/* Footer — only visible during preview */}
        {phase === 'preview' && resultType !== 'crew_assign' && (
          <SheetFooter>
            <div className="flex items-center gap-3 w-full">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleConfirm}
                disabled={
                  (resultType === 'draft' && !editedDraft.trim()) ||
                  (resultType === 'crew_list' && selectedCrewIds.length === 0)
                }
              >
                {primaryLabel}
              </Button>
            </div>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}
