"use client";

/**
 * The roster section: staff, contractors and the freelancers we book.
 *
 * Lifted out of StreamLayout, which had grown to 569 lines with a 399-line
 * function and was the page's real structural problem -- two of its five
 * sections were hand-rolled while three shared a component. This is the second
 * and last of the two.
 *
 * It owns its own search, expansion and role filter, because none of that state
 * was ever read anywhere else; keeping it here is what turns seventeen props
 * into six.
 *
 * @module widgets/network-stream/ui/RosterSection
 */

import { useState } from "react";
import { NetworkCard } from "@/entities/network";
import type { NetworkNode } from "@/entities/network";
import { reservedSlotCount } from "@/entities/network/model/card-slots";
import { filterNodes } from "@/entities/network/model/search-node";
import {
  byEmployment,
  EMPLOYMENT_GROUP_LABELS,
} from "@/entities/network/model/categories";
import { sortNodes, type SortMode } from "@/entities/network/model/sort-nodes";
import { RoleFilterRow, ROLE_FILTER_MIN_ROWS } from "./RoleFilterRow";

/**
 * Group by the controlled role, not the typed job title.
 *
 * The title is free text and holds three different kinds of thing at once --
 * "DJ" is a craft, "Sales" a department, "Director of Ops" a position -- so a
 * filter built on it cannot satisfy the rule that people should be able to
 * predict what values a filter offers. crew_skills.role_tag is the normalised
 * value every other section already uses.
 *
 * First role wins for grouping, because a list cannot show one person twice.
 * Filtering still matches every role they hold, which is what the category
 * sections do.
 */
function groupByRole(nodes: NetworkNode[]): Map<string, NetworkNode[]> {
  const groups = new Map<string, NetworkNode[]>();
  for (const node of nodes) {
    const key = node.crewRoles?.[0] ?? "Other";
    const arr = groups.get(key) ?? [];
    arr.push(node);
    groups.set(key, arr);
  }
  // Sort groups alphabetically, but "Other" always last
  const sorted = new Map<string, NetworkNode[]>();
  const keys = [...groups.keys()].sort((a, b) => {
    if (a === "Other") return 1;
    if (b === "Other") return -1;
    return a.localeCompare(b);
  });
  for (const key of keys) sorted.set(key, groups.get(key)!);
  return sorted;
}

export interface RosterSectionProps {
  nodes: NetworkNode[];
  /** Role slug to display label, from the workspace's crew vocabulary. */
  roleLabels?: Record<string, string>;
  /** The page's one search query. This section no longer owns an input. */
  query: string;
  label: string;
  sortMode: SortMode;
  onNodeClick?: (node: NetworkNode) => void;
  onAffiliateClick: (entityId: string) => void;
  onNodeHoverEnter: (node: NetworkNode) => void;
  onNodeHoverLeave: () => void;
}

