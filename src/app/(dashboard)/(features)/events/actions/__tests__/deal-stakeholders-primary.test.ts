/**
 * Promoting a host does not move the money, and has to say so.
 *
 * Primary host and bill-to are separate roles on purpose — a parent or a
 * company often pays for a wedding neither of them is hosting. What would be
 * wrong is changing one and letting someone assume the other followed. Every
 * published model is explicit about what its primary flag controls (Tripleseat:
 * only the primary contact flows onto documents; NPSP: the primary becomes
 * primary on the Opportunity), and none of them couples the two silently.
 */

import { describe, it, expect } from 'vitest';
import { billToDiffering, type BillToRow } from '../bill-to-diff';

const HOST_A: BillToRow = { id: 'sh-a', role: 'host', entity_id: 'ent-a' };
const HOST_B: BillToRow = { id: 'sh-b', role: 'host', entity_id: 'ent-b' };

describe('billToDiffering', () => {
  it('names the bill-to when the new primary is somebody else', () => {
    const billTo: BillToRow = { id: 'sh-bill', role: 'bill_to', entity_id: 'ent-a' };

    // Emily was promoted; the invoice still bills Allegra.
    expect(billToDiffering([HOST_A, HOST_B, billTo], 'sh-b')).toEqual(billTo);
  });

  it('says nothing when they are the same person', () => {
    const billTo: BillToRow = { id: 'sh-bill', role: 'bill_to', entity_id: 'ent-a' };

    expect(billToDiffering([HOST_A, HOST_B, billTo], 'sh-a')).toBeNull();
  });

  it('says nothing when nobody is billed yet', () => {
    expect(billToDiffering([HOST_A, HOST_B], 'sh-b')).toBeNull();
  });

  it('will not claim a mismatch it cannot prove', () => {
    // A bill-to with no entity — a typed name, an org snapshot — cannot be
    // compared. Asserting a mismatch there would be worse than silence.
    const nameOnly: BillToRow = {
      id: 'sh-bill', role: 'bill_to', entity_id: null,
      organization_name_at_deal: 'Ramsey Family Trust',
    };

    expect(billToDiffering([HOST_A, HOST_B, nameOnly], 'sh-b')).toBeNull();
  });

  it('will not compare against a primary that has no entity either', () => {
    const ghostHost: BillToRow = { id: 'sh-ghost', role: 'host', entity_id: null };
    const billTo: BillToRow = { id: 'sh-bill', role: 'bill_to', entity_id: 'ent-a' };

    expect(billToDiffering([ghostHost, billTo], 'sh-ghost')).toBeNull();
  });
});
