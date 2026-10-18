# Aion voice setup: what's missing for "write 3 paragraphs, get a draft"

_Researched: 2026-07-12 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

**Note on premise:** The queue item's assumptions are stale. The Brain tab is live, `aion_config` exists and is actively written from at least a dozen places, and the draft-follow-up route is fully implemented. This doc reframes the question around the actual gap.

## Current state

**`aion_config` is fully wired.** `public.workspaces.aion_config` stores a typed `AionConfig` JSONB blob with `voice`, `learned`, `follow_up_playbook`, and `kill_switch` fields. All queries route through `getAionConfigForWorkspace()` at `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:106`. Writes for voice go through `saveAionVoiceConfig()` at `aion-config-actions.ts:178`.

**The 5-state onboarding machine exists.** `getOnboardingState()` at `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` returns one of: `no_voice → no_example → no_guardrails → needs_test_draft → configured`. `buildGreeting()` at `src/app/api/aion/chat/route/prompts.ts:292` sends a state-appropriate first message. The system prompt at `prompts.ts:275-283` instructs Aion to step through voice collection conversationally and save via the `save_voice_config` tool.

**The draft route is live.** `src/app/api/aion/draft-follow-up/route.ts` calls `generateFollowUpDraft()` from `src/app/api/aion/lib/generate-draft.ts:26`, which injects `voice.description`, `voice.example_message`, and `voice.guardrails` into the system prompt at `generate-draft.ts:57-79`. Voice-aware drafts are end-to-end working.

**The 4-step flow is bypassed for all existing workspaces.** `synthesizeDefaultVoice()` at `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:20` auto-generates a generic voice from the workspace name. `applyVoiceDefaultIfEmpty()` at `aion-config-helpers.ts:35` sets `voice_default_derived: true` on every read. `getOnboardingState()` returns `configured` immediately when `voice_default_derived === true`, so the `no_voice` greeting and the 3-turn collection flow **never fire** for any workspace without an explicit voice already saved.

**The only re-entry point is buried.** The sidebar settings menu (`AionSidebar.tsx:982-1051`) has a "Tune Aion's voice" item that calls `resetAionVoiceConfig()`. This drops `voice`, `voice_default_derived`, and `onboarding_state` from the config. On the next chat open, the `no_voice` greeting fires. But: the settings icon in the sidebar header is a `SlidersHorizontal` icon with no label — it's not discoverable by someone unfamiliar with the interface.

## Intended state

Daniel opens the Brain tab. He is prompted (or can immediately navigate) to describe his communication style — essentially filling in three things: how he talks, a real example of a message he has sent, and any rules. He submits this, and the next thing he sees is a draft for an active deal that sounds like him. The whole thing takes 5 minutes.

## The gap

- **Auto-derived voice is invisible.** Aion is silently using a generic workspace-name-based voice, but Daniel never sees it, never confirms it, and has no indication it exists.
- **No discoverable entry point.** The path from "open Brain tab" to "set my voice" requires finding a small unlabeled icon in the sidebar, clicking a single menu item, and then starting a new chat. There is no prompt on first visit or when `voice_default_derived === true`.
- **Conversational collection = 3 separate turns.** The `no_voice → no_example → no_guardrails` flow is one question per turn. The queue item envisions a single "write it all now" moment. The 3-turn flow is fine for discovery but wrong for someone who already knows what they want to say.
- **`needs_test_draft` requires an active deal.** The test draft step at `buildGreeting` for `needs_test_draft` (line 329) offers to draft for a deal, but if no deal context is available the result is thin.

## Options

### Option A: Surface the synthesized default + inline edit in the first chat

**What it is:** When `voice_default_derived === true`, add a `LearnedSummaryCard`-style block to the greeting that shows Aion's auto-derived voice and says "This is what I am working from — want to refine it?" with inline edit chips. The user can approve or open a short edit flow without needing to find the sidebar setting.

**Effort:** Small — new greeting branch in `buildGreeting()`, a minimal inline card component, no new server actions needed.

**Main risk:** Still conversational; updating one field still requires a chat turn. Doesn't solve the "write 3 paragraphs in one shot" intent.

**Unlocks:** Discoverability. Users know their synthesized voice exists and can correct it.

### Option B: Dedicated voice editor form (recommended)

