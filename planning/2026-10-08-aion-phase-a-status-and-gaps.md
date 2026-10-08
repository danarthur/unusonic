# Aion Phase A: Voice Setup + First Draft — Status and Gaps

_Researched: 2026-10-08 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

The premise of the question is now outdated. Phase A is substantially complete and live as of the current HEAD.

**`aion_config` exists.** `public.workspaces` has the column. `getAionConfig()` reads it at `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:94`. The `AionConfig` type is fully defined with `voice: { description, example_message, guardrails }`, `learned`, `follow_up_playbook`, and `onboarding_state` fields.

**The Brain tab is not paused.** `src/app/(dashboard)/aion/page.tsx:11` renders `<AionPageClient />` inside `Suspense`, which renders `<ChatInterface viewState="chat">` directly. There is no gate or placeholder.

**The onboarding state machine is wired.** `getOnboardingState(config)` at `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` derives one of five states (`no_voice → no_example → no_guardrails → needs_test_draft → configured`). `buildGreeting()` in `src/app/api/aion/chat/route/prompts.ts` returns per-state opening messages with suggestion chips.

**The tools are wired.** `save_voice_config` at `src/app/api/aion/chat/tools/core.ts:118` saves description, example message, and guardrails in a single call (all fields optional). `draft_follow_up` at `core.ts:318` generates a full draft, enriched by tone anchoring, episodic memory, and the follow-up playbook. `buildResponseFromResult` in `route/helpers.ts:103` converts the tool result into a `draft_preview` message type.

**The draft route is live.** `/api/aion/draft-follow-up` at `src/app/api/aion/draft-follow-up/route.ts` is auth-gated, tier-gated, kill-switch-respecting, and calls `generateFollowUpDraft()` which injects the workspace voice config.

**One real blocker remains.** `draft_follow_up` at `core.ts:333-334` falls back to the follow-up queue when no dealId is given. If the queue is empty it returns `{ error: 'No deals in the follow-up queue.' }`. During onboarding (`needs_test_draft` state), Daniel may have no queue items yet — the cron hasn't run, or no deal has reached a stall threshold. This silently fails the most motivating moment of onboarding.

**One UX friction point.** When Aion synthesizes a default voice from the workspace name, it sets `voice_default_derived=true` and `getOnboardingState` returns `configured` immediately (`aion-chat-types.ts:248`). Daniel never sees the onboarding flow unless he explicitly triggers "Tune Aion's voice" from the `AionSidebar` overflow, which calls `resetAionVoiceConfig`.

## Intended state

Daniel opens the Brain tab, writes a free-form description of how he communicates with clients — his style, an example, and any rules — and within the same session (ideally the same turn) sees a draft follow-up for an active deal that sounds like him. The session entry-point is conversational: no form, no separate settings page.

The existing design already achieves this for workspaces with live deals. The gap is the zero-to-first-draft path for a workspace with no follow-up queue populated.

## The gap

- `draft_follow_up` fails with an error when the follow-up queue is empty, breaking the test draft step during onboarding.
- New workspaces start with `voice_default_derived=true` (derived from workspace name), bypassing onboarding unless Daniel knows to reset via the sidebar overflow.
- The "3 paragraphs → immediate draft" aspiration works only if Aion extracts all three voice fields from a single message and immediately drafts — the multi-step tool loop can do this, but the system prompt's onboarding block says "ask about communication style" which nudges toward a turn-by-turn interview.

## Options

### Option A: Fix the empty-queue fallback in `draft_follow_up`

- **What it is:** When the follow-up queue is empty, fall back to the most recently active deal (`public.deals` WHERE `status != 'closed'` ORDER BY `updated_at DESC LIMIT 1`) and construct a minimal `AionDealContext` for it. This preserves the existing queue-based path and adds a fallback that always produces a draft.
- **Effort:** Small — 20-30 lines in `core.ts:draft_follow_up` and a new server action in `follow-up-actions.ts`.
- **Main risk:** The fallback deal might have no meaningful context (no proposal, no client contact), producing a generic draft. Acceptable as a demo — the point is to show voice, not business accuracy.
- **Unlocks:** Onboarding test draft never silently fails. The `needs_test_draft` state resolves cleanly.

