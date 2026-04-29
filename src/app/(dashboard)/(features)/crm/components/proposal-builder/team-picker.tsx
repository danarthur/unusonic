'use client';

/**
 * TeamPicker — the Team rail tab inside the proposal-builder studio.
 *
 * Extracted from proposal-builder-studio.tsx (Phase 0.5 split, 2026-04-28).
 * The studio file was 3,855 LOC, blocking Vercel typecheck for 12+ min and
 * forcing `typescript: { ignoreBuildErrors: true }` on production deploys.
 * Splitting subtrees with clean prop boundaries (this file: 481 LOC) restores
 * type-safe production builds.
 *
 * Owns: needed-roles chips, role-narrowed roster filter, search input, the
 * "Pick a person" → assignDealCrewEntity / addManualDealCrew dispatch.
 */

import { useCallback, useMemo, useState } from 'react';
import { Search, Users } from 'lucide-react';
import { toast } from 'sonner';

import {
  addManualDealCrew,
  assignDealCrewEntity,
  type DealCrewRow,
  type CrewSearchResult,
} from '../../actions/deal-crew';
import { cn } from '@/shared/lib/utils';
import type { DemoBlock } from './types';

export function TeamPicker({
  dealId,
  selectedBlock,
  dealCrew,
  roster,
  forceDemo,
  roleFocus,
  onSetRoleFocus,
  onRefetchCrew,
  isRequiredRole,
}: {
  dealId: string;
  selectedBlock: DemoBlock | undefined;
  dealCrew: DealCrewRow[];
  roster: CrewSearchResult[];
  forceDemo: boolean;
  roleFocus: string | null;
  onSetRoleFocus: (role: string | null) => void;
  onRefetchCrew: () => void;
  isRequiredRole: (catalogItemId: string, roleNote: string) => boolean;
}) {
  const [query, setQuery] = useState('');
  const [pendingEntityId, setPendingEntityId] = useState<string | null>(null);

  // Open roles across the whole proposal — any deal_crew row with no entity
  // assigned yet counts as "needed." Grouped by role_note with counts so the
  // PM can see at a glance what slots still need filling. Required flag is
  // set when ANY of the grouped rows come from an explicitly-required role.
  const openRoleNeeds = useMemo(() => {
    const groups = new Map<string, DealCrewRow[]>();
    for (const row of dealCrew) {
      if (row.entity_id !== null) continue;
      const label = (row.role_note ?? '').trim();
      if (!label) continue;
      const list = groups.get(label) ?? [];
      list.push(row);
      groups.set(label, list);
    }
    return [...groups.entries()]
      .map(([role, rows]) => ({
        role,
        count: rows.length,
        required: rows.some(
          (r) => r.catalog_item_id != null && isRequiredRole(r.catalog_item_id, role),
        ),
      }))
      .sort((a, b) => {
        // Required first, then alphabetical — required slots are the higher
        // priority visual target.
        if (a.required !== b.required) return a.required ? -1 : 1;
        return a.role.localeCompare(b.role);
      });
  }, [dealCrew, isRequiredRole]);

  const handleChipClick = useCallback(
    (role: string) => {
      // Toggle — click the same chip again to clear the filter and see everyone.
      onSetRoleFocus(roleFocus === role ? null : role);
    },
    [roleFocus, onSetRoleFocus],
  );

  // Entities already on this deal — we tag their rows in the picker so the PM
  // can see at a glance who's already committed, and we prevent accidental
  // double-add attempts on them.
  const assignedEntityIds = useMemo(
    () => new Set(dealCrew.map((r) => r.entity_id).filter(Boolean) as string[]),
    [dealCrew],
  );

  // Two-stage filter:
  //   1. If roleFocus is set (LineInspector "Assign" on a specific role),
  //      narrow to people whose skills or job_title match the role. This is
  //      the "pulls from the network tab of djs" case — assigning a DJ slot
  //      should show DJs, not the whole roster.
  //   2. Query text narrows further across name/title/skill.
  const roleNarrowed = useMemo(() => {
    if (!roleFocus) return roster;
    const roleLower = roleFocus.toLowerCase();
    return roster.filter((p) => {
      const titleMatch = (p.job_title ?? '').toLowerCase().includes(roleLower) ||
        roleLower.includes((p.job_title ?? '').toLowerCase() || '\0');
      const skillMatch = p.skills.some((s) => {
        const sLower = s.toLowerCase();
        return sLower.includes(roleLower) || roleLower.includes(sLower);
      });
      return titleMatch || skillMatch;
    });
  }, [roleFocus, roster]);

  // When role narrowing produces nothing, fall back to the full roster so the
  // PM still has an escape hatch — we flag the state so the UI can explain.
  const roleMatchedSome = !roleFocus || roleNarrowed.length > 0;
  const roleFiltered = roleMatchedSome ? roleNarrowed : roster;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return roleFiltered;
    return roleFiltered.filter((p) => {
      const nameMatch = p.name.toLowerCase().includes(q);
      const titleMatch = (p.job_title ?? '').toLowerCase().includes(q);
      const skillMatch = p.skills.some((s) => s.toLowerCase().includes(q));
      return nameMatch || titleMatch || skillMatch;
    });
  }, [query, roleFiltered]);

  // Split the roster by employment status so "staff" (internal employees) and
  // freelance crew (external contractors) land under their own headers when
  // the workspace has tagged them. Anything unset falls into Staff.
  const staff = filtered.filter((p) => p.employment_status !== 'external_contractor');
  const freelancers = filtered.filter((p) => p.employment_status === 'external_contractor');

  const handlePickPerson = useCallback(
    async (person: CrewSearchResult) => {
      if (forceDemo) {
        toast('Team wiring is disabled in demo mode — drop ?demo=1 to assign crew.');
        return;
      }
      if (assignedEntityIds.has(person.entity_id)) {
        toast(`${person.name} is already on this deal`);
        return;
      }
      setPendingEntityId(person.entity_id);

      // Find the best open slot to fill. Preference order:
      //   1. Slot that matches BOTH the selected block AND the focused role
      //      (e.g. clicked "Assign" on DJ in LineInspector for Gold Package).
      //   2. Any open slot on the selected block (block selected, no role).
      //   3. Any open slot matching the focused role across the whole proposal
      //      (clicked the "DJ" chip without a block — most common flow).
      // If nothing matches, fall through to addManualDealCrew as a deal-level
      // add with no specific slot.
      let openSlot: DealCrewRow | undefined;

      const relevantBlockIds = new Set<string>();
      if (selectedBlock?.catalogItemId) relevantBlockIds.add(selectedBlock.catalogItemId);
      for (const id of selectedBlock?.childCatalogItemIds ?? []) relevantBlockIds.add(id);

      const focusLower = roleFocus?.toLowerCase() ?? null;
      const openRows = dealCrew.filter((r) => r.entity_id === null);

      if (relevantBlockIds.size > 0 && focusLower) {
        openSlot = openRows.find(
          (r) =>
            r.catalog_item_id != null &&
            relevantBlockIds.has(r.catalog_item_id) &&
            (r.role_note ?? '').toLowerCase() === focusLower,
        );
      }
      if (!openSlot && relevantBlockIds.size > 0) {
        openSlot = openRows.find(
          (r) => r.catalog_item_id != null && relevantBlockIds.has(r.catalog_item_id),
        );
      }
      if (!openSlot && focusLower) {
        openSlot = openRows.find(
          (r) => (r.role_note ?? '').toLowerCase() === focusLower,
        );
      }

      try {
        if (openSlot) {
          const res = await assignDealCrewEntity(openSlot.id, person.entity_id);
          if (res.success) {
            if (res.conflict) toast.warning(res.conflict);
            else toast.success(`Assigned ${person.name} · ${openSlot.role_note ?? selectedBlock?.title ?? 'crew'}`);
            onSetRoleFocus(null);
            onRefetchCrew();
          } else {
            toast.error(res.error);
          }
        } else if (roleFocus) {
          // Role is in focus but no matching open slot exists (e.g. all DJ slots
          // already filled, or role tagged on a package not yet added). Add as a
          // manual row with the role preserved so the PM still captures intent.
          const res = await addManualDealCrew(dealId, person.entity_id, roleFocus);
          if (res.success) {
            if (res.conflict) toast.warning(res.conflict);
            else toast.success(`Added ${person.name} · ${roleFocus}`);
            onSetRoleFocus(null);
            onRefetchCrew();
          } else {
            toast.error(res.error);
          }
        } else {
          // No role, no block — an untyped "deal-level add" creates an orphan
          // row with null role_note that's hard to use later. Prompt instead.
          toast('Pick a role above or select a scope row to assign this person.');
        }
      } finally {
        setPendingEntityId(null);
      }
    },
    [
      forceDemo,
      assignedEntityIds,
      selectedBlock,
      dealCrew,
      roleFocus,
      dealId,
      onSetRoleFocus,
      onRefetchCrew,
    ],
  );

  const contextText = (() => {
    if (roleFocus && selectedBlock) {
      return (
        <>
          Filling <span className="text-[var(--stage-text-primary)] font-medium">{roleFocus}</span> on{' '}
          <span className="text-[var(--stage-text-primary)] font-medium">{selectedBlock.title}</span>
        </>
      );
    }
    if (selectedBlock) {
      return (
        <>
          Assigning to <span className="text-[var(--stage-text-primary)] font-medium">{selectedBlock.title}</span>
        </>
      );
    }
    return 'Click a person to add them to this deal';
  })();

  return (
    <div className="h-full min-h-0 flex flex-col">
      {/* Needed-roles chips — one per role_note across every open deal_crew slot
           on this proposal. Click to narrow the roster to people who match,
           click again (or the Clear button below) to see everyone. Styled to
           match the Catalog tag-filter row for visual consistency. */}
      {openRoleNeeds.length > 0 && (
        <div className="shrink-0 px-3 pb-3 flex flex-col gap-1.5">
          <span className="stage-label text-[var(--stage-text-tertiary)]">
            Needed for this proposal
          </span>
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide pb-0.5">
            {openRoleNeeds.map((need) => {
              const active = roleFocus === need.role;
              return (
                <button
                  key={need.role}
                  type="button"
                  onClick={() => handleChipClick(need.role)}
                  className={cn(
                    'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium border transition-colors whitespace-nowrap flex items-center gap-1.5',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]',
                  )}
                  style={
                    active
                      ? {
                          backgroundColor: 'var(--stage-surface-raised)',
                          borderColor: 'var(--stage-edge-top)',
                          color: 'var(--stage-text-primary)',
                        }
                      : {
                          backgroundColor: 'transparent',
                          borderColor: 'oklch(1 0 0 / 0.08)',
                          color: 'var(--stage-text-secondary)',
                        }
                  }
                  aria-pressed={active}
                >
                  <span>{need.role}</span>
                  {need.required && (
                    <span
                      className="text-[var(--color-unusonic-warning)] leading-none"
                      title="Required role"
                      aria-label="Required"
                    >
                      *
                    </span>
                  )}
                  <span className="tabular-nums text-[var(--stage-text-tertiary)]">
                    {need.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Context header — what we're assigning to */}
      <div className="shrink-0 px-3 pb-3 flex flex-col gap-2">
        <div
          className={cn(
            'px-3 py-2 rounded-[var(--stage-radius-input)] flex items-center gap-2',
            selectedBlock || roleFocus
              ? 'bg-[oklch(1_0_0_/_0.03)] border border-[var(--stage-edge-subtle)]'
              : 'bg-transparent border border-dashed border-[var(--stage-edge-subtle)]',
          )}
        >
          <Users
            size={12}
            strokeWidth={1.75}
            className="text-[var(--stage-text-tertiary)] shrink-0"
            aria-hidden
          />
          <span className="text-[12px] text-[var(--stage-text-secondary)] flex-1 min-w-0 truncate">
            {contextText}
          </span>
          {roleFocus && (
            <button
              type="button"
              onClick={() => onSetRoleFocus(null)}
              className="shrink-0 text-[11px] text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-primary)]"
              aria-label="Clear role focus"
            >
              Clear
            </button>
          )}
        </div>

        <label className="relative flex items-center">
          <Search
            size={13}
            strokeWidth={1.75}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--stage-text-tertiary)] pointer-events-none"
            aria-hidden
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search team…"
            className="stage-input w-full h-8 text-[13px]"
            style={{ paddingLeft: '30px', paddingRight: '12px' }}
            aria-label="Search team"
          />
        </label>
      </div>

      {/* Roster */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {/* When role narrowing found nothing, we fell back to the full list —
             tell the PM so they understand why non-DJs are showing for a DJ slot. */}
        {roleFocus && !roleMatchedSome && (
          <div className="mx-3 mb-2 px-3 py-2 rounded-[var(--stage-radius-input)] bg-[var(--ctx-well)] border border-dashed border-[var(--stage-edge-subtle)]">
            <p className="text-[11px] text-[var(--stage-text-tertiary)] leading-[1.5]">
              No one on your team matches <span className="text-[var(--stage-text-secondary)]">{roleFocus}</span> yet.
              Showing everyone — tag skills on their profile to narrow this next time.
            </p>
          </div>
        )}
        {roster.length === 0 ? (
          <div className="px-4 py-10 flex flex-col items-center gap-1 text-center">
            <p className="stage-readout text-[var(--stage-text-secondary)]">
              No crew yet
            </p>
            <p className="stage-label text-[var(--stage-text-tertiary)] normal-case tracking-normal">
              Add people to your roster from the Network page to book them here.
            </p>
          </div>
        ) : (
          <>
            {staff.length > 0 && (
              <TeamGroup
                label="Staff"
                people={staff}
                assignedEntityIds={assignedEntityIds}
                pendingEntityId={pendingEntityId}
                onPick={handlePickPerson}
              />
            )}
            {freelancers.length > 0 && (
              <TeamGroup
                label="Freelancers"
                people={freelancers}
                assignedEntityIds={assignedEntityIds}
                pendingEntityId={pendingEntityId}
                onPick={handlePickPerson}
              />
            )}
            {filtered.length === 0 && (
              <div className="px-4 py-10 flex flex-col items-center gap-1 text-center">
                <p className="stage-readout text-[var(--stage-text-secondary)]">No matches</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function TeamGroup({
  label,
  people,
  assignedEntityIds,
  pendingEntityId,
  onPick,
}: {
  label: string;
  people: CrewSearchResult[];
  assignedEntityIds: Set<string>;
  pendingEntityId: string | null;
  onPick: (person: CrewSearchResult) => void;
}) {
  return (
    <section className="border-b border-[var(--stage-edge-subtle)] last:border-b-0">
      <p className="px-4 pt-3 pb-1.5 stage-label text-[var(--stage-text-tertiary)]">
        {label}
      </p>
      <ul className="flex flex-col pb-1 list-none">
        {people.map((person) => (
          <li key={person.entity_id}>
            <TeamPersonRow
              person={person}
              isAssigned={assignedEntityIds.has(person.entity_id)}
              isPending={pendingEntityId === person.entity_id}
              onPick={onPick}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function TeamPersonRow({
  person,
  isAssigned,
  isPending,
  onPick,
}: {
  person: CrewSearchResult;
  isAssigned: boolean;
  isPending: boolean;
  onPick: (person: CrewSearchResult) => void;
}) {
  const initials = person.name
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0])
    .join('');
  const disabled = isAssigned || isPending;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onPick(person)}
      className={cn(
        'w-full flex items-center gap-3 px-4 py-2 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] focus-visible:ring-inset',
        disabled
          ? 'opacity-55 cursor-not-allowed'
          : 'hover:bg-[oklch(1_0_0_/_0.025)] cursor-pointer',
      )}
    >
      <span
        className="size-7 shrink-0 rounded-full inline-flex items-center justify-center bg-[var(--stage-surface-raised)] border border-[var(--stage-edge-subtle)] text-[10px] font-medium text-[var(--stage-text-secondary)] tracking-wide"
        aria-hidden
      >
        {initials}
      </span>
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <span className="text-[13px] text-[var(--stage-text-primary)] font-medium truncate">
          {person.name}
        </span>
        {(person.job_title || person.skills.length > 0) && (
          <span className="text-[11px] text-[var(--stage-text-tertiary)] truncate">
            {person.job_title ?? person.skills.slice(0, 3).join(' · ')}
          </span>
        )}
      </div>
      {isAssigned ? (
        <span
          className="shrink-0 text-[10px] uppercase tracking-[0.08em] text-[var(--stage-text-tertiary)]"
          title="Already on this deal"
        >
          On deal
        </span>
      ) : isPending ? (
        <span
          className="shrink-0 size-1.5 rounded-full bg-[var(--stage-text-tertiary)] animate-pulse"
          aria-hidden
        />
      ) : null}
    </button>
  );
}
