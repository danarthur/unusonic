# Aion Phase A: Voice Setup + First Draft — Where Things Actually Stand

_Researched: 2026-11-02 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

**How this was understood:** The queue item was written when Aion was at an early stub. The primer still reflects that state. The answer below is a status correction, not a re-scope — Phase A is shipped; the gap is narrower.

## Current state

The premise of the queue item is outdated. The full onboarding flow and draft pipeline exist in the codebase today.

**`aion_config` column exists** on `public.workspaces`. It is read and written by `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:90,113`.

**The chat route is a full system.** `/api/aion/chat/route.ts:59` is 464 lines: auth guard, per-user rate limiting, tier gate via `canExecuteAionAction`, onboarding state machine, tool-calling loop with `streamText`, rolling summarization, fire-and-forget title generation, token accounting.

**The onboarding state machine is live.** `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` implements `getOnboardingState` → five states: `no_voice → no_example → no_guardrails → needs_test_draft → configured`. Each state has a greeting (`prompts.ts:301`) and a system-prompt instruction block (`prompts.ts:284`).

**`save_voice_config` tool is implemented.** `src/app/api/aion/chat/tools/core.ts:118` — saves description, example_message, guardrails to `aion_config`, marks `onboarding_state = 'complete'` when `onboarding_complete: true`.

**`draft_follow_up` tool is implemented.** `core.ts:318` — loads deal context via `getDealContextForAion`, applies playbook rules, tone-anchors with `getToneAnchor`, enriches with semantic memory, calls the LLM to generate the draft body.

**The Aion page is un-gated.** `/aion/page.tsx:11` renders `<AionPageClient />` directly; no "paused" block.

**However:** a `voice_default_derived` bypass (`aion-config-helpers.ts:35-45`) synthesizes a generic voice from the workspace name on every read when no voice is stored. This means `getOnboardingState` returns `configured` immediately for every fresh workspace — the conversational 4-step onboarding never fires by default. The owner never writes their own voice unless they find "Tune Aion's voice" buried in the sidebar header overflow (`AionSidebar.tsx:1043`).

## Intended state

From the queue item: Daniel opens the Aion tab, writes 3 paragraphs about how he talks to clients, and immediately sees a follow-up draft that sounds like him. The design intent is intentional voice capture (owner's words), not a synthesized stand-in. The conversational flow in the chat route exists for this — it just never activates for new accounts.

## The gap

- **Voice capture is bypassed by default.** `synthesizeDefaultVoice` (`aion-config-helpers.ts:20`) generates a usable but generic placeholder. New owners never hit the onboarding flow.
- **No direct settings form for voice editing.** `AionSettingsView.tsx` covers consent + cadence toggles only. There is no form where an owner can directly write description / example / guardrails as prose. The only editing surface is the conversational chat flow.
- **Voice tuning path is hard to discover.** "Tune Aion's voice" is in the sidebar overflow menu — not on the landing page, not in settings.
- **Test draft fails on empty workspaces.** `draft_follow_up` at `core.ts:332` returns `error: 'No deals in the follow-up queue.'` when there are no deals, breaking the final onboarding step for truly fresh accounts.

## Options

### Option A: Voice setup form in settings
- **What it is:** Add three textarea fields (description, example_message, guardrails) to `AionSettingsView.tsx`, wired to the existing `saveAionVoiceConfig` server action. Load current voice via `getAionConfig()` in the settings page server component. This is the permanent, direct editing surface.
- **Effort:** Small — `saveAionVoiceConfig` (`aion-config-actions.ts:178`) is already written. UI is three textareas + save button.
- **Main risk:** Owner bypasses the guided chat flow and sets a poor voice without feedback on how it sounds.
- **Unlocks:** Direct voice editing at any time; no chat session required; survives the `voice_default_derived` bypass.

### Option B: First-run banner on the Aion page
- **What it is:** When `aionConfig.voice_default_derived === true`, show a one-line banner on the Aion landing page — "Your voice is set to a default. Write a few sentences about how you talk to clients." with a "Set up voice" CTA that calls `resetAionVoiceConfig` and opens the onboarding chat flow.
- **Effort:** Small — server action exists; banner is ~20 lines of UI.
- **Main risk:** User dismisses it and never acts. Doesn't give a direct editing surface.
- **Unlocks:** Guided onboarding for new accounts without requiring the user to find the sidebar overflow.

### Option C: Remove the voice_default_derived bypass for new workspaces
- **What it is:** Instead of synthesizing a default on every read, require conversational onboarding for workspaces with no stored voice. `applyVoiceDefaultIfEmpty` returns the stored config unchanged; `getOnboardingState` returns `no_voice` → onboarding fires.
- **Effort:** Small code change, but medium operational risk — existing workspaces that relied on the default may suddenly enter onboarding mid-session.
- **Main risk:** Breaks UX for existing workspaces that have been operating on the synthetic default without knowing it. Would need a migration to write the current default into the DB for those workspaces.
- **Unlocks:** Forces intentional voice capture for all new accounts.

## Recommendation

Ship **Option A first** (voice form in settings), then **Option B** (first-run banner). This pair costs one short session of work and closes the gap cleanly.

Option A gives the permanent editing surface Daniel described ("write 3 paragraphs"). The form is the right home — owners think of voice setup as configuration, not conversation. `saveAionVoiceConfig` is already implemented; you need the UI.

Option B surfaces it for fresh accounts without the drastic change of removing the default bypass (Option C), which risks a jarring regression for existing workspaces.

Option C is the right long-term direction but needs a migration first — defer it.

To get the "write 3 paragraphs → see a draft" experience today: go to `/settings/aion` (after Option A ships), fill in the three fields, save, then go to `/aion` and ask for a draft. The `draft_follow_up` tool will pick up the saved voice on the next turn.

## Next steps for Daniel

1. Open `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` — add three textarea fields for `voice.description`, `voice.example_message`, `voice.guardrails` with a save button calling `saveAionVoiceConfig`.
2. In `src/app/(dashboard)/settings/aion/page.tsx`, pass current `aionConfig` to `AionSettingsView` — use `getAionConfig()` from `aion-config-actions.ts`.
3. Add a `voice_default_derived` banner to `AionPageClient` (or the Aion landing pane): one sentence + "Set up voice" button that calls `resetAionVoiceConfig` then navigates to settings.
4. Fix the empty-workspace fallback in `draft_follow_up` (`core.ts:332`) — when no queue item exists, offer to draft a hypothetical message rather than erroring.
5. After saving a real voice, verify the draft quality: open `/aion`, type "Draft a follow-up for my top deal" and check that the voice description appears correctly in the draft prompt.
6. Update `planning-primer.md` to reflect the Aion system's actual current state — the April 2026 description is now significantly stale.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:84,178` — getAionConfig, saveAionVoiceConfig
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:20,35` — synthesizeDefaultVoice, applyVoiceDefaultIfEmpty
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — getOnboardingState state machine
- `src/app/api/aion/chat/route.ts:110` — getAionConfigForWorkspace, onboarding state read
- `src/app/api/aion/chat/route/prompts.ts:284,301` — onboarding system-prompt blocks + greetings
- `src/app/api/aion/chat/tools/core.ts:118,318` — save_voice_config + draft_follow_up tools
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:1043` — "Tune Aion's voice" overflow item
- `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` — current settings view (consent + cadence only)
