# Aion Phase A: voice setup + first real draft

_Researched: 2026-10-14 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

The premise of this question is outdated. Both blockers it names are resolved.

**`aion_config` exists.** `public.workspaces` already has an `aion_config: Json` column. `getAionConfigForWorkspace()` reads it at `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:106`. The type is `AionConfig` with a `voice: AionVoiceConfig` sub-object (`description`, `example_message`, `guardrails`) defined at `aion-config-actions.ts:12–16`.

**The chat is live.** `/aion` renders `ChatInterface` at `src/app/(dashboard)/aion/AionPageClient.tsx:73`. The route (`src/app/api/aion/chat/route.ts`) has full auth, tier gate, kill-switch check, model routing, tool calling, and streaming.

**The onboarding state machine exists.** Five states (`no_voice → no_example → no_guardrails → needs_test_draft → configured`) are defined at `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:225–257`. `buildGreeting()` returns distinct prompts for each state at `src/app/api/aion/chat/route/prompts.ts:309–347`. Aion's system prompt carries `=== ONBOARDING ===` instructions at `prompts.ts:284–292`.

**The draft pipeline is fully wired.** `/api/aion/draft-follow-up` is live, auth-gated, and injects voice config into the prompt at `src/app/api/aion/lib/generate-draft.ts:52–76`. A `draft_follow_up` chat tool exists at `src/app/api/aion/chat/tools/core.ts:318` that Aion calls when the user says "yes, try one." `DraftPreviewCard` renders the result with an editable textarea and copy/send at `src/app/(dashboard)/(features)/aion/components/DraftPreviewCard.tsx:31`. The `learn-from-edit` route at `/api/aion/learn-from-edit/route.ts` closes the feedback loop by extracting vocabulary swaps from heavy draft edits.

**The blocker is the `voice_default_derived` short-circuit.** `getAionConfig()` synthesizes a default voice from the workspace name when no voice is stored, and marks the config `voice_default_derived: true` (`aion-config-actions.ts:98–100`, `aion-config-helpers.ts:35–45`). `getOnboardingState()` returns `'configured'` immediately when that flag is set (`aion-chat-types.ts:248`). New workspaces therefore skip the 4-step onboarding entirely and land in `configured` pull-mode. The synthesized default is reasonable but generic; Daniel's actual voice never gets collected.

## Intended state

Daniel opens `/aion`, is prompted for his communication style, pastes or types 3 paragraphs, Aion saves them to `aion_config.voice`, then offers a test draft against a live deal. Daniel edits the draft, and the `learn-from-edit` route captures the deltas as vocabulary swaps. On the next draft, the voice is noticeably tighter.

The building blocks are all there. The only thing missing is an entry point that reliably puts Daniel into `no_voice` state so the existing flow takes over.

## The gap

- `voice_default_derived` short-circuit means the 4-step onboarding flow never fires for new (or current) workspaces.
- "Tune Aion's voice" in the sidebar overflow (`resetAionVoiceConfig`, `aion-config-actions.ts:214`) does clear the flag — but it is buried in a three-dot menu that Daniel does not know to look for.
- No test-draft entry point exists outside the onboarding flow; the `draft_follow_up` chat tool is only surfaced when onboarding state is `needs_test_draft`.

## Options

### Option A: Surface the reset affordance + run the existing flow

**What it is:** Add a visible "Set up Aion's voice" call-to-action to the Aion chat landing screen when the workspace has `voice_default_derived === true`. It calls `resetAionVoiceConfig()` and reloads the chat, entering `no_voice` state. The existing 4-step conversational onboarding handles the rest. No new backend work.

**Effort:** Small — one conditional banner/button in `AionLandingStarters.tsx` or `ChatInterface.tsx`, reading `voice_default_derived` from the config server prop.

**Main risk:** The conversational onboarding collects voice across 4 separate chat exchanges. Writing "3 paragraphs" in a single message is natural; asking for each field one at a time feels fragmented.

**Unlocks:** End-to-end pipeline validated today with no new API routes or schema changes.

### Option B: Add a voice setup form to settings

