# Aion Phase A: Voice Setup to First Draft

_Researched: 2026-09-13 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

The planning primer is significantly out of date. Phase A infrastructure is already fully shipped. Here is what actually exists today.

**`aion_config` column**: Lives on `public.workspaces` as a JSONB column. Added in `supabase/migrations/pre-baseline/20260407140000_aion_voice_foundation.sql`, included in the baseline. TypeScript shape is `AionConfig` in `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:50`.

**Voice setup tools**: `save_voice_config` tool at `src/app/api/aion/chat/tools/core.ts:118` — takes `description`, `example_message`, `guardrails`, `onboarding_complete` and calls `updateAionConfigForWorkspace`. Fully wired.

**Onboarding state machine**: `getOnboardingState()` at `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — five states: `no_voice → no_example → no_guardrails → needs_test_draft → configured`. System prompt in `src/app/api/aion/chat/route/prompts.ts:284` injects onboarding instructions for each state.

**Chat route**: `src/app/api/aion/chat/route.ts` is a full-featured authenticated orchestrator — auth guard, tier gate, kill-switch check, tool-calling loop, rolling summarization, model tier selection, streaming. Not a stub.

**Draft generation**: `src/app/api/aion/lib/generate-draft.ts:25` — `generateFollowUpDraft` injects voice config into the system prompt when set. Also reachable via the `draft_follow_up` chat tool at `core.ts:318`.

**The "Brain tab"**: Does not exist as a tab. The Aion surface is the `/aion` standalone page (`src/app/(dashboard)/aion/page.tsx`) backed by `AionPageClient` and `ChatInterface.tsx`. The primer's framing pre-dates the current architecture.

**Default voice bypass**: `synthesizeDefaultVoice()` at `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:20` generates a workspace-name-based voice on first read. `getOnboardingState` treats `voice_default_derived: true` as fully configured (`aion-chat-types.ts:248`), so new workspaces skip the 4-step onboarding entirely.

## Intended state

Daniel opens `/aion`, writes 3 paragraphs about communication style, and sees an Aion-generated follow-up draft that reflects that voice. The mechanics for this exist; the UX frictions are:

1. New workspaces auto-get a synthesized voice and are treated as `configured`, so the onboarding conversation never fires.
2. The `draft_follow_up` tool requires a deal in `ops.follow_up_queue` (or a `deal` page context). On the `/aion` page with an empty queue, it returns "No deals in the follow-up queue" — blocking the test-draft step.

## The gap

- Default voice synthesis short-circuits onboarding. To enter the voice setup flow, Daniel must use "Tune Aion's voice" in the sidebar overflow → `resetAionVoiceConfig()` (clears `voice` and `voice_default_derived`). It's unclear whether this sidebar affordance is visible and accessible.
- `draft_follow_up` tool has no synthetic fallback for the onboarding test draft step. A workspace with no won/active deals in the queue cannot complete `needs_test_draft`.
- The planning primer's framing ("aion_config doesn't exist", "API is a 16-line stub") was accurate in April 2026 and is not the question anymore. The real question is smoothing the first-run experience.

## Options

### Option A: Validate end-to-end with a real deal

- **What it is:** Confirm the full path works today by using an existing deal and the sidebar overflow. Document the exact steps. Identify any runtime bugs in the voice save → draft flow before building new UX.
- **Effort:** Small (1–2 hours)
- **Main risk:** May find a silent bug in `updateAionConfigForWorkspace` or `draft_follow_up` that blocks the path.
- **Unlocks:** Confidence that the infrastructure is solid before investing in UX improvements.

### Option B: Expose voice setup as a dedicated settings form

- **What it is:** Add an explicit voice configuration form to `/settings/aion` (which already has `AionSettingsView`). Three textarea fields (description, example, guardrails) with a Save button wired to `saveAionVoiceConfig`. No LLM intermediary.
- **Effort:** Small–Medium (half day of UI work)
- **Main risk:** Bypasses the conversational onboarding — Daniel fills a form rather than teaching Aion by example, which may produce worse results than the guided chat flow.
- **Unlocks:** A reliable, UI-controlled path to set voice without touching the sidebar overflow or needing a chat session.

### Option C: Fix the test-draft fallback in onboarding

- **What it is:** When `onboardingState === 'needs_test_draft'` and the queue is empty, generate a synthetic demo draft using a placeholder deal context instead of failing. Add this fallback in `draft_follow_up` tool (core.ts) and/or `buildGreeting` so the onboarding completes even on a fresh workspace.
- **Effort:** Small (2–3 hours to add a fallback deal context skeleton)
- **Main risk:** Synthetic drafts may be weaker and confuse the user ("this is a demo deal that doesn't exist"). Needs clear copy framing it as a preview.
- **Unlocks:** Full 4-step onboarding completes end-to-end on a fresh workspace with no live data, which is the exact scenario the queue item describes.

## Recommendation

Run Option A first (one session, real data), then ship Option C. The infrastructure works — the open question is whether it works end-to-end in production with real data. Start there: reset voice via sidebar overflow on a workspace that has at least one deal with follow-up context, walk through the 4 steps in chat, confirm the draft reflects the voice. This will surface any silent failures cheaply.

If A passes: ship Option C (synthetic fallback in `draft_follow_up`). The exact scenario in the queue item — a fresh workspace where Daniel types 3 paragraphs and immediately gets a draft — requires that fallback. Option B (settings form) is useful but doesn't answer the question the way a conversational onboarding does.

Skip building a new "Brain tab" or a separate voice setup wizard — the `/aion` chat page already handles this with the right state machine in place.

## Next steps for Daniel

1. In any workspace with at least one deal, open `/aion` and click the sidebar overflow → "Tune Aion's voice". This calls `resetAionVoiceConfig` and re-enters the onboarding flow.
2. Walk through the 4-step onboarding in chat. Confirm `save_voice_config` fires after each step (visible in Vercel logs or Supabase workspace row).
3. Once `onboarding_state === 'complete'`, trigger a draft by typing "draft a follow-up for [deal name]" and confirm the result matches your voice description.
4. If the draft works: open `src/app/api/aion/chat/tools/core.ts:318` and add a synthetic deal context fallback for the case where `queue.length === 0` and no page context exists. Frame it as "This is a preview draft — I'll personalize it once you add a deal."
5. Deploy and validate the full fresh-workspace path (onboarding → 3 paragraphs → synthetic preview draft).
6. Consider wiring `CadenceLearningToggle.tsx` into `AionSettingsView` (it explicitly says "can live inside the Brain tab, a workspace settings page") as a next-session improvement.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — full AionConfig type, voice mutations
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — `synthesizeDefaultVoice`, `applyVoiceDefaultIfEmpty`
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — `getOnboardingState` state machine
- `src/app/api/aion/chat/tools/core.ts:118` — `save_voice_config` tool
- `src/app/api/aion/chat/tools/core.ts:318` — `draft_follow_up` tool
- `src/app/api/aion/chat/route/prompts.ts:284` — onboarding instruction injection
- `src/app/api/aion/lib/generate-draft.ts:52` — voice injection into follow-up prompt
- `supabase/migrations/pre-baseline/20260407140000_aion_voice_foundation.sql` — aion_config column origin
