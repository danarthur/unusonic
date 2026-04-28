# Aion Phase A: Voice Setup + First Real Draft

_Researched: 2026-04-28 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

---

**Note on premise:** The queue item was written against an earlier codebase state (primer dated 2026-04-10). As of today, both stated premises are out of date. `workspaces.aion_config` exists. The onboarding + draft pipeline is built. See Current State.

## Current state

**`workspaces.aion_config` exists.** Migration at `supabase/migrations/pre-baseline/20260407140000_aion_voice_foundation.sql` adds the JSONB column. The `getAionConfig()` action at `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:84` reads it; `saveAionVoiceConfig()` at `:178` writes it.

**Full onboarding state machine is implemented.** `getOnboardingState()` at `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` derives the current state:

1. `no_voice` — no voice description yet
2. `no_example` — description set, no example message
3. `no_guardrails` — description + example set, no rules
4. `needs_test_draft` — all three set, not yet confirmed with a draft
5. `configured` — complete

The chat route builds a per-state `=== ONBOARDING ===` directive into the system prompt (`src/app/api/aion/chat/route.ts:948–956`) and renders a tailored greeting at each stage (`route.ts:965–1006`). The `needs_test_draft` greeting offers the user a chip — "Yes, try one" — which triggers the `draft_follow_up` tool.

**`draft_follow_up` auto-picks the top-priority deal.** The tool at `src/app/api/aion/chat/tools/core.ts:318` queries the follow-up queue and falls back to the highest-priority item when no `dealId` is passed (`core.ts:332–336`). It enriches the draft with semantic memory and entity context before calling `generateFollowUpDraft()` at `src/app/api/aion/lib/generate-draft.ts`. Voice config (description + example + guardrails) is injected into the system prompt at `route.ts:297–319` via `buildSystemPrompt()`.

**`/api/aion/chat/route.ts` is the real implementation** — 1320 lines, fully authenticated, Claude-backed, with tool-calling, intent routing, and conversation summarization. The "16-line GPT-4-turbo stub" the primer references was a different file (`/api/aion/route.ts`) that no longer exists at that path.

**One bypass to know:** If a new workspace has no voice config, `getAionConfig()` synthesizes a default voice from the workspace name and sets `voice_default_derived: true` (`aion-config-helpers.ts:43`). `getOnboardingState()` short-circuits to `configured` when that flag is set (`aion-chat-types.ts:248`), skipping the 4-step onboarding. Existing workspaces in this state must reset via "Tune Aion's voice" in the sidebar, which calls `resetAionVoiceConfig()` (`aion-config-actions.ts:214`).

## Intended state

Daniel opens the Aion page, Aion greets him with the `no_voice` prompt, he responds with how he talks to clients, pastes an example message, states any rules, and clicks "Yes, try one." Aion auto-picks the top deal and drafts a message in his documented voice. He confirms, onboarding completes, workspace enters `configured` pull-mode.

That flow is fully described by the existing code. The design intent is implemented.

## The gap

- **Unknown: does the `aion_config` column exist in the production Supabase instance?** The migration is in `pre-baseline/` which may or may not have run against the live DB. If it hasn't, every `aion_config` read silently returns `{}` and voice config is never persisted.
- **Hidden onboarding entry point for existing workspaces.** If `voice_default_derived: true`, the onboarding never fires on cold open. The only reset path is the Sidebar overflow — easy to miss.
- **No dedicated "Brain tab."** The queue item mentions it. There is no such tab. The Aion experience lives at `/aion`. This may be fine or may be a product intent still outstanding.

## Options

### Option A: Smoke test + DB check (do this first)

- **What it is:** Run `npm run dev`, open `/aion`, trigger `resetAionVoiceConfig()` via the Sidebar overflow, walk through all four onboarding steps, confirm a draft appears. Separately, confirm in the Supabase dashboard that `workspaces.aion_config` is a real column. If the migration hasn't run, apply it.
- **Effort:** Small (15–30 minutes)
- **Main risk:** Could uncover a silent failure in an integration that looks correct in code (e.g., `getDealContextForAion` fails because the follow-up queue is empty in dev)
- **Unlocks:** Ground truth. Either Phase A is done and the queue item closes, or you have a specific broken step to fix.