export function RosterSection({
  nodes: crewNodes,
  roleLabels,
  query,
  label,
  sortMode,
  onNodeClick,
  onAffiliateClick: openAffiliate,
  onNodeHoverEnter: handleNodeHoverEnter,
  onNodeHoverLeave: handleNodeHoverLeave,
}: RosterSectionProps) {
  const [activeRoleFilter, setActiveRoleFilter] = useState<string | null>(null);

  const searchedCrewNodes = sortNodes(filterNodes(crewNodes, query), sortMode);
  // Grouping earns its place on the same terms the filter does. Three headers
  // over one person each is structure nobody asked for.
  const grouped = crewNodes.length >= ROLE_FILTER_MIN_ROWS;

  /**
   * Role groups within one employment group. Grouping earns its place on the
   * same terms it always did -- three headers over one person each is structure
   * nobody asked for -- and a role filter collapses it to the chosen role.
   */
  const roleGroupsWithin = (
    members: NetworkNode[],
  ): Map<string, NetworkNode[]> => {
    if (activeRoleFilter) return new Map([[activeRoleFilter, members]]);
    return grouped ? groupByRole(members) : new Map([["__all", members]]);
  };
  // Unfiltered, so the pills keep their labels while a search is narrowing.
  const allRoleKeys = [...new Set(crewNodes.flatMap((n) => n.crewRoles ?? []))];
  const filteredCrewNodes = activeRoleFilter
    ? searchedCrewNodes.filter((n) =>
        (n.crewRoles ?? []).includes(activeRoleFilter),
      )
    : searchedCrewNodes;
  if (crewNodes.length === 0) return null;
  // Filtered to nothing: the page-level empty state speaks for every section at
  // once, rather than each printing a heading over empty space.
  if (query.trim() && searchedCrewNodes.length === 0) return null;

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 stage-label text-[var(--stage-text-secondary)]">
          {label}
          <span className="shrink-0 rounded-full bg-[oklch(1_0_0/0.06)] px-2.5 py-0.5 stage-badge-text tabular-nums">
            {searchedCrewNodes.length === crewNodes.length
              ? crewNodes.length
              : `${searchedCrewNodes.length} of ${crewNodes.length}`}
          </span>
        </h2>
      </div>

      {/* Subordinate to the tabs, and absent until a section is too long to
              scan. These used to carry the accent colour, which made a
              section-level refinement shout louder than the page's navigation. */}
      {crewNodes.length >= ROLE_FILTER_MIN_ROWS && (
        <div className="mb-4">
          <RoleFilterRow
            roles={allRoleKeys}
            active={activeRoleFilter}
            labels={roleLabels}
            onSelect={setActiveRoleFilter}
          />
        </div>
      )}

      {filteredCrewNodes.length > 0 ? (
        <div className="flex flex-col gap-6">
          {/* Employed by us, or booked by us. The heading only appears when
                  both are present -- naming a group that is everybody says
                  nothing, and a company whose crew is entirely freelance should
                  not be told so on every visit.

                  Above the role grouping rather than beside it: employment is
                  the coarser fact, and roles subdivide within it once a section
                  is long enough to need them. */}
          {byEmployment(filteredCrewNodes).map(
            ({ group, nodes: groupMembers }) => (
              <div key={group ?? "__all"} className="flex flex-col gap-6">
                {group && (
                  <p className="stage-label text-[var(--stage-text-secondary)]">
                    {EMPLOYMENT_GROUP_LABELS[group]}
                    <span className="ml-2 stage-badge-text text-[var(--stage-text-tertiary)] tabular-nums">
                      {groupMembers.length}
                    </span>
                  </p>
                )}

                {[...roleGroupsWithin(groupMembers).entries()].map(
                  ([role, groupNodes]) => (
                    <div key={role}>
                      {/* A header only when grouping is actually on and more than
                      one group survives. The single synthetic group carries no
                      heading, and neither does a filtered view -- the chip
                      already says which role is showing. */}
                      {grouped && role !== "__all" && !activeRoleFilter && (
                        <p className="mb-2 stage-label text-[var(--stage-text-secondary)]/60">
                          {roleLabels?.[role] ?? role}
                        </p>
                      )}
                      <div className="grid grid-cols-2 gap-[var(--stage-gap)] sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                        {groupNodes.map((node) => (
                          <div
                            key={node.id}
                            className="h-full"
                            onMouseEnter={() => handleNodeHoverEnter(node)}
                            onMouseLeave={handleNodeHoverLeave}
                          >
                            <NetworkCard
                              node={node}
                              slotCount={reservedSlotCount(groupNodes)}
                              layoutId={`node-${node.id}`}
                              onClick={() => onNodeClick?.(node)}
                              onAffiliateClick={openAffiliate}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ),
                )}
              </div>
            ),
          )}
        </div>
      ) : (
        // Only reachable via a role pill now: a search that matches nothing
        // here hides the section entirely, so the page can answer once.
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <p className="stage-label text-[var(--stage-text-secondary)]">
            Nobody in that role right now.
          </p>
          <button
            type="button"
            onClick={() => setActiveRoleFilter(null)}
            className="mt-2 stage-badge-text text-[var(--stage-accent)] hover:underline"
          >
            Show everyone
          </button>
        </div>
      )}
    </section>
  );
}
