'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Sparkles, MessageCircle } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import { WidgetShell } from '@/widgets/shared/ui/WidgetShell';
import { METRICS } from '@/shared/lib/metrics/registry';
import { dismissInsight, markInsightsSurfaced } from '@/app/(dashboard)/(features)/aion/actions/aion-insight-actions';
import { getBriefAndInsights, type BriefAndInsights, type AionInsight } from '../api/get-brief-and-insights';
import { InsightRow } from './InsightRow';

const ActionFlowSheet = dynamic(
  () => import('./ActionFlowSheet').then((m) => ({ default: m.ActionFlowSheet })),
  { ssr: false },
);

const META = METRICS['lobby.todays_brief'];

export function TodaysBriefWidget() {
  const [data, setData] = useState<BriefAndInsights | undefined>(undefined);
  const [activeInsight, setActiveInsight] = useState<AionInsight | null>(null);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const surfacedRef = useRef(false);

  // ── Fetch brief + insights ──────────────────────────────────────────────

  useEffect(() => {
    let active = true;
    void getBriefAndInsights()
      .then((d) => { if (active) setData(d); })
      .catch(() => { if (active) setData({ brief: null, insights: [], workspaceId: null }); });
    return () => { active = false; };
  }, []);

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
  const empty = !hasBrief && !hasInsights;

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
