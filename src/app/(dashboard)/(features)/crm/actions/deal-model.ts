/** Event archetype values for deals. Shared by createDeal schema and UI. */
export const DEAL_ARCHETYPES = [
  'wedding',
  'corporate_gala',
  'product_launch',
  'private_dinner',
  'concert',
  'festival',
  'awards_show',
  'conference',
  'birthday',
  'charity_gala',
] as const;

export type DealArchetype = typeof DEAL_ARCHETYPES[number];

export const DEAL_ARCHETYPE_LABELS: Record<DealArchetype, string> = {
  wedding: 'Wedding',
  corporate_gala: 'Corporate Gala',
  product_launch: 'Product Launch',
  private_dinner: 'Private Dinner',
  concert: 'Concert',
  festival: 'Festival',
  awards_show: 'Awards Show',
  conference: 'Conference',
  birthday: 'Birthday',
  charity_gala: 'Charity Gala',
};
