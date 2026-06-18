# Aion Phase A: voice setup and first draft loop

_Researched: 2026-06-18 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

**Both premises in the question are outdated.** This queue item was written against the 2026-04-10 primer snapshot. As of 2026-06-18 the codebase has moved significantly.

**`aion_config` exists.** The column was added in `supabase/migrations/pre-baseline/20260407140000_aion_voice_foundation.sql` as `jsonb NOT NULL DEFAULT '{}'` and is present in the baseline schema at `supabase/migrations/20260101000000_baseline_schema.sql`. The voice shape is `{ description, example_message, guardrails }`, typed at `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:12`.

**The Brain tab is live.** `/aion` mounts `AionPageClient` (`src/app/(dashboard)/aion/AionPageClient.tsx:66`) which wraps `ChatInterface` (`src/app/(dashboard)/(features)/aion/components/ChatInterface.tsx`). The "paused" language in the primer was stale.

**The conversational onboarding loop is fully built.** The chat route's system prompt tracks four states via `getOnboardingState()` (`src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247`): `no_voice → no_example → no_guardrails → needs_test_draft → configured`. Each state drives a forcing block in the system prompt (`src/app/api/aion/chat/route/prompts.ts:275`). The `save_voice_config` tool in `src/app/api/aion/chat/tools/core.ts:120` captures description/example/guardrails mid-conversation via `updateAionConfigForWorkspace`, which uses the system client correctly.

**The test draft is wired.** At `needs_test_draft`, Aion is instructed to call `draft_follow_up` (`prompts.ts:282`). That tool (`core.ts:318`) calls `getDealContextForAion` + `generateFollowUpDraft` and the result is rendered as a `draft_preview` card by the response builder (`src/app/api/aion/chat/route/helpers.ts:103`). The `generateFollowUpDraft` function at `src/app/api/aion/lib/generate-draft.ts:25` already injects the workspace voice config into the system prompt (`generate-draft.ts:63`).

**Two real issues exist:**

1. **`voice_default_derived` blocks onboarding for established workspaces.** When `getAionConfig` synthesizes a voice from the workspace name it sets this flag, and `getOnboardingState` returns `'configured'` immediately (`aion-chat-types.ts:248`). Any workspace created before explicit voice setup will never see the `no_voice` → `needs_test_draft` flow — they need to click "Tune Aion's voice" in the sidebar overflow to call `resetAionVoiceConfig` first.

2. **`saveAionVoiceConfig` silently fails.** The server action at `aion-config-actions.ts:178` uses `createClient()` (anon/cookie, respects RLS) for its write. The baseline schema has no UPDATE policy on `public.workspaces` for authenticated users — only INSERT and SELECT exist (`baseline_schema.sql:21704`). Supabase UPDATE against a policy-blocked table returns 0 rows, no error, so the action returns `{ success: true }` while writing nothing. `setLearnOwnerCadence` and `resetAionVoiceConfig` already route through `getSystemClient()` for this exact reason; `saveAionVoiceConfig` missed the memo. This breaks any settings UI that calls this action directly.

## Intended state

Daniel opens `/aion`, sees a voice-setup prompt, writes 3 paragraphs in natural language, and within the same conversation sees a real draft for his top-priority deal that sounds like him. The loop should take under 5 minutes from cold start.

## The gap

