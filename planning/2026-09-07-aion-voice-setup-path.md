# Minimum path to voice setup and first real draft

_Researched: 2026-09-07 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

Two premises in the question are no longer accurate. As of the current codebase:

**`aion_config` exists and is active.** `public.workspaces.aion_config` is a live JSONB column. `getAionConfigForWorkspace` (`src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:106`) reads it on every chat turn. `saveAionVoiceConfig` (`aion-config-actions.ts:178`) writes it. `updateAionConfigForWorkspace` (`aion-config-actions.ts:262`) deep-merges it from tool calls. The column has `voice`, `learned`, `follow_up_playbook`, `onboarding_state`, `kill_switch`, and `voice_default_derived` fields.

**The Brain tab is built.** `ChatInterface.tsx` is 808 lines of live UI. The `/aion` page at `src/app/(dashboard)/aion/AionPageClient.tsx:66` renders `<ChatInterface>` directly. `AionInput.tsx`, `AionVoice.tsx`, and the voice transcript card (`VoiceDraftTranscriptCard.tsx`) all exist and are imported.

**The 4-step onboarding flow is wired end-to-end.** `getOnboardingState()` (`src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247`) returns one of five states: `no_voice → no_example → no_guardrails → needs_test_draft → configured`. Each state gets a distinct greeting (`src/app/api/aion/chat/route/prompts.ts:308`) and system-prompt instruction (`prompts.ts:284`). The `save_voice_config` tool (`src/app/api/aion/chat/tools/core.ts:118`) writes all three voice fields in one call. The `draft_follow_up` tool (`core.ts:318`) generates a draft using the current voice config and is assembled into the tool set at `route/tools.ts:58`.

**The actual gap: a new workspace never reaches the onboarding flow.** `applyVoiceDefaultIfEmpty` (`aion-config-helpers.ts:35`) synthesizes a generic voice from the workspace name on every config read when `voice.description` is empty. It sets `voice_default_derived: true`. `getOnboardingState` short-circuits on that flag: `if (config.voice_default_derived === true) return 'configured'` (`aion-chat-types.ts:248`). Result: a brand-new workspace opens the Brain tab and sees the pull-mode greeting ("good morning, here are your oldest proposals") with no onboarding. The voice Daniel gets is auto-synthesized, not his.

The only way to trigger real onboarding today is `resetAionVoiceConfig` (`aion-config-actions.ts:214`), which is buried in the `AionSidebar` overflow menu as "Tune Aion's voice." There is no first-visit entry point.

## Intended state

Daniel opens the Brain tab, sees a clear entry point to describe his communication style, writes freely (one or three paragraphs), Aion extracts `description`, `example_message`, and `guardrails` in a single `save_voice_config` call, then immediately generates a draft follow-up for his top active deal. The draft reflects his actual style, not the generic synthesized voice.

## The gap

- No first-visit UI entry point routes new workspaces into the `no_voice` greeting.
- `voice_default_derived` short-circuits onboarding before it fires.
- No landing chip or CTA surfaces "set up how Aion writes for me."
- `resetAionVoiceConfig` (the unlock key) is only discoverable via sidebar overflow.

## Options

### Option A: Landing chip that resets and re-enters onboarding

- **What it is:** Add a "Set up communication style" chip to `AionLandingStarters.tsx`. On click: call `resetAionVoiceConfig()` (server action, already exists), then call `startNewChat()` in the session context. The next greeting fetch runs with `no_voice` state and starts the conversation. Daniel writes freely; the model calls `save_voice_config` with all three fields extracted from his text, then offers a test draft.
- **Effort:** Small — 2 files, under 40 lines. `AionLandingStarters.tsx` adds a chip/button with an `onReset` callback; `ChatInterface.tsx` wires a handler that calls the server action then `handleNewChat()`.
- **Main risk:** The model must reliably extract description, example, and guardrails from a single free-form paragraph. The `no_voice` system prompt today only says "ask about communication style, save via save_voice_config" — it does not instruct the model to extract all three fields in one pass. A one-turn write may advance to `needs_test_draft` with only `description` populated.
- **Unlocks:** Full onboarding conversation in the Brain tab, leading to `needs_test_draft` and draft generation. No settings page required.

### Option B: Voice form in Settings > Aion

