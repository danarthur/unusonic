# Aion Voice Setup: First-Run Discovery

_Researched: 2026-08-12 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

_Note: this question was written against the April 2026 state of the codebase. The premise has changed. Both stated blockers no longer exist. This doc re-frames the actual gap._

## Current state

**The Brain tab is live.** `AionPageClient.tsx:73` renders `<ChatInterface viewState="chat" workspaceId={workspaceId} />` directly — no pause, no stub. The `/aion` route is fully functional.

**`aion_config` already exists.** `aion-config-actions.ts:93-99` reads/writes `public.workspaces.aion_config` as JSONB. The `AionConfig` type (`aion-config-actions.ts:50-74`) includes `voice.description`, `voice.example_message`, `voice.guardrails`, and learned state.

**`/api/aion/chat/route.ts` is a 450-line authenticated route** — not a stub. It handles auth, rate limiting, tier gating, onboarding state resolution, voice config injection, tool-calling, and streaming. Fully wired.

**The onboarding state machine is complete.** `aion-chat-types.ts:225-257` defines 5 states: `no_voice → no_example → no_guardrails → needs_test_draft → configured`. The greeting builder in `prompts.ts:292-348` returns distinct messages for each state. The system prompt for `no_voice` tells the model to "Ask about communication style. Save via save_voice_config." (`prompts.ts:276`).

**Both required tools exist.** `save_voice_config` saves voice description, example, and guardrails in one or multiple calls (`core.ts:118-144`). `draft_follow_up` generates a draft for the top-priority queue deal, optionally enriched with semantic memory (`core.ts:318+`).

**`/api/aion/draft-follow-up/route.ts` is fully built** — auth, tier gate, voice config injection, `generateFollowUpDraft` from `generate-draft.ts`. Voice config flows into the prompt at `generate-draft.ts:63-75`.

**The actual blocker:** `aion-config-helpers.ts:35-44` — `applyVoiceDefaultIfEmpty` synthesizes a voice from the workspace name and sets `voice_default_derived: true` whenever no explicit voice is stored. `getOnboardingState` returns `'configured'` immediately when `voice_default_derived: true` (`aion-chat-types.ts:248`). Every new workspace skips the onboarding loop entirely. The only path into it today is finding "Tune Aion's voice" in the sidebar overflow (`AionSidebar.tsx:31`, uses `resetAionVoiceConfig`), which is buried behind a `MoreHorizontal` menu.

## Intended state

Daniel opens `/aion`. He is not silently routed to a configured state with a synthesized voice. Something visible invites him to teach Aion his voice. He writes his communication style, pastes an example, sets a guardrail. The next message is a real draft for an active deal, using his voice. The flow respects what he typed, not a workspace-name-derived placeholder.

The infrastructure to do all of this exists. What's missing is the first touchpoint that makes the onboarding visible to someone who didn't know to look in the sidebar overflow.

## The gap

- Every workspace starts in `configured` state (synthesized default voice), never in `no_voice`
- "Tune Aion's voice" lives in the sidebar's `MoreHorizontal` overflow — not discoverable for new users
- No first-run prompt, banner, or CTA surfaces the voice setup when `voice_default_derived: true`
- The `needs_test_draft` step requires at least one deal in the follow-up queue; an empty queue returns `{ error: 'No deals in the follow-up queue.' }` (`core.ts:334`)

## Options

### Option A: Add a first-run banner to the configured greeting

- **What it is:** When `getOnboardingState` returns `'configured'` and `config.voice_default_derived === true`, the greeting includes an extra message block — a short card explaining that Aion is running on a synthesized default voice, with a CTA to start the 4-step guided setup. Clicking the CTA calls `resetAionVoiceConfig` (already exists) from the client, then re-fetches the greeting, which now returns the `no_voice` state. From there, all existing onboarding logic takes over: describe style → example → rules → test draft.
- **Effort:** Small. Changes confined to `buildGreeting` in `prompts.ts` (add one branch to the `configured` case) and the client-side chat UI to render the new card type. No new API routes, no schema changes.
- **Main risk:** The re-fetch after `resetAionVoiceConfig` must clear the in-memory session state and trigger a new `/api/aion/chat` POST with `messages: []`. If the client doesn't reset the message history, the greeting card is re-sent into an existing thread instead of a cold open.
- **Unlocks:** The complete `write 3 paragraphs → see a draft` path, using all existing infrastructure. Sets `voice_default_derived` to false after Daniel explicitly saves his voice.

### Option B: Surface "Tune Aion's voice" as a visible page affordance

