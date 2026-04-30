/**
 * scout.ts — thin barrel.
 *
 * Implementation lives in ./scout/* siblings (Phase 0.5-style split,
 * 2026-04-28). External callers import { scoutEntity, scoutEntityForOnboarding,
 * ScoutResult, ScoutRosterMember } from '@/features/intelligence' which
 * re-exports from this file.
 *
 * NOT a `'use server'` file — Next.js requires every export from a 'use
 * server' module to be a directly-defined async function, which forbids
 * the `export { x } from './sib'` re-exports below. The action sibling
 * (./scout/main.ts) carries `'use server'`, so the actions remain server
 * actions when imported here.
 *
 * Splits:
 *   - types.ts        — shared type definitions
 *   - utils.ts        — OpenAI client, URL/img helpers, validation, role/tag helpers
 *   - sub-agents.ts   — focused contact/identity/classification OpenAI prompts
 *   - roster-hunter.ts — Bloodhound + Cluster Scanner + AI Analyst
 *   - pipeline.ts     — runScoutPipeline (master merge)
 *   - main.ts         — 'use server' actions: scoutEntity + scoutEntityForOnboarding
 */

export type { ScoutResult, ScoutRosterMember } from './scout/types';
export { scoutEntity, scoutEntityForOnboarding } from './scout/main';
