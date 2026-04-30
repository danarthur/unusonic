/**
 * proposal-actions.ts — thin barrel.
 *
 * Implementation lives in ./proposal-actions/* siblings (Phase 0.5-style
 * split, 2026-04-29). Many external callers import from this path, so the
 * barrel re-exports the full surface to preserve backward compat.
 *
 * NOT a `'use server'` file — Next.js requires every export from a 'use
 * server' module to be a directly-defined async function, which forbids
 * the `export { x } from './sib'` re-exports below. The siblings carry
 * `'use server'`, so the actions remain server actions when imported here.
 *
 * Splits:
 *   - sending.ts — proposal email + DocuSeal flow (publishProposal,
 *                  sendProposalLinkToRecipients, revertProposalToDraft,
 *                  sendForSignature, sendProposalReminder)
 *   - main.ts    — proposal reads, package operations, line-item mutations
 *                  (getProposalForDeal/Event, getExpandedPackageLineItems,
 *                  addPackageToProposal, getPackages, getCatalogPackages,
 *                  deleteProposalItemsByPackageInstanceId, unpackPackageInstance,
 *                  upsertProposal, updateProposalItem, deleteProposalItem,
 *                  updateProposal)
 */

// ── sending / signature flow ────────────────────────────────────────────────
export {
  publishProposal,
  sendProposalLinkToRecipients,
  revertProposalToDraft,
  sendForSignature,
  sendProposalReminder,
} from './proposal-actions/sending';
export type {
  PublishProposalResult,
  SendProposalLinkResult,
  RevertProposalResult,
  SendForSignatureResult,
} from './proposal-actions/sending';

// ── reads, packages, line-item mutations ────────────────────────────────────
export {
  getProposalForDeal,
  getProposalHistoryForDeal,
  getProposalPublicUrl,
  getProposalForEvent,
  getExpandedPackageLineItems,
  addPackageToProposal,
  getPackages,
  getCatalogPackages,
  deleteProposalItemsByPackageInstanceId,
  unpackPackageInstance,
  upsertProposal,
  updateProposalItem,
  deleteProposalItem,
  updateProposal,
} from './proposal-actions/main';

export type {
  ProposalLineItemCategory,
  UnitType,
  ProposalLineItemInput,
  GetPackagesResult,
  UpsertProposalResult,
  ProposalHistoryEntry,
  ExpandedLineItem,
  AddPackageToProposalResult,
  ProposalItemPatch,
  ProposalPatch,
} from './proposal-actions/main';
