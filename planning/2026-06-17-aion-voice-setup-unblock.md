# Unblock Aion voice setup + first voice-personalized draft

_Researched: 2026-06-17 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

The primer is significantly out of date. Both premises in the question are false.

**`aion_config` exists and is fully wired.** `public.workspaces.aion_config` is a real JSON column. `getAionConfig()` and `getAionConfigForWorkspace()` read it (`src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:84,106`). `saveAionVoiceConfig()` writes to it (`aion-config-actions.ts:178`). The `AionVoiceConfig` type (`{ description, example_message, guardrails }`) is defined at `aion-config-actions.ts:12`.

**The Brain tab no longer exists.** Aion is a full chat interface at `/aion`, live. `ChatInterface.tsx`, `AionInput.tsx`, and `AionVoice.tsx` are production components, not stubs.

**The 4-step conversational voice onboarding is fully implemented but unreachable.** The state machine (`no_voice → no_example → no_guardrails → needs_test_draft → configured`) lives in `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247`. The greeting builder in `src/app/api/aion/chat/route/prompts.ts:300` returns distinct cold-open messages for each state, and the system prompt injects onboarding instructions at `prompts.ts:275`. The `save_voice_config` tool exists in `src/app/api/aion/chat/tools/core.ts:118`.

**The blocker: `applyVoiceDefaultIfEmpty` always short-circuits onboarding.** At `src/shared/lib/../(features)/aion/actions/aion-config-helpers.ts:35`, every call to `getAionConfig` or `getAionConfigForWorkspace` passes through `applyVoiceDefaultIfEmpty`. When no explicit voice is stored, this injects a synthesized default voice AND sets `voice_default_derived: true`. Then `getOnboardingState` at `aion-chat-types.ts:248` short-circuits immediately to `configured` when it sees that flag. Result: new workspaces always land in `configured` state; the onboarding sequence never fires.

**"Tune Aion's voice" in the sidebar is also broken as a path.** `resetAionVoiceConfig()` (`aion-config-actions.ts:214`) clears the stored voice from the DB. But the very next read calls `applyVoiceDefaultIfEmpty` again, re-synthesizes the default, re-sets `voice_default_derived: true`. The sidebar comment at `AionSidebar.tsx:975` says "the next chat re-enters the explicit no_voice sequence" — that's aspirational; the code doesn't allow it.

**Draft generation is already voice-aware.** `/api/aion/draft-follow-up/route.ts` reads `aionConfig.voice` and passes it to `generateFollowUpDraft` at `src/app/api/aion/lib/generate-draft.ts:26`. `buildFollowUpPrompt` injects `description`, `example_message`, and `guardrails` into the LLM system prompt (`generate-draft.ts:63-74`). All three model tiers are temporarily on Haiku 4.5 (`models.ts:69-73`).

## Intended state

Daniel opens the Aion settings or a dedicated voice setup surface, writes 3 paragraphs describing his communication style, pastes an example message, and notes any guardrails. He saves. Aion immediately generates a follow-up draft for his top open deal using that voice. Every subsequent draft from `/api/aion/draft-follow-up` reflects his actual voice, not the synthesized generic default.

## The gap

- `applyVoiceDefaultIfEmpty` runs on every `getAionConfig` read and always sets `voice_default_derived: true` when no explicit voice is stored, making the 4-step onboarding permanently unreachable.
- No UI surface exists for free-form, non-conversational voice input (the current path requires navigating 4 chat turns, which itself is currently blocked by the above).
- The "Tune Aion's voice" sidebar action (`resetAionVoiceConfig`) clears the voice but doesn't prevent `applyVoiceDefaultIfEmpty` from re-synthesizing on the next read.
- No "save → see instant draft" flow exists for voice setup.

## Options

### Option A: Form-based voice setup on the settings page

- **What it is:** Add a "Voice" section to `src/app/(dashboard)/settings/aion/AionSettingsView.tsx`. Three text areas (`description`, `example_message`, `guardrails`) pre-populated from `synthesizeDefaultVoice(workspaceName)`. Save calls `saveAionVoiceConfig()` directly. After save, fetch and display a draft for the top pending deal via `/api/aion/draft-follow-up`.
- **Effort:** Small — two files: a new `VoiceSetupForm.tsx` component + additions to `AionSettingsView.tsx` + one server action to fetch the draft preview.
- **Main risk:** The settings page is a management surface, not a first-run surface. Daniel has to navigate there; it doesn't surface itself on first open.
- **Unlocks:** Explicit voice, voice-personalized drafts immediately, and `saveAionVoiceConfig` strips `voice_default_derived` so onboarding state reflects the user's actual choice.

