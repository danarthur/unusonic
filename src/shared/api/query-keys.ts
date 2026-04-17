/**
 * Hierarchical query key registry.
 *
 * Workspace ID is always at position [1] so you can invalidate
 * all queries for a workspace with:
 *   queryClient.invalidateQueries({ queryKey: ['deals', wsId] })
 *
 * More specific keys narrow the scope:
 *   queryClient.invalidateQueries({ queryKey: queryKeys.deals.detail(wsId, dealId) })
 */
export const queryKeys = {
  deals: {
    all: (wsId: string) => ["deals", wsId] as const,
    list: (wsId: string, filters?: Record<string, unknown>) =>
      ["deals", wsId, "list", filters] as const,
    detail: (wsId: string, dealId: string) =>
      ["deals", wsId, "detail", dealId] as const,
    crew: (wsId: string, dealId: string) =>
      ["deals", wsId, "detail", dealId, "crew"] as const,
  },

  entities: {
    all: (wsId: string) => ["entities", wsId] as const,
    list: (wsId: string, type?: string) =>
      ["entities", wsId, "list", type] as const,
    detail: (wsId: string, entityId: string) =>
      ["entities", wsId, "detail", entityId] as const,
    captures: (wsId: string, entityId: string) =>
      ["entities", wsId, "detail", entityId, "captures"] as const,
    summary: (wsId: string, entityId: string) =>
      ["entities", wsId, "detail", entityId, "summary"] as const,
    workingNotes: (wsId: string, entityId: string) =>
      ["entities", wsId, "detail", entityId, "workingNotes"] as const,
    teamPreview: (wsId: string, entityId: string) =>
      ["entities", wsId, "detail", entityId, "teamPreview"] as const,
    productions: (wsId: string, entityId: string) =>
      ["entities", wsId, "detail", entityId, "productions"] as const,
    referrals: (wsId: string, entityId: string) =>
      ["entities", wsId, "detail", entityId, "referrals"] as const,
    venueSpecs: (wsId: string, entityId: string) =>
      ["entities", wsId, "detail", entityId, "venueSpecs"] as const,
  },

  catalog: {
    all: (wsId: string) => ["catalog", wsId] as const,
    list: (wsId: string, search?: string) =>
      ["catalog", wsId, "list", search] as const,
    detail: (wsId: string, packageId: string) =>
      ["catalog", wsId, "detail", packageId] as const,
  },

  events: {
    all: (wsId: string) => ["events", wsId] as const,
    calendar: (wsId: string, start: string, end: string) =>
      ["events", wsId, "calendar", start, end] as const,
    detail: (wsId: string, eventId: string) =>
      ["events", wsId, "detail", eventId] as const,
  },

  proposals: {
    all: (wsId: string) => ["proposals", wsId] as const,
    detail: (wsId: string, proposalId: string) =>
      ["proposals", wsId, "detail", proposalId] as const,
  },

  dashboard: {
    all: (wsId: string) => ["dashboard", wsId] as const,
  },

  finance: {
    all: (wsId: string) => ["finance", wsId] as const,
    dashboard: (wsId: string) => ["finance", wsId, "dashboard"] as const,
  },
} as const;
