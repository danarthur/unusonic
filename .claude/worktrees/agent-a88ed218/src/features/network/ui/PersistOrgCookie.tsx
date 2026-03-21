'use client';

import { useEffect } from 'react';
import { setCurrentOrgCookie } from '../api/actions';

/**
 * Calls setCurrentOrgCookie(orgId) after mount so the current org is stored
 * in a cookie (allowed in Server Actions only). Renders nothing.
 */
export function PersistOrgCookie({ orgId }: { orgId: string }) {
  useEffect(() => {
    setCurrentOrgCookie(orgId);
  }, [orgId]);
  return null;
}
