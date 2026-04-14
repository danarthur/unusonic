# Aion Phase A — Current State and What's Left

_Researched: 2026-04-14 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

The premise of this question is outdated. Phase A infrastructure shipped between 2026-04-07 and 2026-04-11. The Brain tab is not paused and the route is not a stub. Here is what actually exists:

**Database:** `aion_config` JSONB column lives on `public.workspaces` via `supabase/migrations/20260407140000_aion_voice_foundation.sql:7`. `aion_actions_used` and `aion_actions_reset_at` exist from `supabase/migrations/20260402120100_tier_config_and_workspace_columns.sql`. The full cortex layer is present: `cortex.aion_sessions`, `cortex.aion_messages`, `cortex.aion_memory` (with entity_id and user_id), and `cortex.aion_insights`.

**Route:** `src/app/api/aion/chat/route.ts` is a 400-line authenticated, tier-gated, streaming SSE route using Claude Haiku/Sonnet/Opus via `@ai-sdk/anthropic`. It is not a stub.

**Onboarding machine:** `src/app/(dashboard)/(features)/brain/lib/aion-chat-types.ts:86` defines a 5-state machine (`no_voice → no_example → no_guardrails → needs_test_draft → configured`). `getOnboardingState()` drives it from `aion_config`. `buildGreeting()` in the chat route handles each state with appropriate prompts and suggestion chips.

**Voice save:** `save_voice_config` tool in `src/app/api/aion/chat/tools/core.ts:115` saves description, example_message, and guardrails to `aion_config` via `updateAionConfigForWorkspace`.

**Draft generation:** `draft_follow_up` tool (`core.ts:312`) calls `getDealContextForAion`, enriches with `cortex.aion_memory` entity recall, applies voice config and playbook rules, then calls Haiku at temperature 0.6.

**Learn-from-edit loop:** `src/app/api/aion/learn-from-edit/route.ts` is complete. `ChatInterface.tsx:233` calls it after draft copy/send, wired through `DraftPreviewCard` → `AionMessageRenderer` → `ChatInterface.handleDraftEdited`.

**Live page:** `src/app/(dashboard)/aion/page.tsx` renders `ChatInterface` directly — no paused banner.

**Known rough edge 1:** `increment_aion_actions` RPC does not exist in the DB yet. `src/features/intelligence/lib/aion-gate.ts:85` falls back to a manual read-increment-write when the RPC errors, which works but is not atomic.

**Known rough edge 2:** `aion_config` is not in generated types. `aion-config-actions.ts:68` casts through `Record<string, unknown>` to access the column. This works today but will drift if `db:types` is regenerated without exposing the column.

## Intended state

Phase A goal: Daniel opens the Brain tab → writes about his communication style → Aion saves it to `aion_config.voice` → offers a test draft → draft uses the voice config → flow completes with `onboarding_state: 'complete'`.

That loop already works end-to-end in code. The intended state is a verified, clean production path: no `as any` casts in the hot path, an atomic RPC for action counting, and types that reflect the live schema.

## The gap

- `increment_aion_actions` RPC is not defined in any migration — relies on a fallback in `aion-gate.ts:85-106`.
- `aion_config` column is not exposed in generated types — three `(data as Record<string, unknown>).aion_config` casts in `aion-config-actions.ts`.
- No smoke test has been run to confirm the end-to-end flow works (the primer suggests Daniel has not exercised it yet).
- `SIGNAL_SPRING_DURATION_MS` in `src/shared/lib/motion-constants.ts:116` is an uncompleted brand rename (low priority).

## Options

### Option A: Smoke test as-is
- **What it is:** Navigate to `/aion`, go through the 5-state onboarding manually — write a voice description, paste an example message, state a guardrail, then accept a test draft. Verify that `aion_config` on the workspace row is populated and the draft reflects the voice.
- **Effort:** Small — 15 minutes of testing, no code changes.
- **Main risk:** Discovers a breakage that requires diagnosis (e.g. tier gate blocking a dev workspace, cortex schema not exposed in client).
- **Unlocks:** Confirmed baseline before writing the `increment_aion_actions` migration.

