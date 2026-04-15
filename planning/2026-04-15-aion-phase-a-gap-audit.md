# Aion Phase A: Current state and real gaps

_Researched: 2026-04-15 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

**Restating the question:** The premise is outdated. Phase A is largely built. The research below documents what exists, what is broken, and what to do next.

---

## Current state

The primer's "Brain tab is paused / aion_config doesn't exist" note was accurate as of 2026-04-10. Commit `07b41d4` ("feat: Aion platform — conversational agent, tools, chat infra") shipped the full system. Here is what is actually live:

**DB columns exist.** Migration `supabase/migrations/20260407140000_aion_voice_foundation.sql:7` adds `aion_config jsonb NOT NULL DEFAULT '{}'` to `public.workspaces`. Migration `20260408120000_aion_chat_sessions.sql` creates `cortex.aion_sessions` and `cortex.aion_messages`. Migration `20260407160000_create_cortex_memory.sql` creates `cortex.aion_memory`. Migration `20260408140000_aion_session_summary.sql` adds `conversation_summary` to sessions.

**The voice setup conversation flow is wired end-to-end.** `src/app/api/aion/chat/route.ts:686` has `buildGreeting()` that reads `getOnboardingState(aionConfig)` and returns a state-appropriate greeting. The 5-state machine (`no_voice → no_example → no_guardrails → needs_test_draft → configured`) is in `src/app/(dashboard)/(features)/brain/lib/aion-chat-types.ts:86`. The system prompt at `chat/route.ts:669` injects per-state onboarding instructions. The `save_voice_config` tool at `src/app/api/aion/chat/tools/core.ts:115` saves to `aion_config` and advances the state.

**Draft generation respects voice.** `core.ts:33` `buildDraftPrompt()` injects `voice.description`, `voice.example_message`, and `voice.guardrails` into every draft prompt. The `draft_follow_up` tool calls this with the current config.

**The learning loop is wired.** `src/app/(dashboard)/(features)/brain/components/ChatInterface.tsx:230` `handleDraftEdited` fires to `/api/aion/learn-from-edit` after a draft is used. The endpoint at `src/app/api/aion/learn-from-edit/route.ts` extracts vocabulary swaps via LLM and writes them back to `aion_config.learned`.

**The Brain page exists** at `src/app/(dashboard)/aion/page.tsx:1` with `ChatInterface`. The `/brain` nav item in `src/shared/ui/command-spine/index.tsx:37` redirects there via `src/app/(dashboard)/brain/page.tsx:3`.

---

## Intended state

A new workspace owner opens the Brain tab, Aion greets them with a voice onboarding prompt, they describe their style in a few messages, paste an example follow-up, state their rules, and immediately get a test draft that reflects their voice. From then on, every draft from the follow-up queue uses their configured voice.

---

## The gap

The golden path works today. Three bugs silently break things downstream:

- **Learning loop drops `workspaceId`.** `ChatInterface.tsx:233` posts to `/api/aion/learn-from-edit` without `workspaceId` in the body. The endpoint returns 400 (`Missing fields`) on every call. `DraftEditedData` type doesn't carry `workspaceId`. The error is swallowed (fire-and-forget), so the UI never shows it, but vocabulary learning never happens.

- **`cortex.aion_memory` schema mismatch.** The migration creates the table without `user_id` or `entity_id` columns, but `core.ts:592` queries `.is('user_id', null)` and `.eq('user_id', userId)`, and the `save_memory` tool passes `p_user_id` and `p_entity_id` to `cortex.save_aion_memory` which doesn't accept those params. All personal / entity-scoped memory reads and writes silently fail.

- **`increment_aion_actions` RPC doesn't exist.** `src/features/intelligence/lib/aion-gate.ts:85` calls it, hits the fallback, but the fallback's `.update({ aion_actions_used: current + 1 })` at line 101 has no `.eq()` clause — it would update every workspace row. The `aion_actions_used` column does exist (`20260402120100_tier_config_and_workspace_columns.sql:43`), so creating the RPC properly would be cleaner and safer.

Not blocking the golden path but worth noting: `feedback` column is missing from `cortex.aion_sessions` (used in `aion-session-actions.ts:176`) and `aion_config` has no TypeScript types (`as any` casts throughout the action file).

---

## Options

### Option A: Fix the three bugs, declare Phase A done

