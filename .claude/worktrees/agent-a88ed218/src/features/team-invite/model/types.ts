/**
 * Team Roster (Ghost Roster) – Types for Forging the Roster.
 * Empty / Captain / Ghost (draft) / Invited / Active.
 */

import type { OrgMemberRole } from '@/entities/organization';

export type RosterBadgeStatus = 'empty' | 'captain' | 'ghost' | 'invited' | 'active';

/** Data for a single badge (slot). Captain = you; ghost = draft not yet sent; invited = signal sent; active = claimed. */
export interface RosterBadgeData {
  id: string;
  name: string;
  first_name?: string | null;
  last_name?: string | null;
  role: OrgMemberRole;
  email: string;
  job_title: string | null;
  avatarUrl: string | null;
  /** Ghost (profile_id null) and no invitation sent yet. */
  isUnsentGhost?: boolean;
}

/** Roster member as returned by getRoster (includes status). */
export type RosterMemberDisplay = RosterBadgeData & { status: RosterBadgeStatus };

/** Input for creating/updating a ghost member (Member Forge). */
export interface GhostMemberInput {
  first_name: string;
  last_name: string;
  email: string;
  role: OrgMemberRole;
  job_title?: string | null;
}

/** Forge default values when editing (partial). */
export type MemberForgeDefaults = Partial<GhostMemberInput> & { id?: string; avatarUrl?: string | null };
