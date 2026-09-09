'use client';

/**
 * CaptureTimelinePanel — reverse-chron list of captures for one entity.
 *
 * Each row shows the distilled note (not the transcript) by default. Row menu:
 *   - Show transcript (expand inline)
 *   - Edit (transcript + note, inline textarea)
 *   - Reassign (fuzzy entity picker — misattribution recovery, design §11)
 *   - Change visibility (user ↔ workspace, confirm on promotion)
 *   - Delete (soft-delete via dismiss_capture RPC)
 *
 * Ownership: teammates can read workspace-visible captures but only the
 * author can mutate. The row menu hides mutation items when !isOwnCapture.
 *
 * Design: docs/reference/capture-surfaces-design.md §5.3.B, §5.4, §11.
 */

import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Lock,
  FileText,
  X,
  Search,
  AlertCircle,
  CalendarCheck2,
  Briefcase,
  User as UserIcon,
  MapPin,
  Building2,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/shared/lib/utils';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import { queryKeys } from '@/shared/api/query-keys';
import { withFrom } from '@/shared/lib/smart-back';
import { useCurrentHref } from '@/shared/lib/smart-back-client';
import { CaptureRowMenu } from './CaptureRowMenu';
import { partitionByScope } from './capture-note-scope';
import { CaptureShowNotes } from './CaptureShowNotes';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { getEntityCaptures, type EntityCapture } from '../api/get-entity-captures';
import { updateCapture } from '../api/update-capture';
import {
  searchReassignTargets,
  type ReassignTarget,
} from '../api/search-reassign-targets';
import { PrivateNotes } from './PrivateNotes';
import { formatRelative } from '@/shared/lib/format-relative';

export interface CaptureTimelinePanelProps {
  workspaceId: string;
  entityId: string;
  entityName: string | null;
  /**
   * When the viewed entity is a company or venue, the timeline also includes
   * captures about people affiliated with it (ROSTER_MEMBER, MEMBER, PARTNER
   * edges). Each such row renders an "about X" chip linking to that person's
   * entity studio. Leave false for person / couple entities.
   */
  entityType?: 'person' | 'company' | 'venue' | 'couple' | null;
  /**
   * When present, the free-text note for this relationship is composed at the
   * bottom of this card instead of in a second card of its own. Two boxes both
   * headed with some form of "notes", each with its own input, read as two
   * different things to fill in when they are one activity.
   *
   * Absent on the full entity page, which has no single relationship in view.
   */
  relationshipId?: string | null;
  initialNotes?: string | null;
}

// Group-by-production threshold per design Decision B default: flat until
// captures span 3+ distinct productions, then group with headers.
const GROUPING_THRESHOLD = 3;

type ProductionGroup = {
  key: string;
  label: string;
  kind: 'deal' | 'event' | 'none';
  captures: EntityCapture[];
};

/**
 * Organize captures into production groups when there are 3+ distinct
 * productions. Returns flat when below the threshold.
 */
function groupCaptures(
  captures: EntityCapture[],
): { mode: 'flat' | 'grouped'; groups: ProductionGroup[] } {
  const distinctProductions = new Set<string>();
  for (const c of captures) {
    if (c.linkedProduction) {
      distinctProductions.add(`${c.linkedProduction.kind}:${c.linkedProduction.id}`);
    }
  }

  if (distinctProductions.size < GROUPING_THRESHOLD) {
    return {
      mode: 'flat',
      groups: [{ key: 'all', label: '', kind: 'none', captures }],
    };
  }

  // Group by production. Use insertion-order Map so the first-seen production
  // comes first — since captures are already reverse-chron, this puts the
  // most-recent production at the top.
  const byProduction = new Map<string, ProductionGroup>();
  for (const c of captures) {
    const key = c.linkedProduction
      ? `${c.linkedProduction.kind}:${c.linkedProduction.id}`
      : 'other';
    if (!byProduction.has(key)) {
      byProduction.set(key, {
        key,
        label: c.linkedProduction?.title ?? 'Other notes',
        kind: c.linkedProduction?.kind ?? 'none',
        captures: [],
      });
    }
    byProduction.get(key)!.captures.push(c);
  }

  return {
    mode: 'grouped',
    groups: Array.from(byProduction.values()),
  };
}

/** Module-level so an empty result is referentially stable across renders. */
const EMPTY_CAPTURES: EntityCapture[] = [];

