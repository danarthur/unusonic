# Aion Phase A: voice setup + first draft (current state)

_Researched: 2026-06-25 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

The premise of this question no longer matches the codebase. As of June 2026, every prerequisite described as missing has been shipped. The planning primer's "Brain tab is paused" note was accurate as of April 2026 but is now stale.

**What exists today:**

- `public.workspaces.aion_config` — EXISTS. `jsonb` column, default `'{}'::jsonb`, present in the baseline schema at `supabase/migrations/20260101000000_baseline_schema.sql:15058`.
- `AionVoiceConfig` type — EXISTS at `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:12`. Shape: `{ description, example_message, guardrails }`.
- Voice save action — `saveAionVoiceConfig()` at `aion-config-actions.ts:178`. Writes to `aion_config.voice` via service role.
- Voice setup flow — 4-step sequence (`no_voice → no_example → no_guardrails → needs_test_draft`) triggered by `resetAionVoiceConfig()`. Entry point: sidebar settings menu, "Tune Aion's voice" button at `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:982`.
- `voice_default_derived` flag — new workspaces get a default voice synthesized from the workspace name at `aion-config-helpers.ts` via `applyVoiceDefaultIfEmpty()`. Clears when owner explicitly saves a voice.
- `getDealContextForAion()` — EXISTS at `src/app/(dashboard)/(features)/events/actions/follow-up-actions.ts:545`. Assembles deal + client + proposal + follow-up log into `AionDealContext`.
- `/api/aion/draft-follow-up` — Fully implemented at `src/app/api/aion/draft-follow-up/route.ts`. Auth guarded (line 23), tier gated (line 44), kill-switch checked (line 54). Calls `generateFollowUpDraft()`.
- `generateFollowUpDraft()` — at `src/app/api/aion/lib/generate-draft.ts:25`. Uses `generateText` from Vercel AI SDK with `getModel('fast')`. Injects `voice.description`, `voice.example_message`, `voice.guardrails` into the system prompt (line 35).
- Brain tab UI — `ChatInterface.tsx` has no "paused" banner. No "waiting for timeline engine" string appears in any source file.
- Old API stub (`/api/aion/route.ts` — 16-line unauthenticated GPT-4-turbo stub) — does not exist in the current tree. Replaced by `/api/aion/chat/route.ts` (streaming, tool-calling, model-tier selection).

## Intended state

Daniel opens the Brain tab, sets his voice (tone + example message + guardrails), and sees a follow-up draft for a real deal that reads like him. The pipeline: voice saved in `aion_config.voice` → `getDealContextForAion()` assembles the deal snapshot → `generateFollowUpDraft()` injects voice into the system prompt → draft returned.

This is exactly what the code already does. The intended state and the current state are aligned on the backend.

## The gap

- **Discoverability:** The 4-step voice flow only runs if Daniel clicks "Tune Aion's voice" in the sidebar settings, or if he's a truly new workspace (no `voice_default_derived` flag). A workspace that already has a synthesized default voice skips onboarding entirely — Daniel may not know his voice config was auto-generated, not written by him.
- **No in-session draft trigger:** The draft endpoint is called from the Follow-Up Card in the Deal Lens (not from within the Brain tab chat itself). To "immediately see a draft" Daniel must navigate to a deal that has a pending follow-up queue item and click there. There is no in-chat command that runs the full voice→draft cycle.
- **Primer is out of date:** The planning primer's "Brain tab is paused" note will mislead any future agent or developer reading it. The primer's "Phase 2 prerequisites not started" list is fully started and done.

## Options

### Option A: Validate the existing path, update the primer

- **What it is:** Walk through the full voice→draft cycle on a real deal (reset voice → complete 4-step setup → open a deal with a pending queue item → trigger draft → confirm voice instructions appear in the output). Update `planning-primer.md` to reflect June 2026 state.
- **Effort:** Small (no code changes; ~30 minutes of manual testing + a one-file edit)
- **Main risk:** Discovering a silent bug in `generateFollowUpDraft` that's been shipping broken drafts.
- **Unlocks:** Confidence that Phase A is done. Clears the way to scope Phase B without re-litigating the same infrastructure questions.

