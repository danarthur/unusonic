'use client';

/**
 * Right-side slide-over sheet for viewing a Network entity (employee, ghost
 * partner, person partner, venue, etc). Composes the entity dossier as a two-
 * tab read-only-ish view: Overview (transmission) and Crew. Heavy section
 * code lives in siblings under ./network-detail-sheet/.
 *
 * This file owns: data fetching (useQuery + keepPreviousData for sibling-
 * switch hold), tab state, and the sheet shell. All large render blocks
 * (contact strip, transmission panel, member-card forms, roster actions)
 * are co-located siblings to keep this file under ~400 LOC after the
 * 2026-04-28 Phase 0.5-style split.
 */

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { FileEdit, Globe } from 'lucide-react';
import { useWorkspace } from '@/shared/ui/providers/WorkspaceProvider';
import { networkQueries } from '@/features/network-data/api/queries';
import { queryKeys } from '@/shared/api/query-keys';
import { Button } from '@/shared/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetClose,
} from '@/shared/ui/sheet';
import { IdentityHeader } from './IdentityHeader';
import { NodeCrewList } from './NodeCrewList';
import type { NodeDetail, NodeDetailCrewMember } from '@/features/network-data';
import { STAGE_LIGHT, STAGE_NAV_CROSSFADE } from '@/shared/lib/motion-constants';
import { PromotedMetricsRow } from './PromotedMetricsRow';
import { ContactStrip } from './network-detail-sheet/contact-strip';
import { TransmissionPanel } from './network-detail-sheet/transmission-panel';
import { getTabsForDetail, type TabId } from './network-detail-sheet/shared';

interface NetworkDetailSheetProps {
  /** When provided, useQuery fetches details internally. */
  nodeId?: string;
  kind?: 'internal_employee' | 'extended_team' | 'external_partner';
  /** Pre-fetched details (legacy prop — used when nodeId is not provided). */
  details?: NodeDetail;
  /** Called when user closes; defaults to router.push(returnPath ?? '/network') if omitted. */
  onClose?: () => void;
  /** Current org id (for Summon partner). */
  sourceOrgId: string;
  /** Where to navigate on close and after editing. Defaults to '/network'. */
  returnPath?: string;
}