### Option B: Fix rough edges, then smoke test
- **What it is:** Write one migration that defines `increment_aion_actions(p_workspace_id uuid)` as a real atomic RPC. Run `npm run db:types` after exposing `aion_config` in Supabase Dashboard "Exposed schemas." Remove the three `as any` casts in `aion-config-actions.ts`. Then smoke test.
- **Effort:** Medium — migration, types regen, small refactor, test.
- **Main risk:** Supabase Dashboard "Exposed schemas" currently does not include non-public schemas for type gen (noted in CLAUDE.md). The `aion_config` column is on `public.workspaces`, so types should cover it — but PR 6.5 for schema exposure is tracked as not done.
- **Unlocks:** Clean typed path, atomic counters, and a verified Phase A baseline that can be safely handed to Phase B (proactive insights cron already in `src/app/api/aion/lib/insight-evaluators.ts`).

### Option C: Ship Phase B immediately
- **What it is:** Skip Phase A verification and move to wiring the proactive insights cron and a production-ready `increment_aion_actions` RPC together as the "Phase B" migration set.
- **Effort:** Large — additional migrations, evaluator wiring, scheduler config.
- **Main risk:** Shipping Phase B on an unverified Phase A foundation. If the onboarding flow has a silent bug, the insight evaluators will run against workspace configs that may be empty.
- **Unlocks:** Full active intelligence layer.

## Recommendation

Option B. Phase A is functionally complete but has two correctness defects worth closing before declaring it done: the non-atomic action counter and the untyped hot path. Both are 30-minute fixes. Write the `increment_aion_actions` RPC migration first (simple atomic `UPDATE workspaces SET aion_actions_used = aion_actions_used + 1`) so the fallback path in `aion-gate.ts` is no longer needed. Then expose `aion_config` in the Supabase Dashboard or explicitly add the column to a cast helper so `db:types` does not silently lose it on the next regen. After that, spend 15 minutes going through the onboarding flow manually — voice description, example message, guardrails, test draft — and confirm the draft reads back the saved config. That closes Phase A with a clean seam.

Do not skip to Phase B before the manual test. The proactive insights evaluator (`insight-evaluators.ts`) reads `aion_config` to decide what to surface. If voice config is broken, the evaluator will surface garbage.

## Next steps for Daniel

1. Write migration `supabase/migrations/20260414_increment_aion_actions_rpc.sql` — add `CREATE OR REPLACE FUNCTION public.increment_aion_actions(p_workspace_id uuid)` that does an atomic `UPDATE workspaces SET aion_actions_used = aion_actions_used + 1 WHERE id = p_workspace_id`.
2. Open Supabase Dashboard → API → "Exposed schemas" and verify `public` is included. Run `npm run db:types` — confirm `aion_config jsonb` appears on the `workspaces` row type.
3. In `src/app/(dashboard)/(features)/brain/actions/aion-config-actions.ts`, remove the `as Record<string, unknown>` casts on lines 68 and 87 now that types cover the column.
4. Open `/aion` in a browser. Go through all 5 onboarding states in sequence. After accepting the test draft, run a SQL query on the workspace row and verify `aion_config.voice` and `aion_config.onboarding_state = 'complete'` are set.
5. Draft a real follow-up from the CRM Follow-Up Card (not the Brain tab) to confirm `/api/aion/draft-follow-up` also reads the voice config and the draft sounds like the example message you gave during onboarding.
6. Rename `SIGNAL_SPRING_DURATION_MS` → `UNUSONIC_SPRING_DURATION_MS` in `src/shared/lib/motion-constants.ts:116` (and its single consumer on line 119) to close the last legacy brand item from the primer.

## References

- `supabase/migrations/20260407140000_aion_voice_foundation.sql` — `aion_config` column
- `supabase/migrations/20260402120100_tier_config_and_workspace_columns.sql` — `aion_actions_used`
- `src/app/api/aion/chat/route.ts` — full streaming chat route
- `src/app/api/aion/chat/tools/core.ts` — `save_voice_config`, `draft_follow_up` tools
- `src/app/(dashboard)/(features)/brain/lib/aion-chat-types.ts:86` — 5-state onboarding machine
- `src/app/(dashboard)/(features)/brain/actions/aion-config-actions.ts` — voice config CRUD
- `src/features/intelligence/lib/aion-gate.ts:85` — `increment_aion_actions` fallback
- `src/app/api/aion/learn-from-edit/route.ts` — edit feedback loop
- `src/app/(dashboard)/aion/page.tsx` — live page
