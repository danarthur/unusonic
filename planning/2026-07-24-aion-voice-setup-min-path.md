# Minimum path to Aion voice setup + first real draft

_Researched: 2026-07-24 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

**Note on framing:** Several of the premises in this question are no longer accurate. This doc reflects what the code actually contains as of the research date.

---

## Current state

**The planning primer is stale.** The infrastructure described as "not-started" is largely built and wired.

`public.workspaces.aion_config` exists (`src/types/supabase.ts:7782`). The TypeScript shape `AionConfig` is defined at `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:50–74` with `voice: { description, example_message, guardrails }`, `learned`, `follow_up_playbook`, `onboarding_state`, and `kill_switch`.

The full 4-step onboarding flow is wired in the Aion chat:

- `getOnboardingState(config)` at `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` derives state from the current voice config: `no_voice → no_example → no_guardrails → needs_test_draft → configured`.
- `buildGreeting()` at `src/app/api/aion/chat/route/prompts.ts:292` returns a custom opening message for each state — the `no_voice` greeting prompts for communication style with quick-reply chips.
- `buildSystemPrompt()` at `prompts.ts:275–283` injects the active onboarding step into the system prompt, directing the model to ask the right question and call `save_voice_config`.
- `save_voice_config` tool at `src/app/api/aion/chat/tools/core.ts:118` persists each piece to `aion_config.voice` via `updateAionConfigForWorkspace`, then refreshes config in-session.

Draft generation is also wired:

- `/api/aion/draft-follow-up/route.ts` is authenticated, tier-gated, reads `aion_config.voice`, and injects it into the generation prompt via `generateFollowUpDraft`.
- `follow-up-card.tsx:338` calls `getDealContextForAion(deal.id, queueItem)` and POSTs to that route. The Follow-Up Card shows a "Draft message" button.
- `getDealContextForAion` at `src/app/(dashboard)/(features)/events/actions/follow-up-actions.ts:545` is fully built — parallel-fetches deal, client, proposal, and follow-up log into an `AionDealContext` DTO.

There is no "Brain tab" as a distinct UI. The Aion chat page at `/aion` IS the setup surface. The onboarding fires automatically when the workspace has no voice config.

The main active constraint: all three model tiers are temporarily routed to `claude-haiku-4-5-20251001` (`src/shared/lib/models.ts:69–73`, comment: "TEMPORARY 2026-04-21"). Haiku handles the collection steps fine but produces noticeably weaker drafts than Sonnet would.

---

## Intended state

Daniel opens `/aion`, sees a greeting that asks about communication style, answers in his own words across a few turns (style description, example message, guardrails), and the system saves each piece. He then opens a deal with a pending follow-up, clicks "Draft message," and sees a draft that reads like him.

The code is designed to deliver exactly this experience. The `configured` state produces a standard chat greeting; the four onboarding states produce guided prompts with chips to make it easy to answer.

---

## The gap

- The primer says the system is "not-started." It is not. The gap is that Daniel has not run through the flow himself to confirm it works end-to-end.
- Model access: Sonnet/Opus return 404 at the org level. Until that grant lands, draft quality is haiku-tier. This affects generation, not collection.
- Unknown: whether the sidebar "Tune Aion's voice" affordance described in `aion-chat-types.ts:244–245` is wired as a clickable UI element or only described in a comment.
- The primer's description of `/api/aion/route.ts` as a 16-line unauthenticated stub is wrong — the real endpoint is `/api/aion/chat/route.ts` and it is fully authenticated.

---

## Options

### Option A: Verify the existing path (do this first)

- **What it is:** Open `/aion` in a browser as a workspace owner with no voice config set. Walk through the greeting → style → example → guardrails → test draft flow. Confirm `save_voice_config` fires (check Supabase `workspaces.aion_config` after each step). Then open a deal with a pending follow-up queue item and click "Draft message."
- **Effort:** Small (2–4 hours, mostly reading what comes back)
- **Main risk:** Haiku produces a weak draft, making the experience feel broken even though the pipeline is correct.
- **Unlocks:** Confirms whether anything is actually broken vs. just undocumented.

### Option B: Chase the model access grant

- **What it is:** Contact Anthropic support / check org-level model access to unblock `claude-sonnet-4-6` and `claude-opus-4-8`. The `getModel()` router at `src/shared/lib/models.ts:69–73` is already written to use Sonnet for standard and Opus for heavy — the only blocker is the 404 from the API.
- **Effort:** Small (send a support ticket or check the Anthropic console)
- **Main risk:** Timeline is outside Daniel's control.
- **Unlocks:** Every Aion feature — chat quality, draft quality, insight evaluators — improves immediately. This is the single highest-leverage action in the system right now.

### Option C: Add a standalone voice setup form

- **What it is:** Build a `/aion/setup` page (or modal) with three textarea fields — "How you talk to clients," "An example message," "Rules" — that calls a server action saving directly to `aion_config.voice`. Bypasses the chat model entirely for the collection step.
- **Effort:** Medium (1–2 days)
- **Main risk:** Duplicates the conversational onboarding; two paths to the same state creates confusion about which is canonical.
- **Unlocks:** Voice collection that works regardless of model tier and is easier to re-edit. Useful if the conversational onboarding proves unreliable in practice.

---

## Recommendation

Do Option A and Option B in parallel. Option A takes an afternoon and either closes the loop ("it works, just needed to know") or reveals a specific breakage to fix. Option B is a ticket or console action that costs under an hour but unblocks quality across the entire product.

Do not build the form (Option C) yet. The conversational onboarding is already built and tested in code. If Option A reveals it is functionally broken, THEN decide between fixing the chat flow vs. adding a form. Building the form speculatively doubles the maintenance surface for no confirmed gain.

The premise in the queue item that the system is "paused" and aion_config "doesn't exist" is wrong — the primer needs updating. The real work item from this research is: **verify the flow, unblock model access**.

---

## Next steps for Daniel

1. Open `/aion` in a browser with a workspace that has no `aion_config.voice` set. Confirm the onboarding greeting appears (style prompt with chips).
2. Walk through all four steps. After each, check `workspaces.aion_config` in the Supabase dashboard to confirm the save landed.
3. Open a deal that has a follow-up queue item. Click "Draft message" in the Follow-Up Card. Confirm a draft appears.
4. Check the Anthropic console for org-level model access. If `claude-sonnet-4-6` is available, remove the temporary haiku override in `src/shared/lib/models.ts:69–73`.
5. If the onboarding flow does not trigger (i.e., you see the `configured` greeting on a workspace where voice was never set), check `aion_config.voice_default_derived` in the DB — if it is `true`, `getOnboardingState` short-circuits to `configured`. Reset it to `false` or `null` to re-enter onboarding.
6. Update `planning-primer.md` to reflect the actual state of the Aion stack — the current description will send future agents down wrong paths.

---

## References

- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:225–252` — `OnboardingState` type + `getOnboardingState()`
- `src/app/api/aion/chat/route/prompts.ts:275–338` — onboarding prompt injection + `buildGreeting()`
- `src/app/api/aion/chat/tools/core.ts:118–144` — `save_voice_config` tool
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:50–74` — `AionConfig` type
- `src/app/api/aion/draft-follow-up/route.ts` — draft generation endpoint
- `src/app/(dashboard)/(features)/events/actions/follow-up-actions.ts:545` — `getDealContextForAion`
- `src/app/(dashboard)/(features)/events/components/follow-up-card.tsx:338` — Follow-Up Card draft flow
- `src/shared/lib/models.ts:69–73` — temporary haiku override
