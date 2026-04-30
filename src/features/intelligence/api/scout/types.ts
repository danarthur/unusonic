/**
 * Scout types — shared across pipeline, sub-agents, and roster hunter.
 * @module features/intelligence/api/scout/types
 */

/** Options for scoutEntity (authenticated, has org) vs scoutEntityForOnboarding (no org yet). */
export type ScoutOptions = { debug?: boolean; forOnboarding?: boolean };

export type ScoutRosterMember = {
  firstName: string;
  lastName: string;
  jobTitle?: string | null;
  avatarUrl?: string | null;
  email?: string | null;
};

export type ScoutResult = {
  name?: string | null;
  doingBusinessAs?: string | null;
  entityType?: 'organization' | 'single_operator' | null;
  brandColor?: string | null;
  logoUrl?: string | null;
  website?: string | null;
  supportEmail?: string | null;
  phone?: string | null;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    postal_code?: string;
    country?: string;
  } | null;
  tags?: string[] | null;
  roster?: ScoutRosterMember[] | null;
};

export type ContactResult = {
  supportEmail?: string | null;
  phone?: string | null;
  address?: ScoutResult['address'];
};

export type IdentityResult = {
  name?: string | null;
  doingBusinessAs?: string | null;
  entityType?: string;
  brandColor?: string | null;
};

export type ClassificationResult = { tags?: string[] | null };

export type RosterResult = {
  roster?: ScoutRosterMember[];
  _debug?: {
    teamPageUrl: string;
    blockCount: number;
    blocksWithImage: number;
    blockAvatars: (string | null)[];
    blockPreviews: string[];
    allImgUrls?: string[];
    avatarPool?: string[];
    rosterOrder?: string[];
  };
};

export type ScoutPipelineResult =
  | { success: true; data: ScoutResult; _debug?: RosterResult['_debug'] }
  | { error: string };
