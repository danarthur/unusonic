# Aion Voice Setup — Minimum Path to First Real Draft

_Researched: 2026-07-14 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

**Note on outdated premises.** The planning primer's "current notable state" is dated 2026-04-10. As of this research run (2026-07-14) both stated blockers have been resolved: the Brain tab is a full ChatInterface, and `aion_config` is an active JSON column on `public.workspaces`. The question below is therefore reframed to its actual current blocker.

## Current state

The Aion chat system is fully operational. Every Phase A prerequisite from the design doc exists:

- **`public.workspaces.aion_config`** — Live. `getAionConfig()` / `saveAionVoiceConfig()` / `updateAionConfigForWorkspace()` fully implemented (`src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:84`).
- **`/api/aion/chat`** — Production route with auth, per-user rate limiting, tier gating, tool registry, rolling summarization (`src/app/api/aion/chat/route.ts:57`).
- **`/api/aion/draft-follow-up`** — Fully implemented. Injects `aionConfig.voice` into `generateFollowUpDraft()` which applies `voice.description`, `voice.example_message`, and `voice.guardrails` to the model prompt (`src/app/api/aion/lib/generate-draft.ts:52`).
- **Onboarding state machine** — Implemented: `no_voice → no_example → no_guardrails → needs_test_draft → configured`. Greetings and system-prompt blocks exist for each state (`src/app/api/aion/chat/route/prompts.ts:300`, `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247`).
- **`save_voice_config` tool** — Registered in the tool registry. Merges voice fields into `aion_config` on every call (`src/app/api/aion/chat/tools/core.ts:118`).
- **`draft_follow_up` tool** — Registered. Falls back to the top follow-up queue deal if no `dealId` supplied (`src/app/api/aion/chat/tools/core.ts:318`).
- **Brain tab** — `AionPageClient.tsx` renders `<ChatInterface viewState="chat" />` with no pausing (`src/app/(dashboard)/aion/AionPageClient.tsx:73`).

**The actual blocker** is one paragraph in `aion-config-helpers.ts`. `applyVoiceDefaultIfEmpty()` synthesizes a voice from the workspace name on every read and sets `voice_default_derived: true` (`src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:20`). `getOnboardingState()` short-circuits to `'configured'` whenever that flag is set (`src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:248`). This means ALL workspaces — including ones where Daniel has never described his style — open the Brain tab in `'configured'` state, receive the pull-mode idle greeting, and never enter the onboarding conversation. The `=== ONBOARDING ===` block in `buildSystemPrompt` only fires for `no_voice`/`no_example` etc. — states that are unreachable today.

A secondary blocker: even if Daniel types his voice description unprompted, the `'configured'`-state system prompt has no instruction to call `save_voice_config` or follow up with a test draft.

## Intended state

Daniel opens the Brain tab. Because his workspace has no user-authored voice, Aion asks him to describe his communication style. He writes 3 paragraphs. Aion saves them via `save_voice_config` and immediately offers to generate a test draft for his top-priority deal. He sees the draft and approves or edits it. From that point, every follow-up draft Aion generates reflects his voice. No settings page, no sidebar overflow menu — the setup happens in the conversation.

## The gap

- `applyVoiceDefaultIfEmpty` always synthesizes a default voice, making `getOnboardingState` return `'configured'` even for workspaces that have never been configured by a human.
- `buildSystemPrompt` has no instruction for the `'configured'` case when `voice_default_derived: true` — the LLM doesn't know to capture an unprompted voice description or follow up with a draft.
- "Tune Aion's voice" in the sidebar overflow calls `resetAionVoiceConfig`, but on the next read the synthesis fires again → still `'configured'`. The affordance exists but doesn't work.

## Options

### Option A: Block synthesis when the user actively enters onboarding

- **What it is:** Add a `onboarding_active: boolean` field to `AionConfig`. `resetAionVoiceConfig` sets it; `saveAionVoiceConfig` (the explicit write path) clears it. `applyVoiceDefaultIfEmpty` skips synthesis when `onboarding_active === true`, allowing `getOnboardingState` to return `no_voice`. The sidebar "Tune Aion's voice" then correctly re-enters the 4-step conversation flow.
- **Effort:** Medium — touches `AionConfig` type, `aion-config-helpers.ts`, `aion-config-actions.ts`, and the `save_voice_config` tool to clear the flag on completion.
- **Main risk:** The 4-step flow fires the `no_voice` greeting only on cold-open (empty messages). A user who opens the tab with existing chat history would see the synthesis bypass not take effect until they start a new session.
- **Unlocks:** The "Tune Aion's voice" sidebar affordance works end-to-end. New workspaces that are reset also re-enter onboarding cleanly.

### Option B: Inject a system-prompt nudge for default-derived workspaces