**What it is:** A `stage-panel` form with 3 labeled textareas (Voice description, Example message, Guardrails) pre-populated with the synthesized default. Accessible from the "Tune Aion's voice" sidebar item (currently opens a reset confirm; change it to open the form) AND from a first-chat banner when `voice_default_derived === true`. Saves via the existing `saveAionVoiceConfig()` server action. After save, auto-triggers a test draft for the user's top-priority open deal via `draft-follow-up`.

**Effort:** Medium — 1 new component (`VoiceEditorPanel`), 1 small modal or sheet wrapper, minor wiring changes to `AionSidebar.tsx` and `ChatInterface.tsx`.

**Main risk:** The form may feel out-of-place in a chat-first interface. Keep it minimal and inline (not a route change).

**Unlocks:** Exactly what the queue item describes. Single-shot voice definition → immediate draft. Synthesized default becomes visible and editable. Re-tuning no longer requires a 4-turn chat.

### Option C: Keep the chat flow; just improve re-entry discoverability

**What it is:** Add a labeled "Set up your voice" button in the Brain tab's empty-state or a persistent banner in `ChatInterface.tsx` when `voice_default_derived === true`. Clicking it calls `resetAionVoiceConfig()` and starts a new chat. The conversational 4-step flow runs as designed.

**Effort:** Small — 2 small UI changes (`ChatInterface`, possibly `AionPageClient`), no new server actions.

**Main risk:** Still requires 3 back-and-forth turns plus a draft request turn. The "write 3 paragraphs and immediately see a draft" experience is not achieved in one shot.

**Unlocks:** Discoverability only.

## Recommendation

**Option B.** The synthesized default voice is the right safeguard (no broken experience for new workspaces), but it creates a false sense of completion. Daniel cannot see what Aion thinks his voice is, cannot correct it in one move, and cannot go straight to a draft that reflects his actual style.

A small voice editor form pre-filled with the synthesized default solves all three gaps: it makes the auto-derived content visible, gives a single-shot edit path, and pipes directly into a test draft. The implementation touches two well-understood surfaces (a new UI component + small wiring in the sidebar) and does not change the database schema at all — `saveAionVoiceConfig()` already handles the write correctly.

Accept the tradeoff that the form feels slightly out of tone with the chat-first interface. Keep it compact — 3 textareas under 3 labels, a single "Save and generate a test draft" button. The form is not a settings page; it is a one-time setup moment that disappears once voice is explicitly saved (when `voice_default_derived` is absent from the config).

## Next steps for Daniel

1. Confirm that `saveAionVoiceConfig()` is the correct write path (`aion-config-actions.ts:178`) — no schema changes needed.
2. Create `src/app/(dashboard)/(features)/aion/components/VoiceEditorPanel.tsx` — a `stage-panel` with 3 textareas pre-populated from `getAionConfig()`, saving via `saveAionVoiceConfig()`.
3. Update `AionSidebar.tsx:998-1012` — change `handleTuneVoice` from calling `resetAionVoiceConfig` to opening the panel (pass an `onOpenVoiceEditor` prop).
4. In `ChatInterface.tsx`, add a `voice_default_derived` check: when `true` and the user has no sent messages yet, render a small "Your voice is auto-configured — refine it here" banner that opens the editor panel.
5. After save in the panel, fire a POST to `/api/aion/draft-follow-up` using the first item from the follow-up queue as context (or skip if queue is empty), and display the result as a `DraftPreviewCard`.
6. Write a manual test: reset via `resetAionVoiceConfig()` in console → open Brain tab → edit form → save → confirm `aion_config.voice` has `voice_default_derived` absent → confirm draft appears.

## References

- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — `getOnboardingState()`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:20,35` — synthesized default + bypass logic
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:178,214` — `saveAionVoiceConfig`, `resetAionVoiceConfig`
- `src/app/api/aion/chat/route/prompts.ts:275-283,292` — onboarding system prompt branches + `buildGreeting`
- `src/app/api/aion/lib/generate-draft.ts:57-79` — voice injection into draft prompt
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:982-1051` — "Tune Aion's voice" menu item
- `src/app/(dashboard)/(features)/aion/components/DraftPreviewCard.tsx` — existing draft card (reuse for test draft display)
