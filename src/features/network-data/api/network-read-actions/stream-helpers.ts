/**
 * Small pure/IO helpers lifted out of stream.ts, which had grown past the
 * 300-line file cap. Kept deliberately branch-light so this module stays clean.
 */

import type { NetworkNode } from '@/entities/network';
import { PERSON_ATTR, COUPLE_ATTR } from '../../model/attribute-keys';
import { deriveRoleFromDealActivity } from '@/entities/network/model/derive-role';

export async function fetchStarredEntityIds(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- cross-schema row shape is resolved at runtime; narrowing here would duplicate the generated types.
  supabase: any,
  workspaceId: string | null,
): Promise<Set<string>> {
  if (!workspaceId) return new Set();
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id;
  if (!userId) return new Set();

  const { data } = await supabase
    .schema('cortex')
    .from('network_stars')
    .select('entity_id')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId);

  return new Set(((data ?? []) as { entity_id: string }[]).map((r) => r.entity_id));
}

export function withStars(starred: Set<string>, nodes: NetworkNode[]): NetworkNode[] {
  if (starred.size === 0) return nodes;
  return nodes.map((n) => (starred.has(n.entityId) ? { ...n, starred: true } : n));
}

export function withCrewRoles(roles: Map<string, string[]>, nodes: NetworkNode[]): NetworkNode[] {
  if (roles.size === 0) return nodes;
  return nodes.map((n) => {
    const r = roles.get(n.entityId);
    return r?.length ? { ...n, crewRoles: r } : n;
  });
}

/**
 * Contact email for a node.
 *
 * Reads through COUPLE_ATTR / PERSON_ATTR rather than a bare key so a couple
 * entity never ghost-reads an email preserved from a prior person -> couple
 * reclassification.
 */
export function readContactEmail(
  entityType: string | undefined,
  attrs: Record<string, unknown>,
): string | undefined {
  if (entityType === 'couple') return (attrs[COUPLE_ATTR.partner_a_email] as string) ?? undefined;
  if (entityType === 'person') return (attrs[PERSON_ATTR.email] as string) ?? undefined;
  return undefined;
}

/**
 * Display label: clients (couple or individual) label as 'Client'; freelancer
 * persons fall back to job_title -> 'Freelancer'; everyone else uses the
 * cortex-type label ('Vendor' / 'Venue' / 'Partner').
 */
export function resolveNodeLabel(
  relType: string | undefined,
  entityType: string | undefined,
  personJobTitle: string | null | undefined,
  cortexLabel: string,
): string {
  if (relType === 'CLIENT') return 'Client';
  if (entityType === 'person') return personJobTitle || 'Freelancer';
  return cortexLabel;
}

/**
 * Crew skills and roles from ops.crew_skills rows.
 *
 * role_tag is the controlled value that grouping reads, while skill_tag keeps
 * whatever was originally typed -- which is what lets historic 'dj' and 'DJ'
 * rows group as one role.
 */
export function indexCrewSkills(
  rows: { entity_id: string; skill_tag: string; role_tag?: string | null }[] | null | undefined,
): { crewSkillsByEntityId: Map<string, string[]>; crewRolesByEntityId: Map<string, string[]> } {
  const crewSkillsByEntityId = new Map<string, string[]>();
  const crewRolesByEntityId = new Map<string, string[]>();

  for (const row of rows ?? []) {
    const list = crewSkillsByEntityId.get(row.entity_id) ?? [];
    list.push(row.skill_tag);
    crewSkillsByEntityId.set(row.entity_id, list);

    const roleTag = row.role_tag;
    if (!roleTag) continue;
    const roles = crewRolesByEntityId.get(row.entity_id) ?? [];
    if (!roles.includes(roleTag)) roles.push(roleTag);
    crewRolesByEntityId.set(row.entity_id, roles);
  }
  return { crewSkillsByEntityId, crewRolesByEntityId };
}

/** Group one string column per entity_id. */
export function indexByEntity(
  rows: unknown[] | null | undefined,
  field: string,
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const raw of (rows ?? []) as Record<string, string>[]) {
    const list = out.get(raw.entity_id) ?? [];
    list.push(raw[field]);
    out.set(raw.entity_id, list);
  }
  return out;
}

/** Sum `valueField` per `keyField`. */
export function sumBy(
  rows: unknown[] | null | undefined,
  keyField: string,
  valueField: string,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const raw of (rows ?? []) as Record<string, string | number | null>[]) {
    const key = raw[keyField] as string;
    out.set(key, (out.get(key) ?? 0) + ((raw[valueField] as number) ?? 0));
  }
  return out;
}

/** Count rows per `keyField`. */
export function countBy(
  rows: unknown[] | null | undefined,
  keyField: string,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const raw of (rows ?? []) as Record<string, string>[]) {
    const key = raw[keyField];
    out.set(key, (out.get(key) ?? 0) + 1);
  }
  return out;
}

