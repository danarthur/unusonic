# Aion Phase A: Voice Setup to First Real Draft

_Researched: 2026-11-26 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

**How I understood it:** The queue item was written against the primer's April 2026 state. The codebase has moved ahead of that description. This doc covers what that means for the goal and what the actual next step is.

## Current state

The two premises in the question are outdated.

**`aion_config` does exist.** `public.workspaces.aion_config` is a JSONB column, added in `supabase/migrations/pre-baseline/20260407140000_aion_voice_foundation.sql`. It is live and in active use. `getAionConfig` and `getAionConfigForWorkspace` both read from it (`aion-config-actions.ts:84`, `aion-config-actions.ts:106`). `saveAionVoiceConfig` and `updateAionConfigForWorkspace` write to it.

**The Aion chat system is fully wired.** `/api/aion/chat/route.ts` is a production-grade route: auth, tier gate, system prompt, tool assembly, streaming via `streamText`. `ChatInterface.tsx` is an ~800-line fully functional chat UI with sessions, sidebar, streaming, and edit/resend. The `/aion` page is live.

**The 4-step onboarding state machine is complete.** `getOnboardingState` in `aion-chat-types.ts:247` drives a `no_voice → no_example → no_guardrails → needs_test_draft → configured` flow. Each state gets its own greeting and system-prompt instruction (`prompts.ts:284–291`, `prompts.ts:308–348`). The `save_voice_config` tool (wired at `core.ts:118`) saves description, example_message, guardrails, and an `onboarding_complete` flag in one call. The `draft_follow_up` tool (`core.ts:318`) triggers `generateFollowUpDraft` which injects the saved voice config into the prompt (`generate-draft.ts:52–75`).

**The gap in user experience, not plumbing.** A new workspace with no voice config today sees: "Hey, I'm Aion — how would you describe your style?" The user picks a chip or types. Aion saves `description`. On the next session open, Aion asks for an example. Then guardrails. Then offers a test draft. That is 4 conversational turns across 3+ session loads to get to a draft. The goal is 3 paragraphs → immediate draft in one interaction.

## Intended state

Daniel opens the Aion page (or a dedicated voice-setup surface), writes three paragraphs covering his style, an example message, and any rules — in one form or one long message — and Aion immediately generates a draft that uses that voice. This is the "magic moment" that makes Aion's value legible on first contact.

## The gap

- The current path requires 4 conversational turns across 3 session loads to complete voice setup. No form-based shortcut exists.
- The `needs_test_draft` greeting offers a draft but it requires a deal in the queue; a fresh workspace with no deals can reach this state with nowhere to draft to.
- `AionVoice.tsx` is a mic recorder, not a voice setup form — the name is confusing but it is unrelated.
- The sidebar's "Tune Aion's voice" affordance (mentioned in `aion-config-actions.ts:213`) exists as a `resetAionVoiceConfig` call but no dedicated form component is wired to it yet.

## Options

### Option A: VoiceSetupForm as a dedicated panel in the Aion settings or sidebar

- **What it is:** A new `VoiceSetupForm` component with three textareas (style, example, guardrails) that calls `saveAionVoiceConfig` directly, then immediately POSTs to `/api/aion/draft-follow-up` with the highest-priority deal from the follow-up queue, and renders the resulting draft inline.
- **Effort:** Small. The server action (`saveAionVoiceConfig`) and the draft route (`/api/aion/draft-follow-up`) both exist. The form is new UI only. Mount in `AionSettingsView` or the sidebar overflow.
- **Main risk:** If no deals are in the queue yet, the draft call has nothing to draft for. Need a graceful fallback ("Voice saved — add your first deal to see a draft").
- **Unlocks:** A repeatable path for new workspaces to complete voice setup and validate the output in a single page load, without touching the conversational onboarding flow.

### Option B: Collapse the 4-step conversation into one greeting turn

- **What it is:** Modify `buildGreeting('no_voice', ...)` in `prompts.ts:308` to ask for all three voice fields at once: "Tell me your style, paste an example message you're proud of, and list any rules — all in one message." `save_voice_config` already accepts all three fields simultaneously.
- **Effort:** Very small — changes two lines in `prompts.ts`, updates the system prompt instruction at line 285.
- **Main risk:** Asking three questions at once is weak conversational design. The existing step-by-step approach produces higher-quality voice configs because Aion can ask clarifying questions per step.
- **Unlocks:** Voice setup + test draft in 2 turns instead of 4+. No new components.

### Option C: Voice-first onboarding modal on first `/aion` visit

- **What it is:** A full-screen setup modal that fires when `onboardingState === 'no_voice'` on mount, walks through 3 steps (style → example → guardrails) with a live preview of the draft at step 3, and closes into the normal chat surface.
- **Effort:** Medium. Requires a new modal component, 3-step local state, draft preview rendering, and a mount-time check in `ChatInterface.tsx` or the page wrapper.
- **Main risk:** Adds modal complexity; risks being intrusive if the user just wants to skip setup. Needs a "skip for now" escape.
- **Unlocks:** Best possible first-run experience: polished, complete, with a live draft before the user ever types in the chat.

## Recommendation

**Ship Option A first, treat Option C as Phase 2.**

Option A is a 2–3 hour build that proves the full value loop — voice input → real draft output — without touching the existing conversational onboarding flow or any routing logic. It lives naturally at the "Tune Aion's voice" entry point in the sidebar overflow (which calls `resetAionVoiceConfig` today but opens nothing). The form handles the "3 paragraphs → immediate draft" goal exactly.

The tradeoff you're accepting: it's a settings-pane form, not a first-run moment. If Daniel's goal is to show this to new customers as an onboarding wow-moment, Option C is the right end state. But Option A validates the voice→draft loop in production quickly, and the form can become the internals of Option C's modal later.

Option B is tempting for speed but produces worse voice configs. Skip it.

## Next steps for Daniel

1. Create `src/app/(dashboard)/(features)/aion/components/VoiceSetupForm.tsx` — three `<textarea>` fields (style, example, guardrails) + a Save button that calls `saveAionVoiceConfig`.
2. After save, POST to `/api/aion/draft-follow-up` with `workspaceId` and the first item from the follow-up queue to get a live draft. Render it below the form as a `draft_preview` block.
3. Mount `VoiceSetupForm` in the sidebar overflow "Tune Aion's voice" path — replace the current `resetAionVoiceConfig`-only call with a slide-in panel.
4. Add a no-deals fallback: if the queue is empty, show "Voice saved. Add your first deal to generate a draft."
5. Confirm that `saveAionVoiceConfig` can call from the browser client (it uses `createClient()` from `server.ts` — verify this is a server action with `'use server'`; it is, at `aion-config-actions.ts:1`).
6. Test the round trip: set voice → verify `aion_config.voice` is populated → open a fresh chat → confirm greeting is `configured` mode, not `no_voice`.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:84` — `getAionConfig`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:178` — `saveAionVoiceConfig`
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — `getOnboardingState`
- `src/app/api/aion/chat/route/prompts.ts:284` — onboarding state → system prompt
- `src/app/api/aion/chat/route/prompts.ts:308` — `buildGreeting` per state
- `src/app/api/aion/chat/tools/core.ts:118` — `save_voice_config` tool
- `src/app/api/aion/chat/tools/core.ts:318` — `draft_follow_up` tool
- `src/app/api/aion/lib/generate-draft.ts:52` — voice injection into draft prompt
- `src/app/api/aion/draft-follow-up/route.ts` — draft route (auth + tier gate + voice)
- `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` — settings mount point
