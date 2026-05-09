# Aion Phase A: unblocking voice setup and first real draft

_Researched: 2026-05-09 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

The primer is significantly out of date. The Aion voice setup and draft pipeline is already built end-to-end.

**`aion_config` column exists.** `src/types/supabase.ts:7689` shows `aion_config: Json` as a first-class column on `workspaces`. `getAionConfig()` at `aion-config-actions.ts:84` reads it; `saveAionVoiceConfig()` at `aion-config-actions.ts:178` and `updateAionConfigForWorkspace()` at `aion-config-actions.ts:262` write to it.

**Voice schema is defined.** `AionVoiceConfig` at `aion-config-actions.ts:12` has three fields: `description`, `example_message`, `guardrails`. These map exactly to the three things the queue item wants Daniel to write.

**The onboarding state machine is live.** `getOnboardingState()` at `aion-chat-types.ts:247` returns one of five states (`no_voice`, `no_example`, `no_guardrails`, `needs_test_draft`, `configured`). `buildGreeting()` at `prompts.ts:292` serves a distinct greeting for each state — the `no_voice` greeting asks "How would you describe your style?" with suggestion chips. `buildSystemPrompt()` at `prompts.ts:275-283` injects `=== ONBOARDING ===` instructions at each step.

**`save_voice_config` tool is wired.** `core.ts:118` defines the tool; it saves any combination of `description`, `example_message`, `guardrails` in a single call. When `onboarding_complete: true` is passed, it sets `aion_config.onboarding_state = 'complete'`.

**`draft_follow_up` tool is wired.** `core.ts:318` picks the top-priority deal from `ops.follow_up_queue`, calls `getDealContextForAion()`, enriches with semantic memory, and generates a draft via `generateFollowUpDraft()` at `generate-draft.ts:25`. Voice is injected into the system prompt at `generate-draft.ts:63-74`.

**The kill switch blocks everything.** The chat route at `chat/route.ts:109-113` returns "Aion is paused for this workspace. Resume it to continue." when `aion_config.kill_switch === true`. `toggleAionKillSwitch()` at `aion-config-actions.ts:292` is the write path — but no `.tsx` file calls it. There is no UI affordance to disable the kill switch.

**Voice default bypass skips onboarding.** `applyVoiceDefaultIfEmpty()` at `aion-config-helpers.ts:36-45` synthesizes a default voice from the workspace name and sets `voice_default_derived: true`. `getOnboardingState()` at `aion-chat-types.ts:248` short-circuits to `'configured'` when this flag is true — so a workspace with `kill_switch: false` but no explicit voice will skip the entire 4-step flow and land on the pull-mode greeting. The reset path exists: AionSidebar at line 1002 calls `resetAionVoiceConfig()` via a "Tune Aion's voice" overflow item, which clears the voice and `voice_default_derived` flag.

## Intended state

Daniel opens Brain tab. Because his workspace has no explicit voice set, the greeting asks about his communication style. He writes how he talks to clients. Over one or two conversational turns, Aion extracts and saves `description`, `example_message`, and `guardrails` via `save_voice_config`. Aion then calls `draft_follow_up` for a top deal and streams a draft that sounds like Daniel. He adjusts the draft in-chat; Aion learns from the edit via `learn-from-edit`.

The code can already produce this experience. The only things blocking it are data-state issues, not missing code.

## The gap

- `kill_switch` is `true` for Daniel's workspace — no UI to toggle it off
- `voice_default_derived: true` (or no voice fields) means opening Brain tab lands on the pull-mode greeting rather than the `no_voice` onboarding prompt — unless the sidebar overflow reset is used
- `ops.follow_up_queue` may be empty — the daily cron populates it; if it hasn't run or no deals score, `draft_follow_up` returns `{ error: 'No deals in the follow-up queue.' }`

## Options

### Option A: SQL unblock + sidebar reset (no code)
- **What it is:** Run SQL to set `kill_switch: false` on Daniel's workspace. Then use the existing "Tune Aion's voice" sidebar overflow to clear `voice_default_derived`. Trigger the follow-up queue cron manually to seed the queue.
- **Effort:** Small — 3 SQL / curl commands
- **Main risk:** None. This is reversible data surgery. If the cron hasn't seeded deals, the test draft returns an error message in-chat rather than failing silently.
- **Unlocks:** The full onboarding experience today, with zero new code.

