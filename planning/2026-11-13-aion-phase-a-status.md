# Aion Phase A: voice setup + first draft — current status

_Researched: 2026-11-13 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

_Note: this question was written against April 2026 state. The premises are no longer true. This doc documents what has shipped and identifies the remaining gap._

## Current state

Phase A is complete. Everything the question named as "not started" is now live.

`public.workspaces.aion_config` exists and is read/written via server actions in `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:84–120`. The `AionConfig` type covers `voice`, `learned`, `follow_up_playbook`, `onboarding_state`, `kill_switch`, and `learn_owner_cadence`.

The Brain tab is live. `src/app/(dashboard)/aion/AionPageClient.tsx:66–76` renders `ChatInterface` unconditionally — no paused banner.

`/api/aion/draft-follow-up/route.ts:1–73` is fully authenticated (Supabase session), tier-gated via `canExecuteAionAction`, kill-switch-aware, and calls `generateFollowUpDraft` from `src/app/api/aion/lib/generate-draft.ts`. The generate function injects `voice.description`, `voice.example_message`, and `voice.guardrails` into the system prompt.

The 4-step in-chat onboarding is wired. The chat route prompt builder (`src/app/api/aion/chat/route/prompts.ts:284–292`) injects state-specific instructions for `no_voice → no_example → no_guardrails → needs_test_draft`. Each state has a cold-open greeting with chips (`prompts.ts:309–347`). The `save_voice_config` tool (`src/app/api/aion/chat/tools/core.ts:118–144`) and `draft_follow_up` tool (`:318–`) are both registered in the chat route.

The `voice_default_derived` bypass (Wk 11 §3.8): new workspaces get a synthesized voice derived from the workspace name via `synthesizeDefaultVoice` (`aion-config-helpers.ts:20–27`). This makes `getOnboardingState` return `configured` immediately — skipping the 4-step. Re-entry is via sidebar overflow "Tune Aion's voice" → `resetAionVoiceConfig` → drops stored voice → next chat triggers `no_voice` greeting. The affordance exists in `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:1041–1044`.

Edit learning is live. When a user edits an Aion draft, `ChatInterface.tsx:283` fires `POST /api/aion/learn-from-edit` which extracts vocabulary swaps and episodic memories and writes them back to `aion_config.learned` and `cortex.aion_memory`.

Tone anchoring (`src/app/api/aion/lib/tone-anchoring.ts`) reads real outbound messages from `ops.messages` and builds a three-tier preamble (recipient-specific → workspace-wide → default) to inject into draft generation.

## Intended state

The original ask — open Brain tab, describe communication style, see a voice-tuned follow-up draft — is achievable today via: sidebar overflow "Tune Aion's voice" → 4-step onboarding collects description, example message, guardrails → `needs_test_draft` state → Aion offers test draft → `draft_follow_up` generates one using the saved voice config. After approval, `save_voice_config(onboarding_complete: true)` advances to `configured`.

## The gap

Phase A prerequisites are met. The residual gap is discoverability:

