# Aion Phase A: Voice Setup to First Follow-Up Draft

_Researched: 2026-06-20 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

**The planning primer (dated 2026-04-10) is 10 weeks stale. Most of Phase A has already shipped.**

`public.workspaces.aion_config` EXISTS — added in `supabase/migrations/pre-baseline/20260407140000_aion_voice_foundation.sql:7` as `jsonb NOT NULL DEFAULT '{}'`, confirmed typed in `src/types/supabase.ts:7782`.

The voice config type is fully defined at `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:12-16`: `AionVoiceConfig { description, example_message, guardrails }` — exactly the three fields mentioned in the question. Save/load actions exist: `saveAionVoiceConfig()` at line 178, `getAionConfig()` at line 84.

The onboarding state machine is defined at `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:225-257`: five states (`no_voice → no_example → no_guardrails → needs_test_draft → configured`) with `getOnboardingState(config)` driving transitions.

Critically, this state machine drives the **chat route itself**, not a client-side form. At `src/app/api/aion/chat/route.ts:122`, the server computes `onboardingState = getOnboardingState(aionConfig)` and `buildGreeting()` in `prompts.ts:292-338` returns state-appropriate opening messages (e.g. `no_voice` → "How would you describe your style?" with suggestion chips). The system prompt injects onboarding instructions per state (e.g. `no_guardrails` → "Ask about rules. Save via save_voice_config." at `prompts.ts:280`).

The `save_voice_config` tool is fully implemented at `src/app/api/aion/chat/tools/core.ts:118-144`. It accepts `description`, `example_message`, `guardrails`, and `onboarding_complete`, deep-merges into `aion_config`, and returns the saved state. The `draft_follow_up` tool fires at the `needs_test_draft` state and its result is handled as a `draft_preview` card at `helpers.ts:103-105`.

The `/api/aion/draft-follow-up/route.ts` (73 lines) loads `aionConfig.voice` and passes it to `generateFollowUpDraft`. `getDealContextForAion()` at `src/app/(dashboard)/(features)/events/actions/follow-up-actions.ts:545-611` returns rich deal + client + proposal + follow-up context for the draft.

**The "Brain tab" as a deal-page tab does not exist.** The Aion interface lives at the standalone `/aion/` route (`src/app/(dashboard)/aion/page.tsx`). Deal pages have a lighter-weight `AionDealCard` widget with `conversation-thread.tsx` — a deal-scoped chat, not the full ChatInterface with onboarding.

## Intended state

Daniel goes to `/aion/`, Aion greets him with the onboarding conversation, he answers three questions (style, example, rules), Aion calls `save_voice_config` after each, state advances to `needs_test_draft`, Aion offers a draft against a real follow-up queue item, Daniel approves, `onboarding_complete: true` is saved, and future drafts respect his voice.

## The gap

- The onboarding conversation at `/aion/` is fully wired but **has not been walked end-to-end in production** (no confirmation it is bug-free).
- The deal-page `AionDealCard` has no nudge to `/aion/` for users whose `aion_config` is empty. A user who lands on a deal and tries the inline chat will get a deal-scoped conversation without onboarding — they may never discover that voice setup happens at `/aion/`.
- The `needs_test_draft` state requires at least one active `ops.follow_up_queue` item to draft against. If the queue is empty for a workspace, the test draft step silently fails.
- `ION_SYSTEM` / `ION_FULL_SYSTEM` constants at `src/features/ai/tools/package-generator.ts:22` are pending a rename — legacy brand pollution, low severity.

## Options

### Option A: Walk the onboarding flow end-to-end and fix what breaks
- **What it is:** Go to `/aion/` with an empty `aion_config`, run through all five states, confirm `save_voice_config` persists each step, confirm the test draft fires and renders a `draft_preview` card. Fix any breakage found.
- **Effort:** Small — this is testing + bug fixing, not building.
- **Main risk:** The test draft step may fail if there is no queued follow-up item; need at least one open deal in the follow-up queue.
- **Unlocks:** Confidence that Phase A is actually done. Everything after this is discoverability.

