/**
 * Re-exports from the canonical entities layer.
 *
 * The source of truth has moved to:
 *   src/entities/directory/model/attribute-keys.ts
 *
 * This file exists only for backwards compatibility with existing feature-layer
 * and app-layer imports. New code should import directly from the entities layer:
 *   import { PERSON_ATTR, ... } from '@/entities/directory/model/attribute-keys';
 */
export {
  PERSON_ATTR,
  COMPANY_ATTR,
  VENUE_ATTR,
  VENUE_OPS,
  INDIVIDUAL_ATTR,
  COUPLE_ATTR,
} from '@/entities/directory/model/attribute-keys';

export type {
  PersonAttrKey,
  CompanyAttrKey,
  VenueAttrKey,
  VenueOpsKey,
  IndividualAttrKey,
  CoupleAttrKey,
} from '@/entities/directory/model/attribute-keys';
