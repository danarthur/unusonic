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
}

export interface PublicProposalWorkspace {
  id: string;
  name: string;
  logoUrl: string | null;
}

export interface PublicProposalItem extends ProposalItem {
  packageImageUrl?: string | null;
}

export interface PublicProposalDTO {
  proposal: Proposal;
  event: PublicProposalEvent;
  workspace: PublicProposalWorkspace;
  items: PublicProposalItem[];
  total: number;
}
