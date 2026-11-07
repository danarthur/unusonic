# Aion voice setup + first real draft: minimum path

_Researched: 2026-11-07 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

> _Note: the queue item's stated premises ("Brain tab paused", "aion_config doesn't exist") are outdated. This doc re-states current reality and identifies what's actually missing._

## Current state

**`aion_config` exists and is in active use.** `public.workspaces.aion_config` is a JSONB column already read and written by `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:93`. The column holds `voice`, `learned`, `follow_up_playbook`, `kill_switch`, and `onboarding_state` among other fields.

**The 5-state conversational onboarding is fully implemented.** `aion-chat-types.ts:225` defines `OnboardingState` as `no_voice → no_example → no_guardrails → needs_test_draft → configured`. On every cold open (empty `messages` array), `src/app/api/aion/chat/route.ts:126-130` calls `buildGreeting(onboardingState, ...)` which returns state-appropriate prompts and suggestion chips — including the "How would you describe your style?" capture at `no_voice` state (`prompts.ts:310-319`). The `save_voice_config` tool at `core.ts:118` persists each field back to `aion_config` as the user responds.

**A synthesized default voice silently blocks the onboarding.** `aion-config-helpers.ts:35-45` (`applyVoiceDefaultIfEmpty`) runs on every `getAionConfig()` read. When `aion_config.voice` is empty, it injects a generic placeholder and sets `voice_default_derived: true`. `getOnboardingState()` at `aion-chat-types.ts:248` returns `'configured'` immediately when that flag is set — so the 4-step forcing block never fires. New workspaces land in pull-mode chat without ever being asked about their voice. This was an intentional Wk 11 §3.8 decision to avoid blocking new users, but the trade-off is the voice setup is completely invisible.

**A re-tune path exists but is buried.** "Tune Aion's voice" in the AionSidebar header overflow (`AionSidebar.tsx:1043`) calls `resetAionVoiceConfig()`, which removes the voice fields and clears `voice_default_derived`. This re-enters the onboarding on the next chat open. It works, but requires the user to discover a secondary overflow menu.

**The draft route is fully wired.** `src/app/api/aion/draft-follow-up/route.ts` has auth, tier gate, kill-switch check, and voice injection into the prompt. `generate-draft.ts:63-74` injects `voice.description`, `voice.example_message`, and `voice.guardrails` into the system prompt. The `draft_follow_up` chat tool at `core.ts:318` also fires inside the chat interface, targeting the top-priority follow-up queue deal.

**The test-draft step depends on the follow-up queue.** `draft_follow_up` (core.ts:334) calls `getFollowUpQueue()`. If the queue is empty it returns `{ error: 'No deals in the follow-up queue.' }` — the `needs_test_draft` onboarding step fails silently with no draft shown.

## Intended state

Daniel opens Aion, describes his communication style in a few sentences, sees a real follow-up draft that reflects that style — without needing to discover any overflow menu, and without needing an active follow-up queue. The session ends with Daniel knowing Aion has his voice, and Aion having a confirmed style to generate drafts from.

## The gap

- Onboarding is blocked by `voice_default_derived` for all workspaces, old or new. The only reset is a buried overflow menu item.
- The test-draft step (`needs_test_draft`) silently fails when no deals are in the follow-up queue — a likely state for new setups.
- No easy entry point from the UI that says "set up your voice" without first knowing the overflow exists.

## Options

### Option A: Surface a "set up your voice" affordance when using default voice

- **What it is:** When `voice_default_derived === true`, show a subtle banner or inline chip in the AionSidebar header — something like "Using default voice — personalize it." Clicking it calls `resetAionVoiceConfig()` and the next chat open starts the 4-step capture flow. No new components; just a conditional in the existing sidebar header render.
- **Effort:** Small (10–20 lines in AionSidebar, one conditional)
- **Main risk:** The user clicks "personalize" but then has no active deal to generate the test draft against. If the queue is empty they hit a dead end at step 4.
- **Unlocks:** Easy discovery of the voice setup flow for any workspace currently on synthesized default.

### Option B: Make the test-draft step work without queue data