### Option B: Add kill-switch toggle to settings + document the reset path
- **What it is:** Wire `toggleAionKillSwitch()` into the workspace settings page (a single toggle with a label like "Aion — pause all activity"). This is the permanent self-service fix. Also add a comment in `AionSidebar.tsx` linking the "Tune Aion's voice" overflow item to the voice setup onboarding for discoverability.
- **Effort:** Small — one settings field, one server action call, ~30 lines
- **Main risk:** Low. The action is already written; this is just UI surface.
- **Unlocks:** Any workspace owner can pause or resume Aion without touching SQL. Makes the kill switch usable in production.

### Option C: Build an explicit voice setup form
- **What it is:** A standalone `/aion/setup` page (or slide-over sheet from the Brain tab) with three labeled text areas (communication style, example message, rules). Submit calls `saveAionVoiceConfig`. On success, show a live draft from the top queue deal.
- **Effort:** Medium — new page/component, submit handler wiring, draft preview section
- **Main risk:** This duplicates the conversational onboarding (which already works). Two paths to the same config create inconsistency. The form also loses the rationale-capture that makes the conversational flow more accurate.
- **Unlocks:** A "write 3 paragraphs at once" UX for users who prefer a form over a conversation.

## Recommendation

Do Option A now (unblock today, 10 minutes), then Option B in the next sprint (make it durable).

Option C is a distraction. The conversational onboarding is the right UX — it captures rationale alongside the voice fields, which makes the drafts better. A form is a regression, not an upgrade. The queue item's framing of "3 paragraphs" is a goal description, not a UI prescription.

The real work is: turn off the kill switch so the Brain tab actually responds, ensure `voice_default_derived` is cleared so Daniel sees the `no_voice` greeting instead of the pull-mode one, and seed at least one deal in the follow-up queue so the test draft has something to work with. All of that is data state, not missing code.

After Option A: Daniel writes his style in chat, Aion saves it, generates a draft. That's Phase A done. Phase B (learning from edits, playbook rules) is already wired — it activates on its own once real sessions run.

## Next steps for Daniel

1. **Unblock kill switch.** In Supabase SQL editor: `UPDATE workspaces SET aion_config = aion_config || '{"kill_switch": false}'::jsonb WHERE id = '<your-workspace-id>';`
2. **Clear voice default.** In Supabase SQL editor: `UPDATE workspaces SET aion_config = aion_config - 'voice' - 'voice_default_derived' WHERE id = '<your-workspace-id>';`
3. **Seed the follow-up queue.** Hit `POST /api/cron/follow-up-queue` locally (or wait for the next daily run) so the `draft_follow_up` tool has a deal to work with.
4. **Open Brain tab.** The greeting should ask "How would you describe your style?" — that's the `no_voice` state firing correctly.
5. **Wire the kill-switch toggle.** In `src/app/(dashboard)/settings/components/settings-content.tsx`, add a toggle that calls `toggleAionKillSwitch()` from `aion-config-actions.ts:292`. This is the Option B fix — prevents future SQLing.
6. **Confirm onboarding works end-to-end.** After writing description + example + guardrails through the chat, ask Aion to draft a follow-up. Verify the draft sounds like the written voice, not the synthesized default.

## References

- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — `getOnboardingState()`, 5-state machine
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:50` — `AionConfig` type, `kill_switch`, `voice_default_derived`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:36` — `applyVoiceDefaultIfEmpty()`, the bypass
- `src/app/api/aion/chat/route/prompts.ts:275` — onboarding instruction injection
- `src/app/api/aion/chat/route/prompts.ts:292` — `buildGreeting()`, state-aware greetings
- `src/app/api/aion/chat/tools/core.ts:118` — `save_voice_config` tool
- `src/app/api/aion/chat/tools/core.ts:318` — `draft_follow_up` tool
- `src/app/api/aion/lib/generate-draft.ts:25` — `generateFollowUpDraft()`, voice injection
- `src/app/api/aion/chat/route.ts:109` — kill switch gate
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:1002` — "Tune Aion's voice" reset affordance
