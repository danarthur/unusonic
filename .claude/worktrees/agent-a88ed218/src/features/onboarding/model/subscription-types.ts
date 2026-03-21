/**
 * Signal Subscription & Persona Types
 * Tiered profiles for Progressive Disclosure onboarding
 * @module features/onboarding/model/subscription-types
 */

// ─── Personas (Progressive Disclosure) ───────────────────────────────────────

export type UserPersona =
  | 'solo_professional'  // Independent planners, 1:1 personalization, basic automation
  | 'agency_team'        // High-volume, team collab, SMS triggers, standard reports
  | 'venue_brand';       // Multi-location, PMS integration, geofenced scheduling, BEO

/** Pathfinding UI labels (Liquid Onboarding). */
export const PATHFINDING_PERSONAS: Record<UserPersona, { label: string; subtitle: string; tierHint: string }> = {
  solo_professional: {
    label: 'Solo Planner',
    subtitle: 'Free / Lite',
    tierHint: '1:1 personalization, basic automation',
  },
  agency_team: {
    label: 'Boutique Agency',
    subtitle: 'Growth',
    tierHint: 'Team collab, SMS triggers, reports',
  },
  venue_brand: {
    label: 'Venue Command',
    subtitle: 'OS',
    tierHint: 'PMS integration, space management, BEO',
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

export type SubscriptionTier =
  | 'foundation'   // $30–45/mo: unlimited projects/clients, basic AI
  | 'growth'       // $80–120/mo: team workflows, standard reports
  | 'venue_os'     // $250–500/mo: PMS, geofenced scheduling, BEO
  | 'autonomous';  // Pay-per-result (~$1/resolution): Digital Workers

export const SUBSCRIPTION_TIERS: Record<SubscriptionTier, {
  label: string;
  price: string;
  highlights: string[];
  suggestedPersonas: UserPersona[];
}> = {
  foundation: {
    label: 'Foundation',
    price: '$30–45/mo',
    highlights: [
      'Unlimited projects & clients',
      'Basic AI credits',
      '1:1 personalization',
    ],
    suggestedPersonas: ['solo_professional'],
  },
  growth: {
    label: 'Growth',
    price: '$80–120/mo',
    highlights: [
      'Team collaboration',
      'SMS triggers',
      'Standard reports',
    ],
    suggestedPersonas: ['agency_team'],
  },
  venue_os: {
    label: 'Venue OS',
    price: '$250–500/mo',
    highlights: [
      '2-way PMS integration',
      'Geofenced staff scheduling',
      'Automated BEO generation',
    ],
    suggestedPersonas: ['venue_brand'],
  },
  autonomous: {
    label: 'Autonomous',
    price: '~$1 per resolution',
    highlights: [
      'Digital Workers (SDRs/Support)',
      'SignalPay required',
      'Explainable AI (XAI)',
    ],
    suggestedPersonas: ['solo_professional', 'agency_team', 'venue_brand'],
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