- **What it is:** For workspaces where `voice_default_derived === true`, render a persistent `stage-panel` strip (or a prominent button row) at the top of the Aion page — outside the chat thread — labeled something like "Aion is using a default voice. Teach it how you write." Button calls `resetAionVoiceConfig` and starts a new chat. The sidebar overflow affordance stays as-is; this is an additive surface-level CTA.
- **Effort:** Small-medium. Requires the Aion page server component to read `aion_config` at render time and pass the `voice_default_derived` flag down to a new client component. No routing changes, no new tools.
- **Main risk:** The flag must be re-read on every page load, or it persists the "set up your voice" banner even after the user completes setup. Server component re-render handles this correctly; a stale client-side cache would not.
- **Unlocks:** Same outcome as Option A but the trigger lives on the page layout rather than inside the chat greeting. More discoverable across sessions.

### Option C: Dedicated voice setup form at `/aion/setup`

- **What it is:** A standalone page with three textareas (communication style, example message, guardrails). On submit, calls `saveAionVoiceConfig` directly (already exists), then redirects to `/aion`. Aion's next greeting reads the full voice config and immediately offers a test draft.
- **Effort:** Medium. New route, new page component, new form. Design work needed (Stage Engineering patterns, density tier). The form bypasses the conversational onboarding — there's no follow-up Q&A from Aion, just a direct save.
- **Main risk:** Breaks the conversational framing. If Daniel fills in the form quickly without thinking, the voice description may be thin. The chat-based flow's back-and-forth tends to produce richer voice definitions because the model asks follow-up questions. Also, the `needs_test_draft` state still depends on queue data.
- **Unlocks:** Fast one-shot voice configuration for users who prefer a form over a conversation.

## Recommendation

**Option A.** It is the smallest change that closes the actual gap, and it reuses 100% of the existing machinery.

The concrete change: in `buildGreeting` (`prompts.ts:340-348`), branch on `config.voice_default_derived === true` inside the `configured` case and return a message array that includes a second block — a `suggestions` type with chips: `['Set up your voice', 'Skip for now']`. The "Set up your voice" chip value triggers `resetAionVoiceConfig` from the client-side `ChatInterface` (the chat session resets to `messages: []`, backend returns `no_voice` greeting). From there, the existing 4-step onboarding plays out exactly as designed.

The one risk to flag before shipping: the `needs_test_draft` step calls `draft_follow_up`, which needs a queued deal. If Daniel's workspace has no deals in `ops.follow_up_queue`, the step gracefully returns an error — Aion should be instructed (via the `needs_test_draft` system prompt segment) to acknowledge the empty queue and offer to draft for any deal Daniel names instead. The `draft_follow_up` tool already supports a `dealId` param for this case.

Do not build Option C. A form gives fast entry but a conversation gives a better voice definition. The conversational flow already exists and is good.

## Next steps for Daniel

1. Confirm that `resetAionVoiceConfig` correctly clears `voice_default_derived` (verify `aion-config-actions.ts:226-249` — it drops `voice`, `voice_default_derived`, and `onboarding_state`). Run `npm run test -- aion-config` to confirm.
2. Edit `buildGreeting` in `src/app/api/aion/chat/route/prompts.ts:340` — add a branch for `state === 'configured' && config is voice_default_derived`. Pass `config` into `buildGreeting` (it currently receives only `state`; you need to either thread the config through or add a `isDerived` boolean param).
3. Add a `{ type: 'suggestions', chips: [...] }` block to that branch inviting the user to start setup. The chip value `'Start voice setup'` should, when processed by the chat route, call `resetAionVoiceConfig` server-side and return an updated greeting. Wire this via a new tool or a client-side reset flow (the client calls `resetAionVoiceConfig` directly on chip click, then sends `messages: []` to restart the greeting).
4. Update the `needs_test_draft` system prompt segment (`prompts.ts:282`) to include: "If `draft_follow_up` returns no queue, tell the user and offer to draft for a deal they name."
5. Manual test: log in to a workspace with no explicit voice config, open `/aion`, confirm the setup CTA appears, complete the 4-step flow, and verify the final draft uses the voice you described.
6. Delete `ArthurInput.tsx` while you're in the area — the primer flags it as a delete candidate and it's dead code.

## References

- `src/app/api/aion/chat/route/prompts.ts:275-283` — onboarding system prompt branches
- `src/app/api/aion/chat/route/prompts.ts:292-348` — `buildGreeting` per onboarding state
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35-44` — `applyVoiceDefaultIfEmpty` (root cause)
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:213-256` — `resetAionVoiceConfig`
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247-257` — `getOnboardingState`
- `src/app/api/aion/chat/tools/core.ts:118-144` — `save_voice_config` tool
- `src/app/api/aion/chat/tools/core.ts:318-400` — `draft_follow_up` tool
- `src/app/api/aion/lib/generate-draft.ts:52-76` — voice injection into follow-up prompt
