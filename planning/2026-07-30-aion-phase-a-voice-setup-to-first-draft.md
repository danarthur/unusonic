# Aion Phase A: Voice Setup to First Draft

_Researched: 2026-07-30 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

**Note on premise:** The primer is dated 2026-04-10 and is significantly outdated. This research reflects the codebase as of 2026-07-30. The "Brain tab paused" and "aion_config doesn't exist" premises are both false.

## Current state

`aion_config` is a live JSONB column on `public.workspaces`, read by `getAionConfig()` at `aion-config-actions.ts:84` and written by `saveAionVoiceConfig()` at `aion-config-actions.ts:178`. The column holds `AionVoiceConfig` (description, example_message, guardrails), `AionLearnedConfig` (vocabulary, patterns), `AionFollowUpPlaybook`, and control flags.

The onboarding state machine is fully implemented. `getOnboardingState()` at `aion-chat-types.ts:247` resolves a config to one of five states: `no_voice → no_example → no_guardrails → needs_test_draft → configured`. `buildGreeting()` at `prompts.ts:292` returns appropriate prompts and chip rows for each state. The system prompt at `prompts.ts:275` injects onboarding instructions for each incomplete state.

The `save_voice_config` tool at `core.ts:118` persists voice fields and the `onboarding_complete` flag via `updateAionConfigForWorkspace`. The `draft_follow_up` tool at `core.ts:318` loads deal context, enriches it with semantic memory and entity facts, applies playbook rules, and generates a voiced draft. `ChatInterface` is live and production-ready; `AionInput` and `AionVoice` are wired. The `/api/aion/draft-follow-up` route at `draft-follow-up/route.ts:1` is auth-gated, tier-gated, and fully implemented. The `learn-from-edit` route at `learn-from-edit/route.ts:1` exists to extract preferences from draft edits.

In short: Phase A is architecturally complete. The conversational voice-setup loop exists end to end.

## Intended state

Daniel opens the Aion page, describes his communication style in a few paragraphs, and immediately receives a follow-up draft for a real deal that sounds like him. The voice config persists across sessions and influences every future draft Aion generates.

## The gap

- **Onboarding is auto-skipped for most workspaces.** `synthesizeDefaultVoice()` at `aion-config-helpers.ts:20` derives a default voice from the workspace name and sets `voice_default_derived: true`. `getOnboardingState()` returns `'configured'` when this flag is set, so the 4-step flow never fires. The only re-entry path is "Tune Aion's voice" in the sidebar header overflow, which calls `resetAionVoiceConfig()`. Daniel's workspace likely has this flag and bypasses voice setup entirely.
- **Empty queue kills the test draft.** `draft_follow_up` at `core.ts:334` returns `{ error: 'No deals in the follow-up queue.' }` when the queue is empty. The `needs_test_draft` greeting chip sends "Yes, draft a test message for my top priority deal" — if the queue is empty, this leads to an error.
- **No direct entry point from settings.** `AionSettingsView` at `AionSettingsView.tsx:90` shows deal-card beta and cadence toggles but has no section for viewing or editing voice config. The only path to the 4-step onboarding is via the sidebar overflow, which is not obviously the right place.

## Options

### Option A: Surface voice setup on first open when auto-derived

- **What it is:** When `voice_default_derived` is true and Daniel opens `/aion`, the `configured` greeting includes a second text block: "Your voice is set to a default. Want to tune how I write for your company? [chips: Tune my voice|Let me tune my voice, Looks fine|Looks fine, skip it]". The "Tune my voice" chip sends a message that triggers `resetAionVoiceConfig()` (via a new `reset_voice_config` tool or a synthetic turn) and drops into `no_voice` state on the next open.
- **Effort:** Small (1 day). Changes to `buildGreeting()` in `prompts.ts`, add one chip to the `configured` greeting branch.
- **Main risk:** Adds a chip to every `configured` greeting permanently, not just first visit. Filter on `voice_default_derived` flag to avoid showing it once voice is explicitly set.
- **Unlocks:** Daniel can enter voice setup without knowing the sidebar overflow exists.

