# Aion Phase A: voice onboarding is shipped — here's what's actually missing

_Researched: 2026-08-25 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

_Note: this question was written when Phase A was unstarted. By August 2026 it is fully shipped. This doc re-states what's real, finds two concrete gaps in the implementation, and scopes the next step._

## Current state

`public.workspaces.aion_config` exists and is in active use. The column holds a typed `AionConfig` JSONB blob with `voice`, `learned`, `follow_up_playbook`, `onboarding_state`, `kill_switch`, and `voice_default_derived` fields — all defined at `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:50`.

The full 5-state onboarding machine is live. `getOnboardingState()` at `aion-chat-types.ts:247` maps the config to one of: `no_voice → no_example → no_guardrails → needs_test_draft → configured`. `buildGreeting()` at `chat/route/prompts.ts:292` returns state-appropriate messages for each. The chat system prompt at `prompts.ts:275` injects onboarding directives so the model knows which field to ask for next.

The `save_voice_config` tool at `chat/tools/core.ts:118` persists voice fields and advances onboarding state. The `draft_follow_up` tool at `core.ts:318` pulls real deal context via `getDealContextForAion`, enriches it with semantic search and entity memories, and calls `generateFollowUpDraft()` at `lib/generate-draft.ts:25`, which injects the workspace voice config into the generation prompt.

The `/api/aion/draft-follow-up` route at `api/aion/draft-follow-up/route.ts` is authenticated, tier-gated, and kill-switch-checked.

`lib/tone-anchoring.ts` pulls real outbound messages from `ops.messages` and builds a three-tier style preamble (recipient-specific → workspace-wide → default). The `learn-from-edit` route at `api/aion/learn-from-edit/route.ts` uses an LLM to extract vocabulary swaps and patterns from user edits, persisting them to `aion_config.learned` and `cortex.aion_memory`.

Two things look broken:

1. **`learn-from-edit` never fires correctly.** `ChatInterface.tsx:283` calls the route but omits `workspaceId` from the POST body. The route at `learn-from-edit/route.ts:46` requires it and throws "Missing fields" if absent. Since the call is fire-and-forget, the error is silent — the feedback loop that teaches Aion from draft edits has never worked.

2. **Onboarding is bypassed by default.** `applyVoiceDefaultIfEmpty()` at `aion-config-helpers.ts:35` synthesizes a default voice from the workspace name on every config read, setting `voice_default_derived: true`. `getOnboardingState()` short-circuits to `'configured'` when this flag is set (`aion-chat-types.ts:248`). This means any workspace that has not explicitly gone through voice setup (or reset it) opens Aion in pull-mode greeting with no onboarding — even if they've never described their style. The "Tune Aion's voice" reset lives in the sidebar overflow at `AionSidebar.tsx:1043`, which is not obvious.

## Intended state

A new workspace owner opens Aion, describes their communication style in a few paragraphs, and immediately receives a follow-up draft that mirrors their voice. When they edit that draft, Aion learns from the changes. Over time, `aion_config` accumulates real vocabulary swaps and patterns.

All the machinery for this exists. The gaps are: (a) the discoverability gap that prevents owners from entering the onboarding flow, and (b) the silent bug that prevents the learning loop from closing.

## The gap

- `workspaceId` missing from the `learn-from-edit` POST body in `ChatInterface.tsx:283` — route always returns `{ learned: false }` silently.
- Onboarding flow is bypassed for every workspace with a derived voice (i.e., all of them unless the owner manually resets via sidebar overflow → "Tune Aion's voice").
- No prominent entry point to start or redo voice setup — the reset path is one level deep in a menu that most users will never open.

## Options

### Option A: Fix the silent bug + expose the entry point
- **What it is:** Add `workspaceId` to the `learn-from-edit` call in `ChatInterface.tsx`. Add a "Customize your voice" button to the Aion settings page (`/settings/aion`) that calls `resetAionVoiceConfig()` and redirects to `/aion` — same outcome as the sidebar overflow, but surface-level visible.
- **Effort:** Small (one-line bug fix + one button)
- **Main risk:** The reset UX (sidebar overflow) already exists; a second entry point needs to be worded carefully to avoid duplication confusion.
- **Unlocks:** The learning loop actually closes. Owners who want to tune their voice can find the path without hunting through menus.

