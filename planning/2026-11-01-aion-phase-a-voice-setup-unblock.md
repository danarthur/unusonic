# Aion Phase A: Unblock Voice Setup and First Real Draft

_Researched: 2026-11-01 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

Two of the three stated preconditions in the queue item are no longer accurate. The codebase is further along than the primer suggests.

**`aion_config` exists.** `public.workspaces.aion_config` is a live JSONB column. `getAionConfig` reads it at `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:84`. `saveAionVoiceConfig` writes to it at `aion-config-actions.ts:178`. The `AionConfig` type (lines 50–74) models `voice`, `learned`, `follow_up_playbook`, `onboarding_state`, and `kill_switch`.

**The chat route is fully built.** `/api/aion/chat/route.ts` is not a stub — it has auth, tier gating, onboarding state machine, intent routing, `streamText` with a tool-calling loop, and rolling summarization. The Brain tab (`AionPageClient.tsx:66`) renders `<ChatInterface viewState="chat" />` directly. No "paused" gate remains.

**The 4-step in-conversation onboarding exists.** `buildGreeting` at `src/app/api/aion/chat/route/prompts.ts:301` returns state-specific greetings for `no_voice`, `no_example`, `no_guardrails`, and `needs_test_draft`. The system prompt adds onboarding instructions for each state (lines 284–292).

**The bypass is the actual blocker.** `applyVoiceDefaultIfEmpty` in `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35` synthesizes a default voice from the workspace name when no voice is stored, and sets `voice_default_derived: true`. `getOnboardingState` in `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` returns `'configured'` whenever `voice_default_derived === true`. Any workspace with a name skips onboarding entirely and lands on the pull-mode greeting. The 4-step flow only fires if the override was put there intentionally in Wk 11 §3.8.

**`draft-follow-up` is live.** `src/app/api/aion/draft-follow-up/route.ts` is auth-gated, tier-gated, kill-switch-aware, and injects `aionConfig.voice` into the prompt via `generateFollowUpDraft` (`src/app/api/aion/lib/generate-draft.ts:25`).

**"Tune Aion's voice" exists but is buried.** `resetAionVoiceConfig` at `aion-config-actions.ts:214` clears the stored voice and `voice_default_derived`, which causes the next chat open to re-enter the `no_voice` state. It is wired to a sidebar overflow item in `AionSidebar`. Discovery requires the user to already be in the chat.

## Intended state

Daniel opens the Brain tab, sees a clear entry point to describe his communication style, writes 3 paragraphs (free-form, not a multi-turn interrogation), hits save, and immediately sees a follow-up draft that sounds like him. This should be discoverable as a first-run action — not buried behind a sidebar overflow. The voice description field already accepts arbitrary prose; the 3-paragraph goal maps directly to `AionVoiceConfig.description`.

## The gap

- The synthesized-default bypass (`voice_default_derived`) causes `getOnboardingState` to return `'configured'` for any named workspace. The 4-step flow never fires.
- The 4-step flow — even when it fires — collects voice across 4 sequential turns. There is no "write everything at once" path.
- The "Tune Aion's voice" affordance that re-enters the flow is in the sidebar overflow — invisible until the user has already used the chat.
- `draft-follow-up` requires a deal with `ops.follow_up_queue` entries. A workspace with no queued follow-ups has nothing to draft against in the test step.

## Options

### Option A: Surface a voice setup form on the Aion landing pane
- **What it is:** When `voice_default_derived === true` or `voice` is empty, the `ChatInterface` landing pane shows a "Set up your voice" banner with a single big textarea (maps to `voice.description`), an optional example message field, and an optional guardrails field. Submit calls `saveAionVoiceConfig`. If any deals have pending follow-ups, immediately fires `draft-follow-up` and renders the result inline.
- **Effort:** Medium (new UI component on landing pane; `saveAionVoiceConfig` and `draft-follow-up` already exist)
- **Main risk:** Requires at least one deal + follow-up queue entry to show the draft. An empty workspace sees "Voice saved" but no draft.
- **Unlocks:** The exact user story — open Brain tab, write prose, see draft that sounds right.

