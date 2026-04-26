#!/usr/bin/env tsx
/**
 * Wk 11 §3.8 — null Aion session titles that are still the deal's literal
 * title.
 *
 * Some sessions were created before the Haiku thread-title generator was
 * wired (`src/app/api/aion/lib/generate-title.ts`). Those sessions store the
 * deal title verbatim, so the AionSidebar shows "Alex & Christine's Wedding"
 * for every chat on that deal — useless for distinguishing threads.
 *
 * The plan §3.8 statement nulls every deal-scoped session whose title still
 * matches its deal's title. The next user message on that thread triggers
 * the existing `generate-title.ts` Haiku call (fire-and-forget) and a
 * meaningful title lands.
 *
 * Idempotent — already-renamed sessions are skipped automatically because
 * the predicate compares titles exactly. Archived sessions are skipped too.
 *
 * Wk 11 prod state: backfill executed once via the Supabase MCP execute_sql
 * tool on 2026-04-26. 1 session updated. This script is the canonical
 * runbook for any future environment (staging, fresh re-seed, etc.).
 *
 * Run on a fresh environment:
 *   1. Paste the SQL below into Supabase Studio → SQL Editor → Run
 *   2. Or: tsx scripts/backfill-aion-thread-titles.ts (prints the SQL)
 *
 * The TS runner intentionally does NOT execute the UPDATE — running schema
 * mutations from a node script via the supabase-js client risks the wrong
 * env-var pair (preview vs prod). The SQL editor pins the target.
 */

const SQL = `
-- Wk 11 §3.8 — null deal-scoped session titles that still match the deal
-- title. Idempotent. Run on each env once after Wk 11 ships.

WITH targets AS (
  SELECT s.id
    FROM cortex.aion_sessions s
    JOIN public.deals d ON d.id = s.scope_entity_id
   WHERE s.scope_type = 'deal'
     AND s.title IS NOT NULL
     AND s.archived_at IS NULL
     AND s.title = d.title
)
UPDATE cortex.aion_sessions
   SET title = NULL,
       updated_at = now()
 WHERE id IN (SELECT id FROM targets)
RETURNING id, scope_entity_id;
`.trim();

console.log('# Wk 11 §3.8 thread-title backfill');
console.log('# Paste the SQL below into Supabase Studio (SQL Editor) on the target env.');
console.log('# Returns one row per session whose title was nulled.');
console.log('');
console.log(SQL);
console.log('');
console.log('# Done. The next message on each affected session will trigger generate-title.ts.');