### Option B: Fallback to any active deal for test draft

- **What it is:** In `draft_follow_up` at `core.ts:332`, when the queue is empty and no `dealId` is provided, fall back to fetching the most recent active deal directly (a `SELECT * FROM public.deals WHERE workspace_id = ? AND status != 'lost' ORDER BY created_at DESC LIMIT 1` query). Use a placeholder follow-up reason (`'Requested by user during voice setup'`).
- **Effort:** Small (half a day). Single change in the tool execute block.
- **Main risk:** Draft for a deal with no follow-up rationale may feel generic. Mitigate with a voice-setup-specific reason string in the prompt.
- **Unlocks:** `needs_test_draft` greeting chip always resolves to a real draft, even for workspaces whose queue hasn't been primed.

### Option C: Voice setup form in settings

- **What it is:** Add a `VoiceConfigSection` to `AionSettingsView` with three textareas (description, example_message, guardrails) that call `saveAionVoiceConfig()` on submit. Daniel pastes his 3 paragraphs into fields rather than going through chat.
- **Effort:** Medium (2–3 days). New component, wiring to the server action, UX for empty vs. populated state, and a reset affordance.
- **Main risk:** Bypasses the chat-driven learning loop entirely. The chat path is more conversational and leads to better-quality voice config because Aion asks clarifying questions. A form encourages copy-paste without reflection.
- **Unlocks:** Explicit, discoverable voice setup that doesn't require knowing the sidebar overflow or going through chat.

## Recommendation

Ship Option A and Option B together. They're both small (1.5 days combined), touch minimal surface area, require no new DB migration, and directly close the two gaps between the existing system and the end-to-end experience Daniel wants.

Option A fixes discoverability. The sidebar overflow is the right long-term home for "Tune voice" but it's invisible on first open. Adding a chip to the `configured` greeting when `voice_default_derived` is true costs nothing and surfaces the path naturally.

Option B fixes the dead-end. The queue being empty is the expected state for a new workspace, and the `needs_test_draft` experience fails silently right now. Falling back to any active deal makes the test draft reliable.

Option C is worth building eventually as a settings-level affordance — the form is more legible than the chat flow for power users who want to edit voice config without a conversation. But it's not the minimum viable path for Daniel's goal.

## Next steps for Daniel

1. In `src/app/api/aion/chat/route/prompts.ts` in `buildGreeting()`, find the `'configured'` case (around line 340). Add a check: if `workspaceId` is set, load the config and check `voice_default_derived`. When true, push an extra `suggestions` block after the warm greeting offering "Tune my voice" as a chip.
2. Add a `reset_voice_config` tool in `src/app/api/aion/chat/tools/core.ts` (or handle the "Tune my voice" user message in the system prompt as a signal to call `resetAionVoiceConfig()`). The server action exists at `aion-config-actions.ts:214`.
3. In `draft_follow_up` execute (core.ts, around line 332), change the empty-queue branch to query `public.deals` for the most recent active deal instead of returning an error. Use a fallback `queueItem` with reason `'Voice setup test draft'`.
4. Verify the end-to-end path: reset a test workspace's voice to `voice_default_derived`, open `/aion`, verify the chip appears, walk through `no_voice → no_example → no_guardrails → needs_test_draft`, request a draft, confirm it uses the voice config.
5. Once Option A + B are shipped, evaluate Option C (settings form) for the next sprint.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — voice config types, read/write actions
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — `synthesizeDefaultVoice`, `applyVoiceDefaultIfEmpty`
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — `getOnboardingState`
- `src/app/api/aion/chat/route/prompts.ts:275,292` — onboarding in system prompt and greeting
- `src/app/api/aion/chat/tools/core.ts:118,318` — `save_voice_config`, `draft_follow_up` tools
- `src/app/api/aion/draft-follow-up/route.ts` — standalone draft generation endpoint
- `src/app/api/aion/lib/generate-draft.ts` — `generateFollowUpDraft` shared utility
- `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` — current settings surface (no voice section)