- **What it is:** One-line code fix for the `workspaceId` bug. One migration adding `user_id uuid`, `entity_id uuid`, `feedback jsonb` columns and updating the RPC. One new `increment_aion_actions` RPC. No UI changes.
- **Effort:** Small — one file edit, one migration file.
- **Main risk:** None. All are isolated changes with no surface-area overlap.
- **Unlocks:** The full Phase A loop — voice setup, draft generation, vocabulary learning — works as designed. Phase B (push notifications, inline draft from Deal Lens) can start.

### Option B: Smoke test first, then fix what breaks

- **What it is:** Run through the live flow (`/aion` → describe voice → get draft → edit it), observe console/network errors, fix the actual failure modes found.
- **Effort:** Small — but requires the dev server running and at least one deal with a follow-up queue item.
- **Main risk:** May surface additional issues not visible in the code (RLS, schema exposure, Anthropic key missing in env).
- **Unlocks:** Higher confidence that the fix is complete, not just theoretically correct.

### Option C: Punt the bugs, move to Phase B

- **What it is:** Accept that the learning loop silently fails. Voice setup and draft generation still work. Ship Phase B (Deal Lens inline drafting, push notifications) and come back to learning loop later when there's real edit data to learn from.
- **Effort:** None now, but defers a foundational capability.
- **Main risk:** Vocabulary learning is the differentiated feature — the longer it's broken, the less data accumulates once it's fixed. Also, the `increment_aion_actions` fallback bug could corrupt usage data across all workspaces if autonomous-tier actions become common.
- **Unlocks:** Faster Phase B start, but on a weaker foundation.

---

## Recommendation

**Option A.** The fixes are surgical and low risk. The code fix is one line: add `workspaceId` to the `DraftEditedData` type and pass it through `ChatInterface.tsx:233`. The migration is 10-15 lines: add `user_id`, `entity_id`, and `feedback` columns, update the RPC signature, and create `increment_aion_actions` as a proper atomic increment. Total work: under an hour.

Skipping this (Option C) defers a foundational capability and risks silent data corruption on the action counter. Option B adds useful confidence but shouldn't be required to ship the fix — the bugs are clear from static analysis.

Phase A should be considered done after these fixes. The voice setup → draft path is end-to-end wired. Move to Phase B next session.

---

## Next steps for Daniel

1. Add `workspaceId` to `DraftEditedData` in `src/app/(dashboard)/(features)/brain/components/DraftPreviewCard.tsx` and thread it through `AionMessageRenderer.tsx` and `ChatInterface.tsx:230-248`.
2. Write migration `supabase/migrations/20260415120000_aion_memory_schema_fix.sql`: add `user_id uuid REFERENCES auth.users(id)` and `entity_id uuid REFERENCES directory.entities(id)` to `cortex.aion_memory`; add `feedback jsonb` to `cortex.aion_sessions`; update `cortex.save_aion_memory` to accept `p_user_id` and `p_entity_id` as optional params; create `increment_aion_actions(p_workspace_id uuid)` as an atomic `UPDATE ... SET aion_actions_used = aion_actions_used + 1` with a proper WHERE clause.
3. Run `npm run db:types` to regenerate types after migrating.
4. Open the app at `/aion` and walk the golden path: describe voice → paste example → state rules → request a test draft. Confirm the `DraftPreviewCard` renders and edits are sent to `learn-from-edit` with a 200 response.
5. Check the `public.workspaces` row for `aion_config` to confirm `voice`, `learned.vocabulary`, and `onboarding_state: 'complete'` are set after the flow.
6. Update the planning primer to reflect Phase A as shipped.

---

## References

- `supabase/migrations/20260407140000_aion_voice_foundation.sql` — `aion_config` column
- `supabase/migrations/20260407160000_create_cortex_memory.sql` — `cortex.aion_memory` DDL and RPC (missing user_id/entity_id)
- `supabase/migrations/20260408120000_aion_chat_sessions.sql` — sessions + messages + RPCs
- `src/app/api/aion/chat/route.ts` — auth, onboarding greeting, system prompt, streaming
- `src/app/api/aion/chat/tools/core.ts` — `save_voice_config`, `draft_follow_up`, `save_memory` tools
- `src/app/api/aion/learn-from-edit/route.ts` — vocabulary learning endpoint
- `src/app/(dashboard)/(features)/brain/components/ChatInterface.tsx:230` — broken `handleDraftEdited` (missing `workspaceId`)
- `src/app/(dashboard)/(features)/brain/lib/aion-chat-types.ts:86` — 5-state onboarding machine
- `src/features/intelligence/lib/aion-gate.ts:85` — broken `increment_aion_actions` fallback
