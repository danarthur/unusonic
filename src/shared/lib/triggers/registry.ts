/**
 * Back-compat shim for the trigger primitive registry.
 *
 * The runtime registry now lives in `./registry-server.ts`, which carries the
 * `import 'server-only'` guard so a client import becomes a hard build error
 * instead of silently bundling the service-role Supabase client.
 *
 * This file stays so existing server-side import paths
 * (`@/shared/lib/triggers/registry`, `./registry`) keep resolving without
 * code changes in:
 *   - `./dispatch.ts`
 *   - `./dwell-sla.ts`
 *   - `./__tests__/registry.test.ts`
 *   - `./__tests__/preview.test.ts`
 *   - `src/features/pipeline-settings/api/actions.ts`
 *
 * Client code must import from `./metadata` instead — see `./index.ts` for
 * the barrel that enforces that split.
 */

export {
  registerPrimitive,
  getPrimitive,
  listAllPrimitives,
  listByTier,
  __resetRegistryForTests,
} from './registry-server';
