# Aion Phase A: Voice Setup and First Draft — Current Status

_Researched: 2026-08-02 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

**The primer is out of date.** Both stated blockers (Brain tab paused, `aion_config` missing) no longer hold. Phase A is largely shipped.

`workspaces.aion_config` exists and is in active use. `getAionConfig()` at `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:94` reads `workspaces.aion_config` as an `AionConfig` JSONB object with `voice`, `learned`, `follow_up_playbook`, `onboarding_state`, and `kill_switch` fields.

A 5-state voice onboarding machine is wired end-to-end:

- `getOnboardingState()` at `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` derives `no_voice → no_example → no_guardrails → needs_test_draft → configured` from the stored config.
- `buildGreeting()` at `src/app/api/aion/chat/route/prompts.ts:292` returns the appropriate cold-open message for each state — asking about communication style, requesting an example message, collecting guardrails, or offering a test draft.
- The chat route at `src/app/api/aion/chat/route.ts:122` calls `getOnboardingState()` on every request and injects the onboarding instruction into the system prompt (`prompts.ts:275`).
- The `save_voice_config` chat tool at `src/app/api/aion/chat/tools/core.ts:118` saves description, example_message, and guardrails to `workspaces.aion_config` in real-time via `updateAionConfigForWorkspace()`.

Draft generation is live. `/api/aion/draft-follow-up` at `src/app/api/aion/draft-follow-up/route.ts` is a full 74-line route (not a stub) with auth, tier gating, kill-switch check, voice config injection, and usage recording. `generateFollowUpDraft()` at `src/app/api/aion/lib/generate-draft.ts:25` injects `voice.description`, `voice.example_message`, and `voice.guardrails` into the LLM system prompt.

A fallback prevents onboarding from blocking new users. `synthesizeDefaultVoice()` at `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:20` generates a default voice from the workspace name, and `getOnboardingState()` returns `configured` immediately if `voice_default_derived === true`, bypassing the 4-step flow entirely.

"Tune Aion's voice" reset is surfaced in the Aion sidebar overflow (`src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:1043`), calling `resetAionVoiceConfig()` to re-enter the explicit onboarding flow.

## Intended state

Per the queue entry: Daniel opens the Aion chat, describes his communication style in a few paragraphs, and immediately gets a follow-up draft that respects that voice. That is the intended experience.

## The gap

The main question is answered — Phase A infrastructure is in place. Two residual gaps exist:

- **No direct voice editor in Settings.** `AionSettingsView.tsx` only covers beta consent and cadence toggle. The three voice fields (`description`, `example_message`, `guardrails`) are only reachable via chat conversation or the sidebar reset flow. A power user who wants to edit a guardrail directly has no form to do it.
- **`needs_test_draft` requires a queued deal.** The `draft_follow_up` chat tool at `core.ts:334` returns `{ error: 'No deals in the follow-up queue.' }` when the queue is empty. If Daniel sets up voice on a fresh workspace with no queued deals, the 4th onboarding step fails silently. The state machine never reaches `configured` without either: (a) accepting a queue-based draft, or (b) the user saying "I'm done" (the chip value `'I am good for now.'` triggers `save_voice_config` with `onboarding_complete: true`).

## Options

### Option A: Ship the voice editor form in Settings

- **What it is:** Add a `VoiceConfigForm` section to `/settings/aion` with three text areas — communication style, example message, guardrails — backed by `saveAionVoiceConfig()`. Add a "Reset to re-run chat setup" link that calls `resetAionVoiceConfig()`.
- **Effort:** Small (half-day). The server actions exist. This is purely a UI addition to `AionSettingsView.tsx`.
- **Main risk:** Two edit surfaces (chat + form) can drift if the chat tool and form action don't write to the same shape. They currently do (`updateAionConfigForWorkspace` vs `saveAionVoiceConfig` both write to `workspaces.aion_config`) — but the merge logic in `updateAionConfigForWorkspace` does field-level merge while `saveAionVoiceConfig` does a full replace of the `voice` sub-object. A partial chat update followed by a form save could clobber a field.
- **Unlocks:** Power users can inspect and edit their voice config without talking Aion through it.

### Option B: Fix the empty-queue `needs_test_draft` fallback

