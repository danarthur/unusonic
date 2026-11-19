# Aion Phase A: voice setup + first real draft

_Researched: 2026-11-19 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

The queue item was written against the April 2026 codebase. The system has advanced substantially since then — both stated blockers are resolved.

`aion_config` exists and is in production use. `getAionConfigForWorkspace()` and `saveAionVoiceConfig()` read and write it via `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:106` and `:178`. The `AionVoiceConfig` type (`description`, `example_message`, `guardrails`) is defined and used at `aion-config-actions.ts:12`.

The `/api/aion/chat` route is a full tool-calling system with auth, rate limiting, model routing, and streaming — not a stub. See `src/app/api/aion/chat/route.ts:59`. The route loads voice config at line 110 and injects it into every system prompt at `src/app/api/aion/chat/route/prompts.ts:97`.

A 5-state onboarding machine exists at `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247`: `no_voice → no_example → no_guardrails → needs_test_draft → configured`. The greeting builder at `src/app/api/aion/chat/route/prompts.ts:301` drives each state to a different conversational prompt. The `save_voice_config` tool at `src/app/api/aion/chat/tools/core.ts:118` saves voice config in-chat. The `draft_follow_up` tool at `core.ts:649` generates drafts using the saved voice.

The `/api/aion/draft-follow-up` route at `src/app/api/aion/draft-follow-up/route.ts:21` is live and calls `generateFollowUpDraft()` at `src/app/api/aion/lib/generate-draft.ts:25`, which injects `voice.description`, `voice.example_message`, and `voice.guardrails` into the system prompt.

**The real blocker**: new workspace owners never see the onboarding flow. `applyVoiceDefaultIfEmpty()` at `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35` synthesizes a default voice from the workspace name and sets `voice_default_derived: true`. Because `getOnboardingState()` returns `'configured'` immediately when that flag is set (`aion-chat-types.ts:248`), the 4-step voice setup flow never fires. The only path to explicit voice setup is an overflow menu item ("Tune Aion's voice") buried in the sidebar.

The `/settings/aion` page (`src/app/(dashboard)/settings/aion/AionSettingsView.tsx`) manages beta consent and cadence learning — it has no voice setup UI.

## Intended state

Daniel opens the Aion page (or a dedicated settings surface), writes his communication style, pastes an example message, states his rules, and immediately sees a generated draft for a real active deal. This is the "first contact" experience — the moment Aion stops being generic and starts sounding like him. The voice config drives every future draft and playbook application from that point forward.

## The gap

- New workspaces silently auto-configure a synthesized voice and skip the onboarding entirely.
- The "Tune Aion's voice" override is in a secondary overflow menu — invisible to first-time users.
- After completing the conversational flow (4 turns minimum), the test draft is offered, not shown immediately.
- `/settings/aion` has no voice setup surface; the only path is through chat.

## Options

### Option A: Voice setup card on the Aion page when `voice_default_derived === true`

- **What it is:** Render a compact 3-field card (description, example, guardrails) above the chat input when `voice_default_derived === true`. On submit: call `saveAionVoiceConfig`, then immediately call `/api/aion/draft-follow-up` with the workspace's top-priority follow-up deal. Show the draft inline. Card dismisses after save.
- **Effort:** Small — the server action and draft route exist; this is a new React component (~150 lines) that calls them.
- **Main risk:** No follow-up deal exists on a fresh workspace (nothing to draft against). Needs a graceful empty state.
- **Unlocks:** The exact scenario in the queue item. After this, the full conversational playbook tuning works in Aion chat.

### Option B: Promote the existing conversational flow

- **What it is:** Remove `voice_default_derived` synthesis so new workspaces open in `no_voice` state. The existing 4-step chat onboarding runs. Add a brief info line in the greeting to tell Daniel why he's being asked.
- **Effort:** Very small — delete `applyVoiceDefaultIfEmpty` call, adjust copy in `buildGreeting`.
- **Main risk:** Breaks the current UX for existing workspaces that have already derived a default. Also, the 4-turn conversational flow is slower than "write 3 paragraphs, see draft."
- **Unlocks:** Forces onboarding for new workspaces; no new components required.

### Option C: Voice setup section on `/settings/aion`

- **What it is:** Add a voice config form (`description`, `example_message`, `guardrails`) to the existing `AionSettingsView`. After save, show a "Generate a test draft" button that calls `/api/aion/draft-follow-up` with a deal picker.
- **Effort:** Medium — requires touching the settings page, adding a deal picker, and wiring the draft preview.
- **Main risk:** Settings are where you go to configure, not to get a first impression. Puts the high-value moment in the wrong place.
- **Unlocks:** Persistent voice management surface alongside the consent/cadence toggles.

## Recommendation

Option A. It places the experience exactly where it needs to be — the moment Daniel first opens Aion — without making new workspaces feel broken or requiring a settings detour. The infrastructure (server action, draft route, voice type) all exists; this is a UI problem, not a data problem.

The key detail: show the card only when `voice_default_derived === true` (not `voice?.description` exists), so workspaces with an intentionally-set voice never see it again after they save. After save, trigger `draft_follow_up` for the workspace's top-priority follow-up item from `get_follow_up_queue`; if the queue is empty, skip the draft and show a success state instead.

Option B is tempting for its simplicity but it actively degrades the existing onboarding story. Option C is the right long-term home for voice management, but it's a poor first-contact surface.

## Next steps for Daniel

1. Create `src/app/(dashboard)/(features)/aion/components/VoiceSetupCard.tsx` — a client component with 3 textareas, calling `saveAionVoiceConfig` on submit and `/api/aion/draft-follow-up` with the top queue item afterward.
2. In `src/app/(dashboard)/(features)/aion/components/ChatInterface.tsx`, load `aionConfig` server-side (or via the existing session context) and conditionally render `<VoiceSetupCard />` above the input when `aionConfig.voice_default_derived === true`.
3. Add a draft preview state to `VoiceSetupCard`: after save, if a queue item exists, show the draft inline with "Looks good" / "Edit it" actions.
4. Add an empty state: if `get_follow_up_queue` returns nothing, show "Voice saved. Next time you get a follow-up, Aion will draft it in your style."
5. Verify the form resets correctly when `resetAionVoiceConfig` is called (sidebar overflow flow still works for retuning).

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — `saveAionVoiceConfig`, `AionVoiceConfig` type, `getAionConfigForWorkspace`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — `applyVoiceDefaultIfEmpty`, `synthesizeDefaultVoice`, `voice_default_derived`
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts` — `getOnboardingState`, `OnboardingState`
- `src/app/api/aion/lib/generate-draft.ts` — `generateFollowUpDraft`, `buildFollowUpPrompt`
- `src/app/api/aion/draft-follow-up/route.ts` — draft endpoint
- `src/app/api/aion/chat/route/prompts.ts` — `buildSystemPrompt` (voice injection), `buildGreeting` (5-state greetings)
- `src/app/api/aion/chat/tools/core.ts` — `save_voice_config`, `draft_follow_up` tools