### Option B: Add a `voice_setup_complete` hook that triggers the first draft automatically

- **What it is:** After `save_voice_config` completes with all three fields filled, return a `configUpdates` payload from the chat route that instructs the client to immediately call `draft_follow_up` on whatever active deal exists. The client-side session handler in `SessionContext` would detect `configUpdates.onboarding_state === 'needs_test_draft'` and fire a synthetic "try a draft" message.
- **Effort:** Medium — touches `route/helpers.ts`, the session context, and requires a reliable "any active deal" query.
- **Main risk:** Extra round-trip complexity. If the auto-draft fails, the user sees an error with no clear path forward.
- **Unlocks:** One-shot: Daniel pastes his voice description and a draft appears without a second message.

### Option C: Surface onboarding earlier — make the default entry show the voice form

- **What it is:** Remove the `voice_default_derived` short-circuit from `getOnboardingState`. New workspaces always enter the onboarding conversation. The sidebar "Tune Aion's voice" action is no longer needed as the primary path.
- **Effort:** Small code change — one line in `aion-chat-types.ts:248` plus a regression test to verify configured workspaces are unaffected.
- **Main risk:** All existing workspaces that had a derived voice get sent through onboarding again on next chat open. Mitigated by checking if `voice_default_derived=true AND onboarding_state='complete'` to exclude already-finished workspaces.
- **Unlocks:** Every new workspace discovers the onboarding naturally, without needing to know about the sidebar reset.

## Recommendation

Ship **Option A first**. The test-draft step silently failing is the most concrete blocker for anyone going through onboarding today. It is a 30-minute, self-contained fix that does not touch any other flows. Options B and C are UX improvements to the already-working flow — worth doing but not urgent.

Specifically: add a `getAnyActiveDeal()` helper in `follow-up-actions.ts` that returns the most-recently-updated non-closed deal, and call it as the fallback in `draft_follow_up` when the queue is empty. Let Aion prefix its draft with "I pulled your most active deal as a reference since nothing's flagged yet" so Daniel understands the context.

Option C (surfacing onboarding earlier) is the right move after Option A is proven — but wait until you have one real onboarding session under your belt to validate whether the default-derived voice bypass was actually helping or hurting.

## Next steps for Daniel

1. **Verify the flow exists.** Open `/aion` from a fresh session. If the chat opens to a greeting (not an onboarding prompt), open the sidebar → overflow → "Tune Aion's voice" to reset. You should now see the `no_voice` onboarding greeting.

2. **Run through the happy path manually.** Describe your style, paste an example, state one rule. Confirm that `aion_config.voice` is populated by checking `/settings/aion` or querying Supabase: `SELECT aion_config->'voice' FROM workspaces WHERE id = '<your_workspace_id>'`.

3. **Test the draft step.** At `needs_test_draft` state, ask Aion to draft a message. If you have live deals, this works. If it returns an error about empty queue, that confirms the Option A fix is needed.

4. **Apply the Option A fix.** In `src/app/(dashboard)/(features)/events/actions/follow-up-actions.ts`, add `getAnyActiveDeal(workspaceId)`. In `src/app/api/aion/chat/tools/core.ts:333`, replace the empty-queue early return with a call to that helper.

5. **Optionally add a test.** `src/app/api/aion/chat/tools/__tests__/` has several test files. Add a case for `draft_follow_up` with an empty queue to confirm the fallback fires and returns a draft.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — `AionConfig` type, `saveAionVoiceConfig`, `getAionConfig`
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — `getOnboardingState` state machine
- `src/app/api/aion/chat/route/prompts.ts` — `buildGreeting`, `buildSystemPrompt` with onboarding blocks
- `src/app/api/aion/chat/tools/core.ts:118` — `save_voice_config` tool
- `src/app/api/aion/chat/tools/core.ts:318` — `draft_follow_up` tool (empty-queue gap at line 334)
- `src/app/api/aion/chat/route/helpers.ts:103` — `buildResponseFromResult` → `draft_preview`
- `src/app/api/aion/draft-follow-up/route.ts` — standalone draft endpoint
- `src/app/(dashboard)/aion/AionPageClient.tsx` — Brain tab entry (not paused)