**What it is:** A new section in `/settings/aion` (alongside `AionSettingsView`) with three labeled textareas (`description`, `example_message`, `guardrails`). Pre-filled from current config. "Save and test draft" button calls `saveAionVoiceConfig()` then navigates to `/aion` with a query param that triggers a test draft immediately on open.

**Effort:** Medium — ~200 lines of UI, no backend changes. Requires reading a deal from the follow-up queue to populate the test draft context.

**Main risk:** The settings page is a side trip; Daniel has to leave the chat context to set up the voice, then come back.

**Unlocks:** A permanent, revisable voice config surface. Also the right home for advanced tuning after the initial setup.

### Option C: Teach the chat to extract voice from a free-form paste

**What it is:** Add a `save_voice_config` chat tool (or extend the existing one) that Aion calls when it detects a multi-paragraph voice description. Update the system prompt to recognize "here is how I write" or a pasted block as onboarding input, structure it into the 3 fields via a quick `generateText` extraction call, save, and immediately offer a test draft — all in one chat turn.

**Effort:** Medium — new prompt instructions, one LLM extraction call in the tool handler, plus a gate to prevent misfires on normal chat messages.

**Main risk:** LLM extraction of `description` / `example_message` / `guardrails` from free-form prose can be unreliable; a weak extraction produces a subtly wrong voice that degrades all future drafts silently.

**Unlocks:** The most natural "write how you talk → get a draft" UX. No forms, no mode switch.

## Recommendation

**Option A first, Option B as the follow-on.** Here is why.

The pipeline is already built. The bottleneck is a missing entry point, not a missing feature. Option A surfaces that entry point in an afternoon and lets Daniel validate the full loop — voice setup → test draft → edit → learn — against his real data. If the conversational 4-step flow feels clunky after trying it, that is useful signal for how to prioritize Option B.

Option C has the right end-state UX but the extraction fidelity risk is real. A misclassified paragraph silently produces weaker drafts, and Daniel will not know why. Better to have the structured form (Option B) as the permanent home and improve the chat interface on top of confirmed data rather than rely on LLM extraction as the source of truth.

The tradeoff accepted: the `no_voice` chat onboarding is a bit stilted (4 separate prompts). That is fine for a test run. If it remains the primary path long-term, replace it with the form in Option B; Option A's surfacing work stays valid as the entry point from the chat itself.

## Next steps for Daniel

1. Open `src/app/(dashboard)/(features)/aion/components/AionLandingStarters.tsx` and add a "Set up your voice" chip or banner that appears when `voice_default_derived === true` in the config prop.
2. Wire that chip to call `resetAionVoiceConfig()` from `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:214`, then `router.refresh()` to reload the chat in `no_voice` state.
3. Open `/aion` on your own workspace, click the chip, and run through the conversational voice setup to confirm the 4-step flow still works end-to-end.
4. At `needs_test_draft`, say "Yes, try one" and confirm the `draft_follow_up` tool produces a `DraftPreviewCard` with voice-matched copy.
5. Edit the draft heavily, confirm `learn-from-edit` fires (check the network tab for the POST to `/api/aion/learn-from-edit`).
6. If the conversational flow feels too fragmented, file Option B (settings form with 3 labeled textareas + "Save and test") as the next sprint item.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — `AionVoiceConfig`, `getAionConfigForWorkspace`, `saveAionVoiceConfig`, `resetAionVoiceConfig`, `updateAionConfigForWorkspace`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — `synthesizeDefaultVoice`, `applyVoiceDefaultIfEmpty`
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts` — `OnboardingState`, `getOnboardingState`
- `src/app/api/aion/chat/route/prompts.ts` — `buildSystemPrompt` (onboarding injections), `buildGreeting`
- `src/app/api/aion/lib/generate-draft.ts` — `generateFollowUpDraft`, `buildFollowUpPrompt`
- `src/app/api/aion/draft-follow-up/route.ts` — live draft route
- `src/app/api/aion/learn-from-edit/route.ts` — edit-learning feedback loop
- `src/app/api/aion/chat/tools/core.ts:318` — `draft_follow_up` chat tool
- `src/app/(dashboard)/(features)/aion/components/DraftPreviewCard.tsx` — draft UI
- `src/app/(dashboard)/aion/AionPageClient.tsx` — `/aion` page shell
