# Aion Phase A: voice setup + first real draft

_Researched: 2026-09-09 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

> **Note on premise:** Both premises in the question are outdated. The Brain tab is fully live (`AionPageClient.tsx:73` mounts a `ChatInterface` with `viewState="chat"`). `public.workspaces.aion_config` exists and is actively read/written. Phase A was largely completed between April and September 2026. The remaining gap is narrower than described — see below.

## Current state

**`aion_config` JSONB column on `public.workspaces` is live.** `getAionConfig()` reads it with a `name, aion_config` select (`aion-config-actions.ts:94`). `saveAionVoiceConfig` writes to it (`aion-config-actions.ts:198`). `getAionConfigForWorkspace` exists for API route handlers (`aion-config-actions.ts:106`).

**`AionVoiceConfig` type is defined** with three fields: `description`, `example_message`, `guardrails` (`aion-config-actions.ts:12-16`).

**`/api/aion/draft-follow-up` is live.** Auth-gated, tier-gated, kill-switch checked. Loads voice config and passes it to `generateFollowUpDraft` which injects it into the system prompt (`draft-follow-up/route.ts:53-65`, `generate-draft.ts:62-75`).

**A 5-state onboarding machine is implemented.** States: `no_voice → no_example → no_guardrails → needs_test_draft → configured` (`aion-chat-types.ts:225-257`). The chat route passes `onboardingState` to `buildSystemPrompt` and `buildGreeting`. When state is `no_voice`, the greeting asks "How would you describe your style?" with chips. When state is `needs_test_draft`, it offers a test draft from the top active deal (`prompts.ts:310-347`).

**The gap is the auto-synthesized default.** `applyVoiceDefaultIfEmpty` in `aion-config-helpers.ts:35-45` generates a voice from the workspace name and sets `voice_default_derived: true` on every read where no voice is stored. `getOnboardingState` returns `'configured'` immediately when `voice_default_derived === true` (`aion-chat-types.ts:248`). Result: a fresh workspace opening the Brain tab today sees the `configured` pull-mode greeting, not the voice setup conversation. The onboarding flow exists but never fires.

## Intended state

A new workspace owner opens the Brain tab for the first time and is walked through voice setup conversationally: describe your style (free-form or chips), paste an example message, state any rules. After the third field is saved, Aion immediately offers a draft from the highest-priority active deal. The owner edits the draft, confirms, and the loop closes. Voice is stored in `aion_config.voice`; the next draft call uses it.

The "Tune Aion's voice" overflow item in the `AionSidebar` (`AionSidebar.tsx:31-32`) calls `resetAionVoiceConfig` to re-enter this flow — so the mechanism exists. What's missing is that new workspaces never hit it the first time.

## The gap

- `applyVoiceDefaultIfEmpty` fires on every `getAionConfig` call for a workspace with no stored voice, injecting a synthesized default and setting `voice_default_derived: true`.
- This causes `getOnboardingState` to skip all four onboarding steps and return `'configured'`.
- New workspaces that have never touched voice config never see the onboarding chat.
- Tone anchoring (`tone-anchoring.ts`) from sent messages is a parallel system — valuable once messages exist, but a new workspace has zero outbound messages, so it falls back to `DEFAULT_PREAMBLE` anyway.

## Options

### Option A: Remove the auto-synthesize bypass for new workspaces

- **What it is:** Change `applyVoiceDefaultIfEmpty` to only inject the synthesized default when the workspace has at least N sent messages (or some signal of use), not on the very first read. New workspaces hit `no_voice` and see the onboarding chat.
- **Effort:** Small — 1–2 lines in `aion-config-helpers.ts`.
- **Main risk:** Existing workspaces that silently got `voice_default_derived: true` and skipped setup still have a generic voice. Not a regression, but not an improvement for them either.
- **Unlocks:** Every new workspace now goes through the voice setup chat naturally. The "3 paragraphs → draft" flow the queue item describes becomes the default first-open experience.

### Option B: Standalone voice setup form in settings

- **What it is:** Add a `VoiceSetupForm` component to `src/app/(dashboard)/settings/aion/` with three textareas (description, example_message, guardrails) wired to `saveAionVoiceConfig`. Surface it in `AionSettingsView` alongside the card beta section.
- **Effort:** Medium — new component, server action already exists, but needs design pass.
- **Main risk:** Disconnected from the "immediately see a draft" part of the goal. User saves voice in settings, then has to navigate to the Brain tab to test it.
- **Unlocks:** An explicit, always-accessible form for updating voice without re-doing the onboarding chat.

### Option C: First-open modal when default voice is detected

- **What it is:** In `ChatInterface`, check if `onboardingState === 'configured' && config.voice_default_derived === true`. If so, render a modal with three textareas. On submit, call `saveAionVoiceConfig`, then immediately trigger a draft from the top deal.
- **Effort:** Large — new component, requires fetching config client-side, modal UX to get right.
- **Main risk:** Adds client-side config fetching to the chat page, which already fetches on the server side. Doubles the round-trip.
- **Unlocks:** Exactly the "open Brain tab → fill form → see draft" experience. But the conversational flow (Option A) achieves the same end with less code.

## Recommendation

**Option A.** The conversational onboarding flow is already built, tested, and handles exactly what the queue item asks for: description (chips + free-form), example message, guardrails, then a test draft from the top active deal. The only reason it never fires is the auto-synthesize bypass. Removing that bypass for workspaces with no stored voice is a 2-line change and delivers the complete experience with no new UI.

Option B is worth doing eventually, but it should be additive — a "retune" surface in settings for established workspaces who want to update their voice without re-doing the chat. Not the first-open path.

Option C adds complexity and client-side config fetching without delivering anything the conversational flow doesn't already provide.

Accept the tradeoff: existing workspaces that already got `voice_default_derived: true` will stay configured with the generic default until they use "Tune Aion's voice" from the sidebar. That's a soft landing, not a regression.

## Next steps for Daniel

1. In `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts`, change `applyVoiceDefaultIfEmpty` to return the config unchanged when there is no stored voice (remove the synthesized-default injection). Or, gate it: only inject if `onboarding_state === 'complete'` is already set.
2. On next Brain tab open for a workspace with no stored voice, `getOnboardingState` will return `'no_voice'` and the greeting fires the 3-step conversational setup.
3. Verify the `save_voice_config` tool in `src/app/api/aion/chat/tools/core.ts` still writes `onboarding_state: 'complete'` after the `needs_test_draft` step so the flow terminates.
4. Test with a fresh workspace: open Brain tab → see "How would you describe your style?" greeting → complete all steps → confirm draft is generated using the saved voice.
5. Optional follow-up (Option B): add `VoiceSetupForm` to `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` so established workspaces have an explicit retune path without the sidebar overflow affordance.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35-45` — `applyVoiceDefaultIfEmpty` (the bypass to remove)
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247-257` — `getOnboardingState` state machine
- `src/app/api/aion/chat/route/prompts.ts:284-292, 310-347` — onboarding forcing block + per-state greetings
- `src/app/api/aion/draft-follow-up/route.ts` — live draft generation route
- `src/app/api/aion/lib/generate-draft.ts:62-75` — voice config injection in `buildFollowUpPrompt`
- `src/app/api/aion/lib/tone-anchoring.ts` — parallel style system from sent messages
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — all config read/write actions
