# Aion voice setup: surfacing onboarding for new workspaces

_Researched: 2026-10-29 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

Both premises in the question are no longer accurate as of October 2026. The system has advanced significantly past the April 2026 primer.

**`aion_config` exists.** The JSONB column lives on `public.workspaces` and is read/written by `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:90-99`. The schema is `AionVoiceConfig` with three fields (`description`, `example_message`, `guardrails`) that map directly to the "3 paragraphs" the queue item describes.

**The chat route is fully operational.** `/api/aion/chat/route.ts` runs a tool-calling architecture with streaming, model routing, workspace scoping, and rate limiting. It is not paused.

**A 5-state conversational onboarding machine exists.** `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:225-257` defines `no_voice → no_example → no_guardrails → needs_test_draft → configured`. The greeting builder in `src/app/api/aion/chat/route/prompts.ts:309-347` returns specific opening messages for each state, including chips that guide the user through describing their style, pasting an example message, and stating their guardrails. The system prompt injects `save_voice_config` instructions for each state at `prompts.ts:284-291`.

**The test draft step is wired.** After `needs_test_draft`, the greeting offers to generate a draft from the top priority deal. `generateFollowUpDraft` in `src/app/api/aion/lib/generate-draft.ts` uses `AionVoiceConfig` directly and the `DraftPreviewCard` component renders the result inline.

**The blocking issue: synthesized-default bypass.** `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35-45` — `applyVoiceDefaultIfEmpty` is called on every config read. When no voice is stored, it synthesizes one from the workspace name and sets `voice_default_derived: true` in the returned object. `getOnboardingState` at `aion-chat-types.ts:247-248` checks `voice_default_derived === true` first and immediately returns `'configured'`, skipping all five onboarding steps. The synthesized default is NOT persisted to the database, but it fires on every read, so new workspaces permanently land in `'configured'` mode without ever being asked about their voice.

**Discovery gap.** `AionLandingStarters.tsx:48-52` has a `NEW_WORKSPACE_STARTERS` set but does not include a voice-setup CTA. `resetAionVoiceConfig` exists at `aion-config-actions.ts:214-256` and would re-enter the onboarding flow if called, but it is only surfaced in the sidebar's overflow menu — not visible to a first-time user.

## Intended state

A new workspace owner opens the Aion chat for the first time, is clearly invited to describe their communication style in three inputs (voice, example, guardrails), and within the same session sees a test draft generated from their top active deal. This is the "Phase A" goal from the design doc. The conversational flow for this is already built; it just needs a visible first-touch entry point.

## The gap

- New workspaces never see the conversational onboarding — the synthesized default bypasses `getOnboardingState` before it can return `no_voice`
- No first-time voice setup CTA exists on the Aion landing pane for workspaces with only a derived voice
- `resetAionVoiceConfig` (the reset path) is buried in the sidebar overflow — not discoverable on first visit
- The `NEW_WORKSPACE_STARTERS` array does not include a voice-setup prompt

## Options

### Option A: Add a voice setup CTA to the landing pane

- **What it is:** When `AionConfig.voice_default_derived === true`, render an extra starter card on the Aion landing pane ("Aion is using a default voice — let me show you how to customize it"). Tapping it calls `resetAionVoiceConfig` (server action, already exists), then fires the chat with an empty turn to trigger the `no_voice` greeting. The existing 5-state flow handles the rest.
- **Effort:** small — one new starter card condition in `AionPageClient.tsx` or `ChatInterface.tsx`, the server action call on tap, and no changes to the chat route or prompt logic
- **Main risk:** The `resetAionVoiceConfig` call clears `onboarding_state` and `voice_default_derived`, so the user's next chat open re-enters onboarding until they complete it. If they abandon mid-flow, the state machine handles recovery gracefully (each state has its own greeting).
- **Unlocks:** The existing conversational onboarding flow runs exactly as designed for new workspaces. No new UI surface.