### Option B: Fix the onboarding state machine so the conversational 4-step flow is reachable

- **What it is:** Change `resetAionVoiceConfig` to write a `voice_onboarding_requested: true` flag to the DB in addition to clearing the voice. Update `applyVoiceDefaultIfEmpty` to skip synthesis when that flag is present (return config as-is with no voice). The next chat read sees no voice and no `voice_default_derived`, so `getOnboardingState` returns `no_voice` and the 4-step conversational flow fires.
- **Effort:** Small-medium — changes to `aion-config-helpers.ts`, `aion-config-actions.ts` (resetAionVoiceConfig + type), and `aion-chat-types.ts` to understand the new flag.
- **Main risk:** Voice setup through 4 turns of chat is slower and more fragile than a form. The user still has to discover the sidebar overflow to trigger it. A new workspace that has never tuned voice stays on the synthesized default indefinitely unless something nudges them.
- **Unlocks:** The intended conversational onboarding design becomes operational. Sidebar "Tune Aion's voice" works as documented.

### Option C: Inline setup card on the Aion landing page

- **What it is:** When `voice_default_derived === true` on first open of `/aion`, show an inline setup card above the chat: "You're using a generated default voice. Tell Aion how you actually write." with a short free-text field. On submit, call `saveAionVoiceConfig()` and immediately generate a test draft in-thread. After that, the card dismisses and the chat is in the standard `configured` flow.
- **Effort:** Medium — new UI component, modifications to `AionPageClient.tsx` / `ChatInterface.tsx`, data fetching for the post-save draft.
- **Main risk:** More moving parts; requires touching the chat landing pane which has accumulated significant logic. Risk of regressions.
- **Unlocks:** First-open impression: the user sees the setup prompt and gets a draft in one flow without leaving the Aion page.

## Recommendation

Ship **Option A** first. It's the minimum-viable path to Daniel's stated goal — "write 3 paragraphs, see a draft" — and it's isolated to the settings page, so there's no risk of breaking the live chat flow. The form model maps naturally to "3 paragraphs": `description` is the style paragraph, `example_message` is the sample message, `guardrails` is the rules paragraph.

Then ship **Option B** as a follow-on: the fix is small (~15 lines across 2 files), it makes the sidebar "Tune Aion's voice" work correctly, and it unblocks the conversational onboarding path for users who prefer it. B is not a prerequisite for the draft use case; it's a correctness fix for the state machine.

Skip Option C for now. The first-open inline card is the right long-term UX but has more blast radius. Ship it after A and B are stable.

## Next steps for Daniel

1. Open `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` and add a `VoiceSection` component below the cadence learning block — three `<textarea>` fields wired to local state.
2. Create `src/app/(dashboard)/settings/aion/VoiceSetupForm.tsx` that reads `synthesizeDefaultVoice(workspaceName)` to pre-populate placeholders (import from `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts`).
3. On save: call `saveAionVoiceConfig(voice)` (already a server action), then call `POST /api/aion/draft-follow-up` with the top pending deal from `ops.follow_up_queue` and render the draft inline.
4. For Option B (after A): in `aion-config-actions.ts`, update `resetAionVoiceConfig` to set `voice_onboarding_requested: true` in the update payload. In `aion-config-helpers.ts`, update `applyVoiceDefaultIfEmpty` to skip synthesis when `config.voice_onboarding_requested === true`.
5. Add `voice_onboarding_requested?: boolean` to `AionConfig` type at `aion-config-actions.ts:50`.
6. Smoke-test: save a voice from the settings form, open a pending deal, click "Draft follow-up" — verify the draft text reflects the saved voice, not the generic default.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — `AionConfig`, `saveAionVoiceConfig`, `resetAionVoiceConfig`, `getAionConfigForWorkspace`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35` — `applyVoiceDefaultIfEmpty` (the blocker)
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — `getOnboardingState` 5-state machine
- `src/app/api/aion/chat/route/prompts.ts:275,300` — onboarding system prompt injection + greeting builder
- `src/app/api/aion/lib/generate-draft.ts:52` — `buildFollowUpPrompt` (voice injection into LLM prompt)
- `src/app/api/aion/draft-follow-up/route.ts` — live draft route (auth + tier gated, voice-aware)
- `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` — target file for the form addition
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:975` — sidebar comment vs. actual behavior mismatch
