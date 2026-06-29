# Aion Phase A: Voice Setup + First Real Draft

_Researched: 2026-06-29 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

---

**Note on scope:** The two premises in the question are outdated. The Brain tab is no longer paused, and `aion_config` already exists. This doc covers the real current gaps instead.

---

## Current state

`public.workspaces.aion_config` exists as a JSON column and is in active production use — `src/types/supabase.ts` types it, and `getAionConfigForWorkspace` (`aion-config-actions.ts:106`) reads it on every chat turn.

`/api/aion/chat` (`src/app/api/aion/chat/route.ts:57`) is a fully built, authenticated route. It includes: Supabase session auth, per-user rate limiting, tier gate (`canExecuteAionAction`), kill switch, model selection, 20+ tool definitions, and streaming via `streamText`.

The 5-state voice onboarding flow is fully wired. `getOnboardingState` (`aion-chat-types.ts:247`) derives state from `aion_config.voice.*`. `buildGreeting` (`prompts.ts:292`) returns the correct opening question for each state, from `no_voice` ("How would you describe your style?") through `needs_test_draft` ("Want me to draft a test message?"). The system prompt includes per-state ONBOARDING instructions for Aion at `prompts.ts:275–283`.

`save_voice_config` is a live tool (`core.ts:118`) — when Aion detects voice description, example, or guardrails in the user's message, it calls this tool, which calls `updateAionConfigForWorkspace` and returns the updated config to the client. `draft_follow_up` is also live (`core.ts:318`) — it pulls the top queue item from `ops.follow_up_queue`, loads deal context, applies playbook channel rules, enriches with entity memories from `cortex.aion_memory`, and calls `generateFollowUpDraft`.

The `/aion` page (`src/app/(dashboard)/aion/page.tsx`) mounts a full `ChatInterface` — sessions, sidebar, scope headers, streaming. No "paused" block exists anywhere in the codebase.

## Intended state

Per Daniel's stated goal: open the Brain tab, write 3 paragraphs about communication style, immediately see a draft that respects that voice. The architecture for this is in place. The intended flow is:

- Workspace is in `no_voice` state → Aion opens with "How do you talk to clients?"
- User writes description → Aion calls `save_voice_config` → moves to `no_example` state
- User pastes example → saved → moves to `no_guardrails`
- User states rules (or skips) → moves to `needs_test_draft`
- Aion calls `draft_follow_up` with the top queue deal → user sees the draft

## The gap

- **Model lock.** All three model tiers route to `claude-haiku-4-5-20251001` since 2026-04-21 (`models.ts:69`, marked TEMPORARY). `config` intent maps to `standard` (Sonnet) and draft generation uses `fast` (also Haiku right now). The first draft impression — the payoff moment — runs on a model that was supposed to be a fallback, not the lead.

- **Onboarding bypass for returning workspaces.** `applyVoiceDefaultIfEmpty` (`aion-config-helpers.ts:35`) synthesizes a voice from the workspace name and sets `voice_default_derived: true`. `getOnboardingState` returns `configured` when this flag is set (`aion-chat-types.ts:248`). Any workspace that has already opened the chat is in `configured` state and sees the pull-mode greeting — no voice setup offered. The retune path is buried: AionSidebar → overflow → "Tune Aion's voice" (`AionSidebar.tsx:1043`).