export function CaptureTimelinePanel({
  workspaceId,
  entityId,
  entityName,
  entityType = null,
  relationshipId = null,
  initialNotes = null,
}: CaptureTimelinePanelProps) {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const [visibleCount, setVisibleCount] = React.useState(5);
  const [highlightedCaptureId, setHighlightedCaptureId] = React.useState<string | null>(null);

  const includeAffiliated = entityType === 'company' || entityType === 'venue';

  const { data, isLoading } = useQuery({
    queryKey: [
      ...queryKeys.entities.captures(workspaceId, entityId),
      { includeAffiliated },
    ],
    queryFn: () => getEntityCaptures(workspaceId, entityId, { includeAffiliated }),
    staleTime: 30_000,
    enabled: Boolean(workspaceId && entityId),
  });

  const captures = data && 'ok' in data && data.ok ? data.captures : EMPTY_CAPTURES;

  // Deep-link: ?capture={id} scrolls to that row and highlights briefly.
  // Also expand visibleCount if the target is past the first page.
  const targetCaptureId = searchParams?.get('capture') ?? null;
  React.useEffect(() => {
    if (!targetCaptureId || captures.length === 0) return;
    const idx = captures.findIndex((c) => c.id === targetCaptureId);
    if (idx === -1) return;
    if (idx >= visibleCount) setVisibleCount(idx + 1);
    setHighlightedCaptureId(targetCaptureId);
    const raf = requestAnimationFrame(() => {
      const el = document.getElementById(`capture-${targetCaptureId}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    const cancelHighlight = setTimeout(() => setHighlightedCaptureId(null), 2200);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(cancelHighlight);
    };
  }, [targetCaptureId, captures, visibleCount]);

  const { about, show } = React.useMemo(() => partitionByScope(captures), [captures]);
  const visibleCaptures = about.slice(0, visibleCount);
  const { mode, groups } = React.useMemo(
    () => groupCaptures(visibleCaptures),
    [visibleCaptures],
  );

  const invalidate = React.useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: queryKeys.entities.captures(workspaceId, entityId),
    });
    queryClient.invalidateQueries({
      queryKey: queryKeys.entities.summary(workspaceId, entityId),
    });
  }, [queryClient, workspaceId, entityId]);

  // With nothing captured AND nowhere to write, there is nothing to show. When
  // a composer is available the card stays, because the input is the reason to
  // open it -- it just does not also print an empty-state paragraph above.
  if (!isLoading && captures.length === 0 && !relationshipId) return null;

  if (isLoading && captures.length === 0) {
    return (
      <div
        className="rounded-[var(--stage-radius-panel)] bg-[var(--ctx-card)] p-[var(--stage-padding)] space-y-2"
        data-surface="elevated"
      >
        <div className="h-3 w-24 rounded stage-skeleton" />
        <div className="h-3 w-full rounded stage-skeleton" />
      </div>
    );
  }

  return (
    <div
      className="rounded-[var(--stage-radius-panel)] bg-[var(--ctx-card)] p-[var(--stage-padding)] space-y-3"
      data-surface="elevated"
    >
      <div className="flex items-center justify-between">
        <h3 className="stage-label text-[var(--stage-text-secondary)]">Notes</h3>
        {about.length > 0 && (
          <span className="text-[11px] text-[var(--stage-text-tertiary)] tabular-nums">
            {about.length}
          </span>
        )}
      </div>

      {about.length === 0 ? (
        relationshipId ? null : (
          <p className="text-[length:var(--stage-label-size)] text-[var(--stage-text-tertiary)]">
            No notes yet. Tap the composer on the lobby to leave one.
          </p>
        )
      ) : mode === 'flat' ? (
        <ul className="space-y-2">
          <AnimatePresence initial={false}>
            {visibleCaptures.map((c) => (
              <CaptureRow
                key={c.id}
                capture={c}
                workspaceId={workspaceId}
                entityName={entityName}
                showProductionPill
                highlighted={highlightedCaptureId === c.id}
                onMutated={invalidate}
              />
            ))}
          </AnimatePresence>
        </ul>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <div key={g.key} className="space-y-2">
              <ProductionGroupHeader group={g} />
              <ul className="space-y-2">
                <AnimatePresence initial={false}>
                  {g.captures.map((c) => (
                    <CaptureRow
                      key={c.id}
                      capture={c}
                      workspaceId={workspaceId}
                      entityName={entityName}
                      showProductionPill={false}
                      highlighted={highlightedCaptureId === c.id}
                      onMutated={invalidate}
                    />
                  ))}
                </AnimatePresence>
              </ul>
            </div>
          ))}
        </div>
      )}

      {about.length > visibleCount && (
        <button
          type="button"
          onClick={() => setVisibleCount((n) => n + 10)}
          className="text-[11px] text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] transition-colors"
        >
          Show older ({about.length - visibleCount} more)
        </button>
      )}

      <CaptureShowNotes
        count={show.length}
        defaultOpen={Boolean(targetCaptureId && show.some((c) => c.id === targetCaptureId))}
      >
        <AnimatePresence initial={false}>
          {show.map((c) => (
            <CaptureRow
              key={c.id}
              capture={c}
              workspaceId={workspaceId}
              entityName={entityName}
              showProductionPill
              highlighted={highlightedCaptureId === c.id}
              onMutated={invalidate}
            />
          ))}
        </AnimatePresence>
      </CaptureShowNotes>

      {/* Compose at the bottom, under what is already there -- the same shape as
          every message thread, and the reason this is one card rather than a
          list here and an input somewhere further down. */}
      {relationshipId && (
        <div className="border-t border-[var(--stage-edge-subtle)] pt-3">
          <PrivateNotes relationshipId={relationshipId} initialNotes={initialNotes} />
        </div>
      )}
    </div>
  );
}

// ── "About X" chip (inline deep-link on affiliated-entity rows) ──────────────

function AboutEntityChip({
  aboutEntity,
}: {
  aboutEntity: NonNullable<EntityCapture['aboutEntity']>;
}) {
  const origin = useCurrentHref();
  const href = withFrom(`/network/entity/${aboutEntity.id}`, origin);
  return (
    <Link
      href={href}
      className={cn(
        'inline-flex items-center gap-1 px-1.5 py-0.5 rounded',
        'bg-[oklch(1_0_0/0.04)] border border-[var(--stage-edge-subtle)]',
        'text-[10px] text-[var(--stage-text-secondary)]',
        'hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0/0.06)]',
        'transition-colors',
      )}
    >
      <EntityTypeIcon type={aboutEntity.type} />
      <span className="truncate max-w-[180px]">
        about {aboutEntity.name ?? 'unknown'}
      </span>
    </Link>
  );
}

function EntityTypeIcon({ type }: { type: string | null }) {
  if (type === 'person' || type === 'couple') {
    return <UserIcon className="size-2.5" strokeWidth={1.5} />;
  }
  if (type === 'venue') {
    return <MapPin className="size-2.5" strokeWidth={1.5} />;
  }
  return <Building2 className="size-2.5" strokeWidth={1.5} />;
}

// ── Production pill (inline on row in flat mode) ─────────────────────────────

function InlineProductionPill({
  production,
}: {
  production: NonNullable<EntityCapture['linkedProduction']>;
}) {
  const Icon = production.kind === 'event' ? CalendarCheck2 : Briefcase;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-1.5 py-0.5 rounded',
        'bg-[oklch(1_0_0/0.04)] border border-[var(--stage-edge-subtle)]',
        'text-[10px] text-[var(--stage-text-secondary)]',
      )}
    >
      <Icon className="size-2.5" strokeWidth={1.5} />
      <span className="truncate max-w-[160px]">{production.title ?? 'untitled'}</span>
    </span>
  );
}

// ── Group header ─────────────────────────────────────────────────────────────

function ProductionGroupHeader({ group }: { group: ProductionGroup }) {
  const Icon =
    group.kind === 'event'
      ? CalendarCheck2
      : group.kind === 'deal'
        ? Briefcase
        : FileText;
  return (
    <div className="flex items-center gap-1.5 text-[var(--stage-text-secondary)]">
      <Icon className="size-3" strokeWidth={1.5} />
      <span className="stage-label">{group.label}</span>
      <span className="text-[10px] text-[var(--stage-text-tertiary)] tabular-nums">
        {group.captures.length}
      </span>
    </div>
  );
}

// ── Row ──────────────────────────────────────────────────────────────────────

function CaptureRow({
  capture,
  workspaceId,
  entityName,
  showProductionPill,
  highlighted,
  onMutated,
}: {
  capture: EntityCapture;
  workspaceId: string;
  entityName: string | null;
  showProductionPill: boolean;
  highlighted: boolean;
  onMutated: () => void;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [reassignOpen, setReassignOpen] = React.useState(false);

  const isOwn = capture.isOwnCapture;
  const isPrivate = capture.visibility === 'user';
  const relative = formatRelative(capture.createdAt);

  return (
    <motion.li
      layout
      id={`capture-${capture.id}`}
      initial={{ opacity: 0, y: 2 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -4 }}
      transition={STAGE_LIGHT}
      className={cn(
        'rounded-md border px-2 py-2 -mx-2 group transition-colors',
        highlighted
          ? 'border-[var(--stage-accent)]/40 bg-[oklch(1_0_0/0.06)]'
          : 'border-transparent hover:border-[var(--stage-edge-subtle)] hover:bg-[oklch(1_0_0/0.02)]',
      )}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2 text-[11px] text-[var(--stage-text-tertiary)]">
            <span className="tabular-nums">{relative}</span>
            {!isOwn && capture.capturedByName && (
              <span>· {capture.capturedByName}</span>
            )}
            {isPrivate && (
              <Lock
                className="size-3 text-[var(--stage-text-tertiary)]"
                strokeWidth={1.5}
                aria-label="Private capture — only you can see this."
              />
            )}
            {capture.uncertain && (
              <span
                className="inline-flex items-center gap-0.5 text-[var(--color-unusonic-warning)]"
                title="Parse was ambiguous — click Reassign if this landed on the wrong entity."
              >
                <AlertCircle className="size-3" strokeWidth={1.5} />
                uncertain
              </span>
            )}
          </div>

          {editing ? (
            <CaptureEditor
              capture={capture}
              onCancel={() => setEditing(false)}
              onSaved={() => {
                setEditing(false);
                onMutated();
              }}
            />
          ) : (
            <>
              <p className="text-[length:var(--stage-data-size)] text-[var(--stage-text-primary)] leading-snug">
                {capture.parsedNote || capture.transcript || '—'}
              </p>
              {(capture.aboutEntity ||
                (showProductionPill && capture.linkedProduction)) && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {capture.aboutEntity && (
                    <AboutEntityChip aboutEntity={capture.aboutEntity} />
                  )}
                  {showProductionPill && capture.linkedProduction && (
                    <InlineProductionPill production={capture.linkedProduction} />
                  )}
                </div>
              )}
            </>
          )}

          {expanded && capture.transcript && !editing && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={STAGE_LIGHT}
              className="mt-1"
            >
              <div className="text-[11px] font-mono text-[var(--stage-text-tertiary)] pl-2 border-l border-[var(--stage-edge-subtle)] py-0.5">
                {capture.transcript}
              </div>
            </motion.div>
          )}
        </div>

        <CaptureRowMenu
          capture={capture}
          isOwn={isOwn}
          expanded={expanded}
          onToggleTranscript={() => setExpanded((x) => !x)}
          onStartEdit={() => {
            setEditing(true);
            setExpanded(true);
          }}
          onStartReassign={() => setReassignOpen(true)}
          onMutated={onMutated}
        />
      </div>

      {reassignOpen && (
        <ReassignDialog
          workspaceId={workspaceId}
          capture={capture}
          currentEntityName={entityName}
          onClose={() => setReassignOpen(false)}
          onReassigned={() => {
            setReassignOpen(false);
            onMutated();
          }}
        />
      )}
    </motion.li>
  );
}

// ── Row menu ─────────────────────────────────────────────────────────────────

function CaptureEditor({
  capture,
  onCancel,
  onSaved,
}: {
  capture: EntityCapture;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [note, setNote] = React.useState(capture.parsedNote ?? '');
  const [transcript, setTranscript] = React.useState(capture.transcript ?? '');
  const [saving, setSaving] = React.useState(false);

  const save = async () => {
    setSaving(true);
    const result = await updateCapture({
      action: 'edit',
      captureId: capture.id,
      transcript: transcript.trim() !== (capture.transcript ?? '').trim() ? transcript : null,
      parsedNote: note.trim() !== (capture.parsedNote ?? '').trim() ? note : null,
    });
    setSaving(false);
    if (!result.ok) {
      toast.error(result.error, { duration: Infinity });
      return;
    }
    toast.success('Saved.');
    onSaved();
  };

  return (
    <div className="space-y-2">
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder="Note"
        className={cn(
          'w-full text-sm px-2 py-1.5 rounded-md resize-none',
          'border border-[var(--stage-edge-subtle)] bg-[var(--ctx-well)]',
          'text-[var(--stage-text-primary)]',
          'focus:outline-none focus:ring-1 focus:ring-[var(--stage-accent)]/50',
        )}
      />
      <textarea
        value={transcript}
        onChange={(e) => setTranscript(e.target.value)}
        rows={3}
        placeholder="Transcript"
        className={cn(
          'w-full text-[11px] font-mono px-2 py-1.5 rounded-md resize-none',
          'border border-[var(--stage-edge-subtle)] bg-[var(--ctx-well)]',
          'text-[var(--stage-text-secondary)]',
          'focus:outline-none focus:ring-1 focus:ring-[var(--stage-accent)]/50',
        )}
      />
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="stage-btn stage-btn-ghost text-xs"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="stage-btn stage-btn-primary text-xs disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}

// ── Reassign dialog ──────────────────────────────────────────────────────────

function ReassignDialog({
  workspaceId,
  capture,
  currentEntityName,
  onClose,
  onReassigned,
}: {
  workspaceId: string;
  capture: EntityCapture;
  currentEntityName: string | null;
  onClose: () => void;
  onReassigned: () => void;
}) {
  const [query, setQuery] = React.useState('');
  const [results, setResults] = React.useState<ReassignTarget[]>([]);
  const [searching, setSearching] = React.useState(false);
  const [reassigning, setReassigning] = React.useState(false);

  // Debounced search.
  React.useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(async () => {
      const rows = await searchReassignTargets(workspaceId, q);
      if (!cancelled) {
        // Exclude the current entity from results — reassigning to itself is a no-op.
        setResults(rows.filter((r) => r.id !== capture.resolvedEntityId));
        setSearching(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, workspaceId, capture.resolvedEntityId]);

  const handlePick = async (target: ReassignTarget) => {
    setReassigning(true);
    const result = await updateCapture({
      action: 'reassign',
      captureId: capture.id,
      newEntityId: target.id,
    });
    setReassigning(false);
    if (!result.ok) {
      toast.error(result.error, { duration: Infinity });
      return;
    }
    toast.success(`Moved to ${target.name}.`);
    onReassigned();
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="w-[440px] max-w-[92vw]">
        <DialogHeader>
          <DialogTitle>
            <span className="text-sm font-medium text-[var(--stage-text-primary)]">
              Move this note
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-[11px] text-[var(--stage-text-tertiary)]">
            Currently on <span className="text-[var(--stage-text-secondary)]">{currentEntityName ?? 'an entity'}</span>.
            Pick where this note actually belongs.
          </p>

          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-[var(--stage-text-tertiary)]" strokeWidth={1.5} />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search people, companies, venues…"
              autoFocus
              className={cn(
                'w-full text-sm pl-8 pr-2 py-2 rounded-md',
                'border border-[var(--stage-edge-subtle)] bg-[var(--ctx-well)]',
                'text-[var(--stage-text-primary)]',
                'placeholder:text-[var(--stage-text-tertiary)]',
                'focus:outline-none focus:ring-1 focus:ring-[var(--stage-accent)]/50',
              )}
            />
          </div>

          <div className="max-h-[280px] overflow-y-auto space-y-0.5">
            {searching && results.length === 0 && (
              <p className="text-[11px] text-[var(--stage-text-tertiary)] px-2 py-3">
                Searching…
              </p>
            )}
            {!searching && query.trim().length >= 2 && results.length === 0 && (
              <p className="text-[11px] text-[var(--stage-text-tertiary)] px-2 py-3">
                No matches.
              </p>
            )}
            {results.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => handlePick(r)}
                disabled={reassigning}
                className={cn(
                  'w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded text-left',
                  'hover:bg-[oklch(1_0_0/0.06)] transition-colors',
                  'disabled:opacity-40',
                )}
              >
                <span className="text-sm text-[var(--stage-text-primary)]">
                  {r.name}
                </span>
                <span className="text-[10px] uppercase tracking-wider text-[var(--stage-text-tertiary)]">
                  {r.type ?? '?'}
                </span>
              </button>
            ))}
          </div>

          <div className="flex justify-between items-center pt-1">
            <button
              type="button"
              onClick={async () => {
                // "Un-assign" path — drop the entity link entirely.
                setReassigning(true);
                const result = await updateCapture({
                  action: 'reassign',
                  captureId: capture.id,
                  newEntityId: null,
                });
                setReassigning(false);
                if (!result.ok) {
                  toast.error(result.error, { duration: Infinity });
                  return;
                }
                toast.success('Un-assigned.');
                onReassigned();
              }}
              disabled={reassigning}
              className="text-[11px] text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] underline-offset-2 hover:underline"
            >
              Un-assign
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={reassigning}
              className="stage-btn stage-btn-ghost text-xs inline-flex items-center gap-1"
            >
              <X className="size-3" />
              Cancel
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────


