# Aion Phase A — Voice Setup Status and Discoverability Gap

_Researched: 2026-11-04 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

**The premises are outdated.** Phase A is fully shipped. The primer dates from April 2026 and no longer reflects the codebase.

**Brain tab**: `src/app/(dashboard)/aion/AionPageClient.tsx:66` renders `<ChatInterface viewState="chat" workspaceId={workspaceId} />` directly. No paused state.

**`workspaces.aion_config`**: The column exists and is the canonical store for `AionConfig` — a typed JSONB blob with `voice`, `learned`, `follow_up_playbook`, `kill_switch`, and onboarding state. Reading happens via `getAionConfigForWorkspace()` at `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:106`.

**Voice setup onboarding**: A 5-state machine (`no_voice → no_example → no_guardrails → needs_test_draft → configured`) is defined at `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:225`. `buildGreeting()` at `src/app/api/aion/chat/route/prompts.ts:301` returns a different opening message for each state. Responding to those messages triggers `save_voice_config` (a chat tool at `src/app/api/aion/chat/tools/core.ts:118`) which persists voice fields to `aion_config` and returns updated config to the client.

**Draft generation**: The `draft_follow_up` chat tool at `src/app/api/aion/chat/tools/core.ts:318` loads deal context via `getDealContextForAion()`, queries `cortex.aion_memory` for entity facts, applies playbook channel rules, and calls `generateFollowUpDraft()`. Voice config is injected into the system prompt at `src/app/api/aion/lib/generate-draft.ts:62`. The standalone `POST /api/aion/draft-follow-up` route is also wired with auth + tier gate + kill-switch check.

**Edit learning**: `POST /api/aion/learn-from-edit` at `src/app/api/aion/learn-from-edit/route.ts` extracts vocabulary swaps from draft edits and writes them back to `aion_config.learned`.

## Intended state

The described scenario — Daniel opens the Brain tab, describes his communication style, and immediately sees an Aion draft — works today IF Daniel manually resets his voice config first ("Tune Aion's voice" in the sidebar overflow). The intent of Phase A was to make this the first-run experience for every new workspace.

The design doc's original Phase A concern (no DB column, chat route stub) is resolved. The gap that remains is narrower: discoverability.

## The gap

- `synthesizeDefaultVoice()` at `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:20` always creates a derived voice from the workspace name and sets `voice_default_derived: true`.
- `getOnboardingState()` at `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:248` short-circuits to `'configured'` when `voice_default_derived === true`.
- Result: every new workspace bypasses the tutoring flow entirely and lands in pull-mode.
- The tutoring flow is only reachable by clicking "Tune Aion's voice" in the AionSidebar overflow menu (`src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:973`), which is three levels of UI depth — not obvious.
- New users never experience the scenario the question describes unless they already know to look for that overflow item.

## Options

### Option A: First-chat voice prompt chip
- **What it is:** When `voice_default_derived === true` and no prior user messages exist in the session, `buildGreeting()` appends a chip: "This is Aion with a default voice — teach it yours?" Tapping the chip calls `resetAionVoiceConfig()` server-side then sends a synthetic `no_voice` opening message in the same turn.
- **Effort:** Small — changes `buildGreeting()` for the `configured` + `voice_default_derived` branch, adds one chip, one server action call path.
- **Main risk:** Annoying for users who tried Aion, liked the default, and don't want to be prompted again. Needs a "No thanks, default is fine" chip to dismiss without resetting.
- **Unlocks:** First-run users discover the voice tutoring flow naturally. The scenario from the queue item works without any manual steps.

### Option B: Voice setup section in Settings/Aion
- **What it is:** Add a `VoiceSetupSection` component to `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` with three inline-editable text areas for `description`, `example_message`, and `guardrails`. Saves via `saveAionVoiceConfig()` directly — no chat required.
- **Effort:** Medium — new UI component, needs design pass (stage-panel, density tokens), three controlled fields with save state.
- **Main risk:** Breaks the conversational-first philosophy. Users who set up voice in settings skip the tutoring conversation and don't learn how to edit it via chat. Chat and settings could diverge.
- **Unlocks:** Power users who want to edit voice config without having a conversation. Useful for workspace owners who inherited a default they want to tweak.

### Option C: Standalone `/aion/onboarding` route
- **What it is:** A dedicated page (or modal) that walks through the 3 voice questions as a form, with a "Generate test draft" step at the end. Linked from both the first-chat prompt and an empty-state card on `/aion`.
- **Effort:** Large — new route, new UI, session state across steps, test draft generation, design polish.
- **Main risk:** Adds a parallel path that can diverge from the chat-based version. Maintenance burden.
- **Unlocks:** A polished onboarding experience with progress indication. Good for a future "complete setup" nudge in the sidebar or lobby.

## Recommendation

**Option A.** The tutoring flow is fully built — the only thing missing is a door into it. A prompt chip on first chat is the lightest door. It respects the conversational-first design (the tutoring itself stays in chat), it's one code change in `buildGreeting()`, and it matches how the product already teaches capabilities (chip rows on cold-open). The "No thanks" dismiss path keeps it from being an annoyance for users who are content with the default.

Option B is worth adding later as a companion surface (settings editing is ergonomic for revision, chat is good for first setup), but it's a separate project, not a blocker for the scenario Daniel described. Option C is premature — Option A costs a fraction of the effort and covers the discovery gap completely.

The tradeoff you're accepting: the prompt appears even if Daniel has already used Aion with the default and is happy with it. Mitigate by only showing the chip on the very first session (check `cortex.aion_sessions` row count for the workspace — if zero, it's a genuinely fresh workspace).

## Next steps for Daniel

1. Confirm that `workspaces.aion_config` exists in the live DB — run `SELECT id, aion_config FROM workspaces LIMIT 3` in the SQL Editor to verify (the code assumes it, but the primer said otherwise).
2. Open `src/app/api/aion/chat/route/prompts.ts:349` and find the `configured` case in `buildGreeting()`.
3. Add a branch: when `config.voice_default_derived === true` AND the workspace has no prior sessions (`cortex.aion_sessions` count = 0), append a chip: `{ label: "Teach Aion your voice", value: "I'd like to teach Aion how I write" }` and a "Skip for now" dismiss chip.
4. In the chat route (`src/app/api/aion/chat/route.ts`), when the user sends "I'd like to teach Aion how I write", call `resetAionVoiceConfig()` for the workspace before the LLM turn, then proceed — `getOnboardingState()` will now return `no_voice` and the system prompt will force the tutoring branch.
5. Test the golden path: fresh workspace → open `/aion` → "Teach Aion your voice" chip → 3-turn setup → "Yes, try one" chip → draft appears.
6. Test the skip path: "Skip for now" → pull-mode greeting persists → no re-prompt on next session.

## References

- `src/app/(dashboard)/aion/AionPageClient.tsx` — Brain page (not paused)
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — config read/write, `AionConfig` type
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — `synthesizeDefaultVoice`, `applyVoiceDefaultIfEmpty`
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:225` — `OnboardingState` machine
- `src/app/api/aion/chat/route/prompts.ts:301` — `buildGreeting()` per state
- `src/app/api/aion/chat/tools/core.ts:118` — `save_voice_config` tool
- `src/app/api/aion/chat/tools/core.ts:318` — `draft_follow_up` tool
- `src/app/api/aion/lib/generate-draft.ts` — draft generation with voice injection
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:973` — "Tune Aion's voice" overflow item (current discovery path)
