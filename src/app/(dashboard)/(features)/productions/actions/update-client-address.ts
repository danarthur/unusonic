'use server';

import { updateOrg } from '@/features/org-management/api';
import type { UpdateOrgInput } from '@/entities/organization/model/schema';

export type UpdateClientAddressResult = { ok: true } | { ok: false; error: string };

/** Update client (organization) billing address. Writes to master organizations table. */
export async function updateClientAddress(
  organizationId: string,
  address: UpdateOrgInput['address']
): Promise<UpdateClientAddressResult> {
  return updateOrg({ org_id: organizationId, address });
}