/**
 * Attach current affiliations: who works at each company node, and where each
 * person node currently works.
 *
 * This is the fix for planners under a parent company. Two shapes were broken:
 *
 *   - A company's staff had no edge from the workspace at all, so they existed
 *     in the graph and rendered NOWHERE -- reachable only by opening the
 *     company's detail sheet.
 *   - A person WITH their own edge (a planner who is also your client) showed
 *     as an unrelated stranger, with no visible tie to the company sitting a
 *     few cards away.
 *
 * Both are the same missing idea: the company is the relationship, the people
 * are contacts inside it.
 *
 * Only live edges count (`ended_at IS NULL`) -- a departed employee must not
 * keep appearing on their old employer's card, which is precisely what the
 * dated edges from 20260903193000 made expressible.
 */
export async function attachAffiliations(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the server client's generics vary; only .schema()/.from() are used.
  supabase: any,
  nodes: NetworkNode[],
): Promise<NetworkNode[]> {
  const companyIds = nodes
    .filter((n) => n.identity.entityType === 'company' || n.identity.entityType === 'venue')
    .map((n) => n.entityId);
  if (companyIds.length === 0) return nodes;

  const { data: edges } = await supabase
    .schema('cortex')
    .from('relationships')
    .select('source_entity_id, target_entity_id, relationship_type, context_data')
    .in('target_entity_id', companyIds)
    .in('relationship_type', [
      'MEMBER', 'EMPLOYEE', 'WORKS_FOR', 'EMPLOYED_AT', 'PARTNER', 'ROSTER_MEMBER',
    ])
    .is('ended_at', null);

  const edgeRows = (edges ?? []) as {
    source_entity_id: string;
    target_entity_id: string;
    context_data: Record<string, unknown> | null;
  }[];
  if (edgeRows.length === 0) return nodes;

  const personIds = Array.from(new Set(edgeRows.map((e) => e.source_entity_id)));
  const { data: people } = await supabase
    .schema('directory')
    .from('entities')
    .select('id, display_name, type, attributes')
    .in('id', personIds)
    .eq('type', 'person');

  const personById = new Map(
    ((people ?? []) as { id: string; display_name: string | null; attributes: Record<string, unknown> | null }[])
      .map((p) => [p.id, p]),
  );

  const { affiliatesByCompany, employerByPerson } = groupAffiliations(
    edgeRows,
    personById,
    new Map(nodes.map((n) => [n.entityId, n.identity.name])),
  );

  return nodes.map((n) => {
    const affiliates = affiliatesByCompany.get(n.entityId);
    const employer = employerByPerson.get(n.entityId);
    if (!affiliates && !employer) return n;
    return {
      ...n,
      ...(affiliates
        ? {
            affiliates: [...affiliates.values()].sort((a, b) =>
              a.name.localeCompare(b.name),
            ),
          }
        : {}),
      ...(employer ? { employer } : {}),
    };
  });
}

export type Affiliate = NonNullable<NetworkNode['affiliates']>[number];

/**
 * Pure grouping half of attachAffiliations, split out so the de-duplication
 * rule is testable without a database.
 *
 * The rule that matters: results are keyed by PERSON, not accumulated per
 * edge. The same human routinely holds two affiliation edges to one company --
 * MEMBER *and* ROSTER_MEMBER is the norm in current data -- and pushing per
 * edge listed everyone twice on the company card.
 */
export function groupAffiliations(
  edgeRows: {
    source_entity_id: string;
    target_entity_id: string;
    context_data: Record<string, unknown> | null;
  }[],
  personById: Map<string, { id: string; display_name: string | null; attributes: Record<string, unknown> | null }>,
  companyNameById: Map<string, string>,
): {
  affiliatesByCompany: Map<string, Map<string, Affiliate>>;
  employerByPerson: Map<string, { entityId: string; name: string }>;
} {
  const affiliatesByCompany = new Map<string, Map<string, Affiliate>>();
  const employerByPerson = new Map<string, { entityId: string; name: string }>();

  for (const e of edgeRows) {
    const person = personById.get(e.source_entity_id);
    if (!person) continue;

    const jobTitle = readJobTitle(e.context_data, person.attributes);

    const list = affiliatesByCompany.get(e.target_entity_id) ?? new Map<string, Affiliate>();
    const existing = list.get(person.id);
    if (existing) {
      // A later edge only fills in a job title the earlier one lacked.
      if (!existing.jobTitle && jobTitle) existing.jobTitle = jobTitle;
    } else {
      list.set(person.id, {
        entityId: person.id,
        name: person.display_name ?? 'Unnamed',
        jobTitle,
      });
    }
    affiliatesByCompany.set(e.target_entity_id, list);

    // First edge wins; the ordering question only matters for the rare person
    // affiliated to two companies at once, and a card shows one employer line.
    if (!employerByPerson.has(person.id)) {
      const name = companyNameById.get(e.target_entity_id);
      if (name) employerByPerson.set(person.id, { entityId: e.target_entity_id, name });
    }
  }

  return { affiliatesByCompany, employerByPerson };
}

