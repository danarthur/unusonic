# Aion Phase A — voice setup + first real draft

_Researched: 2026-04-18 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

> **Note on stale premises.** The queue item was written against an older codebase snapshot. Both premises are now outdated: (1) `aion_config` DOES exist — added by `supabase/migrations/20260407140000_aion_voice_foundation.sql`; (2) there is no "Brain tab" with a paused state — the Aion interface lives at `/dashboard/aion` and is fully rendered via `AionPageClient.tsx:45`. The gap is narrower than the question implies.

## Current state

**`aion_config` column:** Present on `public.workspaces` as `jsonb NOT NULL DEFAULT '{}'`. Covered in `src/types/supabase.ts:5418`. Migration: `supabase/migrations/20260407140000_aion_voice_foundation.sql:1-25`.

**Server actions:** `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` has `getAionConfig`, `saveAionVoiceConfig`, `updateAionConfigForWorkspace`, and `toggleAionKillSwitch` — all implemented and tested.

**Onboarding state machine:** `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:221-246` defines five states (`no_voice → no_example → no_guardrails → needs_test_draft → configured`) and exports `getOnboardingState(config)`.

**Chat route — onboarding fully wired:** `src/app/api/aion/chat/route.ts:198` calls `getOnboardingState(aionConfig)`. `buildGreeting()` (line 764) returns state-appropriate opening messages with suggestion chips. `buildSystemPrompt()` (line 747) injects per-state onboarding instructions. The `save_voice_config` tool (`src/app/api/aion/chat/tools/core.ts:115`) persists description, example_message, and guardrails to `aion_config` in a single call.

**Draft tool:** `draft_follow_up` (`core.ts:312`) calls `getDealContextForAion` (`src/app/(dashboard)/(features)/crm/actions/follow-up-actions.ts:498`), enriches with semantic memory, and calls the `generateFollowUpDraft` function. Falls back to top-priority deal in `ops.follow_up_queue` when no deal ID is provided. The standalone endpoint `/api/aion/draft-follow-up/route.ts` is also wired and authenticated.

**Aion page:** `src/app/(dashboard)/aion/AionPageClient.tsx:45` renders `ChatInterface` at `/dashboard/aion`. No separate "Brain tab" exists; the CRM prism has Deal/Plan/Ledger lenses only (`src/app/(dashboard)/(features)/crm/components/prism.tsx:610-612`).

**Tier gate:** `src/app/api/aion/chat/route.ts:174` calls `canExecuteAionAction(workspaceId, 'active')`. Foundation tier returns `allowed: false` — the entire chat API (and thus all onboarding) is blocked for non-paying workspaces. Growth and Studio tiers pass. (`src/shared/lib/tier-config.ts:40-52`, `src/features/intelligence/lib/aion-gate.ts:42-71`)

## Intended state

Daniel opens `/dashboard/aion`, sees the `no_voice` greeting ("How would you describe your style?"), answers three prompts (style description, example message, guardrail rules), and immediately gets a real draft for an active deal — all within a single chat session. Voice config is persisted to `aion_config` automatically by `save_voice_config` after each answer.

## The gap

- The workspace used for development must be on `growth` (or `studio`) tier, or the chat API returns 403. This is the only real blocker.
- `ops.follow_up_queue` may be empty in dev if the cron (`/api/cron/follow-up-queue`) has not run. `draft_follow_up` will return "No deals in the follow-up queue" unless there's page context (deal ID in URL) or at least one queued deal.
- No "Brain tab" in the deal prism. If Daniel wants Aion accessible inline from a deal, that is a separate build item.

## Options

### Option A: Verify end-to-end as-is — no code needed