export function NetworkDetailSheet({ nodeId, kind, details: detailsProp, onClose, sourceOrgId, returnPath }: NetworkDetailSheetProps) {
  const router = useRouter();
  const { workspaceId } = useWorkspace();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = React.useState<TabId>('transmission');

  // Fetch details via useQuery when nodeId/kind are provided; fall back to prop.
  // `placeholderData: keepPreviousData` holds the previous entity's payload
  // visible while the new fetch is in flight so sibling-switch (entity A →
  // entity B with the sheet open) doesn't flash a skeleton between them.
  // See docs/reference/code/perf-patterns.md §2 for the canonical pattern.
  const { data: queryDetails, isFetching } = useQuery({
    ...networkQueries.nodeDetail(workspaceId ?? '', nodeId ?? '', kind ?? 'external_partner', sourceOrgId),
    enabled: !!nodeId && !!kind && !!workspaceId,
    initialData: detailsProp ?? undefined,
    placeholderData: keepPreviousData,
  });
  void isFetching;
  const details = queryDetails ?? detailsProp;

  const invalidateDetail = React.useCallback(() => {
    if (nodeId && workspaceId) {
      queryClient.invalidateQueries({ queryKey: queryKeys.entities.detail(workspaceId, nodeId) });
    }
    // Also invalidate the network list so the grid updates
    if (workspaceId) {
      queryClient.invalidateQueries({ queryKey: queryKeys.entities.all(workspaceId) });
    }
  }, [queryClient, nodeId, workspaceId]);

  const handleClose = React.useCallback(() => {
    if (onClose) {
      onClose();
    } else {
      router.push(returnPath ?? '/network');
    }
  }, [onClose, returnPath, router]);

  const [pendingCrew, setPendingCrew] = React.useState<NodeDetailCrewMember[]>([]);

  React.useEffect(() => {
    if (details?.id) setPendingCrew([]);
  }, [details?.id]);

  React.useEffect(() => {
    if (!details) return;
    const tabList = getTabsForDetail(details);
    const ids = tabList.map((t) => t.id);
    if (!ids.includes(activeTab)) setActiveTab(ids[0] ?? 'transmission');
  }, [details?.id, details?.kind, details?.entityDirectoryType, activeTab, details]);

  const handleRefresh = React.useCallback(() => {
    invalidateDetail();
  }, [invalidateDetail]);

  const handleCrewAdded = React.useCallback(
    (newMember?: NodeDetailCrewMember) => {
      if (newMember) setPendingCrew((prev) => [...prev, newMember]);
      setTimeout(() => invalidateDetail(), 800);
    },
    [invalidateDetail]
  );

  if (!details) return null;

  const isPartner = details.kind === 'external_partner';
  const serverCrew = (details.crew ?? []).filter((m) => {
    const n = (m.name ?? '').trim();
    return n.length > 0 && n !== '—';
  });
  // Merge server + pending so adding one person doesn’t hide existing crew. Dedupe by name so we don’t show placeholder + real card (server has ghost email, optimistic has null).
  const serverNames = new Set(
    serverCrew.map((m) => (m.name ?? '').trim().toLowerCase())
  );
  const pendingOnly = pendingCrew.filter(
    (p) => !serverNames.has((p.name ?? '').trim().toLowerCase())
  );
  const crew = [...serverCrew, ...pendingOnly];
  const ghostOrgId = details.targetOrgId ?? '';
  const isCrewEditable = isPartner && details.isGhost && !!ghostOrgId;

  return (
    <Sheet open onOpenChange={(open) => { if (!open) handleClose(); }}>
      <SheetContent
        side="right"
        className="w-[min(100%,37.5rem)] rounded-l-[var(--stage-radius-panel,12px)] bg-[var(--stage-surface)]"
        data-surface="surface"
      >
        <SheetHeader>
          <SheetTitle className="truncate">{details.identity.name}</SheetTitle>
          <div className="flex shrink-0 items-center gap-1">
            {/* Ghost partner — edit their external entity profile */}
            {isPartner && details.isGhost && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push(`/network/entity/${details.id}?kind=external_partner${returnPath ? `&from=${encodeURIComponent(returnPath)}` : ''}`)}
                className="h-8 gap-1.5 px-2 text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0/0.08)]"
              >
                <FileEdit className="size-4" strokeWidth={1.5} />
                Edit
              </Button>
            )}
            {/* Internal employee / contractor — navigate to their person entity studio */}
            {!isPartner && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push(`/network/entity/${details.id}?kind=${details.kind}${returnPath ? `&from=${encodeURIComponent(returnPath)}` : ''}`)}
                className="h-8 gap-1.5 px-2 text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0/0.08)]"
              >
                <FileEdit className="size-4" strokeWidth={1.5} />
                Edit
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-8 w-8 text-[var(--stage-text-secondary)]" aria-label="View profile">
              <Globe className="size-4" strokeWidth={1.5} />
            </Button>
            <SheetClose />
          </div>
        </SheetHeader>

          <div className="flex-1 overflow-y-auto flex flex-col min-h-0">
            <IdentityHeader
              details={details}
              sourceOrgId={sourceOrgId}
              onSummonSuccess={handleRefresh}
            />

            {/* Promoted metrics — two that earn inline placement per §10 */}
            {workspaceId && details.subjectEntityId && (() => {
              const t = details.entityDirectoryType;
              if (t !== 'person' && t !== 'company' && t !== 'venue' && t !== 'couple') {
                return null;
              }
              return (
                <div className="px-6 pb-3">
                  <PromotedMetricsRow
                    workspaceId={workspaceId}
                    entityId={details.subjectEntityId}
                    entityType={t}
                  />
                </div>
              );
            })()}

            {/* Contact strip — always visible, outside tabs */}
            <ContactStrip details={details} />

            {/* Tab strip with sliding indicator */}
            <div className="shrink-0 border-b border-[var(--stage-edge-subtle)] px-6">
              <div className="relative flex h-12" role="tablist">
                {getTabsForDetail(details).map((tab) => {
                  const displayLabel = tab.id === 'crew' && details.entityDirectoryType === 'venue'
                    ? 'House contacts'
                    : tab.label;
                  return (
                  <div key={tab.id} className="relative flex flex-1 items-center justify-center">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={activeTab === tab.id}
                      aria-controls={`panel-${tab.id}`}
                      id={`tab-${tab.id}`}
                      onClick={() => setActiveTab(tab.id)}
                      className={`
                        stage-label
                        transition-colors duration-[80ms] text-[var(--stage-text-secondary)]
                        hover:text-[var(--stage-text-primary)]
                        ${activeTab === tab.id ? 'text-[var(--stage-text-primary)]' : ''}
                      `}
                    >
                      {displayLabel}
                    </button>
                    {activeTab === tab.id && (
                      <motion.div
                        layoutId="network-detail-tab-indicator"
                        className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--stage-accent)]"
                        initial={false}
                        transition={STAGE_LIGHT}
                      />
                    )}
                  </div>
                  );
                })}
              </div>
            </div>

            {/* Tab panels with crossfade */}
            <div className="flex-1 overflow-y-auto px-6 py-5 relative">
              <AnimatePresence mode="wait">
              {activeTab === 'transmission' && (
                <motion.div
                  key="transmission"
                  id="panel-transmission"
                  role="tabpanel"
                  aria-labelledby="tab-transmission"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={STAGE_NAV_CROSSFADE}
                  className="space-y-5"
                >
                  <TransmissionPanel
                    details={details}
                    workspaceId={workspaceId ?? null}
                    sourceOrgId={sourceOrgId}
                    onRefresh={handleRefresh}
                    onClose={handleClose}
                  />
                </motion.div>
              )}

              {activeTab === 'crew' && (
                <motion.div
                  key="crew"
                  id="panel-crew"
                  role="tabpanel"
                  aria-labelledby="tab-crew"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={STAGE_NAV_CROSSFADE}
                  className="space-y-6"
                >
                  {isPartner ? (
                    <NodeCrewList
                      crew={crew}
                      sourceOrgId={sourceOrgId}
                      ghostOrgId={ghostOrgId}
                      isEditable={isCrewEditable}
                      onAdded={handleCrewAdded}
                    />
                  ) : (
                    <p className="text-[length:var(--stage-data-size)] text-[var(--stage-text-secondary)]">
                      Available for partners.
                    </p>
                  )}
                </motion.div>
              )}

              </AnimatePresence>
            </div>
          </div>
      </SheetContent>
    </Sheet>
  );
}