/**
 * Job title for an affiliation: the edge's own context wins over the person's
 * profile, because the same human can hold different titles at different
 * companies and the edge is the one that knows which.
 */
function readJobTitle(
  contextData: Record<string, unknown> | null,
  attributes: Record<string, unknown> | null,
): string | null {
  const fromEdge = (contextData ?? {}).job_title as string | null | undefined;
  if (fromEdge) return fromEdge;
  const fromProfile = (attributes ?? {})[PERSON_ATTR.job_title] as string | null | undefined;
  return fromProfile ?? null;
}

/**
 * People who have actually worked a deal with this workspace but whom nobody
 * ever filed with a direct relationship edge.
 *
 * Without this, reaching the contacts page depends on someone having drawn an
 * edge -- which sorts by data-entry accident rather than by relationship. Alexa
 * Infranca had worked TWO deals as planner and appeared nowhere on the page,
 * while three people with zero deals each had cards. Deal involvement is the
 * better evidence and it maintains itself: someone shows up the day they run
 * their first show.
 *
 * `excludeEntityIds` are the people already built from edges, so nobody is
 * added twice.
 */
export async function fetchWorkedWithNodes(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the server client's generics vary; only .schema()/.from() are used.
  supabase: any,
  workspaceId: string | null,
  excludeEntityIds: Set<string>,
): Promise<NetworkNode[]> {
  if (!workspaceId) return [];

  const [stakeholderRes, crewRes] = await Promise.all([
    supabase.schema('ops').from('deal_stakeholders').select('entity_id, role'),
    supabase.schema('ops').from('deal_crew').select('entity_id').eq('workspace_id', workspaceId),
  ]);

  const { rolesByEntity, crewIds } = collectDealActivity(
    stakeholderRes.data,
    crewRes.data,
    excludeEntityIds,
  );

  const candidateIds = [...new Set([...rolesByEntity.keys(), ...crewIds])];
  if (candidateIds.length === 0) return [];

  const { data: people } = await supabase
    .schema('directory')
    .from('entities')
    .select('id, display_name, avatar_url, attributes, type')
    .in('id', candidateIds)
    .eq('owner_workspace_id', workspaceId)
    .in('type', ['person', 'couple']);

  return ((people ?? []) as WorkedWithPerson[])
    .map((p) => buildWorkedWithNode(p, rolesByEntity.get(p.id) ?? [], crewIds.has(p.id)))
    .filter((n): n is NetworkNode => n !== null);
}

type WorkedWithPerson = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  attributes: Record<string, unknown> | null;
  type: string;
};

const DERIVED_ROLE_LABEL: Record<string, string> = {
  CLIENT: 'Client',
  VENDOR: 'Vendor',
  ROSTER_MEMBER: 'Team',
};

/** Index deal involvement per entity, skipping anyone already built from edges. */
function collectDealActivity(
  stakeholders: unknown[] | null | undefined,
  crew: unknown[] | null | undefined,
  excludeEntityIds: Set<string>,
): { rolesByEntity: Map<string, string[]>; crewIds: Set<string> } {
  const rolesByEntity = new Map<string, string[]>();
  for (const r of ((stakeholders ?? []) as { entity_id: string | null; role: string }[])) {
    if (!r.entity_id || excludeEntityIds.has(r.entity_id)) continue;
    const list = rolesByEntity.get(r.entity_id) ?? [];
    list.push(r.role);
    rolesByEntity.set(r.entity_id, list);
  }

  const crewIds = new Set<string>();
  for (const r of ((crew ?? []) as { entity_id: string | null }[])) {
    if (r.entity_id && !excludeEntityIds.has(r.entity_id)) crewIds.add(r.entity_id);
  }
  return { rolesByEntity, crewIds };
}

/**
 * Null when the evidence says only that someone was reachable on the day --
 * they stay off the page rather than being filed on a guess.
 */
function buildWorkedWithNode(
  p: WorkedWithPerson,
  stakeholderRoles: string[],
  workedAsCrew: boolean,
): NetworkNode | null {
  const role = deriveRoleFromDealActivity(stakeholderRoles, workedAsCrew);
  if (!role) return null;

  const attrs = p.attributes ?? {};
  return {
    id: `worked-with-${p.id}`,
    entityId: p.id,
    kind: 'external_partner',
    gravity: 'outer_orbit',
    relationshipType: role,
    roles: [role],
    identity: {
      name: p.display_name ?? 'Unnamed',
      avatarUrl: p.avatar_url,
      label: DERIVED_ROLE_LABEL[role] ?? 'Contact',
      entityType: p.type as 'person' | 'couple',
    },
    meta: {
      email: readContactEmail(p.type, attrs),
      phone: (attrs[PERSON_ATTR.phone] as string | undefined) ?? undefined,
    },
  };
}