### Option B: Stop synthesizing the default for fresh workspaces

- **What it is:** Gate `applyVoiceDefaultIfEmpty` on `config.onboarding_state === 'complete'` instead of firing on every empty-voice read. Fresh workspaces (no voice, no `onboarding_state`) start at `no_voice` naturally. Existing completed workspaces keep the synthesis fallback.
- **Effort:** small — one-line condition change in `aion-config-helpers.ts:39`; requires auditing callers that may rely on the synthesized default being present
- **Main risk:** Any workspace with a stored voice config that has been cleared or partially set (e.g., only `description`) would re-enter onboarding unexpectedly. Needs a migration or guard to mark all currently active workspaces as `onboarding_state: 'complete'`.
- **Unlocks:** Architecturally cleaner — the state machine drives everything without a bypass. Easier to reason about voice config completeness long-term.

### Option C: Dedicated voice setup page

- **What it is:** A form page at `/aion/setup` (or a panel within `/aion`) that shows the three `AionVoiceConfig` fields as textareas, saves on submit via `saveAionVoiceConfig`, then redirects to the chat where the `needs_test_draft` greeting fires automatically.
- **Effort:** medium — new page, new form component, redirect logic, and deciding when to route users there (first visit, `voice_default_derived` flag)
- **Main risk:** Duplicates the conversational setup path. Users who complete the form and users who complete the chat flow both end in the same state, but you now have two paths to maintain. The conversational flow already handles the "3 paragraphs" collection with better context-gathering (it asks follow-up questions).
- **Unlocks:** The most literal mapping of "write 3 paragraphs and see a draft." Better for users who prefer forms over chat.

## Recommendation

**Option A.** The conversational onboarding infrastructure is complete and well-designed — the greeting handlers, the state machine, the `save_voice_config` tool, and the test-draft step all exist and work. The only thing preventing new workspaces from reaching it is the missing entry point. A single CTA card on the landing pane that calls `resetAionVoiceConfig` and boots the chat is a 2-hour change that unlocks the entire existing flow.

Option B is architecturally cleaner but carries migration risk for existing workspaces. Save it for a cleanup sprint once the onboarding is validated. Option C builds more surface area for a problem the conversational flow already solves better — skip it.

The tradeoff in Option A: users who start onboarding and abandon mid-session will see the onboarding greeting on their next open until they complete it. This is correct behavior, and the individual state greetings ("Welcome back — I have your voice on file...") handle it gracefully.

## Next steps for Daniel

1. In `src/app/(dashboard)/aion/AionPageClient.tsx` (or `ChatInterface.tsx`), read `aionConfig.voice_default_derived` from the server-side config fetch that already happens at page load.
2. Pass a `showVoiceSetupPrompt` boolean down to `AionLandingStarters` (or render an inline card above the starters) when `voice_default_derived === true`.
3. The CTA text: "Aion is drafting in a default voice. Spend two minutes teaching it how you write." Button: "Set up your voice."
4. On click: call `resetAionVoiceConfig` (server action at `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:214`), then open the chat with an empty first turn to trigger the `no_voice` greeting from `prompts.ts:310-319`.
5. Verify the full flow: CTA → reset → no_voice greeting → chips → description saved → no_example greeting → example pasted → no_guardrails → guardrails → needs_test_draft → draft generated → `configured` state persisted.
6. Smoke test with a workspace that has no `aion_config` row (fresh account).

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — AionConfig type, saveAionVoiceConfig, resetAionVoiceConfig
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — applyVoiceDefaultIfEmpty (the bypass)
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:225-257` — 5-state onboarding machine
- `src/app/api/aion/chat/route/prompts.ts:284-347` — onboarding system-prompt injections + greeting handlers
- `src/app/api/aion/lib/generate-draft.ts` — draft generation wired to AionVoiceConfig
- `src/app/(dashboard)/(features)/aion/components/AionLandingStarters.tsx` — landing pane CTAs (add setup CTA here)
