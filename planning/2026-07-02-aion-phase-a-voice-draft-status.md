# Aion Phase A: Voice Setup + First Real Draft — Current Status

_Researched: 2026-07-02 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

**The premise of this question no longer holds. Phase A shipped.** The primer (dated 2026-04-10) described an early state. The codebase is significantly further along.

Specifically:

- `public.workspaces.aion_config` exists as a typed `Json` column (`src/types/supabase.ts:7782`). Reads go through `getAionConfigForWorkspace` (`src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:106`), writes through the service-role client.

- A 5-state voice onboarding machine is fully wired: `no_voice → no_example → no_guardrails → needs_test_draft → configured` (`src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247`). The greeting builder returns different UIs per state (`src/app/api/aion/chat/route/prompts.ts:292–435`).

- Voice setup happens via chat conversation: Aion asks for style (step 1), a real example (step 2), guardrails (step 3), then offers a test draft on an active deal (step 4). The model is instructed to call `save_voice_config` via the tool after each step.

- Draft generation is live: `/api/aion/draft-follow-up/route.ts` accepts deal context + voice config and returns a draft. The chat's `draft_follow_up` tool in `src/app/api/aion/chat/tools/core.ts:36` wires voice + deal context + learned vocabulary + playbook rules into the prompt, then returns a `draft_preview` block.

- Tone anchoring from sent-message history exists as a library (`src/app/api/aion/lib/tone-anchoring.ts`) and is imported in the chat `core.ts` tool but is NOT used in the standalone `generate-draft.ts`. That file still derives tone only from `voice_config`.

- There is one key bypass: when `aion_config.voice` is empty, `applyVoiceDefaultIfEmpty` synthesizes a default voice from the workspace name and sets `voice_default_derived: true` (`src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35`). `getOnboardingState` treats `voice_default_derived === true` as `configured` (`src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:248`). This means **new workspaces skip the 4-step voice wizard entirely** and land in pull-mode greeting with a synthesized voice.

- The `/aion` page runs `ChatInterface` with a full sidebar, session history, and "Tune Aion's voice" overflow item that calls `resetAionVoiceConfig()` — which clears the derived flag and re-enters the explicit 4-step flow.

## Intended state

The queue item goal: Daniel opens Aion, teaches his voice in ~3 paragraphs of natural language, and immediately sees a draft that sounds like him.

That flow is fully functional today. The only friction is discoverability: because `voice_default_derived` skips onboarding, Daniel won't be nudged through the 4-step wizard unless he knows to trigger "Tune Aion's voice" from the sidebar overflow — or says something like "let me teach you how I write" in the chat (Aion is instructed to handle that via the `=== ONBOARDING ===` section of the system prompt when triggered explicitly).

## The gap

- Default voice bypass hides the onboarding wizard on first use. A new workspace owner who doesn't know the overflow menu exists will never write their 3 paragraphs — Aion just synthesizes a generic voice and jumps to pull-mode.
- The standalone `/api/aion/draft-follow-up` route uses `generate-draft.ts`, which does not apply tone anchoring from sent-message history. The chat tool in `core.ts` does import `getToneAnchor` but its actual call is not visible in the first 50 lines — worth verifying end-to-end.
- `onboarding_state === 'complete'` is set by the model calling `save_voice_config` with `onboarding_complete: true`, but there's no schema enforcement: `getOnboardingState` checks `config.onboarding_state === 'complete'` for the final gate (`aion-chat-types.ts:255`). If that string never gets written (model fails to call the tool), the user is stuck at `needs_test_draft` on every open.

## Options

### Option A: Test the flow end-to-end as-is
- **What it is:** Trigger "Tune Aion's voice" on a live workspace, go through all 4 steps, confirm a test draft is generated and sounds right. Document any rough edges (model not calling tools, confusing questions, draft quality).
- **Effort:** Small (1–2 hours of live testing)
- **Main risk:** Finds a bug that takes a sprint to fix; but better to know now than after showing to users.
- **Unlocks:** Confidence that Phase A actually works end-to-end before building anything on top of it.

