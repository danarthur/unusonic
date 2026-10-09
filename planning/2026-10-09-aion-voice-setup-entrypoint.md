# Aion Voice Setup: Missing Entrypoint

_Researched: 2026-10-09 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture. Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? The goal: Daniel opens the Brain tab, writes 3 paragraphs about how he talks to clients, and immediately sees an Aion-generated follow-up draft that respects that voice.

## Current state

**Note: the premises in this question are no longer accurate as of this research run.** Six months of work shipped since it was written. Current state:

`aion_config` is a live JSONB column on `public.workspaces`, read and written by several paths:
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:84` — `getAionConfig()` Server Action (workspace-scoped)
- `aion-config-actions.ts:178` — `saveAionVoiceConfig()` saves `voice.{description, example_message, guardrails}` directly
- `aion-config-actions.ts:209` — `resetAionVoiceConfig()` clears voice + derived flag, forcing re-onboarding

`/api/aion/chat/route.ts` is a full 465-line tool-calling route with auth, rate-limiting, streaming, model routing, and session summarization — not a stub.

The onboarding state machine is fully implemented in `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — five states: `no_voice → no_example → no_guardrails → needs_test_draft → configured`. Each state shapes the system prompt (`src/app/api/aion/chat/route/prompts.ts:284`) and the cold-open greeting (`prompts.ts:310`).

Two tools handle the flow end-to-end: `save_voice_config` (`src/app/api/aion/chat/tools/core.ts:118`) saves fields to `aion_config.voice` incrementally as the user speaks; `draft_follow_up` (`core.ts:318`) fetches the top-queue deal, enriches with semantic memory, applies the playbook, and generates a voice-aware draft.

`/api/aion/draft-follow-up/route.ts` is implemented and auth-gated.

**The actual gap:** When `voice_default_derived === true` (set by `applyVoiceDefaultIfEmpty` at `aion-config-helpers.ts:42` for every new workspace), `getOnboardingState` returns `'configured'` immediately, bypassing the 4-step conversational flow entirely (`aion-chat-types.ts:248`). The only way to enter voice setup is a sidebar overflow reset ("Tune Aion's voice") that calls `resetAionVoiceConfig`. This affordance is buried in `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:1043` — one hidden overflow item, no visual CTA.

There is no dedicated voice-setup form, no card that says "teach Aion your style," and no moment that surfaces the 3-paragraph path described in the question.

## Intended state

Daniel opens the Aion surface, sees a clear "Set up your voice" invitation, writes a short description, pastes an example message, adds any guardrails, submits, and within the same session sees a draft for a real deal — all without needing to find a sidebar overflow. This was the original Phase A vision: voice first, draft second, as one linear moment.

## The gap

- `voice_default_derived` silently skips onboarding for every new workspace — the 4-step flow never fires on first visit
- No explicit "Set up your voice" CTA exists on `/aion`, `/chat`, or `/settings/aion`
- The only re-entry path is a sidebar overflow item most users won't find
- The `needs_test_draft` greeting and `draft_follow_up` tool work but are unreachable without a voice reset first

## Options

### Option A: Voice setup card on the Aion page

- **What it is:** A `StagePanel` card that renders at the top of `/aion` (or `/chat`) when `voice_default_derived === true`. Three inline text areas — description, example message, guardrails — that call `saveAionVoiceConfig` on submit. On success, redirect into chat; the `needs_test_draft` greeting fires and Aion generates the first draft.
- **Effort:** Small — `saveAionVoiceConfig` already exists, the form is 3 text areas, the redirect is one `router.push('/chat')`.
- **Main risk:** Users who want the conversational flow lose it. The 3-field form is more clinical than the guided chat steps.
- **Unlocks:** Direct path from first visit to first draft in one interaction. Closest to the stated vision.

### Option B: First-visit prompt that enters conversational onboarding

- **What it is:** When a workspace has `voice_default_derived === true` and visits `/aion` for the first time, show a full-screen or prominent overlay — "Let me learn your style before we start" — with a single CTA. Tapping it calls `resetAionVoiceConfig`, then routes into `/chat`. The existing `no_voice` greeting fires and the chat-based 4-step flow runs.
- **Effort:** Small-medium — needs a first-visit detection flag (localStorage or a DB boolean on `aion_config`), the overlay UI, and the reset + redirect wiring.
- **Main risk:** More steps than Option A. The conversational flow requires 4+ turns to complete voice setup before seeing a draft.
- **Unlocks:** Keeps the chat-native onboarding pattern intact; lower UI investment than a bespoke form.

### Option C: Inline voice panel in the sidebar

- **What it is:** Expand the existing "Tune Aion's voice" sidebar overflow item into a proper settings panel — show the 3 voice fields as editable inputs, let the user update them inline without resetting, and add a "Generate test draft" button that fires `draft_follow_up` in context.
- **Effort:** Medium — sidebar layout work, inline edit state, and wiring the draft button.
- **Main risk:** Sidebar is visible only after the user is already in chat. Doesn't solve first-visit discoverability.
- **Unlocks:** Power-user path for iterating voice without resetting onboarding state.

## Recommendation

Ship Option A. The 3-field form matches the stated goal exactly: Daniel writes 3 paragraphs, hits save, sees a draft. It uses infrastructure that already exists (`saveAionVoiceConfig`, `draft_follow_up`, the `needs_test_draft` greeting) and requires about 50 lines of new UI. The conversational flow remains as the re-tune path via sidebar; it doesn't need to be the first-run path.

Accept the tradeoff that the guided chat experience is skipped. The 4-step flow was designed for when the model needed to prompt each field individually — a direct form is faster and more honest about what's being collected. Rename the card label from "Voice config" to something plain: "How you talk to clients."

One addition to make the form feel live rather than clinical: after saving, auto-submit "draft a test follow-up for my top deal" into the chat so the draft appears immediately without an extra click.

## Next steps for Daniel

1. Create `src/app/(dashboard)/(features)/aion/components/VoiceSetupCard.tsx` — `StagePanel` with three `<textarea>` fields (description, example_message, guardrails) and a submit button that calls `saveAionVoiceConfig`.
2. In the `/aion` or `/chat` page server component, check `aionConfig.voice_default_derived === true` and conditionally render `<VoiceSetupCard />` above the `<ChatInterface />`.
3. On successful save, redirect to `/chat` with a query param (e.g. `?intent=test-draft`) so the chat mounts with a pre-filled user message that triggers `draft_follow_up`.
4. In `ChatInterface.tsx` or its parent, read the `intent=test-draft` param and auto-submit the opener message on mount.
5. Set the submit in step 3 to also clear `voice_default_derived` from config — `saveAionVoiceConfig` already does this (`aion-config-actions.ts:190`), so the card won't re-render next visit.
6. Optionally remove the `VoiceSetupCard` render if `aionConfig.voice?.description` is non-empty (explicitly set), so returning users never see it again.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — `saveAionVoiceConfig`, `resetAionVoiceConfig`, `AionConfig` type
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:20` — `synthesizeDefaultVoice`, `applyVoiceDefaultIfEmpty`
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — `getOnboardingState` 5-state machine
- `src/app/api/aion/chat/route/prompts.ts:284,338` — onboarding states in system prompt and greeting
- `src/app/api/aion/chat/tools/core.ts:118,318` — `save_voice_config`, `draft_follow_up` tools
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:1043` — current "Tune Aion's voice" overflow item
- `src/app/api/aion/draft-follow-up/route.ts` — implemented draft endpoint