- **What it is:** When `needs_test_draft` fires and the queue is empty, `draft_follow_up` falls back to any active deal in the workspace (regardless of queue status). If no deals at all, it generates a labeled example using a canonical scenario ("a corporate inquiry, day 5 after sending a proposal"). The example is clearly marked "Example — no active deals yet."
- **Effort:** Small-medium (20–40 lines in `core.ts` `draft_follow_up` execute, add `getActiveDeals()` fallback)
- **Main risk:** A draft against a random active deal might confuse the user ("why did it pick that one?"). The canonical fake deal avoids this but is less grounded.
- **Unlocks:** The voice setup flow completes end-to-end regardless of pipeline state. Pairs naturally with Option A.

### Option C: Add a voice setup form in AionSidebar (settings panel)

- **What it is:** A three-field textarea form (description, example, guardrails) in the sidebar settings section. User writes their style directly, hits Save, and the next chat turn is a test draft using the saved voice. Sidesteps the conversational capture entirely.
- **Effort:** Medium (new settings panel, wire to `saveAionVoiceConfig`, trigger test draft on save)
- **Main risk:** Duplicates the conversational path. Two ways to set the same thing increases maintenance surface and confuses users about which is "correct." The conversational flow is already built and battle-tested.
- **Unlocks:** A direct "write your style in a form" experience as the queue item describes. But this is what the chat onboarding already does — just through conversation instead of a form.

## Recommendation

Ship Options A + B together. They're both small changes and together they close the scenario the queue item describes.

Option A gets the user into the voice setup flow without digging into an overflow menu — a one-line conditional in AionSidebar showing a chip when `voice_default_derived === true`. Option B ensures the flow completes whether or not there are queue deals. The conversational capture that already exists is the right interaction pattern; it doesn't need a form duplicate (Option C).

The end state: Daniel opens Aion, sees "Using default voice — personalize it", clicks it, describes his style in 2-3 chat turns, and sees a real draft (or a clearly-labeled example draft if the queue is dry). That's the scenario. The infrastructure is already there — just needs the door opened.

Option C is a distraction. The form experience the queue item imagines is essentially what the chat onboarding already does; the voice is captured conversationally across the same 3 paragraphs. No need to build a parallel form.

## Next steps for Daniel

1. In `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx`, find the sidebar header render (around line 973). Add a "Personalize voice" chip/button that shows when `aionConfig?.voice_default_derived === true`. Wire it to call `resetAionVoiceConfig()` and reload the chat.
2. In `src/app/api/aion/chat/tools/core.ts:324-346`, modify `draft_follow_up` execute: after the `queue.length === 0` check, add a fallback to fetch any active deal via a simple `getActiveDeals(workspaceId)` query. Fall back to a canonical labeled example only if no active deals exist.
3. Add a `getActiveDeals(workspaceId)` helper in `src/app/(dashboard)/(features)/events/actions/` — a lightweight query on `public.deals` filtered to `status NOT IN ('closed', 'cancelled')`, returning the top 1 by `updated_at`.
4. Smoke-test: reset `aion_config` to `{}` on the dev workspace, open `/aion`, verify the "personalize" chip shows, complete the 3-step capture, verify a draft renders.
5. Verify the `needs_test_draft` greeting + test-draft tool works end-to-end with no queue items (by clearing `ops.follow_up_queue` on dev).

## References

- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:973-1043` — sidebar header overflow, existing "Tune Aion's voice" action
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35-45` — `applyVoiceDefaultIfEmpty` (the blocking default)
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247-257` — `getOnboardingState` and the `voice_default_derived` short-circuit
- `src/app/api/aion/chat/route/prompts.ts:284-292, 310-347` — onboarding prompts per state + greeting builder
- `src/app/api/aion/chat/tools/core.ts:118-144, 318-346` — `save_voice_config` and `draft_follow_up` tools
- `src/app/api/aion/draft-follow-up/route.ts` — draft route with full auth + voice injection
- `src/app/api/aion/lib/generate-draft.ts:52-75` — `buildFollowUpPrompt` voice injection
