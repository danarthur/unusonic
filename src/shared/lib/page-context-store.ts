/**
 * Page Context Store — tells Aion what the user is currently viewing.
 *
 * Any page sets this on mount. SessionContext reads it when sending chat
 * messages so Aion can reference the current deal, event, entity, etc.
 * without asking the user "which one?"
 */

import { useEffect } from 'react';
import { create } from 'zustand';

export type PageContextType =
  | 'deal'
  | 'event'
  | 'entity'       // person, company, venue in network
  | 'proposal'
  | 'crm'          // CRM overview (no specific entity)
  | 'catalog'
  | 'calendar'
  | 'dashboard'
  | 'aion'
  | null;

export interface PageContext {
  /** What kind of page the user is on */
  type: PageContextType;
  /** Primary entity ID (deal ID, event ID, entity ID, etc.) */
  entityId: string | null;
  /** Human-readable label for the system prompt ("Johnson Wedding", "Acme Corp") */
  label: string | null;
  /** Optional secondary context (e.g. event ID when viewing a deal's plan tab) */
  secondaryId: string | null;
  secondaryType: string | null;
}

interface PageContextState extends PageContext {
  /** Set the full page context — call from page components on mount */
  set: (ctx: Partial<PageContext>) => void;
  /** Clear context — call when navigating away from a contextual page */
  clear: () => void;
}

const EMPTY: PageContext = {
  type: null,
  entityId: null,
  label: null,
  secondaryId: null,
  secondaryType: null,
};

export const usePageContextStore = create<PageContextState>()((set) => ({
  ...EMPTY,
  set: (ctx) => set({ ...EMPTY, ...ctx }),
  clear: () => set(EMPTY),
}));

/**
 * Hook for pages to declare their context on mount.
 * Automatically clears on unmount.
 *
 * Usage:
 *   useAionPageContext({ type: 'deal', entityId: dealId, label: deal.title });
 */
export function useAionPageContext(ctx: Partial<PageContext>) {
  const setCtx = usePageContextStore((s) => s.set);
  const clear = usePageContextStore((s) => s.clear);

  useEffect(() => {
    setCtx(ctx);
    return () => clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.type, ctx.entityId, ctx.label, ctx.secondaryId, ctx.secondaryType]);
}