- **What it is:** Add a `VoiceSetupSection` to `AionSettingsView.tsx` with three labeled textareas (description, example, guardrails) and a "Generate test draft" button. The save button calls `saveAionVoiceConfig` (already exists). The test-draft button POSTs to `/api/aion/draft-follow-up` using the first active deal from the workspace.
- **Effort:** Medium — `AionSettingsView.tsx` adds the section; `src/app/(dashboard)/settings/aion/page.ts` passes voice config as a prop; a new server action fetches the first active deal ID for the test button. Two to three days.
- **Main risk:** Settings is off the Brain tab path. The described experience ("open Brain tab, write, see draft") doesn't happen — it requires a detour to settings first.
- **Unlocks:** Explicit, inspectable voice config with a draft preview. Works without depending on the chat state machine or the follow-up queue.

### Option C: Harden the `no_voice` system prompt to extract all three fields in one turn

- **What it is:** Update the `no_voice` system-prompt instruction in `prompts.ts:285` from "ask about communication style" to "when the user describes their style, extract description, example, and guardrails together in a single save_voice_config call, then advance directly to draft." Pair with Option A's landing chip. When Daniel writes one rich message, Aion handles it in a single round trip.
- **Effort:** Small — one line in `prompts.ts`. Combined with Option A, total still under 50 lines.
- **Main risk:** Hardening the prompt for one-turn extraction is a behavior change that could confuse the model on short inputs. Needs a test with a genuinely short style description to verify it doesn't hallucinate an example or guardrail.
- **Unlocks:** The exact described experience — one-turn voice setup, immediate draft — when combined with Option A.

## Recommendation

Ship Option A and Option C together. They are the same scope as a single small task.

The landing chip (A) surfaces the entry point. The prompt hardening (C) makes the single-turn write work reliably so Daniel doesn't have to go through the three-question sequence if he already knows what he wants to say.

The change to `prompts.ts` should explicitly instruct the model: "If the user provides enough detail to populate description, example_message, and guardrails in one message, call save_voice_config with all three fields and do not ask follow-up questions." The landing chip should appear only when `voice_default_derived === true` (i.e., no explicit voice has been saved), so it disappears after setup.

Option B (settings form) is worth building eventually as an "edit your voice" surface — but it's a day-two concern, not the blocker. The draft-follow-up route already works; the form is just a nicer edit interface.

The `needs_test_draft` draft path is live and correct. The only requirement is that at least one active deal exists for the `draft_follow_up` tool to pick up. If Daniel's workspace has no deals yet, the tool returns an error. That edge case should be handled in the `needs_test_draft` greeting with a fallback: "I can draft a test message as soon as you have an active deal — want me to walk you through adding one?"

## Next steps for Daniel

1. Open `src/app/(dashboard)/(features)/aion/components/AionLandingStarters.tsx`. Add a conditional chip (when `voice_default_derived` prop is true) labelled "Set up how Aion writes for me" with an `onReset` callback.
2. In `src/app/(dashboard)/(features)/aion/components/ChatInterface.tsx`, wire a handler that calls `resetAionVoiceConfig()` then `handleNewChat()`. Pass this as the `onReset` prop.
3. Open `src/app/api/aion/chat/route/prompts.ts` line 285. Update the `no_voice` onboarding instruction to tell the model to extract all three voice fields in one pass when the user's message is rich enough.
4. Pass `voice_default_derived` from `AionPageClient` down to `ChatInterface` → `AionLandingStarters`. Read it from `getAionConfig()` in the page's server component (`src/app/(dashboard)/aion/page.tsx`).
5. Add a fallback to the `needs_test_draft` greeting in `prompts.ts:339` for when the follow-up queue is empty: offer to add a first deal instead of failing silently.
6. Smoke-test: open `/aion` on a fresh workspace, click the chip, write a paragraph covering style + an example sentence + one rule, verify Aion calls `save_voice_config` with all three fields, then offers a draft.

## References

- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — `getOnboardingState`, including `voice_default_derived` shortcut
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35` — `applyVoiceDefaultIfEmpty`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:178,214` — `saveAionVoiceConfig`, `resetAionVoiceConfig`
- `src/app/api/aion/chat/route/prompts.ts:284,308` — onboarding system prompt + greeting builder
- `src/app/api/aion/chat/tools/core.ts:118,318` — `save_voice_config`, `draft_follow_up` tools
- `src/app/api/aion/draft-follow-up/route.ts` — standalone draft route (authenticated, tier-gated, voice-aware)
- `src/app/(dashboard)/(features)/aion/components/AionLandingStarters.tsx:41` — current landing starters
