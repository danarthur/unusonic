# Aion Phase A: voice setup + first follow-up draft

_Researched: 2026-08-21 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

_Note: this question was written around 2026-04-10. The stated prerequisites are no longer accurate — the research below reflects current state._

## Current state

**`aion_config` exists and is fully wired.** `public.workspaces.aion_config` is a JSONB column read by `getAionConfig()` at `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:84`. The `AionConfig` type (`aion-config-actions.ts:50`) includes `voice` (description, example_message, guardrails), `learned`, `follow_up_playbook`, `onboarding_state`, and `kill_switch`.

**The Brain tab is live.** `/aion` → `AionPageClient.tsx:66` → `ChatInterface` in chat mode. The chat route at `src/app/api/aion/chat/route.ts` is a full multi-tool authenticated route — not the 16-line stub described in the queue item.

**Voice onboarding flow exists in the chat.** A 5-state machine (`no_voice → no_example → no_guardrails → needs_test_draft → configured`) is implemented in `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247`. The greeting builder at `src/app/api/aion/chat/route/prompts.ts:300` handles each state with appropriate prompts and chips. The `save_voice_config` tool (`src/app/api/aion/chat/tools/core.ts:118`) writes to `aion_config` via `updateAionConfigForWorkspace`.

**Draft generation is functional.** `/api/aion/draft-follow-up` (`draft-follow-up/route.ts:1`) calls `generateFollowUpDraft` which injects `aionConfig.voice` (description, example_message, guardrails) into the generation prompt (`src/app/api/aion/lib/generate-draft.ts:63`). The `draft_follow_up` tool in the chat (`core.ts:318`) calls this and renders a `draft_preview` card.

**The blocker: `voice_default_derived` bypass.** `synthesizeDefaultVoice` (`aion-config-helpers.ts:20`) auto-fills voice from the workspace name. `applyVoiceDefaultIfEmpty` stamps `voice_default_derived: true` on every read when voice is unset. `getOnboardingState` (`aion-chat-types.ts:247`) returns `'configured'` immediately when this flag is set — so the 4-step onboarding flow never fires for any workspace.

**No standalone voice editing UI.** `AionSettingsView.tsx` covers only consent/beta toggle. The only path into voice setup today is: sidebar overflow → "Tune Aion's voice" → `resetAionVoiceConfig()` clears the default → next chat open triggers `no_voice` greeting. There is no form where Daniel can write paragraphs directly.

## Intended state

Daniel opens the Brain tab (or a settings page), writes how he communicates with clients (free-form, 3 paragraphs is fine), hits save, and the voice config is stored. He then asks Aion to draft a follow-up for an active deal and gets a message that sounds like him. The mechanism already exists end-to-end; what's missing is a direct UI path to set the voice without going through the conversational flow.

## The gap

- No form UI to edit `voice.description`, `voice.example_message`, `voice.guardrails` directly — `saveAionVoiceConfig` server action exists but nothing calls it from a form
- `voice_default_derived` bypass means the conversational onboarding flow is suppressed for all workspaces; "Tune Aion's voice" in the sidebar overflow is the only reset path and is undiscoverable
- First-run experience for `draft_follow_up` in chat: if no deals exist in `ops.follow_up_queue`, the tool returns "No deals in the follow-up queue" with no fallback; voice can be set but the test draft fails silently on an empty workspace
- The sidebar "Tune Aion's voice" overflow option is not visible to Daniel without already knowing to look for it

## Options

### Option A: Voice config form in settings/aion

- **What it is:** Add three textareas (description, example_message, guardrails) to `AionSettingsView.tsx` below the existing consent section. On save, call `saveAionVoiceConfig` (already exists). Saving an explicit voice clears `voice_default_derived` per the action's existing logic (`aion-config-actions.ts:190`), so the synthesized default is replaced and the state machine advances.
- **Effort:** Small — 1 component, 1 server action call, no schema changes.
- **Main risk:** Settings page is a secondary surface; Daniel may not think to look there before opening the Brain tab.
- **Unlocks:** A direct, non-conversational path to set voice. The chat draft tool works immediately after.

