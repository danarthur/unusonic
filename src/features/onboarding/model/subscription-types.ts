/**
 * Unusonic Subscription & Persona Types
 * Tiered profiles for Progressive Disclosure onboarding
 * @module features/onboarding/model/subscription-types
 */

import type { TierSlug } from '@/shared/lib/tier-config';

// ─── Personas (Progressive Disclosure) ───────────────────────────────────────

export type UserPersona =
  | 'solo_professional'  // Independent planners, 1:1 personalization, basic automation
  | 'agency_team'        // High-volume, team collab, SMS triggers, standard reports
  | 'venue_brand';       // Multi-location, PMS integration, geofenced scheduling, BEO

/** Pathfinding UI labels (Liquid Onboarding). */
export const PATHFINDING_PERSONAS: Record<UserPersona, { label: string; subtitle: string; tierHint: string }> = {
  solo_professional: {
    label: 'Solo Planner',
    subtitle: 'Foundation',
    tierHint: '2 team seats, 5 active shows, Aion suggestions',
  },
  agency_team: {
    label: 'Boutique Agency',
    subtitle: 'Growth',
    tierHint: 'Team collab, custom roles, full dispatch',
  },
  venue_brand: {
    label: 'Venue / Brand',
    subtitle: 'Studio',
    tierHint: 'Multi-venue, Aion autonomous, 15 seats included',
  },
};

export const USER_PERSONAS: Record<UserPersona, { label: string; description: string }> = {
  solo_professional: {
    label: 'Solo Professional',
    description: 'Independent planners needing 1:1 personalization and basic automation',
  },
  agency_team: {
    label: 'Agency / Team',
    description: 'High-volume planners needing team collaboration, SMS triggers, and reporting',
  },
  venue_brand: {
    label: 'Venue / Brand',
    description: 'Multi-location entities needing PMS integration, space management, and BEO',
  },
};

// ─── Subscription Tiers ──────────────────────────────────────────────────────

/** Re-export TierSlug as SubscriptionTier for onboarding consumers. Single source of truth: tier-config.ts */
export type SubscriptionTier = TierSlug;

export const SUBSCRIPTION_TIERS: Record<SubscriptionTier, {
  label: string;
  price: string;
  highlights: string[];
  suggestedPersonas: UserPersona[];
}> = {
  foundation: {
    label: 'Foundation',
    price: '$39/mo',
    highlights: [
      '2 team seats included',
      '5 active shows',
      'CRM, proposals, invoices, catalog, run of show',
      'Aion suggestions and alerts',
      'Unlimited crew, freelancers, and clients',
    ],
    suggestedPersonas: ['solo_professional'],
  },
  growth: {
    label: 'Growth',
    price: '$99/mo',
    highlights: [
      '5 team seats included',
      '25 active shows',
      'Custom roles (Role Builder)',
      'Full crew dispatch (bulk, templates)',
      'Aion drafts and recommendations',
      'Advanced reporting',
    ],
    suggestedPersonas: ['agency_team'],
  },
  studio: {
    label: 'Studio',
    price: '$249/mo',
    highlights: [
      '15 team seats included',
      'Unlimited active shows',
      'Multi-venue and geofencing',
      'Aion autonomous actions',
      'Everything in Growth',
    ],
    suggestedPersonas: ['venue_brand'],
  },
};

// ─── Agent Mode (Usage-Based UI) ──────────────────────────────────────────────

export type AgentMode = 'assist' | 'autonomous' | 'on_site';

export const AGENT_MODES: Record<AgentMode, { label: string; description: string }> = {
  assist: {
    label: 'Assist',
    description: 'AI suggests; you decide',
  },
  autonomous: {
    label: 'Autonomous',
    description: 'Digital Workers act on your behalf',
  },
  on_site: {
    label: 'On-Site Mode',
    description: 'Event-day interface with geofencing',
  },
};