- **What it is:** In `buildSystemPrompt`, detect `config.voice_default_derived === true` and append a block: "The workspace voice was auto-generated, not user-authored. If the user describes their communication style, call `save_voice_config` immediately to capture it. After saving, say what you captured and offer to draft a test message: 'Want me to try one now so you can hear how it sounds?'" No DB changes. No new state. The voice config already passes through `buildSystemPrompt` at `src/app/api/aion/chat/route/prompts.ts:52`.
- **Effort:** Small — one `if` block (~10 lines) in `prompts.ts`.
- **Main risk:** Relies on the LLM following a soft instruction. If Daniel types three paragraphs but frames them as general chat, the model might not recognize it as a voice description. Also, the prompt fires every turn (not just cold-open), which could produce unexpected behavior mid-conversation.
- **Unlocks:** Daniel's exact scenario — writes 3 paragraphs, gets a draft — with zero infrastructure changes.

### Option C: Add a proactive setup card in the Brain tab UI

- **What it is:** When `ChatInterface` detects `voice_default_derived: true` (requires passing the flag down from the page server component through `AionPageClient`), render a subtle dismissible banner above the input: "Aion is using a default voice. Tell me how you write and I'll generate drafts in your tone." The banner dispatches a pre-seeded starter message when tapped, which the model handles as a `no_voice` onboarding prompt regardless of current state.
- **Effort:** Medium — server component prop, ChatInterface prop, banner component, dismiss state in localStorage.
- **Main risk:** Adds UI complexity to a deliberately minimal chat surface. The banner approach works only if Daniel actually taps it.
- **Unlocks:** Clear discoverability without changing the model routing logic.

## Recommendation

**Ship Option B immediately, then fix Option A in a follow-up sprint.**

Option B is the minimum viable path to Daniel's desired experience and can be done in under an hour. Add the `voice_default_derived` guard to `buildSystemPrompt` in `src/app/api/aion/chat/route/prompts.ts`. The model already has `save_voice_config` and `draft_follow_up` tools registered — it just needs a clear instruction to use them when it detects unsolicited voice description. Scope the guard to the cold-open greeting path only (when `messages.length` is low, or check `onboardingState` explicitly) to avoid mid-conversation noise.

The reason not to jump straight to Option A: the 4-step conversational onboarding is a heavier UX contract (four back-and-forth turns before Daniel sees a draft). The `voice_default_derived` prompt injection achieves the same outcome in a single user turn — write once, get a draft immediately. Option A is still worth doing to fix the "Tune Aion's voice" sidebar affordance, but that can wait.

Option C (banner) adds UI surface that the chat philosophy intentionally avoids. Skip it.

Accepting the main risk of B: if Daniel writes something ambiguous, the model may not trigger the tools. Mitigate by making the injected prompt instruction highly specific: "If the user mentions tone, style, how they write, how they talk to clients, or pastes a message they sent, call `save_voice_config`."

## Next steps for Daniel

1. Open `src/app/api/aion/chat/route/prompts.ts`, find `buildSystemPrompt` around line 52. Locate the `=== VOICE CONFIG ===` block (line ~88).
2. After the existing voice config lines, add a guard: if `config.voice_default_derived === true`, append to `parts`: `"=== VOICE SETUP MODE ==="` then `"This workspace's voice was auto-generated. If the user describes their communication style, tone, or pastes an example message, call save_voice_config immediately. After saving, confirm what you captured and ask: 'Want me to draft one for your top deal so you can hear how it sounds?'"`.
3. Test by opening `/aion` on a workspace with no stored voice. Type a description of your writing style. Verify Aion calls `save_voice_config` (you'll see the config update in the tool response) and offers a draft.
4. Optionally: fix Option A. In `aion-config-helpers.ts`, change `applyVoiceDefaultIfEmpty` to accept and pass through an `onboarding_active` flag from the stored config. In `aion-config-actions.ts`, update `resetAionVoiceConfig` to write `{ ...rest, onboarding_active: true }` so the sidebar "Tune my voice" affordance actually enters the onboarding flow.
5. After the draft fires correctly, verify `generateFollowUpDraft` is using the right voice: check `src/app/api/aion/lib/generate-draft.ts:52` — the `voice.description`, `voice.example_message`, and `voice.guardrails` fields should appear in the model prompt log.
6. Once confirmed end-to-end, mark `onboarding_state: 'complete'` in `save_voice_config` after the test draft is approved (already wired at `src/app/api/aion/chat/tools/core.ts:135`) — this stops the setup instructions from re-injecting on subsequent turns.

## References

- `src/app/api/aion/chat/route/prompts.ts` — `buildSystemPrompt`, `buildGreeting`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — `applyVoiceDefaultIfEmpty`, `synthesizeDefaultVoice`
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts` — `getOnboardingState`
- `src/app/api/aion/chat/tools/core.ts` — `save_voice_config`, `draft_follow_up`
- `src/app/api/aion/lib/generate-draft.ts` — `buildFollowUpPrompt` (voice injection point)
- `src/app/api/aion/chat/route.ts` — onboarding state check at line 122