### Option B: Onboarding discoverability for existing workspaces

- **What it is:** Add a "Set up Aion's voice" call-to-action in the `/aion` lobby empty state that fires when `voice_default_derived: true` but no real voice has been saved. Directs users to the existing reset flow rather than hiding it in the Sidebar overflow. A one-line check and a chip in `ChatInterface.tsx` around the empty-state block (`:352–398`).
- **Effort:** Small
- **Main risk:** Touching ChatInterface empty state requires care — it's used for both onboarding and the configured pull-mode lobby
- **Unlocks:** Daniel can open `/aion` on his existing workspace and reach the setup flow without hunting for the Sidebar option.

### Option C: Dedicated voice setup page at /settings/aion/voice

- **What it is:** A standalone multi-step form at `/settings/aion/voice` — three text areas (description, example, guardrails), live word count, preview of how the AI will render the style. Saves via `saveAionVoiceConfig()`. Accessible from the Sidebar and from a prominent CTA on `/aion` lobby.
- **Effort:** Large (new page, new components, new settings subsection)
- **Main risk:** Duplicates the chat-native onboarding flow, adds a second place where voice config lives, increases maintenance surface
- **Unlocks:** A more form-like, inspectable setup experience — closer to how tools like Notion AI settings work

## Recommendation

**Do Option A.** The code says Phase A is complete. The primer says it isn't. That contradiction needs to be resolved with a real test, not with more code. Spend 30 minutes running the flow end-to-end: reset the workspace voice config, walk through the four onboarding steps in the chat, confirm the test draft appears and respects the voice description you entered.

The only real risk is the DB column not existing in production — easy to verify and fix in 5 minutes if so.

If the smoke test works cleanly, **Phase A is done.** Close this queue item and move to whatever Phase B is in section 26 of the design doc. If a specific step breaks, open a new, narrowly-scoped queue item describing exactly what failed and at which step.

Option B (discoverability improvement) is a worthwhile follow-up regardless of the smoke test result — the `voice_default_derived` bypass is a real UX gap for any workspace that went through onboarding before this flow existed. But it's not blocking Phase A.

## Next steps for Daniel

1. Check the Supabase table editor: does `public.workspaces` have an `aion_config` column? If not, apply the migration at `supabase/migrations/pre-baseline/20260407140000_aion_voice_foundation.sql`.
2. Run `npm run dev` and open `http://localhost:3000/aion`.
3. In the Sidebar, open the overflow menu → "Tune Aion's voice" → confirm `resetAionVoiceConfig()` fires and the next cold open shows the `no_voice` greeting.
4. Walk all four onboarding steps: description → example → guardrails → "Yes, try one." Confirm a draft appears.
5. If any step fails, note the exact failure and open a focused queue item: "Step N of Aion onboarding fails — [specific error]."
6. If all steps pass, mark Phase A complete and read section 27+ of the design doc for Phase B scope.

## References

- `src/app/api/aion/chat/route.ts` — full chat implementation, onboarding system prompt (lines 948–956), greeting builder (lines 965–1006)
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — `getOnboardingState()` state machine
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — `getAionConfig`, `saveAionVoiceConfig`, `resetAionVoiceConfig`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:43` — `voice_default_derived` synthesis
- `src/app/api/aion/chat/tools/core.ts:318` — `draft_follow_up` tool (auto-picks top deal)
- `src/app/api/aion/lib/generate-draft.ts` — draft generation
- `src/app/(dashboard)/(features)/crm/actions/follow-up-actions.ts:545` — `getDealContextForAion`
- `supabase/migrations/pre-baseline/20260407140000_aion_voice_foundation.sql` — `aion_config` column migration
