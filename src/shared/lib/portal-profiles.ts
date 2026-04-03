/**
 * Portal Profile Registry
 *
 * Maps capabilities and skill tags to portal experiences.
 * Each profile defines which nav items appear, what the default landing is,
 * and which gig-detail role patterns trigger role-specific workspaces.
 *
 * Resolution priority:
 * 1. Admin override (`primary_portal_profile` in ROSTER_MEMBER context_data)
 * 2. entity_capabilities (business role: "Sales", "Production Management")
 * 3. crew_skills (show role: "DJ", "Lighting", "Sound")
 * 4. Fallback: tech_stagehand (most minimal, read-only — safe default)
 */

import type { LucideIcon } from 'lucide-react';
import {
  CalendarDays,
  Calendar,
  UserCircle,
  Banknote,
  Music,
  TrendingUp,
  FileText,
  ClipboardList,
  Users,
  ListMusic,
} from 'lucide-react';

/* ── Nav Item Registry ───────────────────────────────────────────── */

export interface PortalNavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  href: string;
}

const NAV: Record<string, PortalNavItem> = {
  gigs:          { id: 'gigs',          label: 'Gigs',       icon: CalendarDays,   href: '/schedule' },
  calendar:      { id: 'calendar',      label: 'Calendar',   icon: Calendar,       href: '/calendar' },
  pay:           { id: 'pay',           label: 'Pay',        icon: Banknote,       href: '/pay' },
  profile:       { id: 'profile',       label: 'Profile',    icon: UserCircle,     href: '/profile' },
  // DJ / Entertainer specific
  'show-prep':   { id: 'show-prep',     label: 'Show Prep',  icon: Music,          href: '/schedule' }, // same page, workspace renders inline
  // Salesperson specific
  pipeline:      { id: 'pipeline',      label: 'Pipeline',   icon: TrendingUp,     href: '/pipeline' },
  proposals:     { id: 'proposals',     label: 'Proposals',  icon: FileText,       href: '/proposals' },
  // Band specific
  setlists:      { id: 'setlists',      label: 'Setlists',   icon: ListMusic,      href: '/setlists' },
  riders:        { id: 'riders',        label: 'Riders',     icon: ClipboardList,  href: '/riders' },
  // Production Manager specific
  'crew-status': { id: 'crew-status',   label: 'Crew',       icon: Users,          href: '/crew-status' },
};

/* ── Profile Definitions ─────────────────────────────────────────── */

export interface PortalProfile {
  key: string;
  label: string;
  /** Matched against entity_capabilities (case-insensitive) */
  matchCapabilities: string[];
  /** Matched against crew_skills skill_tag (case-insensitive) */
  matchSkillTags: string[];
  /** Matched against crew_assignment.role for per-gig override (regex patterns) */
  matchGigRolePatterns: RegExp[];
  /** Nav items for this profile */
  navItemIds: string[];
  /** Default landing route */
  defaultLanding: string;
  /** Whether gig detail shows an editable workspace */
  hasGigWorkspace: boolean;
}

export const PORTAL_PROFILES: Record<string, PortalProfile> = {
  dj_entertainer: {
    key: 'dj_entertainer',
    label: 'DJ / Entertainer',
    matchCapabilities: ['dj', 'entertainer', 'entertainment'],
    matchSkillTags: ['dj', 'mc', 'emcee', 'entertainer', 'host'],
    matchGigRolePatterns: [/\b(dj|mc|emcee|entertainer|host)\b/i],
    navItemIds: ['gigs', 'calendar', 'pay', 'profile'],
    defaultLanding: '/schedule',
    hasGigWorkspace: true,
  },
  tech_stagehand: {
    key: 'tech_stagehand',
    label: 'Tech / Stagehand',
    matchCapabilities: ['lighting', 'sound', 'video', 'stagehand', 'rigging', 'a/v', 'av', 'audio'],
    matchSkillTags: ['lighting', 'sound', 'video', 'stagehand', 'rigging', 'audio', 'a1', 'v1', 'l1'],
    matchGigRolePatterns: [/\b(lighting|sound|audio|video|stagehand|rigger|tech|a1|v1|l1|grip)\b/i],
    navItemIds: ['gigs', 'calendar', 'pay', 'profile'],
    defaultLanding: '/schedule',
    hasGigWorkspace: false,
  },
  salesperson: {
    key: 'salesperson',
    label: 'Salesperson',
    matchCapabilities: ['sales', 'account management', 'business development'],
    matchSkillTags: [],
    matchGigRolePatterns: [],
    navItemIds: ['gigs', 'calendar', 'pipeline', 'pay', 'profile'],
    defaultLanding: '/schedule',
    hasGigWorkspace: false,
  },
  band_musical_act: {
    key: 'band_musical_act',
    label: 'Band / Musical Act',
    matchCapabilities: ['band', 'musical act', 'musician', 'vocalist', 'performer'],
    matchSkillTags: ['band', 'musician', 'vocalist', 'singer', 'guitarist', 'drummer', 'bassist'],
    matchGigRolePatterns: [/\b(band|musician|vocalist|singer|performer)\b/i],
    navItemIds: ['gigs', 'calendar', 'setlists', 'pay', 'profile'],
    defaultLanding: '/schedule',
    hasGigWorkspace: true,
  },
  production_manager: {
    key: 'production_manager',
    label: 'Production Manager',
    matchCapabilities: ['production management', 'stage management', 'crew chief'],
    matchSkillTags: ['production manager', 'stage manager', 'crew chief', 'pm'],
    matchGigRolePatterns: [/\b(production manager|stage manager|crew chief|pm|td)\b/i],
    navItemIds: ['gigs', 'calendar', 'crew-status', 'pay', 'profile'],
    defaultLanding: '/schedule',
    hasGigWorkspace: false,
  },
};

