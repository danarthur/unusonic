'use client';

import { useEffect } from 'react';
import { useSetCommandPaletteOrg } from '@/shared/ui/providers/CommandPaletteContext';

/**
 * Sets currentOrgId in the global Command Palette context so Cmd+K can show
 * the "Network" section (search orgs, add to Inner Circle) when on this page.
 */
export function SetCommandPaletteOrg({ orgId }: { orgId: string }) {
  const setCurrentOrgId = useSetCommandPaletteOrg();
  useEffect(() => {
    setCurrentOrgId(orgId);
    return () => setCurrentOrgId(null);
  }, [orgId, setCurrentOrgId]);
  return null;
}