- **What it is:** Set the dev workspace's `subscription_tier` to `growth` in Supabase SQL Editor, navigate to `/dashboard/aion`, and complete the 3-question onboarding in the existing chat UI.
- **Effort:** Small (1 SQL statement + browser test)
- **Main risk:** If `ops.follow_up_queue` is empty, the test draft step returns an error. Fix by running the follow-up cron once or opening Aion from a deal page (`/crm?deal=<id>&openAion=true` if that route exists, otherwise hardcode a `pageContext`).
- **Unlocks:** Confirms the full loop (voice setup → draft) works before writing any new code.

### Option B: Seed script for reliable local testing

- **What it is:** A SQL script in `scripts/debug/` that sets workspace tier to `growth`, inserts one row in `ops.follow_up_queue` for the most recent deal, and clears `aion_config` to reset onboarding state. Run before each test session.
- **Effort:** Small (20-line SQL, no app code)
- **Main risk:** None — dev-only script with no prod impact.
- **Unlocks:** Reproducible onboarding testing without manual DB fiddling each time.

### Option C: Add a Brain lens to the deal prism

- **What it is:** Add a fourth `brain` lens to the CRM prism that renders `ChatInterface` with `pageContext: { type: 'deal', entityId: dealId }`. Aion opens pre-loaded with deal context and skips the queue-lookup fallback.
- **Effort:** Medium (modify `prism.tsx`, handle layout at the fourth tab width, pass page context to ChatInterface, test the deal-scoped greeting at `configured` state)
- **Main risk:** CRM prism is a 900+ line component; adding a fourth tab without layout regression takes care. Also the `configured` greeting already handles deal context (`route.ts:811-818`) so the wiring exists — it's purely a UI surface change.
- **Unlocks:** Aion embedded in the deal workflow; "Draft a follow-up" accessible without leaving the deal view.

## Recommendation

**Do Option A first, then B.** The system is complete — there is no missing feature to build for the voice-setup-to-draft loop. The only blocker is the tier gate. Run one SQL statement, open `/dashboard/aion`, and walk through the 3-question flow. If the test draft step fails because the queue is empty, open Aion from a deal page URL or run the cron once.

Option B (seed script) is a five-minute add that pays for itself the first time you reset and re-test. Do it immediately after confirming Option A works.

Option C (Brain lens in deal prism) is worth doing, but it is a distinct feature addition, not a prerequisite for voice setup. File it as a separate queue item once the core loop is confirmed working.

## Next steps for Daniel

1. In Supabase SQL Editor, run: `UPDATE public.workspaces SET subscription_tier = 'growth' WHERE id = '<your-dev-workspace-id>';`
2. Navigate to `/dashboard/aion` — you should see the `no_voice` greeting immediately.
3. Answer the three prompts (style, example message, guardrails). Aion calls `save_voice_config` after each answer and advances the state machine.
4. At the `needs_test_draft` state, click "Yes, try one." If the queue is empty, open Aion from within a deal page so page context provides the deal ID.
5. Confirm the generated draft reflects your voice config. If it does not, check `aion_config` in the DB: `SELECT aion_config FROM public.workspaces WHERE id = '<workspace-id>';`
6. Add `scripts/debug/seed-aion-dev.sql` to reset onboarding state and queue a test deal for future test runs.

## References

- `supabase/migrations/20260407140000_aion_voice_foundation.sql` — aion_config column
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — read/write actions
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:221-246` — onboarding state machine
- `src/app/api/aion/chat/route.ts:174, 198, 747-805` — tier gate, state detection, greeting + system prompt
- `src/app/api/aion/chat/tools/core.ts:115, 312` — save_voice_config, draft_follow_up tools
- `src/app/(dashboard)/(features)/crm/actions/follow-up-actions.ts:498` — getDealContextForAion
- `src/features/intelligence/lib/aion-gate.ts:42` — canExecuteAionAction
- `src/shared/lib/tier-config.ts:31-65` — tier → Aion mode mapping
- `src/app/(dashboard)/aion/AionPageClient.tsx:45` — ChatInterface render point
- `src/app/(dashboard)/(features)/crm/components/prism.tsx:610-612` — current deal lens tabs
