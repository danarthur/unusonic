/**
 * bill-to-diff.ts — pure logic, no `'use server'`.
 *
 * `deal-stakeholders.ts` is a server-action module, and Next.js requires every
 * export from a 'use server' file to be a directly-defined async function.
 * `billToDiffering` is neither async nor an action -- it is a comparison over
 * rows already in hand, and it is the part worth testing directly. Exporting it
 * from there failed the build with "Server Actions must be async functions",
 * which `tsc` does not catch and only `next build` does.
 *
 * Same reason `plan-gear-from-proposal-types.ts` and `gear-drift-helpers.ts`
 * sit beside their action modules.
 *
 * @module app/events/actions/bill-to-diff
 */

export type BillToRow = {
  id: string;
  role: string;
  entity_id: string | null;
  contact_name_at_deal?: string | null;
  organization_name_at_deal?: string | null;
};

/**
 * The bill-to row, when it is somebody other than the new primary host.
 *
 * Null when they are the same person, when nobody is billed yet, or when the
 * bill-to has no entity to compare against -- in that last case we cannot prove
 * a mismatch, and claiming one would be worse than saying nothing.
 */
export function billToDiffering(
  rows: BillToRow[],
  primaryStakeholderId: string,
): BillToRow | null {
  const billTo = rows.find((r) => r.role === 'bill_to');
  if (!billTo) return null;

  const primary = rows.find((r) => r.id === primaryStakeholderId);
  if (!primary?.entity_id || !billTo.entity_id) return null;
  if (billTo.entity_id === primary.entity_id) return null;

  return billTo;
}