### Option B: Surface voice setup on Aion landing for `voice_default_derived` workspaces

- **What it is:** Add a "Personalize Aion's voice" CTA to `AionLandingStarters.tsx` that fires when `aion_config.voice_default_derived === true`. Clicking it calls `resetAionVoiceConfig()` and drops into the 4-step flow. Removes the need to find the sidebar settings menu.
- **Effort:** Small (one component change, one server-action call, one condition in the landing starters)
- **Main risk:** If the landing starters component also shows for existing users with a real voice, the CTA would be intrusive. Needs a clean condition: only show when `voice_default_derived` is true AND the config has no explicit voice.
- **Unlocks:** First-time voice setup is a natural part of the Aion first-visit flow, not a buried settings menu item. Makes the stated goal ("Daniel opens Brain tab, writes voice, sees draft") a single-session experience.

### Option C: In-chat draft trigger

- **What it is:** Wire a chat tool in `src/app/api/aion/chat/tools/core.ts` that recognizes "draft a follow-up for [deal]" intent, calls `getDealContextForAion()` + `generateFollowUpDraft()`, and returns a `DraftPreviewCard` message block. Voice config flows in automatically from `aionConfig.voice`.
- **Effort:** Medium (new tool definition, intent routing in `lib/models.ts`, tool result → DraftPreviewCard message type)
- **Main risk:** The tool needs fuzzy deal matching by name — if the deal lookup is ambiguous or slow, the UX degrades. Also increases tool surface area that needs prompt-injection hardening.
- **Unlocks:** Daniel can say "draft a follow-up for the Warner Bros show" inside the Brain tab chat and see a voice-aware draft without leaving Aion. Makes the Brain tab the single entry point for the whole flow.

## Recommendation

Run Option A first — it takes 30 minutes and either confirms Phase A is done or surfaces a real bug. Do not build more on top of unvalidated infrastructure.

If Option A passes, the primer needs updating before anything else: the stale "Brain tab is paused" description will derail future research runs. Update `planning-primer.md` to reflect that Phase A is shipped, the 4-step voice setup is in the sidebar, and the draft endpoint is live.

After that, Option B is the right next step. The voice setup being buried in a sidebar settings menu is a real discoverability problem for the stated goal. A targeted CTA on the Aion landing (scoped to `voice_default_derived=true` workspaces only) closes the UX gap with minimal code surface. Option C (in-chat draft trigger) is the right Phase B feature, but it's medium effort and shouldn't start until the baseline path is confirmed working.

## Next steps for Daniel

1. Open the Brain tab in a real workspace. If you see a paused banner, note what it says and file that as a new queue question.
2. Click the sidebar settings menu (top-right of Aion sidebar) → "Tune Aion's voice" to verify the 4-step flow runs.
3. Complete the 4-step flow with real content (3 paragraphs of how you talk to clients fits neatly into description + example + guardrails).
4. Navigate to a deal that has a pending follow-up queue item. Confirm the Follow-Up Card renders a "Draft" button and produces a message that reads like your written voice.
5. If all of the above works: update `planning-primer.md` lines 107–111 to replace the "Brain tab is paused" block with a "Phase A shipped" summary.
6. Queue the next question: "How should the in-chat draft trigger (Option C) be scoped — what intent signals does the router need, and does it need a deal-search tool or can it rely on the existing page context store?"

## References

- `supabase/migrations/20260101000000_baseline_schema.sql:15058` — `aion_config` column
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:12,84,178,214` — types + queries + mutations
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:975,982` — voice setup entry point + sidebar settings
- `src/app/api/aion/draft-follow-up/route.ts:21` — draft endpoint
- `src/app/api/aion/lib/generate-draft.ts:25,52` — `generateFollowUpDraft()` + `buildFollowUpPrompt()`
- `src/app/(dashboard)/(features)/events/actions/follow-up-actions.ts:509,545` — `AionDealContext` type + `getDealContextForAion()`
- `planning-primer.md:107` — stale "Brain tab is paused" note (update after Option A validates)
