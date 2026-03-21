/**
 * Event entity – Event Studio types.
 * Aligns with events table + Event Genome columns.
 */

export type EventLifecycleStatus =
  | 'lead'
  | 'tentative'
  | 'confirmed'
  | 'production'
  | 'live'
  | 'post'
  | 'archived'
  | 'cancelled';

export type ConfidentialityLevel = 'public' | 'private' | 'secret';

/** Typed shape for tech_requirements JSONB (audio/video/lighting notes). */
export type TechRequirements = {
  audio?: string | null;
  video?: string | null;
  lighting?: string | null;
  notes?: string | null;
  [key: string]: unknown;
};

/** Typed shape for compliance_docs JSONB (permit status etc.). */
export type ComplianceDoc = {
  id?: string;
  name: string;
  status: 'pending' | 'submitted' | 'approved' | 'expired';
  expires_at?: string | null;
  [key: string]: unknown;
};

export type ComplianceDocs = ComplianceDoc[] | Record<string, unknown>;

export interface EventCommandRow {
  id: string;
  workspace_id: string;
  title: string | null;
  internal_code: string | null;
  status: string | null;
  lifecycle_status: EventLifecycleStatus | null;
  confidentiality_level: ConfidentialityLevel | null;
  slug: string | null;
  starts_at: string;
  ends_at: string;
  dates_load_in: string | null;
  dates_load_out: string | null;
  venue_name: string | null;
  venue_address: string | null;
  venue_google_maps_id: string | null;
  location_name: string | null;
  location_address: string | null;
  logistics_dock_info: string | null;
  logistics_power_info: string | null;
  client_entity_id: string | null;
  producer_id: string | null;
  pm_id: string | null;
  guest_count_expected: number | null;
  guest_count_actual: number | null;
  tech_requirements: TechRequirements | null;
  compliance_docs: ComplianceDocs | null;
  project_id: string | null;
  crm_probability: number | null;
  crm_estimated_value: number | null;
  lead_source: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** Hydrated for Event Studio UI (client/PM names, etc.). */
export interface EventCommandDTO extends EventCommandRow {
  client_name?: string | null;
  producer_name?: string | null;
  pm_name?: string | null;
}
