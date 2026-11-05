# Aion Phase A — voice setup and first draft audit

_Researched: 2026-11-05 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

_Note: the planning primer dates to April 2026. This research was run November 2026. The codebase has advanced significantly. The premise of the question (paused Brain tab, no aion_config) no longer holds. This doc audits the actual current state and identifies the remaining gap._

## Current state

Phase A is shipped. The evidence:

**Schema:** `public.workspaces.aion_config` (JSONB) exists and is read/written by multiple paths. `getAionConfig()` in `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:84` reads it directly. `updateAionConfigForWorkspace()` at `:263` merges partial updates using the system client.

**Onboarding machine:** A 5-state machine (`no_voice → no_example → no_guardrails → needs_test_draft → configured`) is fully wired. `getOnboardingState()` at `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` derives state from the config. The chat route reads onboarding state on every cold open (`route.ts:124`) and the greeting builder fires the right prompt for each state (`prompts.ts:309`).

**Chat route:** `/api/aion/chat/route.ts` is a 465-line authenticated, rate-limited, tool-calling, streaming route — not the 16-line stub the primer describes.

**Voice tools in the LLM layer:**
- `save_voice_config` at `src/app/api/aion/chat/tools/core.ts:118` — saves `description`, `example_message`, `guardrails` and advances onboarding state.
- `draft_follow_up` at `core.ts:318` — generates a follow-up draft for the top-priority deal (or a specified deal), feeds `config.voice` into `buildDraftPrompt()` at `core.ts:410`. Voice actually shapes every draft.
- `regenerate_draft` at `core.ts:441` — applies feedback and re-drafts.

**The full happy path works:** cold-open `/aion` → greeting fires `no_voice` prompt → user pastes style description → `save_voice_config` stores it and advances state → `no_example` → `no_guardrails` → `needs_test_draft` → `draft_follow_up` runs → `draft_preview` card renders in the chat.

## Intended state

Daniel opens Aion, describes his communication style in a few paragraphs, and immediately sees a draft that sounds like him. The design intent was conversational: the LLM extracts voice config from natural language rather than a form. That is exactly what the current system does.

## The gap

Not a build gap — a discoverability gap. One flag bypasses the entire onboarding flow:

- `voice_default_derived` (defined at `aion-config-actions.ts:67-73`) is set when `getAionConfig()` synthesizes a default voice from the workspace name because no voice was ever stored. `getOnboardingState()` returns `configured` immediately when this flag is true (`aion-chat-types.ts:248`), skipping all 4 onboarding steps.
- Result: any workspace that has had `getAionConfig()` called (which happens on every Aion page load) gets a synthesized default and goes straight to the pull-mode greeting. The voice setup flow never fires unless Daniel explicitly clicks "Tune Aion's voice" in the AionSidebar overflow (`AionSidebar.tsx`, which calls `resetAionVoiceConfig()`).
- The sidebar overflow is not labeled prominently and is not the entry point Daniel described.

Concretely: Daniel opens `/aion`, sees the pull-mode greeting, never gets prompted to describe his style, and Aion drafts messages in a generic production-management register rather than his actual voice.

## Options

### Option A: Document the existing path

- **What it is:** No code change. Add a note to the planning doc that voice setup requires the sidebar overflow → "Tune Aion's voice." Use `resetAionVoiceConfig()` then start a new chat.
- **Effort:** Small (zero code, one paragraph of internal docs)
- **Main risk:** Daniel never does it; the synthesized default persists indefinitely; draft quality is permanently below the designed baseline.
- **Unlocks:** Nothing new — existing capability becomes discoverable only if Daniel reads docs.

### Option B: Show a voice-setup nudge in the Aion page landing state

- **What it is:** When `voice_default_derived === true` and the user is in the initial (no-messages) chat view, render a dismissable banner or starter chip: "Aion is using a default voice — tell me how you actually talk to clients." One click sends a synthetic message that starts the onboarding turn. `resetAionVoiceConfig()` fires before the message so `getOnboardingState` returns `no_voice` on the next turn.
- **Effort:** Small (20–40 lines in `AionLandingStarters.tsx` or `ChatInterface.tsx`, plus a prop wired from the page server component that reads `aion_config`)
- **Main risk:** Adds a small conditional branch to the landing pane; needs a dismissal mechanism so it doesn't nag on every visit.
- **Unlocks:** The exact experience the question describes. Opens the Brain tab, one click, describes style, sees draft.

### Option C: Dedicated voice setup form in /settings/aion

- **What it is:** A three-field form (description / example / guardrails) in `AionSettingsView.tsx`, wiring directly to `saveAionVoiceConfig()`. Bypasses the chat flow entirely.
- **Effort:** Medium (form UI, server action wiring, state handling)
- **Main risk:** Misses the intelligence angle — a form captures text but the LLM can't ask clarifying questions, suggest examples, or structure what the user pastes. The conversational path produces better voice config.
- **Unlocks:** A settings-first path that some users may prefer.

## Recommendation

Option B. The existing onboarding flow is well-built and the conversational path produces better voice config than a form ever will (the LLM can probe "what about wedding clients vs corporate clients?", then save a nuanced result). The only real problem is that `voice_default_derived` silently short-circuits discovery.

A single conditional in `AionLandingStarters.tsx` — "if the workspace has only a derived default voice, show a 'tell Aion your style' starter" — creates the described experience with no schema changes, no new tools, and minimal surface area. The starter chip sends a message that resets the flag and fires the existing 4-step flow. The draft renders at the end of that flow exactly as designed.

Tradeoff accepted: for workspaces that have already set a real voice, this branch is never hit. For workspaces still on the derived default, the nudge is opt-in (one click, dismissable).

## Next steps for Daniel

1. Open `/aion` as yourself with no prior voice config — observe whether the pull-mode greeting fires or the `no_voice` onboarding prompt fires. This tells you if `voice_default_derived` is already set for your workspace.
2. If pull-mode fires: use the AionSidebar overflow menu → "Tune Aion's voice" → verify the `no_voice` onboarding prompt appears next. File is `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx`.
3. Walk through all 4 onboarding steps, then verify a `draft_preview` card renders at the end. If it doesn't, check that `draft_follow_up` has a deal in `ops.follow_up_queue` to target.
4. If the end-to-end flow works, wire the Option B nudge: add a `voiceIsDefault: boolean` prop to `AionLandingStarters.tsx`, read `aion_config.voice_default_derived` server-side in `src/app/(dashboard)/aion/page.tsx`, and render a "tell me your style" chip when true.
5. The chip's `value` should be `"Let me tell you how I talk to clients."` — that message triggers `save_voice_config` on the first reply because the system prompt says to call it whenever the user describes their communication style.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — aion_config reads/writes, voice_default_derived flag
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — `getOnboardingState()` state machine
- `src/app/api/aion/chat/route.ts` — full chat route (auth, tools, streaming)
- `src/app/api/aion/chat/tools/core.ts:118,318` — `save_voice_config` and `draft_follow_up` tools
- `src/app/api/aion/chat/route/prompts.ts:284,309` — onboarding branches in system prompt and greeting builder
- `src/app/(dashboard)/(features)/aion/components/AionLandingStarters.tsx` — target file for Option B
- `src/app/(dashboard)/aion/page.tsx` — server component that should pass `voiceIsDefault` prop
