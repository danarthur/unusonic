/**
 * Rider Parser Modal — multi-step flow for extracting rider requirements
 * and matching them against the workspace catalog via Aion.
 *
 * Step 1: Paste rider text
 * Step 2: Review matched requirements
 * Step 3: Add selected items to proposal
 *
 * @module features/ai/ui/rider-parser-modal
 */

'use client';

import React, { useState, useCallback, useTransition } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, ChevronDown, ChevronUp, AlertTriangle, FileText, Zap } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/shared/ui/dialog';
import { Button } from '@/shared/ui/button';
import { LivingLogo } from '@/shared/ui/branding/living-logo';
import { cn } from '@/shared/lib/utils';
import { STAGE_LIGHT, STAGE_MEDIUM, STAGE_STAGGER_CHILDREN } from '@/shared/lib/motion-constants';
import { parseRiderText, type RiderMatch, type RiderParseResult } from '../tools/rider-parser';
import { addPackageToProposal } from '@/features/sales/api/proposal-actions';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface RiderParserModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dealId: string;
  workspaceId: string;
  onItemsAdded: () => void;
}

// ---------------------------------------------------------------------------
// Step type
// ---------------------------------------------------------------------------

type Step = 'input' | 'review' | 'adding';

// ---------------------------------------------------------------------------
// Per-requirement selection state
// ---------------------------------------------------------------------------

interface RequirementSelection {
  included: boolean;
  /** Index into the requirement's `matches` array — which catalog item to use. */
  selectedMatchIndex: number;
}

// ---------------------------------------------------------------------------
// Status colors (OKLCH semantic)
// ---------------------------------------------------------------------------

const STATUS_COLORS = {
  matched: {
    bg: 'oklch(0.45 0.12 145 / 0.15)',
    border: 'oklch(0.55 0.12 145)',
    text: 'oklch(0.75 0.12 145)',
    label: 'Matched',
  },
  partial: {
    bg: 'oklch(0.50 0.12 75 / 0.15)',
    border: 'oklch(0.60 0.12 75)',
    text: 'oklch(0.80 0.12 75)',
    label: 'Partial',
  },
  unmatched: {
    bg: 'oklch(0.45 0.15 25 / 0.15)',
    border: 'oklch(0.55 0.15 25)',
    text: 'oklch(0.75 0.15 25)',
    label: 'Not in catalog',
  },
} as const;

