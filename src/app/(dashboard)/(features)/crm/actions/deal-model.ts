import { z } from 'zod';

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

export const createDealSchema = z.object({
  proposedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be yyyy-MM-dd'),
  eventArchetype: z.enum(DEAL_ARCHETYPES).nullable().optional(),
  title: z.string().max(500).nullable().optional(),
  organizationId: z.string().uuid().nullable().optional(),
  mainContactId: z.string().uuid().nullable().optional(),
  /** Freetext client name — used to create a ghost org when no organizationId is provided */
  clientName: z.string().max(300).nullable().optional(),
  /** Client type: controls which ghost entity type is created */
  clientType: z.enum(['company', 'individual', 'couple']).default('company'),
  /** Individual client fields */
  clientFirstName: z.string().max(100).nullable().optional(),
  clientLastName: z.string().max(100).nullable().optional(),
  clientEmail: z.string().email().nullable().optional(),
  clientPhone: z.string().max(50).nullable().optional(),
  /** Couple: Partner B fields (Partner A uses clientFirstName/clientLastName/clientEmail) */
  partnerBFirstName: z.string().max(100).nullable().optional(),
  partnerBLastName: z.string().max(100).nullable().optional(),
  partnerBEmail: z.string().email().nullable().optional(),
  status: z.enum(['inquiry', 'proposal', 'contract_sent', 'won', 'lost']).default('inquiry'),
  budgetEstimated: z.number().nullable().optional(),
  notes: z.string().nullable().optional(),
  venueId: z.string().uuid().nullable().optional(),
  /** Freetext venue name — used to create a ghost venue when no venueId is provided */
  venueName: z.string().max(300).nullable().optional(),
  /** How this inquiry arrived (legacy text enum). */
  leadSource: z.enum(['referral', 'repeat_client', 'website', 'social', 'direct']).nullable().optional(),
  /** Structured lead source — references ops.workspace_lead_sources */
  leadSourceId: z.string().uuid().nullable().optional(),
  /** Freetext detail / context about the lead source */
  leadSourceDetail: z.string().max(500).nullable().optional(),
  /** Entity who referred this client (for referral sources) */
  referrerEntityId: z.string().uuid().nullable().optional(),
  /** Planner / coordinator entity linked to this deal */
  plannerEntityId: z.string().uuid().nullable().optional(),
  /** Event start time as HH:MM (24h) */
  eventStartTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  /** Event end time as HH:MM (24h) */
  eventEndTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
});

export type CreateDealInput = z.infer<typeof createDealSchema>;
export type CreateDealResult =
  | { success: true; dealId: string; warning?: 'approaching_show_limit' }
  | { success: false; error: string }
  | { success: false; error: 'show_limit_reached'; current: number; limit: number | null };
