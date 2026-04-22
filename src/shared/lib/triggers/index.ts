/**
 * Client-safe barrel for the triggers module.
 *
 * Historically this file re-exported from `./registry`, which pulled the
 * entire primitive graph (including the service-role Supabase client from
 * `enroll-follow-up.ts`) into every consumer's bundle. It now re-exports
 * client-safe metadata only.
 *
 *   - Types: see `./types`
 *   - Normalized trigger row shape: see `./normalize`
 *   - Client-safe primitive lookup: see `./metadata`
 *   - Server runtime (configSchema, run, undo): import from
 *     `@/shared/lib/triggers/registry` directly. That path is guarded by
 *     `import 'server-only'` in `./registry-server`.
 *
 * The `getPrimitive` / `listAllPrimitives` / `listByTier` exports here return
 * `PrimitiveMetadata`, NOT `TriggerPrimitive`. If a server caller needs
 * `configSchema` or `run`, it must import from `./registry` instead of this
 * barrel.
 */

export type {
  TriggerTier,
  TriggerContext,
  TriggerResult,
  TriggerPrimitive,
} from './types';

export {
  getPrimitive,
  listAllPrimitives,
  listByTier,
} from './metadata';
export type { PrimitiveMetadata } from './metadata';

export { normalizeTriggers } from './normalize';
export type { TriggerEntry } from './normalize';
