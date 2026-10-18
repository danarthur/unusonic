# Aion Phase A: Voice Setup to First Draft

_Researched: 2026-08-27 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

**The four Phase A prerequisites are all shipped.** The primer's April 2026 snapshot is stale — significant work landed since then.

`aion_config` exists on `public.workspaces` with a fully-typed `AionConfig` shape: `voice` (description, example_message, guardrails), `learned` (vocabulary swaps, patterns, preferences), `follow_up_playbook`, `onboarding_state`, `kill_switch`, `learn_owner_cadence`, `voice_default_derived`. Read/write wiring is in `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:84`.

The Brain tab is live at `/aion` — `AionPageClient.tsx:5` renders `ChatInterface` with no pause gate.

`/api/aion/chat` (`src/app/api/aion/chat/route.ts:57`) is a full production route: auth guard, rate limiting, tier gate, kill switch, session management, onboarding state machine, tool-calling loop, model routing (fast/standard/heavy), streaming text + tool events.

`/api/aion/draft-follow-up` (`src/app/api/aion/draft-follow-up/route.ts`) is live. It reads `aionConfig.voice` and passes it to `generateFollowUpDraft` (`src/app/api/aion/lib/generate-draft.ts:25`), which injects voice.description, voice.example_message, and voice.guardrails into the system prompt before calling Claude.

`/api/aion/learn-from-edit` (`src/app/api/aion/learn-from-edit/route.ts`) is live: LLM-extracts vocabulary swaps from draft edits, persists them to `aion_config.learned`.

A 5-state onboarding machine exists: `getOnboardingState` in `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` maps to `no_voice → no_example → no_guardrails → needs_test_draft → configured`.

**The critical nuance:** new workspaces never see the onboarding flow. `applyVoiceDefaultIfEmpty` in `aion-config-helpers.ts` synthesizes a default voice from the workspace name and sets `voice_default_derived = true`, which `getOnboardingState` treats as `'configured'`. This is intentional — the 4-step forcing block only fires after Daniel explicitly selects "Tune Aion's voice" in the sidebar overflow (`AionSidebar.tsx:31` → `resetAionVoiceConfig`).

## Intended state

The queue item goal: Daniel opens the Brain tab, types or pastes 3 paragraphs describing how he writes to clients, and sees an Aion-generated follow-up draft from the voice he just described — within the same session.

## The gap

- **New workspaces auto-skip onboarding.** `voice_default_derived = true` means Daniel lands in `configured` state and never sees the onboarding flow unless he finds "Tune Aion's voice" in the sidebar overflow — a non-obvious entry point.
- **4 turns, not 3 paragraphs.** The current onboarding is sequential: description turn → example turn → guardrails turn → chip click to trigger a test draft. A one-shot "paste everything and get a draft" path doesn't exist.
- **`needs_test_draft` step is not automatic.** The greeting (`prompts.ts:329`) presents a chip "Yes, try one" — the draft only appears after the user explicitly clicks it. The greeting doesn't auto-fetch a deal and generate a draft.
- The test draft requires an active deal in the follow-up queue to be meaningful. Empty-queue workspaces would get a draft with thin context.

## Options

### Option A: Test the current flow today (no new code)

- **What it is:** Document the path: open /aion → sidebar "•••" → "Tune Aion's voice" → 4-step chat onboarding → click "Yes, try one" → see draft. Verify it works end-to-end on a real deal.
- **Effort:** Small (30 min to verify; 0 code changes)
- **Main risk:** May expose rough edges (empty queue, `save_voice_config` tool missing from the assembled tool set) before the demo.
- **Unlocks:** Confidence that Phase A is usable. Produces a concrete list of the remaining rough edges.

### Option B: Auto-generate draft in the `needs_test_draft` greeting

- **What it is:** When `onboardingState === 'needs_test_draft'`, `buildGreeting` fetches the top deal from `ops.follow_up_queue` for the workspace, calls `generateFollowUpDraft`, and returns a `draft_preview` block as part of the greeting instead of a "want to try?" chip. The draft appears without a second turn.
- **Effort:** Medium (half-day: modify `buildGreeting`, add a queue-fetch helper, test with empty-queue fallback).
- **Main risk:** Adds latency to the `configured` → onboarding re-entry flow. Empty-queue workspaces get a degraded draft.
- **Unlocks:** The "immediate draft" moment the queue item describes. Makes the onboarding payoff tangible without a chip click.