### Option B: First-run banner in the Brain tab

- **What it is:** When `voice_default_derived === true` (i.e. voice is synthesized, not explicit), render a soft banner in `ChatInterface` or `AionLandingStarters` with a CTA: "Your voice isn't set up — Aion is using a default. Tell me how you talk to clients." Clicking it calls `resetAionVoiceConfig()` and the chat immediately opens the `no_voice` onboarding greeting. Three conversational turns later, voice is set and a test draft is offered.
- **Effort:** Small-medium — detect flag from a server action, add a conditional banner, wire reset + auto-submit "start voice setup" message.
- **Main risk:** The conversational onboarding takes 3-4 turns before a draft appears; some users abandon before reaching the draft. Also requires at least one deal in the queue for the test draft to work.
- **Unlocks:** The intended in-chat experience. Keeps voice config inside the AI flow (teachable, correctable).

### Option C: Voice setup form in a modal from the Brain tab landing

- **What it is:** When `voice_default_derived === true`, show a "Set up Aion" card on the chat landing page (not the settings page). Card has three short textarea fields + a "Generate a test draft" button. On submit, calls `saveAionVoiceConfig`, then immediately hits `/api/aion/draft-follow-up` with the top-priority deal and renders the draft inline.
- **Effort:** Medium — new component, client-side state, two server calls, draft display.
- **Main risk:** Most complex. Requires a deal in the queue for the draft. Duplicates some of what the conversational flow does.
- **Unlocks:** The exact "write 3 paragraphs, see draft" experience from the queue item, without going through chat.

## Recommendation

Ship Option A first (settings form), then wire Option B's banner to point there.

Option A is the lowest-risk move that unblocks the whole chain: once voice is explicitly saved, every downstream path (chat drafts, deal-card drafts, dispatch emails) already reads it correctly. The `saveAionVoiceConfig` server action is already written and tested. The form is 30-50 lines of UI.

Option C is the most satisfying UX but it requires at least one deal to exist in the queue for the draft to work — a new workspace with no deals will see an error. Build Option C in a follow-up sprint once there's data to test against.

Option B (in-chat banner) is the right long-term home for voice onboarding and should be wired after A lands. The banner is small; the conversational flow handles all the edge cases the form doesn't (partial saves, clarifications, revision).

The tradeoff: Option A doesn't deliver the "write paragraphs, instantly see draft" moment. Accept that for now — voice saved via settings + "draft a follow-up for [deal]" in chat is one extra step and already works today.

## Next steps for Daniel

1. Add a `VoiceConfigForm` component to `src/app/(dashboard)/settings/aion/` with three textareas wired to `saveAionVoiceConfig` from `aion-config-actions.ts`.
2. Mount it in `AionSettingsView.tsx` below the consent section, guarded by `isAdmin` (same gate as cadence toggle).
3. Prefill the form from `getAionConfig()` so existing values are preserved on save.
4. Test: save voice config → open `/aion` → type "draft a follow-up for my top deal" → verify the draft matches the saved voice.
5. Follow-up (Option B): in `AionLandingStarters.tsx`, check for `voice_default_derived` and show a "Tell Aion how you communicate" CTA that routes to `/settings/aion` (or resets voice and opens onboarding).
6. Fix the empty-queue fallback in `draft_follow_up` (`core.ts:334`) — when no queue item exists, fall back to any active deal rather than erroring.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — `AionConfig`, `saveAionVoiceConfig`, `getAionConfig`, `updateAionConfigForWorkspace`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — `synthesizeDefaultVoice`, `applyVoiceDefaultIfEmpty`
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — `getOnboardingState`, 5-state machine
- `src/app/api/aion/chat/route/prompts.ts:300` — greeting builder per onboarding state
- `src/app/api/aion/chat/tools/core.ts:118` — `save_voice_config` tool; `core.ts:318` — `draft_follow_up` tool
- `src/app/api/aion/lib/generate-draft.ts:63` — voice injection into draft prompt
- `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` — current settings page (consent only)
- `src/app/(dashboard)/aion/AionPageClient.tsx` — Brain tab shell
