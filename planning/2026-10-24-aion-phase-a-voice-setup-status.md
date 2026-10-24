# Aion Phase A: Voice Setup + First Draft — Current Status

_Researched: 2026-10-24 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

---

**Note on premise:** This question was written against the state of the codebase as of approximately 2026-04-10. The primer captures that snapshot. As of 2026-10-24, the premise is outdated — Phase A has been shipped. The research below documents what exists and where the actual remaining gaps are.

---

## Current state

**`aion_config` exists and is fully wired.** The column lives on `public.workspaces` and is read by `getAionConfig()` and `getAionConfigForWorkspace()` at `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:84,106`. It holds `voice`, `learned`, `follow_up_playbook`, `kill_switch`, and `voice_default_derived`.

**Brain tab is live.** `src/app/(dashboard)/aion/AionPageClient.tsx:73` renders `<ChatInterface viewState="chat" ...>` directly — no paused gate.

**Full chat route is live.** `/api/aion/chat/route.ts` is authenticated (line 59–67), model-routing, tool-calling. The 16-line GPT-4-turbo stub referenced in the primer has been replaced entirely.

**Voice onboarding 5-state machine is implemented.** `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` defines `getOnboardingState()`. States: `no_voice → no_example → no_guardrails → needs_test_draft → configured`. The greeting builder at `src/app/api/aion/chat/route/prompts.ts:308` serves a different cold-open for each state, and the system prompt injects `=== ONBOARDING ===` instructions at lines 284–293.

**`save_voice_config` and `draft_follow_up` tools are registered.** `src/app/api/aion/chat/tools/core.ts:318` and `:649`.

**Voice injection into drafts is live.** `src/app/api/aion/lib/generate-draft.ts:52` reads `voice.description`, `voice.example_message`, and `voice.guardrails` into the system prompt. The `/api/aion/draft-follow-up` route loads `aion_config` and passes voice to `generateFollowUpDraft`.

**"Tune Aion's voice" affordance exists.** `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:1043` surfaces this in the header overflow, calling `resetAionVoiceConfig()` which clears the stored voice and `voice_default_derived`, so the next chat open re-enters the `no_voice` greeting.

**learn-from-edit loop is live.** `/api/aion/learn-from-edit/route.ts` extracts vocabulary swaps from edits and merges them back into `aion_config.learned`.

## Intended state

Daniel opens the Brain tab, triggers voice setup, writes in plain language how he talks to clients, and sees a follow-up draft that sounds like him. The flow then self-improves as he edits drafts.

Per the code's 5-state machine: the flow is `no_voice` (describe style) → `no_example` (paste a real message) → `no_guardrails` (name any hard rules) → `needs_test_draft` (Aion offers a draft) → `configured` (normal operation). Every step is implemented and live.

## The gap

- **Cold-start discoverability.** New workspaces get `voice_default_derived: true` via `applyVoiceDefaultIfEmpty` (`aion-config-helpers.ts:35`), which synthesizes a generic voice from the workspace name. `getOnboardingState` returns `configured` immediately. Daniel opens the Brain tab and sees the normal greeting — no prompt to set up voice. The setup path only unlocks via sidebar overflow → "Tune Aion's voice".

- **No dedicated voice-setup form.** The settings page at `/settings/aion` covers consent and beta flags only. Voice tuning is entirely chat-guided. There is no form where Daniel can paste 3 paragraphs and hit save.

- **Test draft requires active deals.** The `needs_test_draft` step instructs Aion to call `draft_follow_up`, which needs `getActiveDeals` to return something. A fresh workspace with zero deals will fail or skip this step silently.

## Options

### Option A: Smoke-test the end-to-end today
- **What it is:** Daniel clicks "Tune Aion's voice" in the sidebar → works through the 5-step flow → verifies the test draft sounds right → done. No code changes. Just validation.
- **Effort:** Small (under 30 minutes)
- **Main risk:** May surface a bug in the `needs_test_draft → draft_follow_up` tool call (no active deals = empty draft; edge case in voice injection).
- **Unlocks:** Knowing whether Phase A is actually complete or has a latent bug before building more on top of it.

### Option B: Improve cold-start discoverability
- **What it is:** On first Brain tab load for a workspace with `voice_default_derived: true`, render a visible nudge ("Aion is using a generic voice — customize it for better drafts") with a button that calls `resetAionVoiceConfig` and immediately shows the `no_voice` greeting. One component change in `ChatInterface` or `AionPageClient`.
- **Effort:** Small-medium (2–4 hours)
- **Main risk:** The nudge feels pushy if it shows on every session, not just once. Needs a "dismiss" that writes `onboarding_nudge_dismissed: true` to aion_config.
- **Unlocks:** Makes the voice setup path self-discovering without requiring users to find the sidebar overflow.

### Option C: Dedicated voice-setup panel in settings
- **What it is:** Add a "Voice" section to `/settings/aion` with three text areas (style description, example message, guardrails) that call `saveAionVoiceConfig` directly. Bypasses the chat flow entirely.
- **Effort:** Medium (half day)
- **Main risk:** Diverges from the chat-guided path that also builds `learned` rules and follow-up playbook. Two separate entry points for voice creates a confusing mental model.
- **Unlocks:** Non-chat pathway for owners who want to configure voice without a conversation.

## Recommendation

**Do Option A first.** The end-to-end is implemented and the question's stated goal ("see a draft that respects that voice") should already work. Validating this costs 30 minutes and will either confirm Phase A is done or surface a specific bug to fix. Building more discoverability or a settings form on top of a broken foundation is wasted effort.

If Option A confirms everything works: move to Option B next. Cold-start discoverability is the single most likely reason Daniel hasn't encountered this flow — the `voice_default_derived` shortcut means new workspaces never see the onboarding. A single one-time nudge in `AionPageClient` is a small, safe change. Option C is lower priority; the chat-guided path is more powerful because it also captures follow-up rules and preferences during the same session.

## Next steps for Daniel

1. Open the Brain tab at `/aion`.
2. Click the three-dot overflow in the sidebar header → "Tune Aion's voice" → confirm. This calls `resetAionVoiceConfig` and reloads the `no_voice` greeting.
3. Work through the 4 steps (style → example → guardrails → test draft). Note any steps that fail or skip.
4. If the test draft step fails (no active deals): go to the CRM, open a deal in progress, return to `/aion?deal=<id>`, and retry.
5. If all 4 steps work and the draft sounds right: Phase A is done. File a note to add the cold-start nudge (Option B) in the next sprint.
6. If a step breaks: check the browser console and `/api/aion/chat` response body — the failure will be in the tool call result or the `draft_follow_up` response.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — `AionConfig` type, `getAionConfig`, `saveAionVoiceConfig`, `resetAionVoiceConfig`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — `synthesizeDefaultVoice`, `applyVoiceDefaultIfEmpty`
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — `getOnboardingState` state machine
- `src/app/api/aion/chat/route/prompts.ts:284,308` — onboarding system-prompt injection and greeting builder
- `src/app/api/aion/lib/generate-draft.ts:52` — voice injection into draft prompts
- `src/app/(dashboard)/aion/AionPageClient.tsx:73` — Brain tab rendering (no paused gate)
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:1043` — "Tune Aion's voice" affordance
- `src/app/api/aion/chat/tools/core.ts:318` — `draft_follow_up` and `save_voice_config` tool definitions