### Option C: Standalone voice-setup form

- **What it is:** A modal or settings panel with three textareas (style, example, rules) and a "Generate test draft" button that calls `/api/aion/draft-follow-up` directly. Replaces the chat-guided onboarding for initial setup.
- **Effort:** Large (2–3 days: form UI, server action integration, sync with chat-learned updates, design review).
- **Main risk:** Introduces a parallel voice-config surface that can drift from the chat-guided updates (`learn-from-edit`, `save_voice_config` tool). Redundant with what the chat already does conversationally.
- **Unlocks:** Faster initial setup, but at the cost of a parallel surface to maintain.

## Recommendation

Run Option A first, then ship Option B.

**Option A today (30 min).** Walk the current flow on a real deal. The infrastructure is there — what's unknown is whether `save_voice_config` is wired into the assembled chat tool set and whether the queue fetch inside `draft_follow_up` returns a meaningful deal. This test will either confirm the path works or surface one or two specific wiring gaps to fix.

**Option B next (half-day).** Auto-generating the draft in the `needs_test_draft` greeting is the correct resolution to "immediately see a draft." It closes the one-turn gap without adding a parallel surface. The greeting already has access to `workspaceId` — adding a queue fetch there is a small extension of an existing pattern. Add a fallback ("Here is what a draft would look like with a sample deal") for empty-queue workspaces.

Skip Option C. The chat-native onboarding is the right model for a system that continues learning via `learn-from-edit` and `save_follow_up_rule`. A separate form creates friction and drift.

The discoverability gap (sidebar overflow is not obvious) is a separate follow-up: surface "Set up your voice" as a card or banner on the `/aion` page when `voice_default_derived === true`.

## Next steps for Daniel

1. **Open `/aion` → sidebar "•••" → "Tune Aion's voice"** to trigger `resetAionVoiceConfig` and enter the `no_voice` onboarding state.
2. **Walk the 4-step flow.** Type your style description, paste an example message, add guardrails. Confirm that `saveAionVoiceConfig` updates `aion_config` correctly (check the `workspaces` row in the Supabase dashboard).
3. **At `needs_test_draft`, click "Yes, try one".** Confirm a draft renders as a `draft_preview` block — if it doesn't, check that `draft_follow_up` is in the assembled tool set for this onboarding context (`src/app/api/aion/chat/route/tools.ts`).
4. **If the draft appears:** Phase A is done. File an issue for the discoverability banner ("Set up your voice" on the /aion page for `voice_default_derived` workspaces).
5. **If the draft doesn't appear:** The gap is in the tool assembly. Check `buildToolsForIntent` in `src/app/api/aion/chat/route/tools.ts` — `draft_follow_up` may be gated on an intent classifier that doesn't fire during onboarding. Expose it unconditionally when `onboardingState === 'needs_test_draft'`.
6. **After verification:** Implement Option B — modify `buildGreeting` in `src/app/api/aion/chat/route/prompts.ts:329` to auto-fetch the top queue deal and include a `draft_preview` block in the `needs_test_draft` greeting response.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — AionConfig type, getAionConfig, saveAionVoiceConfig, resetAionVoiceConfig
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — getOnboardingState, OnboardingState, 5-state machine
- `src/app/api/aion/chat/route.ts` — full chat route
- `src/app/api/aion/chat/route/prompts.ts:275` — onboarding system prompt injection, buildGreeting per state
- `src/app/api/aion/draft-follow-up/route.ts` — draft generation, voice injection
- `src/app/api/aion/lib/generate-draft.ts` — buildFollowUpPrompt, voice field injection
- `src/app/api/aion/lib/tone-anchoring.ts` — observed-style mirroring from ops.messages
- `src/app/api/aion/learn-from-edit/route.ts` — vocabulary learning from draft edits
- `src/app/(dashboard)/aion/AionPageClient.tsx` — Brain tab, no pause gate
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:31` — "Tune Aion's voice" entry point