### Option B: Fix the default-voice bypass, let the conversation handle setup
- **What it is:** Remove the `voice_default_derived` short-circuit from `getOnboardingState` (or scope it to skip only on the `no_voice` greeting, not all states). The existing 4-step in-conversation flow fires for any workspace without an explicitly-saved voice. No new UI components.
- **Effort:** Small (one-line change in `aion-chat-types.ts:247` + test update)
- **Main risk:** Forces all existing users with `voice_default_derived === true` into the onboarding flow on next chat open. Jarring for any workspace already using Aion. The 4-step flow still collects voice one turn at a time — the "write 3 paragraphs" goal is partially met only if the user types long answers.
- **Unlocks:** In-conversation voice capture for new workspaces; existing users get an unwanted interrupt.

### Option C: Add a dedicated voice setup page in Settings
- **What it is:** Add a "Voice" section to `/settings/aion` with the same 3-field form as Option A. The existing `AionSettingsView.tsx` gains a voice tuning panel. No Brain-tab changes.
- **Effort:** Medium (UI additions to settings, same action calls)
- **Main risk:** Voice setup is in settings, not the Brain tab. The user flow is: open settings → configure voice → return to Brain tab → send first message → see draft. More steps, less magical.
- **Unlocks:** Voice setup for users who prefer a form over a chat; can be shipped independently without touching the chat flow.

## Recommendation

Ship Option A. The user story is specific about the Brain tab being the entry point, and the landing pane is the right place for a "Set up your voice" prompt — it is where the user already is, and the form can collapse after first save so it never appears again. The `saveAionVoiceConfig` action and `draft-follow-up` route are the complete write path; the only new code is the UI component that surfaces them.

One scoping decision: handle the "no deals yet" case gracefully. If `ops.follow_up_queue` returns nothing after the voice save, show a confirmation ("Voice saved. I will use this when drafting your first follow-up.") rather than an empty draft. This avoids the empty-workspace edge case without blocking the ship.

Option B is tempting because it is one line, but the side effect on existing workspaces is real and the multi-turn UX does not match the "write 3 paragraphs" intention.

Option C lands the capability but in the wrong place — settings is for configuration you already know you need, not for discovery on first use.

## Next steps for Daniel

1. Add a `VoiceSetupBanner` component to `src/app/(dashboard)/(features)/aion/components/`. Render it in `ChatInterface.tsx` when `voice_default_derived === true` — above `AionLandingStarters`.
2. The form: one primary textarea ("Describe how you write to clients — style, tone, anything I should know"), one optional textarea ("Paste a follow-up you have sent that landed well"), one optional field ("Any rules I should always follow?"). Submit calls `saveAionVoiceConfig`.
3. After successful save, call `GET /api/aion/draft-follow-up` via the existing `draft-follow-up` route — pick the top item from `ops.follow_up_queue` for this workspace. If nothing is queued, show a success state with no draft.
4. Hide the banner after save (store in `aion_config.onboarding_state = 'complete'`), so it never re-shows.
5. Wire the existing `resetAionVoiceConfig` sidebar-overflow item to clear `onboarding_state` too, so "Tune Aion's voice" brings the banner back.
6. Update `getOnboardingState` test in `src/app/(dashboard)/(features)/aion/components/__tests__/AionInput.test.tsx` to cover the new `onboarding_state = 'complete'` path.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — `saveAionVoiceConfig`, `resetAionVoiceConfig`, `AionConfig`, `AionVoiceConfig`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — `applyVoiceDefaultIfEmpty`, `synthesizeDefaultVoice`
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — `getOnboardingState`, `voice_default_derived` bypass
- `src/app/api/aion/chat/route/prompts.ts:284–347` — onboarding forcing block + greeting builders
- `src/app/api/aion/lib/generate-draft.ts` — `generateFollowUpDraft`, `buildFollowUpPrompt`
- `src/app/api/aion/draft-follow-up/route.ts` — draft generation endpoint
- `src/app/(dashboard)/aion/AionPageClient.tsx` — Brain tab entry point
- `src/app/(dashboard)/(features)/aion/components/ChatInterface.tsx` — landing pane + `AionLandingStarters` mount point