- Users who sign up today land in `configured` state via synthesized default and never see the 4-step flow unless they know to find "Tune Aion's voice" in the sidebar overflow (a secondary menu that most users won't find unprompted).
- There is no in-product signal that says "you're on a default voice — tell me how you actually write."
- Tone anchoring only produces workspace-wide anchors once real outbound messages exist in `ops.messages`. New workspaces start with zero messages, so early drafts use the synthesized generic voice regardless of voice config.
- No telemetry tracks how many workspaces are still on `voice_default_derived: true`.

## Options

### Option A: Soft nudge card in the Brain sidebar

**What it is:** A `StagePanel` notice card below the session list in `AionSidebar`, visible only when `voice_default_derived === true` and not dismissed. "Aion is using a default voice. Take 2 minutes to tune it." — one button calls `resetAionVoiceConfig` then opens a new session. `localStorage` dismissal so it appears once per workspace, 30-day window.

**Effort:** Small — one card component, one prop threaded to the sidebar, `localStorage` dismiss following the pattern in `AionFirstVisitPrompt.tsx:14–43`.

**Main risk:** Mildly annoying to workspaces that explicitly chose not to tune. Low risk now; grows as user base does.

**Unlocks:** Explicit voice data for drafts, closes discoverability gap without blocking anything.

### Option B: First-open interstitial for owners on synthesized voice

**What it is:** On the first visit to `/aion` by a workspace owner where `voice_default_derived === true`, show a full-screen interstitial with two paths: "Tell me how you write" (enters 4-step) or "Skip for now" (permanent dismiss). Tracks state in `aion_config.onboarding_state`.

**Effort:** Medium — interstitial component, URL state management, server-side dismiss tracking.

**Main risk:** Interrupts the frictionless "just use it" experience that the Wk 11 bypass deliberately created.

**Unlocks:** Higher conversion to explicit voice — at the cost of a heavier first-open.

### Option C: Implicit learning only — no explicit setup path

**What it is:** Lean fully on `learn-from-edit` and tone anchoring. Remove "Tune Aion's voice" as a user-facing path. Voice personalizes entirely from observed edits after a threshold (e.g. 5 edits).

**Effort:** Small for removal, medium for user communication of the tradeoff.

**Main risk:** Early draft quality stays generic for new workspaces with no edit history. For a founder reviewing every draft personally, this matters immediately.

**Unlocks:** Zero onboarding friction. Only viable once draft volume is non-trivial.

## Recommendation

Option A. It is small, respects the Wk 11 decision to skip forced onboarding, and closes the only real open issue: a new owner has no way to discover voice tuning exists. The nudge card reads as a capability disclosure, not a gate. Dismiss it once and it's gone.

Option B creates friction the Wk 11 bypass was specifically designed to avoid. Option C is the right long-term direction but premature: there is no edit history yet to learn from, so the first few months of drafts would be generic without an escape valve.

The nudge should appear only for owners (`role = owner`) on a synthesized voice and use the same 30-day `localStorage` window as `AionFirstVisitPrompt`. After 30 days it resurfaces once — a workspace that has been using Aion for a month may actually want to tune now that they have context on its output.

## Next steps for Daniel

1. Thread `voiceDefaultDerived` as a prop from the page server component → `AionSidebar` by reading `getAionConfig()` in `src/app/(dashboard)/aion/page.tsx`.
2. Add a `StagePanel` nudge card inside `AionSidebar` gated on `voiceDefaultDerived && !dismissed`. Single button: fires `resetAionVoiceConfig`, then calls `startNewSession()` from the session context.
3. Wire `localStorage` dismissal — key `aion-voice-nudge-dismissed-at`, 30-day window, same pattern as `AionFirstVisitPrompt.tsx:14–43`.
4. Add a unit test in `aion-config-actions.test.ts` asserting `resetAionVoiceConfig` clears `voice_default_derived` from the stored config (it clears `_flag` today; confirm the written row omits the key).
5. Consider adding `voice_explicit: boolean` to the `aion.metric_cost_per_seat` aggregation so you can track synthesized-vs-explicit voice across workspaces from the admin telemetry dashboard.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — `getAionConfig`, `resetAionVoiceConfig`, `updateAionConfigForWorkspace`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — `synthesizeDefaultVoice`, `applyVoiceDefaultIfEmpty`
- `src/app/api/aion/chat/route/prompts.ts:284–347` — onboarding state injection + per-state greetings
- `src/app/api/aion/chat/tools/core.ts:118–144` — `save_voice_config` tool; `318+` — `draft_follow_up` tool
- `src/app/api/aion/draft-follow-up/route.ts` — authenticated draft generation
- `src/app/api/aion/lib/generate-draft.ts` — `generateFollowUpDraft`, `buildFollowUpPrompt`
- `src/app/api/aion/lib/tone-anchoring.ts` — observed-message tone system
- `src/app/api/aion/learn-from-edit/route.ts` — edit-learning loop
- `src/app/(dashboard)/aion/AionPageClient.tsx:66–76` — Brain tab (live, no pause gate)
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:972–1044` — "Tune Aion's voice" affordance
- `src/app/(dashboard)/(features)/aion/components/AionFirstVisitPrompt.tsx` — `localStorage`-dismiss pattern to replicate
