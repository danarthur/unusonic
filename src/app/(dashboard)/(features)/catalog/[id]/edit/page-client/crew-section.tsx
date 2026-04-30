'use client';

/**
 * Default Crew section for the catalog edit page-client cluster. Lists the
 * inherited (read-only, bundles only) and direct assignees, plus a toggle
 * between "Named person" search and "Role type" free-text input.
 *
 * Extracted from page-client.tsx (Phase 0.5-style split, 2026-04-29).
 *
 * State + the search/add/remove handlers stay owned by the main component.
 * This file is presentational — receives lists + callbacks via props.
 */

import { Users } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import type { CatalogAssigneeRow } from '@/features/sales/api/catalog-assignee-actions';
import type { NetworkSearchOrg } from '@/features/network-data';
import { inputClass, labelClass } from './shared';

type DefaultCrewSectionProps = {
  assignees: CatalogAssigneeRow[];
  inheritedAssignees: (CatalogAssigneeRow & { ingredient_name: string })[];
  crewMode: 'person' | 'role';
  setCrewMode: (v: 'person' | 'role') => void;
  crewSearch: string;
  crewResults: NetworkSearchOrg[];
  crewSearchLoading: boolean;
  crewPickerOpen: boolean;
  setCrewPickerOpen: (v: boolean) => void;
  onCrewSearch: (q: string) => void;
  onAddAssignee: (org: NetworkSearchOrg) => void;
  onRemoveAssignee: (assigneeRowId: string) => void;
  roleInput: string;
  setRoleInput: (v: string) => void;
  roleAdding: boolean;
  onAddRole: () => void;
  jobTitles: string[];
};

