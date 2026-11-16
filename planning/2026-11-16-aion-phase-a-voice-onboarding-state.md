# Aion Phase A: Voice Setup + First Draft — Current State

_Researched: 2026-11-16 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

**Research note:** Both premises in this question are now false. The queue entry was written against the April 2026 state (reflected in the primer). By November 2026, Phase A has been fully shipped. This document describes what exists, identifies the remaining discoverability gap, and recommends the next concrete step.

## Current state

**`aion_config` exists and is fully populated.** `public.workspaces.aion_config` is a JSONB column storing `AionVoiceConfig` (`{description, example_message, guardrails}`), `AionLearnedConfig`, `AionFollowUpPlaybook`, and onboarding state flags. `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:50` defines the full `AionConfig` type. `saveAionVoiceConfig`, `getAionConfig`, and `resetAionVoiceConfig` all exist and are wired.

**The 5-state onboarding machine is live.** `aion-chat-types.ts:226` defines the states (`no_voice → no_example → no_guardrails → needs_test_draft → configured`). `src/app/api/aion/chat/route/prompts.ts:284-291` injects an `=== ONBOARDING ===` block when the state is not `configured`, and `buildGreeting` at line 309 returns state-matched cold-open messages including chips, example-message prompts, and a test-draft offer.

**The chat route is production-grade.** `/api/aion/chat/route.ts` has auth, rate limiting, tier gating, streaming, tool-calling, model selection, session summarization, and vocabulary injection. It is not the 16-line GPT-4-turbo stub the primer describes.

**Draft generation is live and voice-aware.** `/api/aion/draft-follow-up/route.ts` calls `generateFollowUpDraft` from `src/app/api/aion/lib/generate-draft.ts:25`. That function injects `voice.description`, `voice.example_message`, and `voice.guardrails` as prompt sections when they exist (`generate-draft.ts:63`).

**The onboarding bypass.** `applyVoiceDefaultIfEmpty` (`aion-config-helpers.ts:35`) synthesizes a default voice from the workspace name on every config read and sets `voice_default_derived: true`. `getOnboardingState` (`aion-chat-types.ts:248`) returns `'configured'` immediately when `voice_default_derived` is set. This means any workspace that has not explicitly configured voice is silently bumped to `configured`, skipping the 4-step collection conversation entirely.

**Voice reset is accessible but buried.** The only current path to trigger the onboarding flow on an existing workspace is AionSidebar overflow → "Tune Aion's voice" → calls `resetAionVoiceConfig` (`AionSidebar.tsx:1002`). This strips `voice`, `voice_default_derived`, and `onboarding_state`, so the next cold-open fires `no_voice` state.

## Intended state

The queue question's goal: open Aion, describe how you talk to clients in 3 paragraphs, immediately see a draft for a real deal that respects that voice. That journey requires the user to land in `no_voice` state so the onboarding conversation fires, complete all 4 steps, then get a live draft against a real queue item.

The design intended the bypass (`voice_default_derived`) to remove friction for new workspaces. But it also silently skips the voice setup for anyone who never went through the explicit flow — including Daniel, unless he has already used "Tune Aion's voice".

## The gap

- New workspaces (and existing ones pre-dating the explicit flow) are auto-promoted to `configured` via synthesized default voice. The 4-step onboarding conversation never fires unless the user finds "Tune Aion's voice" in the sidebar overflow.
- The `needs_test_draft` greeting offers a draft but only says "want me to try one?" — it does not automatically target a real deal from the follow-up queue. A workspace with no active deals would get a hollow offer.
- No discoverability path: new Aion users land in pull-mode chat with no prompt to configure voice. The existing `AionFirstVisitPrompt` handles feature consent, not voice.

## Options

