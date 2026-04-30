/**
 * Shared types/helpers for NetworkDetailSheet siblings.
 *
 * Extracted from NetworkDetailSheet.tsx during the Phase 0.5-style split
 * (2026-04-28). Keeps tab IDs and the visibility predicate in one place
 * so the main file and the panel siblings stay in sync.
 */
import type { NodeDetail } from '@/features/network-data';

export type TabId = 'transmission' | 'crew';

export const ALL_TABS: { id: TabId; label: string }[] = [
  { id: 'transmission', label: 'Overview' },
  { id: 'crew', label: 'Crew' },
];

/** Crew tab only for org/venue entities (not person/couple). */
export function getTabsForDetail(details: NodeDetail): { id: TabId; label: string }[] {
  const isPartner = details.kind === 'external_partner';
  const showCrew = isPartner
    && details.entityDirectoryType !== 'person'
    && details.entityDirectoryType !== 'couple';
  return showCrew ? ALL_TABS : ALL_TABS.filter((t) => t.id !== 'crew');
}