export function DefaultCrewSection({
  assignees,
  inheritedAssignees,
  crewMode,
  setCrewMode,
  crewSearch,
  crewResults,
  crewSearchLoading,
  crewPickerOpen,
  setCrewPickerOpen,
  onCrewSearch,
  onAddAssignee,
  onRemoveAssignee,
  roleInput,
  setRoleInput,
  roleAdding,
  onAddRole,
  jobTitles,
}: DefaultCrewSectionProps) {
  return (
    <div className="border-t border-[oklch(1_0_0_/_0.06)] pt-5 mt-2 px-6 pb-12">
      <div className="flex items-center gap-2 mb-3">
        <Users size={14} strokeWidth={1.5} className="text-[var(--stage-text-secondary)]" />
        <p className={labelClass + ' mb-0'}>Default crew</p>
      </div>
      <p className="text-xs text-[var(--stage-text-secondary)]/60 mb-3 leading-relaxed">
        When this item is on a proposal, these people will be suggested as production crew on the deal.
      </p>

      {/* Inherited from ingredients (bundles only) — read-only */}
      {inheritedAssignees.length > 0 && (
        <div className="flex flex-col gap-1.5 mb-3">
          <p className="stage-label text-[var(--stage-text-secondary)]/40 mb-1">From ingredients</p>
          {inheritedAssignees.map((a) => (
            <div
              key={`${a.id}-inherited`}
              className="flex items-center gap-2.5 px-3 py-2 rounded-[var(--stage-radius-nested)] border border-[oklch(1_0_0_/_0.04)] bg-[var(--ctx-well)] opacity-60"
            >
              {a.entity_id === null && (
                <span className="stage-label text-[var(--stage-text-secondary)]/40 border border-[oklch(1_0_0_/_0.08)] rounded px-1.5 py-0.5 shrink-0">
                  Role
                </span>
              )}
              <span className="flex-1 text-sm text-[var(--stage-text-primary)] truncate">
                {a.entity_id ? (a.entity_name ?? a.entity_id) : (a.role_note ?? '—')}
              </span>
              <span className="text-label text-[var(--stage-text-secondary)]/40 shrink-0">
                {a.ingredient_name}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Direct assignments on this package */}
      {assignees.length > 0 && (
        <div className="flex flex-col gap-1.5 mb-3">
          {inheritedAssignees.length > 0 && (
            <p className="stage-label text-[var(--stage-text-secondary)]/40 mb-1">Added directly</p>
          )}
          {assignees.map((a) => (
            <div
              key={a.id}
              className="flex items-center gap-2.5 px-3 py-2 rounded-[var(--stage-radius-nested)] border border-[oklch(1_0_0_/_0.06)] bg-[var(--ctx-well)]"
            >
              {a.entity_id === null && (
                <span className="stage-label text-[var(--stage-text-secondary)]/40 border border-[oklch(1_0_0_/_0.08)] rounded px-1.5 py-0.5 shrink-0">
                  Role
                </span>
              )}
              <span className="flex-1 text-sm text-[var(--stage-text-primary)] truncate">
                {a.entity_id ? (a.entity_name ?? a.entity_id) : (a.role_note ?? '—')}
              </span>
              {a.entity_id && a.role_note && (
                <span className="text-xs text-[var(--stage-text-secondary)]/50">{a.role_note}</span>
              )}
              <button
                type="button"
                onClick={() => onRemoveAssignee(a.id)}
                className="text-[var(--stage-text-secondary)]/30 hover:text-[var(--color-unusonic-error)]/70 transition-colors focus:outline-none"
                aria-label="Remove"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-1 mb-3 p-1 rounded-[var(--stage-radius-nested)] bg-[var(--ctx-well)] border border-[oklch(1_0_0_/_0.06)] w-fit">
        <button
          type="button"
          onClick={() => setCrewMode('person')}
          className={cn(
            'px-3 py-1 rounded-[var(--stage-radius-nested)] text-xs font-medium transition-colors focus:outline-none',
            crewMode === 'person'
              ? 'bg-[oklch(1_0_0_/_0.08)] text-[var(--stage-text-primary)]'
              : 'text-[var(--stage-text-secondary)]/50 hover:text-[var(--stage-text-secondary)]',
          )}
        >
          Named person
        </button>
        <button
          type="button"
          onClick={() => setCrewMode('role')}
          className={cn(
            'px-3 py-1 rounded-[var(--stage-radius-nested)] text-xs font-medium transition-colors focus:outline-none',
            crewMode === 'role'
              ? 'bg-[oklch(1_0_0_/_0.08)] text-[var(--stage-text-primary)]'
              : 'text-[var(--stage-text-secondary)]/50 hover:text-[var(--stage-text-secondary)]',
          )}
        >
          Role type
        </button>
      </div>

      {crewMode === 'person' && (
        <div className="relative">
          <input
            type="text"
            value={crewSearch}
            onChange={(e) => {
              onCrewSearch(e.target.value);
              setCrewPickerOpen(true);
            }}
            onFocus={() => setCrewPickerOpen(true)}
            placeholder="Search network to add crew…"
            className={inputClass}
          />
          {crewPickerOpen && (crewResults.length > 0 || crewSearchLoading) && (
            <div className="absolute left-0 top-full mt-1 z-20 w-full rounded-[var(--stage-radius-nested)] border border-[oklch(1_0_0_/_0.10)] bg-[var(--stage-surface-raised)] overflow-hidden shadow-lg">
              {crewSearchLoading && (
                <div className="px-4 py-3 text-xs text-[var(--stage-text-secondary)]/40">
                  Searching…
                </div>
              )}
              {crewResults.map((r) => (
                <button
                  key={r.entity_uuid ?? r.id}
                  type="button"
                  onClick={() => onAddAssignee(r)}
                  className="w-full text-left px-4 py-2.5 text-sm text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0_/_0.04)] hover:text-[var(--stage-text-primary)] transition-colors"
                >
                  {r.name}
                  {r.entity_type && (
                    <span className="ml-1.5 text-label opacity-50 capitalize">{r.entity_type}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {crewMode === 'role' && (
        <div className="flex gap-2">
          <input
            type="text"
            value={roleInput}
            onChange={(e) => setRoleInput(e.target.value)}
            placeholder="e.g. DJ, Photographer, Security…"
            className={inputClass}
            list="staff-roles-list"
          />
          <datalist id="staff-roles-list">
            {jobTitles.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
          <button
            type="button"
            disabled={!roleInput.trim() || roleAdding}
            onClick={onAddRole}
            className="shrink-0 px-4 py-2.5 rounded-[var(--stage-radius-button)] border border-[oklch(1_0_0_/_0.08)] text-sm text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0_/_0.04)] hover:text-[var(--stage-text-primary)] disabled:opacity-45 transition-colors focus:outline-none"
          >
            {roleAdding ? 'Adding…' : 'Add'}
          </button>
        </div>
      )}
    </div>
  );
}