- **What it is:** In the `draft_follow_up` tool, when the queue is empty, fall back to generating a generic demo draft using the stored voice config and placeholder deal context (e.g., a hypothetical corporate event). The draft clearly labels itself as a demo. This unblocks the 4th onboarding step for a workspace with no deals.
- **Effort:** Small (2 hours). Change is contained to `core.ts:332–334`. The `generateFollowUpDraft()` helper already accepts a context object — pass a synthetic one when no queue item exists.
- **Main risk:** The demo draft might mislead the user into thinking Aion has real deal data when it doesn't. Copy needs to be explicit: "Here is a sample draft based on your voice style — not tied to a real deal."
- **Unlocks:** New workspaces can complete the full 5-step onboarding flow end-to-end before any deals exist.

### Option C: Treat Phase A as done, document it, and move to Phase B

- **What it is:** Accept that Phase A is substantially shipped. Write a short doc (or update the primer) to reflect the actual state. Move planning effort to the next unbuilt increment — likely Phase B (proactive draft suggestions surfacing in the CRM without the user asking, or inbox connection to pull real reply history for `learn-from-edit`).
- **Effort:** Minimal. Update the primer; no code changes.
- **Main risk:** The two gaps above (no form editor, empty-queue draft failure) will surface as friction when real users go through onboarding.
- **Unlocks:** Clears the planning backlog so Phase B work can start with accurate context.

## Recommendation

**Option B first, then Option A.** They are both small, and both remove real friction from the onboarding path. Start with B (2 hours) because the empty-queue failure is a showstopper for the exact scenario in the queue entry — Daniel opens the Aion chat on a fresh workspace, completes the voice steps, hits "Yes, try one," and gets an error. Option A (half-day) is worth doing at the same time because the voice config has no inspection surface today.

Do not treat the gap as blocking. The end-to-end path works on workspaces that already have deals. Option B specifically unlocks it for fresh workspaces.

After these two fixes, Phase A is complete. The primer needs to be updated to reflect that `aion_config` exists, the onboarding machine is wired, and the Brain tab is not paused.

## Next steps for Daniel

1. **Verify end-to-end manually.** Open `/aion` on a workspace with at least one queued deal. Clear the voice config in Supabase (`UPDATE workspaces SET aion_config = '{}' WHERE id = '<your_id>'`), then reload. Confirm the 4-step onboarding runs and produces a real draft.
2. **Fix the empty-queue fallback** at `src/app/api/aion/chat/tools/core.ts:332`. When `queue.length === 0`, build a synthetic demo context and call `generateFollowUpDraft()` with a note that it is a demo.
3. **Add voice editor to Settings.** In `src/app/(dashboard)/settings/aion/AionSettingsView.tsx`, add a `VoiceConfigSection` component with three textareas bound to `saveAionVoiceConfig()`. Use the existing `StagePanel` pattern.
4. **Align the two write paths.** Verify that `updateAionConfigForWorkspace()` and `saveAionVoiceConfig()` produce compatible results if used in sequence. The field-level merge in `updateAionConfigForWorkspace` (`aion-config-actions.ts:271`) should be safe, but confirm with a test.
5. **Update `planning-primer.md`** to reflect that `aion_config` exists, Phase A is live, and the Brain tab is not paused.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — voice config types + server actions
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — `synthesizeDefaultVoice`, `applyVoiceDefaultIfEmpty`
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:224` — `OnboardingState` type + `getOnboardingState()`
- `src/app/api/aion/chat/route/prompts.ts:275` — onboarding injection into system prompt
- `src/app/api/aion/chat/route/prompts.ts:292` — `buildGreeting()` per onboarding state
- `src/app/api/aion/chat/tools/core.ts:118` — `save_voice_config` tool
- `src/app/api/aion/chat/tools/core.ts:318` — `draft_follow_up` tool + empty-queue gap
- `src/app/api/aion/draft-follow-up/route.ts` — direct draft route (74 lines, fully wired)
- `src/app/api/aion/lib/generate-draft.ts` — `generateFollowUpDraft()` with voice injection
- `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` — Settings page (consent-only, no voice editor)
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:1043` — "Tune Aion's voice" overflow item