const CATEGORY_LABELS: Record<string, string> = {
  gear: 'Gear',
  crew: 'Crew',
  other: 'Other',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RiderParserModal({
  open,
  onOpenChange,
  dealId,
  workspaceId,
  onItemsAdded,
}: RiderParserModalProps) {
  const [step, setStep] = useState<Step>('input');
  const [riderText, setRiderText] = useState('');
  const [parseResult, setParseResult] = useState<RiderParseResult | null>(null);
  const [selections, setSelections] = useState<Record<number, RequirementSelection>>({});
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isParsing, startParsing] = useTransition();
  const [addingProgress, setAddingProgress] = useState({ done: 0, total: 0 });

  // ── Reset on close ──────────────────────────────────────────────────────
  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        // Reset state on close
        setStep('input');
        setRiderText('');
        setParseResult(null);
        setSelections({});
        setExpandedIndex(null);
        setError(null);
        setAddingProgress({ done: 0, total: 0 });
      }
      onOpenChange(next);
    },
    [onOpenChange]
  );

  // ── Step 1 → Step 2: Parse ─────────────────────────────────────────────
  const handleParse = useCallback(() => {
    if (!riderText.trim()) return;
    setError(null);
    startParsing(async () => {
      const result = await parseRiderText(workspaceId, riderText);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.requirements.length === 0) {
        setError('No equipment or crew requirements found in this text.');
        return;
      }
      setParseResult(result);
      // Default selections: include matched/partial, exclude unmatched
      const defaultSelections: Record<number, RequirementSelection> = {};
      result.requirements.forEach((req, i) => {
        defaultSelections[i] = {
          included: req.status !== 'unmatched',
          selectedMatchIndex: 0,
        };
      });
      setSelections(defaultSelections);
      setStep('review');
    });
  }, [riderText, workspaceId]);

  // ── Toggle inclusion ───────────────────────────────────────────────────
  const toggleInclusion = useCallback((index: number) => {
    setSelections((prev) => ({
      ...prev,
      [index]: {
        ...prev[index],
        included: !prev[index]?.included,
      },
    }));
  }, []);

  // ── Change selected match ──────────────────────────────────────────────
  const changeMatch = useCallback((reqIndex: number, matchIndex: number) => {
    setSelections((prev) => ({
      ...prev,
      [reqIndex]: {
        ...prev[reqIndex],
        selectedMatchIndex: matchIndex,
      },
    }));
  }, []);

  // ── Step 2 → Step 3: Add to proposal ──────────────────────────────────
  const handleAddToProposal = useCallback(async () => {
    if (!parseResult) return;

    const toAdd: { packageId: string; reqIndex: number }[] = [];
    parseResult.requirements.forEach((req, i) => {
      const sel = selections[i];
      if (!sel?.included) return;
      if (req.status === 'unmatched') return; // skip unmatched even if toggled
      const match = req.matches[sel.selectedMatchIndex];
      if (!match) return;
      toAdd.push({ packageId: match.packageId, reqIndex: i });
    });

    if (toAdd.length === 0) return;

    setStep('adding');
    setAddingProgress({ done: 0, total: toAdd.length });

    let failures = 0;
    for (let i = 0; i < toAdd.length; i++) {
      try {
        const result = await addPackageToProposal(dealId, toAdd[i].packageId);
        if (!result.success) failures++;
      } catch {
        failures++;
      }
      setAddingProgress({ done: i + 1, total: toAdd.length });
    }

    onItemsAdded();
    if (failures > 0) {
      console.warn(`[rider-parser] ${failures}/${toAdd.length} items failed to add`);
    }
    handleOpenChange(false);
  }, [parseResult, selections, dealId, onItemsAdded, handleOpenChange]);

  // ── Derived counts ────────────────────────────────────────────────────
  const selectedCount = parseResult
    ? parseResult.requirements.filter((_, i) => {
        const sel = selections[i];
        return sel?.included && parseResult.requirements[i].status !== 'unmatched';
      }).length
    : 0;

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <LivingLogo
              status={isParsing ? 'thinking' : step === 'adding' ? 'loading' : 'idle'}
              size="sm"
            />
            <DialogTitle>
              {step === 'input' && 'Parse technical rider'}
              {step === 'review' && 'Review requirements'}
              {step === 'adding' && 'Adding to proposal'}
            </DialogTitle>
          </div>
          <DialogClose />
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4">
          <AnimatePresence mode="wait">
            {/* ── Step 1: Input ────────────────────────────────────────── */}
            {step === 'input' && (
              <motion.div
                key="input"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={STAGE_MEDIUM}
                className="space-y-4"
              >
                <p className="text-sm text-[var(--stage-text-secondary)]">
                  Paste the technical section of the artist rider. Aion will extract equipment and
                  crew requirements and match them against your catalog.
                </p>
                <textarea
                  value={riderText}
                  onChange={(e) => setRiderText(e.target.value)}
                  placeholder="Paste rider text here..."
                  rows={12}
                  className={cn(
                    'w-full rounded-[var(--stage-radius-input)] border border-[var(--stage-edge-subtle)]',
                    'bg-[var(--ctx-well,var(--stage-input-bg))] px-4 py-3',
                    'text-sm text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-muted)]',
                    'focus:outline-none focus:ring-2 focus:ring-[var(--stage-accent)]',
                    'resize-y min-h-[8rem]'
                  )}
                />
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={STAGE_LIGHT}
                    className="flex items-start gap-2 rounded-[var(--stage-radius-input)] px-3 py-2 text-sm"
                    style={{ background: STATUS_COLORS.unmatched.bg, color: STATUS_COLORS.unmatched.text }}
                  >
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                    {error}
                  </motion.div>
                )}
                <div className="flex justify-end">
                  <Button
                    onClick={handleParse}
                    disabled={!riderText.trim() || isParsing}
                    className="gap-2"
                  >
                    {isParsing ? (
                      <>
                        <LivingLogo status="thinking" size={16} />
                        Analyzing rider...
                      </>
                    ) : (
                      <>
                        <Zap size={16} strokeWidth={1.5} />
                        Parse with Aion
                      </>
                    )}
                  </Button>
                </div>
              </motion.div>
            )}

            {/* ── Step 2: Review ───────────────────────────────────────── */}
            {step === 'review' && parseResult && (
              <motion.div
                key="review"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={STAGE_MEDIUM}
                className="space-y-4"
              >
                {/* Summary bar */}
                <div className="flex items-center gap-3 text-xs font-medium tracking-wide text-[var(--stage-text-secondary)]">
                  <span>{parseResult.requirements.length} requirements found</span>
                  <span className="text-[var(--stage-text-muted)]">·</span>
                  <span style={{ color: STATUS_COLORS.matched.text }}>
                    {parseResult.totalMatched} matched
                  </span>
                  {parseResult.totalPartial > 0 && (
                    <>
                      <span className="text-[var(--stage-text-muted)]">·</span>
                      <span style={{ color: STATUS_COLORS.partial.text }}>
                        {parseResult.totalPartial} partial
                      </span>
                    </>
                  )}
                  {parseResult.totalUnmatched > 0 && (
                    <>
                      <span className="text-[var(--stage-text-muted)]">·</span>
                      <span style={{ color: STATUS_COLORS.unmatched.text }}>
                        {parseResult.totalUnmatched} not found
                      </span>
                    </>
                  )}
                </div>

                {/* Requirement list */}
                <motion.div
                  className="space-y-2"
                  initial="hidden"
                  animate="visible"
                  variants={{
                    hidden: {},
                    visible: { transition: { staggerChildren: STAGE_STAGGER_CHILDREN } },
                  }}
                >
                  {parseResult.requirements.map((req, i) => (
                    <RequirementCard
                      key={i}
                      requirement={req}
                      index={i}
                      selection={selections[i]}
                      expanded={expandedIndex === i}
                      onToggleExpand={() =>
                        setExpandedIndex((prev) => (prev === i ? null : i))
                      }
                      onToggleInclude={() => toggleInclusion(i)}
                      onChangeMatch={(matchIdx) => changeMatch(i, matchIdx)}
                    />
                  ))}
                </motion.div>

                {/* Actions */}
                <div className="flex items-center justify-between pt-2 border-t border-[var(--stage-edge-subtle)]">
                  <button
                    type="button"
                    onClick={() => {
                      setStep('input');
                      setParseResult(null);
                      setError(null);
                    }}
                    className="text-sm text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] transition-colors"
                  >
                    Back
                  </button>
                  <Button
                    onClick={handleAddToProposal}
                    disabled={selectedCount === 0}
                    className="gap-2"
                  >
                    <Check size={16} strokeWidth={1.5} />
                    Add {selectedCount} item{selectedCount !== 1 ? 's' : ''} to proposal
                  </Button>
                </div>
              </motion.div>
            )}

            {/* ── Step 3: Adding ───────────────────────────────────────── */}
            {step === 'adding' && (
              <motion.div
                key="adding"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={STAGE_MEDIUM}
                className="flex flex-col items-center justify-center py-12 gap-4"
              >
                <LivingLogo status="loading" size="lg" />
                <p className="text-sm text-[var(--stage-text-secondary)]">
                  Adding items to proposal... {addingProgress.done}/{addingProgress.total}
                </p>
                <div className="w-48 h-1 rounded-full bg-[var(--stage-edge-subtle)] overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-[var(--stage-text-primary)]"
                    initial={{ width: '0%' }}
                    animate={{
                      width:
                        addingProgress.total > 0
                          ? `${(addingProgress.done / addingProgress.total) * 100}%`
                          : '0%',
                    }}
                    transition={STAGE_LIGHT}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// RequirementCard sub-component
// ---------------------------------------------------------------------------

interface RequirementCardProps {
  requirement: RiderMatch;
  index: number;
  selection: RequirementSelection | undefined;
  expanded: boolean;
  onToggleExpand: () => void;
  onToggleInclude: () => void;
  onChangeMatch: (matchIndex: number) => void;
}

function RequirementCard({
  requirement,
  selection,
  expanded,
  onToggleExpand,
  onToggleInclude,
  onChangeMatch,
}: RequirementCardProps) {
  const statusColor = STATUS_COLORS[requirement.status];
  const isIncluded = selection?.included ?? false;
  const selectedMatchIdx = selection?.selectedMatchIndex ?? 0;
  const hasMatches = requirement.matches.length > 0;
  const selectedMatch = hasMatches ? requirement.matches[selectedMatchIdx] : null;

  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 6 },
        visible: { opacity: 1, y: 0, transition: STAGE_LIGHT },
      }}
      className={cn(
        'rounded-[var(--stage-radius-panel)] border overflow-hidden transition-colors',
        isIncluded
          ? 'border-[var(--stage-edge-subtle)] bg-[var(--stage-surface-elevated)]'
          : 'border-[var(--stage-edge-subtle)] bg-[var(--stage-surface-elevated)] opacity-50'
      )}
    >
      {/* Status stripe */}
      <div className="flex">
        <div
          className="w-1 shrink-0"
          style={{ background: statusColor.border }}
        />
        <div className="flex-1 min-w-0 p-3">
          {/* Top row: checkbox, name, badges, expand */}
          <div className="flex items-center gap-3">
            {/* Include checkbox */}
            <button
              type="button"
              onClick={onToggleInclude}
              className={cn(
                'shrink-0 w-5 h-5 rounded-[4px] border flex items-center justify-center transition-colors',
                isIncluded
                  ? 'bg-[var(--stage-text-primary)] border-[var(--stage-text-primary)]'
                  : 'border-[var(--stage-edge-subtle)] bg-transparent'
              )}
              aria-label={isIncluded ? 'Exclude from proposal' : 'Include in proposal'}
            >
              {isIncluded && (
                <Check size={12} strokeWidth={2} className="text-[var(--stage-void)]" />
              )}
            </button>

            {/* Name + quantity */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-[var(--stage-text-primary)] truncate">
                  {requirement.requirement.name}
                </span>
                {requirement.requirement.quantity > 1 && (
                  <span className="shrink-0 text-xs text-[var(--stage-text-muted)] tabular-nums">
                    x{requirement.requirement.quantity}
                  </span>
                )}
              </div>
            </div>

            {/* Category badge */}
            <span className="shrink-0 text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full bg-[oklch(1_0_0_/_0.06)] text-[var(--stage-text-secondary)]">
              {CATEGORY_LABELS[requirement.requirement.category] ?? requirement.requirement.category}
            </span>

            {/* Status badge */}
            <span
              className="shrink-0 text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full"
              style={{
                background: statusColor.bg,
                color: statusColor.text,
              }}
            >
              {statusColor.label}
            </span>

            {/* Expand / collapse */}
            <button
              type="button"
              onClick={onToggleExpand}
              className="shrink-0 p-1 rounded text-[var(--stage-text-muted)] hover:text-[var(--stage-text-secondary)] transition-colors"
              aria-label={expanded ? 'Collapse' : 'Expand'}
            >
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>

          {/* Selected match preview (when collapsed) */}
          {!expanded && selectedMatch && (
            <div className="mt-1.5 pl-8 text-xs text-[var(--stage-text-secondary)] truncate">
              {selectedMatch.packageName}
              <span className="ml-2 text-[var(--stage-text-muted)]">
                ${selectedMatch.price.toLocaleString()}
              </span>
            </div>
          )}

          {/* Expanded details */}
          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={STAGE_LIGHT}
                className="overflow-hidden"
              >
                <div className="pt-3 pl-8 space-y-3">
                  {/* Original text */}
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--stage-text-muted)] mb-1">
                      From rider
                    </p>
                    <p className="text-xs text-[var(--stage-text-secondary)] italic leading-relaxed">
                      &ldquo;{requirement.requirement.originalText}&rdquo;
                    </p>
                  </div>

                  {/* Match picker */}
                  {hasMatches && (
                    <div>
                      <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--stage-text-muted)] mb-1.5">
                        Catalog match
                      </p>
                      <div className="space-y-1">
                        {requirement.matches.map((match, mIdx) => (
                          <button
                            key={match.packageId}
                            type="button"
                            onClick={() => onChangeMatch(mIdx)}
                            className={cn(
                              'w-full flex items-center gap-3 px-3 py-2 rounded-[var(--stage-radius-input)] text-left transition-colors',
                              mIdx === selectedMatchIdx
                                ? 'bg-[oklch(1_0_0_/_0.08)] ring-1 ring-[var(--stage-accent)]'
                                : 'hover:bg-[oklch(1_0_0_/_0.04)]'
                            )}
                          >
                            <div
                              className={cn(
                                'w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0',
                                mIdx === selectedMatchIdx
                                  ? 'border-[var(--stage-text-primary)]'
                                  : 'border-[var(--stage-edge-subtle)]'
                              )}
                            >
                              {mIdx === selectedMatchIdx && (
                                <div className="w-1.5 h-1.5 rounded-full bg-[var(--stage-text-primary)]" />
                              )}
                            </div>
                            <span className="flex-1 text-xs text-[var(--stage-text-primary)] truncate">
                              {match.packageName}
                            </span>
                            <span className="text-xs text-[var(--stage-text-muted)] tabular-nums">
                              ${match.price.toLocaleString()}
                            </span>
                            <span className="text-[10px] text-[var(--stage-text-muted)] tabular-nums">
                              {Math.round(match.similarity * 100)}%
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* No matches message */}
                  {!hasMatches && (
                    <p className="text-xs text-[var(--stage-text-muted)]">
                      No matching items in your catalog. This requirement will be skipped.
                    </p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}
