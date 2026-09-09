/**
 * Company compliance survives a read.
 *
 * The add-connection sheet asks a vendor for a W-9 and a COI expiry, and both
 * were being dropped twice over: `createGhostWithContact` declared the fields
 * on its payload and never wrote them, and `operational_settings` is a Zod
 * object, which silently strips anything it does not name — so even a direct
 * write would have been erased by the next save of the company profile.
 *
 * These live in operational_settings rather than at the top of attributes
 * because that bag is what `orgOperationalSettings` exposes to the record page.
 * One home, one reader.
 */

import { describe, it, expect } from 'vitest';
import { readEntityAttrs } from '../entity-attrs';

describe('company operational settings', () => {
  it('keeps W-9 and COI expiry alongside terms', () => {
    const attrs = readEntityAttrs(
      {
        operational_settings: {
          tax_id: '12-3456789',
          payment_terms: 'Net 30',
          w9_status: true,
          coi_expiry: '2027-03-01',
        },
      },
      'company',
    );

    expect(attrs.operational_settings?.w9_status).toBe(true);
    expect(attrs.operational_settings?.coi_expiry).toBe('2027-03-01');
    // The fields that already worked must keep working.
    expect(attrs.operational_settings?.payment_terms).toBe('Net 30');
    expect(attrs.operational_settings?.tax_id).toBe('12-3456789');
  });

  it('reads a false W-9 as false, not as absent', () => {
    // The merge in updateGhostProfile uses `??` for strings but must not for
    // this: `false ?? existing` would pin the flag to true once it was ever set.
    const attrs = readEntityAttrs({ operational_settings: { w9_status: false } }, 'company');
    expect(attrs.operational_settings?.w9_status).toBe(false);
  });

  it('tolerates a company with no operational settings at all', () => {
    const attrs = readEntityAttrs({}, 'company');
    expect(attrs.operational_settings ?? null).toBeFalsy();
  });
});
