'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { PortalNavItem } from '@/shared/lib/portal-profiles';

/** Serializable version of PortalProfile (RegExp patterns stored as source strings) */
export interface SerializedPortalProfile {
  key: string;
  label: string;
  matchCapabilities: string[];
  matchSkillTags: string[];
  matchGigRolePatterns: string[];
  navItemIds: string[];
  defaultLanding: string;
  hasGigWorkspace: boolean;
}

interface PortalProfileContextValue {
  /** The user's person entity ID (resolved once in layout) */
  personEntityId: string | null;
  /** Primary resolved profile for this employee */
  primary: SerializedPortalProfile;
  /** All matched profiles (for hybrid role awareness) */
  all: SerializedPortalProfile[];
  /** Resolved nav items for the active profile (icons resolved client-side via NAV map) */
  navItems: Omit<PortalNavItem, 'icon'>[];
  /** Raw capabilities from entity_capabilities */
  capabilities: string[];
  /** Raw skill tags from crew_skills */
  skillTags: string[];
}

const PortalProfileContext = createContext<PortalProfileContextValue | null>(null);

export function PortalProfileProvider({
  value,
  children,
}: {
  value: PortalProfileContextValue;
  children: ReactNode;
}) {
  return (
    <PortalProfileContext.Provider value={value}>
      {children}
    </PortalProfileContext.Provider>
  );
}

export function usePortalProfile(): PortalProfileContextValue {
  const ctx = useContext(PortalProfileContext);
  if (!ctx) throw new Error('usePortalProfile must be used within PortalProfileProvider');
  return ctx;
}