- Workspaces with a synthesized default voice (likely Daniel's own workspace) silently skip onboarding. The entry point — "Tune Aion's voice" in the sidebar — is not discoverable without knowing to look.
- `saveAionVoiceConfig` server action is broken (RLS + wrong client). Any future settings page using it will silently no-op.
- `draft_follow_up` returns an error if `ops.follow_up_queue` is empty for the workspace at the moment of the test draft, which can happen for new workspaces or early in an onboarding session before the cron has run.

## Options

### Option A: Fix the two bugs, add a reset shortcut
- **What it is:** Switch `saveAionVoiceConfig` to `getSystemClient()` (2-line change, mirrors `setLearnOwnerCadence`). Add a visible "Set up Aion's voice" button or banner to the `/aion` page for workspaces in `needs_test_draft` or `configured + voice_default_derived` state. Update `draft_follow_up` to fall back to most-recent open deal when queue is empty.
- **Effort:** Small (3 targeted changes, no schema work)
- **Main risk:** System-client write for voice config bypasses RLS — acceptable because the action already validates workspace membership before writing.
- **Unlocks:** The end-to-end loop works for Daniel today, settings UI works for future pages.

### Option B: Add an explicit voice setup page
- **What it is:** Build a `/aion/setup` or settings tab with a 3-field form (description, example, guardrails) that calls `saveAionVoiceConfig`. Fix the server action in the same pass. Add a redirect from `/aion` for `no_voice` state workspaces.
- **Effort:** Medium (new page, form, redirect logic)
- **Main risk:** Parallel path to the conversational onboarding — two ways to do the same thing, risk of drift.
- **Unlocks:** Non-conversational entry point useful for users who dislike chat-first UX.

### Option C: Deprecate the conversational onboarding, replace with a modal
- **What it is:** Remove the forcing-block state machine from the chat route. Add a first-run modal on `/aion` with a 3-step form. Saves via a fixed `saveAionVoiceConfig` action.
- **Effort:** Large (remove live code, new modal, regression risk on chat route)
- **Main risk:** The conversational path is built and tested; removing it is waste. The modal needs design work to match Stage Engineering.
- **Unlocks:** Cleaner chat experience for returning users.

## Recommendation

**Option A.** The conversational loop is already built and the UX Daniel described ("write 3 paragraphs → see a draft") already exists — it just has two bugs and a discoverability gap.

Fix `saveAionVoiceConfig` first: swap `createClient()` for `getSystemClient()` and validate workspace membership before the write, same pattern as `setLearnOwnerCadence`. Then add a `draft_follow_up` fallback: if the queue is empty, query `public.deals` for the most recent open deal and use a synthetic queue item with `reason: 'Requested by user'` — the tool already handles this shape at `core.ts:343`. Finally, make the sidebar "Tune Aion's voice" affordance discoverable: add a small inline prompt on the `/aion` landing for workspaces where `voice_default_derived` is true, e.g., "Aion is using a default voice — customize it."

Option B is worth visiting after this works in practice. Don't build a form page until you know the conversational path isn't enough.

## Next steps for Daniel

1. Open `/aion` in your browser and check whether the onboarding prompts fire or whether Aion greets you in "configured" mode. If configured, click the sidebar overflow (three dots on your workspace header) and select "Tune Aion's voice" — this calls `resetAionVoiceConfig` and resets the flow.
2. Fix `saveAionVoiceConfig` in `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:185` — replace `const supabase = await createClient()` with `const { getSystemClient } = await import('@/shared/api/supabase/system'); const supabase = getSystemClient();` and add a membership check before the write (follow the pattern at lines 144–151).
3. Add an empty-queue fallback to `draft_follow_up` in `src/app/api/aion/chat/tools/core.ts:334` — if `queue.length === 0`, query `public.deals` for the workspace's most-recent open deal before returning an error.
4. Add a `voice_default_derived` nudge to `AionPageClient.tsx` or the `needs_test_draft` greeting — one line of contextual text pointing to the sidebar "Tune Aion's voice" action.
5. Run `npm test -- aion-config` to verify the config action tests still pass after step 2.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — voice config types, `saveAionVoiceConfig` (broken), `updateAionConfigForWorkspace` (working)
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — `getOnboardingState` state machine
- `src/app/api/aion/chat/route/prompts.ts:275` — onboarding forcing blocks
- `src/app/api/aion/chat/tools/core.ts:120,318` — `save_voice_config` and `draft_follow_up` tools
- `src/app/api/aion/chat/route/helpers.ts:103` — `draft_preview` card rendering
- `src/app/api/aion/lib/generate-draft.ts:25,63` — `generateFollowUpDraft` + voice injection
- `supabase/migrations/20260101000000_baseline_schema.sql:21704` — no UPDATE policy on `public.workspaces`
- `supabase/migrations/pre-baseline/20260407140000_aion_voice_foundation.sql` — `aion_config` column origin