### Option A: Run the existing flow now
- **What it is:** From the AionSidebar overflow on the `/aion` page, click "Tune Aion's voice." This calls `resetAionVoiceConfig`, clears the bypass flag, and the next cold-open fires `no_voice` state. Daniel writes about his style, Aion collects example + guardrails, then offers a test draft against a real deal.
- **Effort:** Small — zero code changes. 5 minutes of UI interaction.
- **Main risk:** Daniel may need to know to look in the sidebar overflow; this is not prominently signposted.
- **Unlocks:** Daniel experiences the full onboarding loop and validates whether the voice actually improves draft quality before any further engineering.

### Option B: First-visit voice prompt
- **What it is:** Add a first-visit check in `AionPageClient.tsx` analogous to `AionFirstVisitPrompt`. When `voice_default_derived === true` (synthesized, never explicitly set) and no prior voice-prompt dismissal in localStorage, surface a modal or inline callout: "Aion is using a default voice for your workspace. Spend 2 minutes customizing it." Button calls `resetAionVoiceConfig` and starts a new session.
- **Effort:** Small — one new component (~60 lines), one server action call, one localStorage key.
- **Main risk:** Adds another onboarding modal to an already modal-heavy first run. Timing matters.
- **Unlocks:** Every new workspace owner encounters the voice setup path without hunting in the overflow.

### Option C: Auto-inject voice into the `needs_test_draft` draft
- **What it is:** When the user accepts the test-draft offer in `needs_test_draft` state, pre-fill the deal context with the top queued deal from `ops.follow_up_queue` instead of waiting for Aion to call `draft_follow_up` via conversation. The draft appears without a second user turn.
- **Effort:** Medium — requires the chat route to detect the `needs_test_draft` + "yes" pattern and auto-call the draft tool, or requires a synthetic message injection in the greeting path.
- **Main risk:** Adds complexity to the synthetic-message path (already handling `[arg-edit]` and `[open-pin]`). Tight coupling between onboarding state and queue availability.
- **Unlocks:** One-turn voice-to-draft experience: configure voice → "yes" → see draft. Exactly what the queue question described.

## Recommendation

**Start with Option A.** The experience Daniel described is already live; it just requires triggering the onboarding reset. Run "Tune Aion's voice" from the sidebar, go through the 4 steps, and evaluate draft quality. This takes 5 minutes and produces the validation data needed to decide whether Option B or C is worth building.

If the experience is good and worth making automatic for new workspaces, ship Option B next — it is small and directly serves discoverability without touching the routing logic. Option C is appealing but adds non-trivial complexity to an already intricate message-handling pipeline; defer it until the conversation-based onboarding path proves insufficient.

## Next steps for Daniel

1. Open `/aion` and find the sidebar (panel icon, top-left of the chat interface).
2. Click the three-dot overflow in the sidebar header → "Tune Aion's voice." This triggers `resetAionVoiceConfig`.
3. Close and reopen Aion — the cold-open should fire the `no_voice` greeting asking about communication style.
4. Describe your style, paste an example message, and add any guardrails over 3–4 conversational turns.
5. When the test-draft offer appears, pick a real deal from your queue and evaluate the output against your actual voice.
6. If voice-to-draft quality is good, consider Option B (first-visit prompt at `src/app/(dashboard)/aion/AionPageClient.tsx`) to surface this path for all new workspace owners.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — `AionConfig` type, `saveAionVoiceConfig`, `resetAionVoiceConfig`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — `applyVoiceDefaultIfEmpty`, `synthesizeDefaultVoice`
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:226` — `OnboardingState` type and `getOnboardingState`
- `src/app/api/aion/chat/route/prompts.ts:284` — onboarding state injection in system prompt
- `src/app/api/aion/chat/route/prompts.ts:309` — `buildGreeting` with per-state cold-opens
- `src/app/api/aion/lib/generate-draft.ts:52` — `buildFollowUpPrompt` with voice injection
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:1002` — "Tune Aion's voice" reset action
- `src/app/(dashboard)/aion/AionPageClient.tsx` — entry point for Option B