### Option B: Structured voice-setup form on the settings page
- **What it is:** A three-field form (description, example, guardrails) on `/settings/aion` that calls `saveAionVoiceConfig()` directly — bypassing the conversational onboarding entirely. Include a preview: "Here's how Aion would draft based on this voice." Also fix the `workspaceId` bug.
- **Effort:** Medium (new settings section + preview call to `draft_follow_up`)
- **Main risk:** Parallel paths (chat onboarding + settings form) can diverge in state. Must ensure `voice_default_derived` is cleared on a form save.
- **Unlocks:** Voice setup is explicit and inspectable without needing to go through chat. Owners can edit any field directly without resetting everything.

### Option C: Surface the onboarding flow on first /aion visit for unconfigured workspaces
- **What it is:** Remove the `voice_default_derived` short-circuit for workspaces that have been active for less than 7 days OR where the owner has never sent a real message. Let the 5-step onboarding flow fire naturally. Add a "Skip setup" chip at each step.
- **Effort:** Medium (onboarding state heuristic change + skip path)
- **Main risk:** Breaks the Wk 11 §3.8 decision that was made deliberately — that short-circuit solved real UX friction. Reverting it may re-introduce the friction it was solving.
- **Unlocks:** The original intended experience: owner opens Aion, writes their style, sees a draft. Directly matches the queue item's goal.

## Recommendation

**Option A first, then B.**

The `workspaceId` bug is a single-line fix and should ship immediately — the learning loop has been silently broken and every draft edit has been wasted training signal. Fix `ChatInterface.tsx:283` to pass `workspaceId`.

Then do Option B: add a structured voice setup form to `/settings/aion`. The conversational onboarding (Option C) adds friction for returning owners who want to tweak one field. A form is faster, inspectable, and composable with a voice preview. Keep the chat onboarding for workspaces that explicitly reset via sidebar overflow — it remains a valid path for someone who wants a more guided experience.

Do not pursue Option C. The `voice_default_derived` short-circuit was a deliberate Wk 11 decision. Reverting it requires re-validating the UX case and is higher risk than adding a form.

## Next steps for Daniel

1. **Fix the bug:** In `src/app/(dashboard)/(features)/aion/components/ChatInterface.tsx` around line 283, add `workspaceId` to the `learn-from-edit` POST body. The `workspaceId` prop is available in the component.
2. **Verify end-to-end works today:** Go to Aion sidebar overflow → "Tune Aion's voice" → reset → open `/aion`. The onboarding flow should fire. Write 3 paragraphs about your style and confirm Aion saves it and generates a draft.
3. **Add a voice setup section to settings:** In `src/app/(dashboard)/settings/aion/AionSettingsView.tsx`, add a three-field form (description, example, guardrails) that calls `saveAionVoiceConfig()`. Wire a preview button that POSTs to `/api/aion/draft-follow-up` with a mock deal context.
4. **Add a CTA to the Aion sidebar:** When `aionConfig.voice_default_derived === true`, show a subtle "Teach Aion your voice" affordance in the sidebar — linking to the settings form, not triggering the reset flow.
5. **Test the learning loop after the bug fix:** Edit a generated draft, then inspect `aion_config.learned.vocabulary` in Supabase to confirm patterns are landing.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — `AionConfig` type, `saveAionVoiceConfig`, `resetAionVoiceConfig`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — `synthesizeDefaultVoice`, `applyVoiceDefaultIfEmpty`
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — `getOnboardingState`
- `src/app/api/aion/chat/route/prompts.ts:292` — `buildGreeting` (all 5 states)
- `src/app/api/aion/chat/tools/core.ts:118` — `save_voice_config` tool
- `src/app/api/aion/chat/tools/core.ts:318` — `draft_follow_up` tool
- `src/app/api/aion/lib/generate-draft.ts` — voice injection into draft prompt
- `src/app/api/aion/learn-from-edit/route.ts` — learning from edits (has the `workspaceId` bug at caller site)
- `src/app/(dashboard)/(features)/aion/components/ChatInterface.tsx:283` — the bug
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:1043` — "Tune Aion's voice" reset entry point
