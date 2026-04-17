'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Sparkles, MessageCircle } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import { WidgetShell } from '@/widgets/shared/ui/WidgetShell';
import { METRICS } from '@/shared/lib/metrics/registry';
import { dismissInsight, markInsightsSurfaced } from '@/app/(dashboard)/(features)/aion/actions/aion-insight-actions';
import { useOptionalCapture } from '@/widgets/lobby-capture/ui/CaptureProvider';
import { getBriefAndInsights, type BriefAndInsights, type AionInsight } from '../api/get-brief-and-insights';
import { InsightRow } from './InsightRow';
import { CaptureComposer } from './CaptureComposer';

const ActionFlowSheet = dynamic(
  () => import('./ActionFlowSheet').then((m) => ({ default: m.ActionFlowSheet })),
  { ssr: false },
);

const META = METRICS['lobby.todays_brief'];

export interface TodaysBriefWidgetProps {
  /**
   * The active layout's cardIds — drives layout-aware insight-row reordering
   * in `getBriefAndInsights`. `undefined` (legacy bento / Default preset) or
   * `[]` skips the reorder pass and returns priority-only order. See
   * docs/reference/sales-brief-v2-design.md §6.4.
   */
  activeCardIds?: readonly string[];
}

export function TodaysBriefWidget({ activeCardIds }: TodaysBriefWidgetProps = {}) {
  const [data, setData] = useState<BriefAndInsights | undefined>(undefined);
  const [activeInsight, setActiveInsight] = useState<AionInsight | null>(null);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const surfacedRef = useRef(false);

  // Null when the capture feature flag is off — composer hides entirely.
  // The composer itself reads `hasEverCaptured` from context; we only need
  // the ctx reference here to decide whether the empty state should show.
  const captureCtx = useOptionalCapture();

  // Stable stringified key so the effect only refires when the card set
  // genuinely changes (not on every layout-reference identity change).
  const cardIdsKey = activeCardIds ? activeCardIds.join('|') : '';

  // ── Fetch brief + insights ──────────────────────────────────────────────

  useEffect(() => {
    let active = true;
    const ids = cardIdsKey ? cardIdsKey.split('|') : undefined;
    void getBriefAndInsights(ids)
      .then((d) => { if (active) setData(d); })
      .catch(() => { if (active) setData({ brief: null, insights: [], workspaceId: null }); });
    return () => { active = false; };
  }, [cardIdsKey]);

  // ── Mark insights as surfaced (once) ────────────────────────────────────

  useEffect(() => {
    if (surfacedRef.current || !data?.insights.length) return;
    surfacedRef.current = true;
    const ids = data.insights.map((i) => i.id);
    void markInsightsSurfaced(ids);
  }, [data?.insights]);

  // ── Handlers ────────────────────────────────────────────────────────────

  const handleDismiss = useCallback((id: string) => {
    setDismissedIds((prev) => new Set(prev).add(id));
    void dismissInsight(id);
  }, []);

  const handleAction = useCallback((insight: AionInsight) => {
    setActiveInsight(insight);
  }, []);

  const handleResolved = useCallback((insightId: string) => {
    setDismissedIds((prev) => new Set(prev).add(insightId));
    setActiveInsight(null);
  }, []);

  // ── Derived state ───────────────────────────────────────────────────────

  const loading = data === undefined;
  const brief = data?.brief;
  const insights = (data?.insights ?? []).filter((i) => !dismissedIds.has(i.id));
  const hasBrief = brief && brief.body !== '';
  const hasInsights = insights.length > 0;
  // The composer row makes the card never truly empty when the capture
  // flag is on. Only fall back to the empty message when there's no
  // composer AND no brief AND no insights.
  const empty = !hasBrief && !hasInsights && !captureCtx;

  return (
    <WidgetShell
      icon={Sparkles}
      label={META?.title ?? "Today's brief"}
      loading={loading}
      empty={empty}
      emptyMessage="Nothing urgent right now."
      freshness={brief?.generatedAt}
    >
      <div className="flex flex-col gap-3">
        {/* Capture composer — first-run explanatory or compact depending on
            whether the user has ever captured. Renders null when the flag
            is off (no CaptureProvider mounted). State is read from context;
            the modal flips it on successful confirm, so no reload is
            needed to move from first-run to compact. */}
        <CaptureComposer />

        {/* Brief paragraph */}
        {hasBrief && (
          <p className="text-sm text-[var(--stage-text-primary)] leading-relaxed">
            {brief.body}
          </p>
        )}

        {/* Insight rows */}
        {hasInsights && (
          <div className="flex flex-col gap-1 mt-1">
            <AnimatePresence mode="popLayout">
              {insights.map((insight) => (
                <InsightRow
                  key={insight.id}
                  insight={insight}
                  onAction={handleAction}
                  onDismiss={handleDismiss}
                />
              ))}
            </AnimatePresence>
          </div>
        )}

        {/* Footer — Ask Aion link */}
        <div className="flex items-center gap-3 pt-1">
          <Link
            href="/aion"
            className="inline-flex items-center gap-1.5 text-xs text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] transition-colors"
          >
            <MessageCircle className="w-3.5 h-3.5" strokeWidth={1.5} />
            Ask Aion
          </Link>
        </div>
      </div>

      {/* Action Flow Sheet — dynamic imported, only loads on first tap */}
      {data?.workspaceId && (
        <ActionFlowSheet
          insight={activeInsight}
          open={activeInsight !== null}
          onOpenChange={(open) => { if (!open) setActiveInsight(null); }}
          workspaceId={data.workspaceId}
          onResolved={handleResolved}
        />
      )}
    </WidgetShell>
  );
}
