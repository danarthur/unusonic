/**
 * Public Proposal Viewer – DTO for client portal (by public_token)
 * @module features/sales/model/public-proposal
 */

import type { Proposal, ProposalItem } from '@/types/supabase';

/** @deprecated Use PublicProposalEvent. */
export type PublicProposalGig = PublicProposalEvent;

export interface PublicProposalEvent {
  id: string;
  title: string;
  clientName: string | null;
  startsAt: string | null;
  endsAt: string | null;
  /** True when startsAt came from ops.events (real time), false when synthesized from deal.proposed_date */
  hasEventTimes: boolean;
  /** Raw HH:MM event start time for display (avoids timezone issues with Date parsing). */
  eventStartTime: string | null;
  /** Raw HH:MM event end time for display. */
  eventEndTime: string | null;
}

export interface PublicProposalWorkspace {
  id: string;
  name: string;
  logoUrl: string | null;
  portalThemePreset: string | null;
  portalThemeConfig: Record<string, unknown> | null;
}

export interface PublicProposalItem extends ProposalItem {
  packageImageUrl?: string | null;
  /** Performer profile picture URL — rendered as a small badge, not a hero image. */
  talentAvatarUrl?: string | null;
  isOptional: boolean;
  clientSelected: boolean;
  /** Talent names extracted from crew_meta where booking_type === 'talent'. Labor names are never exposed. */
  talentNames?: string[] | null;
  /** Entity IDs for assigned talent — used for avatar resolution. */
  talentEntityIds?: string[] | null;
}

export interface PublicProposalVenue {
  name: string;
  address: string | null;
}

export interface PublicProposalDTO {
  proposal: Proposal;
  event: PublicProposalEvent;
  workspace: PublicProposalWorkspace;
  items: PublicProposalItem[];
  total: number;
  /** Resolved venue — from event or deal fallback. Null when no venue is set. */
  venue: PublicProposalVenue | null;
  /** DocuSeal embed URL for in-page e-signature. Null when status is accepted or DocuSeal is not configured. */
  embedSrc: string | null;
  /** Absolute download URL for the signed PDF. Generated server-side (signed storage URL or DocuSeal URL). Null until proposal is accepted. */
  signedPdfDownloadUrl: string | null;
}
