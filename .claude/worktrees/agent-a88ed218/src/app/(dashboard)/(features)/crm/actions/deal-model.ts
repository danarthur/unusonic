/** Event archetype values for deals. Shared by createDeal schema and UI. */
export const DEAL_ARCHETYPES = ['wedding', 'corporate_gala', 'product_launch', 'private_dinner'] as const;
export type DealArchetype = (typeof DEAL_ARCHETYPES)[number];
