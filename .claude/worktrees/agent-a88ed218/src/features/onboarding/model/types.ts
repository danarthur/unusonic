/**
 * Signal Onboarding – Result types for Ghost org and claim flows.
 * @module features/onboarding/model/types
 */

import type { ScoutResult } from '@/features/intelligence';
import type { GenesisTierId } from '@/features/org-identity';
import type { UserPersona } from './subscription-types';

/** Context for Genesis step during onboarding (persona + optional scout pre-fill). */
export interface OnboardingGenesisContext {
  persona: UserPersona;
  suggestedTier?: GenesisTierId;
  scoutData?: ScoutResult | null;
}

/** Result of checking a slug (Nexus) for availability or ghost presence. */
export type NexusResult =
  | { type: 'VOID' }
  | { type: 'TAKEN' }
  | { type: 'GHOST'; data: GhostOrgPreview };

/** Preview data for an unclaimed (ghost) organization. */
export interface GhostOrgPreview {
  name: string;
  slug: string;
  event_count: number;
  collaborator_count: number;
  verifiable_credential_issuer?: string;
}

export type CreateGhostOrganizationResult =
  | { ok: true; organizationId: string }
  | { ok: false; error: string };

export type ClaimOrganizationResult =
  | { ok: true; organizationId: string }
  | { ok: false; error: string };

export type CreateGenesisOrganizationResult =
  | { ok: true; organizationId: string }
  | { ok: false; error: string };
