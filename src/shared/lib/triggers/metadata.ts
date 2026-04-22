/**
 * Client-safe trigger primitive metadata.
 *
 * This module exposes ONLY the pieces of a trigger primitive that are safe to
 * ship to the browser bundle: type, tier, label, description, and an optional
 * pure/synchronous preview() for the confirmation modal.
 *
 * It deliberately does NOT import the primitive implementations from
 * `./primitives/*` — those pull in `getSystemClient` (service-role Supabase)
 * via `enroll-follow-up.ts`. Any client module that transitively imports the
 * server registry would leak the service role key into the client bundle.
 *
 * The canonical runtime registry (with `configSchema`, `run`, `undo`) lives in
 * `./registry-server` and is `import 'server-only'` guarded. Server code that
 * needs the full primitive (write-path validation, dispatcher, dwell SLA)
 * imports from `@/shared/lib/triggers/registry` (which re-exports
 * `registry-server`).
 *
 * Client code imports metadata from `@/shared/lib/triggers` (the barrel) or
 * directly from `@/shared/lib/triggers/metadata`.
 */

import type { TriggerTier } from './types';

export type { TriggerTier } from './types';

/**
 * Display-only shape of a trigger primitive. Subset of `TriggerPrimitive<C>`
 * without `configSchema`, `run`, or `undo`. `preview` is retained because its
 * contract (see types.ts) requires it to be synchronous and pure — no DB
 * fetches, no network — so it can safely execute in the browser.
 */
export interface PrimitiveMetadata {
  type: string;
  tier: TriggerTier;
  label: string;
  description: string;
  /**
   * Sync/pure preview sentence. None of the current primitives implement this
   * (prism.tsx falls back to `t.type` today), but the field is reserved so a
   * primitive can define its preview inline here when one is added without
   * forcing a re-split.
   */
  preview?: (config: unknown) => string;
}

/**
 * Hand-maintained metadata catalog. MUST stay in lockstep with the primitive
 * definitions in `./primitives/*`. When a new primitive is added:
 *   1. Register it in `./registry-server.ts` (server runtime).
 *   2. Add its metadata entry here (client catalog).
 *   3. Extend `StageTriggerSchema` in `./schema.ts` (write-path zod).
 *
 * The registry-server module has a duplicate-registration guard that catches
 * stray side-effect imports. There is no equivalent runtime guard here since
 * this module has no registration side-effect — the list is the source.
 *
 * Copy (label/description) is duplicated from each primitive file intentionally
 * so the client bundle doesn't need to evaluate the primitive module. A
 * __tests__/metadata-parity.test.ts check is the intended follow-up (not part
 * of this leak-fix pass) to ensure these stay in sync.
 */
const PRIMITIVE_METADATA: PrimitiveMetadata[] = [
  {
    type: 'trigger_handoff',
    tier: 'outbound',
    label: 'Open handoff wizard',
    description:
      'Opens the deal-to-event handoff wizard for the user who moved the deal. For webhook-initiated transitions, surfaces a handoff-ready action card on the deal.',
  },
  {
    type: 'send_deposit_invoice',
    tier: 'outbound',
    label: 'Send deposit invoice',
    description:
      "Auto-generates an invoice from the deal's accepted proposal via finance.spawn_invoices_from_proposal and sends it to the client.",
  },
  {
    type: 'notify_role',
    tier: 'internal',
    label: 'Notify role',
    description:
      'Sends an in-app notification to every workspace member who holds the given role.',
  },
  {
    type: 'create_task',
    tier: 'internal',
    label: 'Create task',
    description:
      'Creates a task in the workspace task list tied to the deal, assigned by the selected rule.',
  },
  {
    type: 'update_deal_field',
    tier: 'internal',
    label: 'Update deal field',
    description:
      'Sets or clears a column on public.deals (e.g. stamp won_at, set close_date).',
  },
  {
    type: 'enroll_in_follow_up',
    tier: 'internal',
    label: 'Enroll in follow-up queue',
    description:
      'Enrolls the deal in the follow-up queue with a typed reason. Owner sees it in the Today widget (internal) or the deal surface (client-visible if hide_from_portal is false).',
  },
];

const byType = new Map<string, PrimitiveMetadata>(
  PRIMITIVE_METADATA.map((m) => [m.type, m]),
);

/**
 * Client-safe lookup. Mirrors the name of the server registry's `getPrimitive`
 * so existing client callsites (prism.tsx, pipeline-editor.tsx) continue to
 * read `.type`, `.tier`, `.label`, `.description` without edits beyond the
 * import line.
 */
export function getPrimitive(type: string): PrimitiveMetadata | undefined {
  return byType.get(type);
}

export function listAllPrimitives(): PrimitiveMetadata[] {
  return [...PRIMITIVE_METADATA];
}

export function listByTier(tier: TriggerTier): PrimitiveMetadata[] {
  return PRIMITIVE_METADATA.filter((p) => p.tier === tier);
}