### Option B: Add a voice-setup nudge to the AionDealCard
- **What it is:** In `conversation-thread.tsx`, when the user sends a first message and `aion_config.voice` is empty (or `voice_default_derived === true`), surface a one-line prompt: "Your voice isn't set up yet — [configure in Aion →]" linking to `/aion/`. Does not replace the inline chat but closes the discoverability gap.
- **Effort:** Small (one conditional + a link in the deal card footer).
- **Main risk:** Minor UX awkwardness if the user ignores it and chats anyway — the draft quality will be lower until voice is configured, which is an acceptable state.
- **Unlocks:** Users who live in deal pages discover voice setup without being told to find `/aion/`.

### Option C: Embed the onboarding flow inside the AionDealCard itself
- **What it is:** When `aion_config` is empty and the deal card is open, show the onboarding greeting directly in the deal chat instead of the generic deal-scoped greeting. The same `buildGreeting()` / `save_voice_config` flow runs inline.
- **Effort:** Medium — requires the deal card to check onboarding state server-side and inject the onboarding greeting, and the conversation thread to handle `follow_up_queue` + `draft_preview` card types.
- **Main risk:** Complexity; onboarding mid-deal-context may produce confusing scope mixing if the user also wants to discuss the deal.
- **Unlocks:** Single surface for both onboarding and deal chat — no redirect needed.

## Recommendation

**Option A first, then Option B.** The data + API + state machine layer is complete. Before building anything, verify the flow actually works. Spend one session walking `/aion/` with a fresh-state workspace config and confirm all five transitions fire cleanly. Fix anything that breaks. That alone may close Phase A entirely.

Once verified, add the Option B nudge — it is two lines of code and closes the only real UX gap (deal-page users don't know to go to `/aion/`). Option C is over-engineered for now: two surfaces is not a problem when they serve different jobs (onboarding vs. deal chat).

Do not build a 3-paragraph form. The conversational approach is already designed, built, and more appropriate for the goal of teaching Aion a natural voice.

## Next steps for Daniel

1. Open `/aion/` with `aion_config` reset to `{}` (use `resetAionVoiceConfig()` action or clear it directly in Supabase) and walk all five onboarding states. Verify each `save_voice_config` call persists.
2. Confirm the `needs_test_draft` state fires `draft_follow_up` and the response renders a `draft_preview` card. If the queue is empty, ensure at least one deal has an active `ops.follow_up_queue` item.
3. If the flow works, update the primer (`planning-primer.md`) to reflect the actual current state.
4. Add a voice-config nudge in `src/app/(dashboard)/(features)/events/components/aion-deal-card/conversation-thread.tsx` — when `voice_default_derived === true` or voice is empty, show a link to `/aion/`.
5. Rename `ION_SYSTEM` → `AION_SYSTEM` and `ION_FULL_SYSTEM` → `AION_FULL_SYSTEM` in `src/features/ai/tools/package-generator.ts:22`.
6. Update `planning-primer.md` "Current notable state" section to remove the outdated "Brain Mode is paused" and stub references — they are no longer accurate.

## References

- `supabase/migrations/pre-baseline/20260407140000_aion_voice_foundation.sql:7` — aion_config column
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:12-206` — voice config types, save/load actions
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:225-257` — onboarding state machine
- `src/app/api/aion/chat/route.ts:122,126` — onboarding state computed + greeting returned on empty conversation
- `src/app/api/aion/chat/route/prompts.ts:276-285,292-338` — system prompt injections + buildGreeting per state
- `src/app/api/aion/chat/tools/core.ts:118-144` — save_voice_config tool implementation
- `src/app/api/aion/chat/route/helpers.ts:103-105` — draft_follow_up result → draft_preview card
- `src/app/api/aion/draft-follow-up/route.ts` — draft generation route (73 lines)
- `src/app/(dashboard)/(features)/events/actions/follow-up-actions.ts:545-611` — getDealContextForAion
- `src/app/(dashboard)/(features)/events/components/aion-deal-card/conversation-thread.tsx` — deal-page chat widget (Option B target)
- `src/features/ai/tools/package-generator.ts:22` — ION_SYSTEM pending rename
