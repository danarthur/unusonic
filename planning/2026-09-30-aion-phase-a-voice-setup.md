# Aion Phase A: Voice Setup and First Real Draft

_Researched: 2026-09-30 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

**The question's stated prerequisites are already shipped.** The primer's April 2026 snapshot is stale. As of the current codebase:

`public.workspaces.aion_config` exists and is typed. `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:84` reads it via `getAionConfig()` and `getAionConfigForWorkspace()`. The `AionConfig` type (`aion-config-actions.ts:50`) carries `voice`, `learned`, `follow_up_playbook`, `onboarding_state`, `kill_switch`, and `voice_default_derived`.

A 5-state onboarding machine exists at `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247`. States: `no_voice → no_example → no_guardrails → needs_test_draft → configured`. New workspaces skip the forcing block via `voice_default_derived` (synthesized from the workspace name).

The chat route at `src/app/api/aion/chat/route.ts` is fully operational: auth guard, tier gating, system prompt with voice injection, tool-calling loop (up to 10 steps), streaming. It is not a stub.

The `save_voice_config` tool (`src/app/api/aion/chat/tools/core.ts:118`) persists voice fields conversationally by calling `updateAionConfigForWorkspace`. The LLM calls it whenever the user describes their communication style, pastes an example, or states guardrails.

Draft generation respects voice at `src/app/api/aion/chat/tools/core.ts:36` (`buildDraftPrompt` injects `voice.description`, `voice.example_message`, `voice.guardrails` into the generation prompt). The `/api/aion/draft-follow-up` route (`draft-follow-up/route.ts:60`) passes `aionConfig.voice` to `generateFollowUpDraft`. The feedback loop closes via `src/app/api/aion/learn-from-edit/route.ts`, which extracts vocabulary from edits.

The "Brain Mode is paused" string no longer exists in the codebase. The `/aion` page (`src/app/(dashboard)/aion/page.tsx`) renders `AionPageClient` which renders `ChatInterface`.

**The one genuine gap:** there is no standalone voice-setup form in `/settings/aion`. Voice is configured only conversationally (via `save_voice_config` tool) or reset via the sidebar overflow. The `/settings/aion` page (`AionSettingsView.tsx`) covers consent, cadence opt-in, and memory backfill — not voice config.

## Intended state

The goal from the queue item: Daniel opens a tab, writes 3 paragraphs about how he talks to clients, and immediately sees an Aion-generated follow-up draft that respects that voice. The conversational flow handles this today — but it depends on LLM-driven turn-taking, not a deterministic form. The intended state is a reliable, repeatable setup path where the voice → draft connection is visible and immediate, not implied by chat behavior.

## The gap

- No dedicated voice config form in `/settings/aion` (3 fields: description, example_message, guardrails)
- No "Generate test draft" button wired to `/api/aion/draft-follow-up` with a sample context immediately after voice is set
- The "first draft" moment is gated on LLM initiative during chat, not on user action in a form
- The settings page lacks a read-back of the current voice config ("Here is what Aion knows about your style")

## Options

### Option A: Do nothing — use the existing conversational flow

- **What it is:** The onboarding chat sequence is already functional. Document the user journey ("say this to Aion to set up your voice") and treat the current state as complete.
- **Effort:** Small
- **Main risk:** Conversational onboarding has no guaranteed completion path; users who skip or diverge leave `aion_config.voice` partially filled and drafts underperform silently.
- **Unlocks:** Nothing new. Closes the original question without any code change.

### Option B: Add voice config form to `/settings/aion` with inline test draft

- **What it is:** Three labeled text areas (communication style, example message, guardrails) rendered in a `StagePanel` at `src/app/(dashboard)/settings/aion/AionSettingsView.tsx`. On save, calls `saveAionVoiceConfig`. A "Generate test draft" button calls `/api/aion/draft-follow-up` with a hardcoded sample context (deal title "Sample Concert", status "proposal") and renders the result inline. The existing `resetAionVoiceConfig` already surfaces the reset path in the sidebar.
- **Effort:** Medium (new form component + wiring the draft call, no DB migration needed)
- **Main risk:** The test draft uses a fake context — could feel disconnected if the user has no real deals yet.
- **Unlocks:** Reliable, form-based setup path; owner can see and edit their voice config at any time without going through chat; the draft result proves the connection is live.

### Option C: Show a "Set up your voice" prompt card on first Aion chat open

- **What it is:** When `getOnboardingState` returns `no_voice`, render a modal or inline prompt card above the chat input asking for 3 free-form paragraphs, then call `saveAionVoiceConfig` directly from the client on submit (skipping the LLM). Immediately generate a test draft via `/api/aion/draft-follow-up` and show it in the chat thread.
- **Effort:** Medium (new modal component, but no settings page changes)
- **Main risk:** Adds another modal surface; conflicts slightly with the existing conversational onboarding path that already handles `no_voice` state.
- **Unlocks:** The exact flow the queue item described — write, submit, see draft — but lives in chat rather than settings.

## Recommendation

**Option B.** Add the voice config form to `/settings/aion`.

Option A is not acceptable because the conversational path has no completion guarantee. Option C introduces a modal that conflicts with the existing `no_voice` LLM flow. Option B is additive: it does not break the conversational path, it gives the owner a canonical place to see and edit their voice config, and the inline test draft makes the voice → draft connection tangible.

The tradeoff to accept: the test draft uses fake context. That's fine — the point is proving the pipeline is wired, not producing a production-ready draft. Once the owner has one real deal, the actual `/api/aion/draft-follow-up` call from the deal card is the main path anyway.

The `voice_default_derived` flag means most owners will already have a synthesized voice and will land in `configured` state. Option B gives them a way to inspect and override that synthesized default without going through the reset → conversational re-onboarding cycle.

## Next steps for Daniel

1. Open `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` and add a `VoiceConfigSection` component below the existing `CadenceLearningToggle` block.
2. The section renders three `<textarea>` fields bound to `description`, `example_message`, `guardrails`. Pre-fill from the server-loaded `state.voiceConfig` prop (fetch via `getAionConfig()` in the settings page server action, same pattern as `getWorkspaceFeatureState()`).
3. On "Save voice" button: call `saveAionVoiceConfig(voice)` (already exported from `aion-config-actions.ts:178`). Toast on success, call `router.refresh()`.
4. Add a "Generate test draft" button below the form. On click: POST to `/api/aion/draft-follow-up` with `{ workspaceId, context: SAMPLE_CONTEXT }` where `SAMPLE_CONTEXT` is a minimal `AionDealContext` (title, client name, no real deal ID needed). Render the returned `{ draft, channel }` inline.
5. Wire `voiceConfig` into the settings page server component: add `getAionConfig()` call alongside the existing `getWorkspaceFeatureState()` and pass it as a prop to `AionSettingsView`.
6. Ship. No DB migration required — `aion_config` column already accepts arbitrary JSONB.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — `AionConfig`, `saveAionVoiceConfig`, `resetAionVoiceConfig`, `getAionConfigForWorkspace`
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — `getOnboardingState`
- `src/app/api/aion/chat/tools/core.ts:118` — `save_voice_config` conversational tool
- `src/app/api/aion/draft-follow-up/route.ts` — draft generation endpoint
- `src/app/api/aion/lib/tone-anchoring.ts` — observed-style system; note it is distinct from explicit voice config
- `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` — target file for voice form
- `src/app/(dashboard)/settings/aion/page.tsx` — server component to update with `getAionConfig()` fetch
