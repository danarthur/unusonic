/**
 * Deterministic QBO RequestId generator.
 *
 * Intuit's RequestId header deduplicates API calls server-side. Same
 * RequestId on retry → Intuit returns cached response → no duplicate
 * invoices/payments. This is the single most important defense against
 * the HoneyBook duplicate-invoice problem (Field Expert anti-pattern #4).
 *
 * Derived from: sha256(workspace_id || local_type || local_id || operation || attempt_version)
 *
 * @module features/finance/qbo/request-id
 */

import { createHash } from 'crypto';

export function makeRequestId(
  workspaceId: string,
  localType: string,
  localId: string,
  operation: string,
  attemptNumber: number,
): string {
  const input = [workspaceId, localType, localId, operation, String(attemptNumber)].join('|');
  return createHash('sha256').update(input).digest('hex').slice(0, 36);
}