### Option B: Fix the onboarding discoverability gap
- **What it is:** Remove or gate the `voice_default_derived` bypass so that a fresh workspace that has never explicitly configured voice gets prompted through the 4-step wizard on first open, not silently given a synthesized default. Add a first-open nudge ("Tell me how you talk to clients") in the pull-mode greeting for workspaces with `voice_default_derived === true`.
- **Effort:** Small — a prompt change in `buildGreeting` + a one-line condition in `getOnboardingState`
- **Main risk:** Existing workspaces that rely on derived default will get re-prompted (fix: gate on `aion_actions_used === 0` or check if any real messages exist)
- **Unlocks:** New users reliably enter their own voice rather than getting a generic synthesized one.

### Option C: Wire tone anchoring into standalone draft route
- **What it is:** Update `generate-draft.ts` and the `/api/aion/draft-follow-up` route to call `getToneAnchor(workspaceId, recipientEntityId)` and prepend the preamble to the draft prompt. Parity with the chat tool path.
- **Effort:** Small — `getToneAnchor` already exists; the standalone route just needs a `recipientEntityId` param added to its request body and a 5-line patch to `generate-draft.ts`.
- **Main risk:** `getToneAnchor` uses the server supabase client; the standalone route already imports it. No architecture risk.
- **Unlocks:** Standalone drafts (triggered from the Aion deal card, not the chat) use sent-message history to mirror tone, not just the stored voice config. Drafts get meaningfully better once the inbox has data.

## Recommendation

Start with **Option A**, then immediately do **Option B** as a fast follow.

Phase A shipped months ago. The productive question now is whether the end-to-end flow actually feels right on Daniel's real workspace — that test should take an hour and will surface any real blockers (model not calling tools at the right moment, test draft landing badly, `onboarding_state='complete'` never getting written).

Option B is the only substantive product gap: the `voice_default_derived` bypass was a sensible latency optimization but it means no new user will ever be nudged to set their real voice. A one-line condition change and a soft nudge in the pull-mode greeting fixes it without regressing anything. This is the highest-leverage change for the stated goal.

Option C (tone anchoring in standalone route) is a quality improvement worth doing once the workspace has real sent-message history. Queue it for after the inbox connection lands.

## Next steps for Daniel

1. Open `/aion` on your live workspace. In the sidebar overflow ("⋯" at the top right of the session list), find "Tune Aion's voice" and click it.
2. Go through the 4-step conversation. Write 3 paragraphs in step 1 (style), paste a real message you've sent in step 2, set your guardrails in step 3.
3. At step 4 ("Your voice config is set up. Want me to draft a test message?"), say yes. Evaluate the draft quality.
4. If the draft is off, check `workspaces.aion_config.voice` in the Supabase dashboard to confirm the 3 paragraphs were saved correctly.
5. If the flow breaks at any step (Aion doesn't ask the right questions, doesn't save, doesn't draft), file a specific bug in the queue — that is the real blocker.
6. After the smoke test, patch `src/app/api/aion/chat/route/prompts.ts` `buildGreeting` to add a nudge line in the `configured` branch when `config.voice_default_derived === true`: "I'm using a default voice based on your workspace name. Want to teach me how you actually write?"

## References

- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — `getOnboardingState` state machine
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:106` — `getAionConfigForWorkspace`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35` — `applyVoiceDefaultIfEmpty` (the bypass)
- `src/app/api/aion/chat/route/prompts.ts:292` — `buildGreeting` (all onboarding branches)
- `src/app/api/aion/lib/generate-draft.ts` — standalone draft generation (no tone anchoring)
- `src/app/api/aion/lib/tone-anchoring.ts` — tone anchoring library (not used in standalone route)
- `src/app/api/aion/chat/tools/core.ts:36` — chat `draft_follow_up` tool (richer prompt, uses tone anchoring)
- `src/types/supabase.ts:7782` — `aion_config` column confirmed in `public.workspaces`