/** Profile priority order — first match wins during resolution */
const PROFILE_PRIORITY: string[] = [
  'production_manager',
  'salesperson',
  'dj_entertainer',
  'band_musical_act',
  'tech_stagehand',
];

const DEFAULT_PROFILE = PORTAL_PROFILES.tech_stagehand;

/* ── Resolution Functions ────────────────────────────────────────── */

export interface ResolvedPortalProfile {
  primary: PortalProfile;
  all: PortalProfile[];
  navItems: PortalNavItem[];
}

/**
 * Resolve portal profile from entity capabilities and skill tags.
 * Optionally accepts an admin override from ROSTER_MEMBER context_data.
 */
export function resolvePortalProfile(opts: {
  capabilities: string[];
  skillTags: string[];
  adminOverride?: string | null;
}): ResolvedPortalProfile {
  const { capabilities, skillTags, adminOverride } = opts;

  // 1. Admin override
  if (adminOverride && PORTAL_PROFILES[adminOverride]) {
    const primary = PORTAL_PROFILES[adminOverride];
    return {
      primary,
      all: [primary],
      navItems: primary.navItemIds.map(id => NAV[id]).filter(Boolean),
    };
  }

  // 2. Match all profiles
  const capLower = capabilities.map(c => c.toLowerCase());
  const skillLower = skillTags.map(s => s.toLowerCase());

  const matched: PortalProfile[] = [];

  for (const key of PROFILE_PRIORITY) {
    const profile = PORTAL_PROFILES[key];
    const capMatch = profile.matchCapabilities.some(mc => capLower.some(c => c.includes(mc)));
    const skillMatch = profile.matchSkillTags.some(ms => skillLower.some(s => s.includes(ms)));
    if (capMatch || skillMatch) {
      matched.push(profile);
    }
  }

  const primary = matched[0] ?? DEFAULT_PROFILE;

  // Merge nav items from all matched profiles (dedup by id)
  const seen = new Set<string>();
  const mergedNavIds: string[] = [];
  for (const id of primary.navItemIds) {
    if (!seen.has(id)) { seen.add(id); mergedNavIds.push(id); }
  }

  return {
    primary,
    all: matched.length > 0 ? matched : [DEFAULT_PROFILE],
    navItems: mergedNavIds.map(id => NAV[id]).filter(Boolean),
  };
}

/**
 * Resolve which portal profile applies for a specific gig,
 * based on the crew_assignment.role field.
 * Falls back to the user's primary profile.
 */
export function resolveGigProfile(
  assignmentRole: string | null,
  primaryProfile: PortalProfile,
): PortalProfile {
  if (!assignmentRole) return primaryProfile;

  for (const key of PROFILE_PRIORITY) {
    const profile = PORTAL_PROFILES[key];
    if (profile.matchGigRolePatterns.some(re => re.test(assignmentRole))) {
      return profile;
    }
  }

  return primaryProfile;
}

/**
 * Get nav items for a given profile key. Used as a static fallback
 * before the profile context is available.
 */
export function getDefaultNavItems(): PortalNavItem[] {
  return DEFAULT_PROFILE.navItemIds.map(id => NAV[id]).filter(Boolean);
}
