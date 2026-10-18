# Aion Phase A: voice setup + first draft unblock

_Researched: 2026-07-04 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

The primer is significantly out of date. The system is not paused — it is production-grade.

`public.workspaces.aion_config` **exists** as a JSONB column. It is read and written by `getAionConfig` and `saveAionVoiceConfig` in `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:84` and used throughout the chat route.

`/api/aion/chat/route.ts:57` is a full streaming endpoint with auth, per-user rate limiting, tier gating, tool-calling (10-step loop), model tier selection, rolling summarization, session scope, and an onboarding state machine. Not a stub.

The onboarding state machine at `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` is complete: `no_voice → no_example → no_guardrails → needs_test_draft → configured`. The greeting builder at `src/app/api/aion/chat/route/prompts.ts:300` returns a different opening message for each state and offers suggestion chips.

`save_voice_config` and `draft_follow_up` are both implemented as chat tools in `src/app/api/aion/chat/tools/core.ts:118` and `core.ts:318`. The draft tool calls `generateText` with the workspace voice config injected, tone anchoring from outbound message history, and playbook rules applied.

`/api/aion/draft-follow-up/route.ts:22` also exists as a standalone route for the follow-up card on the Deal lens.

**The actual blocker:** `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35` — `applyVoiceDefaultIfEmpty` synthesizes a voice from the workspace name on every read when no explicit voice is stored, and sets `voice_default_derived: true` in the returned object (not persisted to DB). `getOnboardingState` at `aion-chat-types.ts:247` short-circuits to `'configured'` when that flag is set. Every new workspace lands directly in the `configured` pull-mode greeting, bypassing the 4-step setup entirely. Voice setup is reachable only via the Sidebar overflow "Tune Aion's voice" affordance (`resetAionVoiceConfig`).

**Secondary gap:** `draft_follow_up` at `core.ts:333` returns `{ error: 'No deals in the follow-up queue.' }` if the workspace has no queue items. A day-0 workspace completes voice setup but gets a graceful error, not a draft.

## Intended state

Daniel opens the `/aion` page, the chat asks "how do you talk to clients?", he writes 3 paragraphs, Aion walks him through example + guardrails, then generates a real follow-up draft for one of his deals — all in a single chat session. After that, the brain tab is in `configured` state for good.

## The gap

- `applyVoiceDefaultIfEmpty` fires unconditionally for any workspace without an explicit voice, jumping state to `configured` and hiding the setup flow.
- No mechanism distinguishes "new workspace, never set up" from "established workspace, chose not to set up."
- `draft_follow_up` in the chat has no fallback for a queue-empty workspace — the final step of setup fails silently.

## Options

### Option A: Gate the default synthesis on onboarding completion
- **What it is:** In `applyVoiceDefaultIfEmpty`, only synthesize the default voice (and set `voice_default_derived: true`) when `config.onboarding_state === 'complete'`. Workspaces with no explicit voice AND no explicit completion stay in `no_voice` and see the setup flow. Existing active workspaces that pre-date this check need a one-time migration: update `aion_config.onboarding_state = 'complete'` for any workspace with at least one `cortex.aion_session`.
- **Effort:** Small — one conditional in `aion-config-helpers.ts:39`, plus a one-time SQL migration for existing workspaces.
- **Main risk:** If the migration is missed or partial, some existing workspaces see the `no_voice` greeting on their next Aion open. Fixable by setting `onboarding_state = 'complete'` on their config via a Server Action.
- **Unlocks:** New workspaces walk through the full 4-step setup naturally. The existing Sidebar overflow "Tune Aion's voice" path still works for workspaces that want to retune.

### Option B: Add a first-visit banner in the `/aion` page UI
- **What it is:** In `AionPageClient.tsx:66`, read `onboarding_state` server-side and render a dismissable banner or inline prompt above the chat when state is not `configured`. The banner feeds Daniel's input as a synthetic first message into `sendChatMessage`, starting the flow explicitly.
- **Effort:** Medium — new server data fetch in `src/app/(dashboard)/aion/page.tsx`, new banner component, synthetic message plumbing.
- **Main risk:** Adds visual complexity to a clean interface. The chat already handles the flow; the banner duplicates the entry point.
- **Unlocks:** More explicit and reliable than trusting the LLM to ask at the right time. Useful if Option A's gate proves too subtle.

### Option C: Demo draft fallback when queue is empty
- **What it is:** In `draft_follow_up` at `core.ts:333`, when `queue.length === 0`, synthesize a minimal `AionDealContext` stub (name: "Example client", archetype matching Daniel's workspace type, etc.) and generate the draft against it, labeled clearly as a demo. The draft shows how Aion would sound — real generation, fake deal data.
- **Effort:** Small — modify the `if (queue.length === 0)` branch in `core.ts:334` to build a stub context instead of returning an error.
- **Main risk:** A draft about a fictional deal may feel hollow. If Daniel has any real deals at all, this never fires.
- **Unlocks:** The wow moment — seeing a real-sounding draft in Daniel's voice — lands even for a day-0 workspace with no data yet.

## Recommendation

Ship Option A first, then Option C as a one-commit follow-on.

Option A fixes the root cause in one targeted change. The `applyVoiceDefaultIfEmpty` helper was added in Wk 11 §3.8 specifically to help established workspaces skip a repetitive setup flow — that is the right default for them. But it was applied unconditionally, which silently hid the setup flow from new workspaces. The guard on `onboarding_state === 'complete'` restores the intended behavior: new workspaces see setup, established workspaces see the synthesized default.

The migration for existing workspaces is straightforward SQL and should be scripted into `scripts/debug/` as a one-time op, not a Supabase migration (it's a data op, not a schema change).

Option C is a three-line change that removes the one failure mode that would break the flow even after Option A. It should ship in the same PR or immediately after. Option B can wait — the conversational flow already handles the UX correctly once Option A fires.

## Next steps for Daniel

1. **Read `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35–45`** — understand the `applyVoiceDefaultIfEmpty` function and the `voice_default_derived` flag.
2. **Apply the Option A guard:** in `applyVoiceDefaultIfEmpty`, wrap the synthesis block in `if (config.onboarding_state === 'complete') { ... }`. Test by opening `/aion` in an incognito session with a workspace that has no explicit voice config.
3. **Write the migration script:** `scripts/debug/backfill-aion-onboarding-state.sql` — sets `aion_config = jsonb_set(aion_config, '{onboarding_state}', '"complete"')` for all workspaces where `cortex.aion_sessions` has at least one row.
4. **Apply Option C:** in `src/app/api/aion/chat/tools/core.ts:333`, replace the early `return { error: ... }` with a stub context when the queue is empty.
5. **Walk through the flow end-to-end:** open `/aion` as a new workspace, type "I talk to clients like..." and verify the state machine walks through `no_voice → no_example → no_guardrails → needs_test_draft` and generates a draft.
6. **Update `planning-primer.md`** to reflect the actual state of the Aion system — the current primer is significantly out of date and will mislead future research runs.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35` — `applyVoiceDefaultIfEmpty` (the blocker)
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — `getOnboardingState` state machine
- `src/app/api/aion/chat/route/prompts.ts:300` — greeting builder per onboarding state
- `src/app/api/aion/chat/tools/core.ts:118,318` — `save_voice_config`, `draft_follow_up` chat tools
- `src/app/api/aion/chat/route.ts:57` — full streaming chat route (not a stub)
- `src/app/api/aion/draft-follow-up/route.ts:22` — standalone draft route for Deal lens
- `src/app/api/aion/lib/tone-anchoring.ts:60` — tone anchor (observed sent-style)
