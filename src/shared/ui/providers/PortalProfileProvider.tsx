'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { PortalProfile, PortalNavItem } from '@/shared/lib/portal-profiles';

interface PortalProfileContextValue {
  /** The user's person entity ID (resolved once in layout) */
  personEntityId: string | null;
  /** Primary resolved profile for this employee */
  primary: PortalProfile;
  /** All matched profiles (for hybrid role awareness) */
  all: PortalProfile[];
  /** Resolved nav items for the active profile */
  navItems: PortalNavItem[];
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