- **Queue dependency for first draft.** `draft_follow_up` falls back to "No deals in the follow-up queue." if `ops.follow_up_queue` is empty. A workspace with deals but no queued items (cron hasn't run, or all dismissed) gets nothing.

## Options

### Option A: Unlock the model tier
- **What it is:** Update `MODELS` in `models.ts:69–73` — set `standard` to `claude-sonnet-4-6` and `heavy` to `claude-opus-4-8`. Verify Anthropic API key has access first (dashboard check, 5 minutes). The comment says this was waiting on org-level access resolution.
- **Effort:** Small — 1 line if API access is already available; medium if key provisioning is needed.
- **Main risk:** May surface a 404/auth error if the Anthropic org account still doesn't have Sonnet/Opus access — would need key upgrade before the code change.
- **Unlocks:** The draft that Daniel sees on day one is produced by a model that actually handles voice nuance well. Without this, the first impression is underpowered regardless of how good the voice config is.

### Option B: Add a voice-setup entry point to the Aion empty state
- **What it is:** In `ChatInterface.tsx` (empty state block, around line 359), detect when `voice_default_derived: true` (pass it as a prop from the page server component) and render a "Set up Aion's voice" CTA alongside the landing starters. Clicking it calls `resetAionVoiceConfig` and reloads the chat, which will then open with the `no_voice` greeting. This is a purely client-side change — no new APIs, no schema work.
- **Effort:** Small — ~30 lines across `ChatInterface.tsx`, the Aion page server component (to read `aion_config`), and a minimal action call.
- **Main risk:** Adds a second trigger path for voice reset that must stay in sync with the sidebar overflow trigger. Low complexity but two entry points for the same action.
- **Unlocks:** Daniel (or any owner) can discover and enter the onboarding flow from the chat landing without knowing the sidebar overflow exists.

### Option C: Use `draft_follow_up` without a queue item
- **What it is:** Extend `draft_follow_up` (`core.ts:318`) to fall back gracefully when the queue is empty — instead of returning an error, call `getDealContextForAion` on the most-recently-active deal from `public.deals` (simple `order by updated_at desc limit 1`). This makes the "test draft" step of onboarding work even before the cron has seeded the queue.
- **Effort:** Small — 15–20 lines in the `draft_follow_up` tool execute block.
- **Main risk:** The deal chosen by recency may not be the right one for a test draft — but this is fine for a first-impression onboarding draft where the user is evaluating tone, not the content.
- **Unlocks:** The `needs_test_draft` step of onboarding always produces a draft, even on a fresh workspace.

## Recommendation

Do A first, then B, then C — in that order, in the same PR or two quick ones.

**A is the prerequisite.** Haiku is a fine fast model, but it's not what you want producing the first draft a new user sees after describing their voice. If API access is already sorted (check the Anthropic dashboard — the model access block was from April), this is a 1-line change. If it needs a key upgrade, get that done before anything else — it unblocks B and C.

**B is the UX unlock for Daniel's specific scenario.** Daniel's workspace almost certainly has `voice_default_derived: true` from a prior chat session. Without B, he has to know to go to the sidebar overflow. The empty-state CTA surfaces the path he'd actually follow.

**C is a small reliability fix** that prevents the onboarding from silently dying in the `needs_test_draft` step on queue-empty workspaces. Worth including in the same commit as B.

Skip building a standalone voice setup form (Settings > Aion). The conversational setup is the right abstraction — it teaches Daniel what Aion does while collecting the voice config, which a static form doesn't.

## Next steps for Daniel

1. **Check Anthropic org model access.** Log into console.anthropic.com → confirm that `claude-sonnet-4-6` and `claude-opus-4-8` are accessible for the project. If not, upgrade the plan or request access before touching code.
2. **Unlock model tiers.** Edit `src/app/api/aion/lib/models.ts:70–72` — change `standard` to `'claude-sonnet-4-6'` and `heavy` to `'claude-opus-4-8'`. Leave `fast` as Haiku.
3. **Read `aion_config` in the Aion page server component** (`src/app/(dashboard)/aion/AionPageClient.tsx` or its server wrapper) and pass `voiceDefaultDerived: boolean` as a prop to `ChatInterface`.
4. **Add the CTA to the empty state** in `ChatInterface.tsx` (around line 359): if `voiceDefaultDerived`, render a "Set up your voice" button that calls `resetAionVoiceConfig()` and refreshes. One server action call.
5. **Extend `draft_follow_up` fallback** in `core.ts:332–334`: if queue is empty, query `public.deals` for the most recently updated deal and draft for that instead of returning an error.
6. **Test end-to-end:** Open `/aion` fresh, click "Set up your voice," write 3 paragraphs, confirm Aion saves the config (check sidebar header shows voice is set), ask Aion to draft a follow-up — verify it echoes the voice you described.

## References

- `src/app/api/aion/lib/models.ts` — model registry and tier routing (temp Haiku lock at line 69)
- `src/app/api/aion/chat/route/prompts.ts:275–340` — onboarding state injection + `buildGreeting`
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — `getOnboardingState`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:20–45` — `synthesizeDefaultVoice`, `applyVoiceDefaultIfEmpty`
- `src/app/api/aion/chat/tools/core.ts:118` — `save_voice_config` tool
- `src/app/api/aion/chat/tools/core.ts:318` — `draft_follow_up` tool
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:1043` — existing "Tune Aion's voice" overflow item
- `src/app/(dashboard)/(features)/aion/components/ChatInterface.tsx:359` — empty state anchor point for new CTA
