'use server';

/**
 * Proposal-revision server actions.
 *
 * Owns the contract-amendment flow that replaces an accepted proposal with
 * a fresh draft (Round 3 audit, 2026-05-06). Distinct from the legacy
 * `revertProposalToDraft` (sending.ts) — that flips status in place; this
 * supersedes the prior row and clones it into a new draft so the audit
 * trail survives.
 *
 * Why an RPC and not raw inserts:
 *   The flow is read prior → insert new → clone items → update prior
 *   (supersede). Doing this from the server action would either need
 *   client-side rollback handling on each step or risk leaving partial
 *   state. The `public.send_proposal_revision` RPC (added in
 *   `20260505212544_proposal_supersede.sql`) wraps it in a single
 *   transaction with a SECURITY DEFINER membership check.
 *
 * Feature gating:
 *   The `crm.proposal_revisions` feature flag controls whether the action
 *   is callable. Default OFF until the builder studio has a design-ready
 *   "Send revision" UI. The flag does NOT bypass any other access check —
 *   the underlying RPC always enforces workspace membership.
 *
 * @module features/sales/api/proposal-actions/revisions
 */

import { createClient } from '@/shared/api/supabase/server';
import { isFeatureEnabled, type FeatureFlagKey } from '@/shared/lib/feature-flags';

/**
 * Feature flag key for the contract-amendment flow.
 * Add this to FEATURE_FLAGS in `src/shared/lib/feature-flags.ts` once the
 * builder studio has a "Send revision" affordance.
 */
const PROPOSAL_REVISIONS_FLAG: FeatureFlagKey = 'crm.proposal_revisions';

export type SendProposalRevisionResult =
  | { success: true; newProposalId: string }
  | { success: false; error: string };

/**
 * Start a revision off an accepted proposal.
 *
 * Locked decisions (Round 3 audit):
 *   - Only allowed when `prevProposal.status === 'accepted'`. Pre-accept
 *     edits use `updateProposalItem` in place — no need for revision.
 *   - The prior row is kept as audit and marked superseded
 *     (`superseded_at`, `superseded_by_proposal_id`).
 *   - `revision_note` is captured on the NEW proposal so each revision
 *     carries its own note explaining what changed.
 *   - All-or-nothing: the RPC wraps clone + supersede in a single
 *     transaction. A failure leaves the prior intact.
 *
 * Caller is expected to be a member of the prior proposal's workspace; the
 * RPC raises if not.
 */
export async function sendProposalRevision(
  prevProposalId: string,
  revisionNote: string,
): Promise<SendProposalRevisionResult> {
  if (!prevProposalId) {
    return { success: false, error: 'Missing prior proposal id' };
  }

  const supabase = await createClient();

  // Resolve workspace from the prior proposal so the feature flag check
  // sees the same workspace the RPC will write to. Falls through with a
  // clean error if the caller can't read the row (RLS denial / not a
  // member); the RPC would also reject but we surface the precise reason.
  const { data: priorRow, error: priorErr } = await supabase
    .from('proposals')
    .select('workspace_id, status')
    .eq('id', prevProposalId)
    .maybeSingle();

  if (priorErr) return { success: false, error: priorErr.message };
  if (!priorRow) {
    return { success: false, error: 'Proposal not found.' };
  }

  const workspaceId = (priorRow as { workspace_id: string }).workspace_id;

  // TODO(crm.proposal_revisions): drop this gate once the new builder
  // studio renders a "Send revision" affordance for accepted proposals.
  // Until then the action is callable only from feature-flagged surfaces.
  const enabled = await isFeatureEnabled(workspaceId, PROPOSAL_REVISIONS_FLAG);
  if (!enabled) {
    return {
      success: false,
      error: 'Proposal revisions are not enabled for this workspace.',
    };
  }

  const status = (priorRow as { status: string }).status;
  if (status !== 'accepted') {
    return {
      success: false,
      error: `Revisions are only allowed from accepted proposals (got ${status}). To edit a draft / sent proposal, edit it in place.`,
    };
  }

  const note = revisionNote?.trim() ?? '';

  const { data: rpcResult, error: rpcError } = await supabase.rpc(
    'send_proposal_revision' as never,
    {
      p_prev_proposal_id: prevProposalId,
      p_revision_note: note.length > 0 ? note : null,
    } as never,
  );

  if (rpcError) {
    return { success: false, error: rpcError.message };
  }

  const newId = rpcResult as unknown as string | null;
  if (!newId) {
    return { success: false, error: 'Revision RPC returned no id.' };
  }

  return { success: true, newProposalId: newId };
}
