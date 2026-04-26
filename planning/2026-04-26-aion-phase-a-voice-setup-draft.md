# Aion Phase A: Voice Setup + First Real Draft

_Researched: 2026-04-26 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

_Note: two premises in this question are outdated. See Current State._

## Current state

The primer's "Current notable state" (dated 2026-04-10) is significantly stale. The codebase is materially further along than described.

**`aion_config` already exists.** The column `aion_config jsonb DEFAULT '{}'::jsonb NOT NULL` is live on `public.workspaces` (`supabase/migrations/20260101000000_baseline_schema.sql:15058`). `getAionConfig()` reads it with `applyVoiceDefaultIfEmpty()` that synthesizes a default voice from the workspace name (`aion-config-actions.ts:84-99`, `aion-config-helpers.ts:35-45`).

**`AionVoiceConfig` type is defined** with three fields: `description`, `example_message`, `guardrails` (`aion-config-actions.ts:12-16`). The `AionConfig` wrapper also carries `onboarding_state`, `kill_switch`, and `voice_default_derived` flags (`aion-config-actions.ts:50-74`).

**`/api/aion/chat/route.ts` is a full tool-calling route**, not a 16-line stub. It handles auth, rate limiting, tier gating, model selection, intent classification, tool assembly, and streaming (`route.ts:1-550+`). `ChatInterface.tsx` is wired in `AionPageClient.tsx:5`.

**A 5-state onboarding machine exists.** `getOnboardingState()` returns `no_voice → no_example → no_guardrails → needs_test_draft → configured` (`aion-chat-types.ts:247-257`). The chat route uses this to generate state-specific greeting prompts (`route.ts:929-970`) and to append onboarding instructions to the system prompt (`route.ts:912-919`).

**`save_voice_config` tool in the chat** fires when the LLM detects the user describing their communication style. It saves any or all of `description`, `example_message`, `guardrails` and can set `onboarding_state = 'complete'` (`core.ts:118-143`).

**Draft infrastructure is complete.** `generateFollowUpDraft()` exists at `generate-draft.ts:25`. `/api/aion/draft-follow-up/route.ts` is an auth-gated, tier-checked endpoint that accepts deal context and voice config and returns a draft (`draft-follow-up/route.ts:1-73`). `buildDraftPrompt()` in `core.ts:36` injects voice into every draft.

**One real blocker: model access.** All model tiers are temporarily routed to `claude-haiku-4-5-20251001` due to a Sonnet/Opus 404 from the Anthropic org dashboard (`models.ts:64-73`). `MODELS.standard` and `MODELS.heavy` are commented stubs pointing at Haiku.

**No structured voice setup form exists.** The only path to voice setup is conversational: 4-5 chat turns to collect `description`, `example_message`, and `guardrails` separately. `AionSettingsView.tsx` at `/settings/aion` covers consent and card features but has no voice config textareas (`AionSettingsView.tsx:33`). There is also no "Brain tab" in the deal page — the Aion surface is a standalone `/aion` route.

## Intended state

Daniel opens a UI, writes his communication style, pastes an example message, and states his guardrails — then immediately sees a draft follow-up that uses all three. The experience should feel like tuning an instrument, not filling out a chatbot questionnaire. The "Brain tab" referenced in the queue item was likely a planned deal-page tab; the current Aion surface at `/aion` is the production equivalent.

## The gap

- No structured voice form — only conversational (4-5 turns) to collect all three fields
- `MODELS.standard` / `MODELS.heavy` blocked on Haiku 4.5 (`models.ts:70-71`) — affects reasoning quality for config turns
- No link from the chat greeting or nav to a "set up your voice" affordance
- No "Brain tab" in the deal page (though `/aion` with deal-scoped sessions covers the same ground)

## Options

### Option A: Voice form on `/settings/aion`

- **What it is:** Add a collapsible section to `AionSettingsView.tsx` with three textareas (`description`, `example_message`, `guardrails`) + a Save button (calls existing `saveAionVoiceConfig()`) + a "Test a draft" button that fetches the top follow-up queue item via `getFollowUpQueue()` then POSTs to `/api/aion/draft-follow-up`. Draft renders inline below the form.
- **Effort:** Small — ~120 lines added to one file, zero new API routes, zero schema changes
- **Main risk:** If `ops.follow_up_queue` is empty (fresh workspace), test draft has no deal context. Need a graceful fallback message ("Add a deal first to test with real context").
- **Unlocks:** Daniel can set voice in one sitting, immediately verify the draft quality, and never touch the chat onboarding flow again.

### Option B: Standalone `/aion/setup` wizard page

- **What it is:** A dedicated 3-step page: step 1 description, step 2 example, step 3 guardrails + preview draft. Each step saves on advance. Final step shows a draft from the top queue item.
- **Effort:** Medium — new route, new page component, step state machine, ~300 lines
- **Main risk:** Adds a route that has to stay maintained. The settings form (Option A) is simpler and achieves the same outcome.
- **Unlocks:** A clean first-time onboarding URL that can be linked from workspace onboarding and email invites.

### Option C: Fix model access only, leave conversational

- **What it is:** Flip `MODELS.standard` back to `claude-sonnet-4-5` and `MODELS.heavy` to `claude-opus-4-5` (or 4-6 aliases) in `models.ts:70-71` once the Anthropic dashboard confirms org access. Add a "Describe your voice in one message" tip to the `no_voice` greeting chips.
- **Effort:** Tiny — one line in `models.ts`, one chip label change in `route.ts:937`
- **Main risk:** The fundamental UX issue remains. 4-5 back-and-forth turns is not "write 3 paragraphs and see a draft." Discoverability stays low.
- **Unlocks:** Better draft quality immediately. Does not solve the setup friction.

## Recommendation

**Do both Option A and Option C, in that order.**

The model access fix (`models.ts:70-71`) should happen first — it's one line and improves every Aion turn immediately. Confirm Sonnet 4.5 or 4.6 access in the Anthropic dashboard, flip the constants, done.

Then add the voice form to `/settings/aion`. The settings page already exists, the server action (`saveAionVoiceConfig`) is already written and tested, and the draft endpoint (`/api/aion/draft-follow-up`) is live. This is gluing three working parts together with a form. The "write 3 paragraphs → see a draft" experience Daniel described maps exactly to 3 textareas + 1 button. The conversational onboarding can stay as a fallback path for users who prefer it — these aren't mutually exclusive.

Option B (wizard page) is better UX but is a future project, not Phase A. Build it when there's a real new-user onboarding funnel to plug it into.

## Next steps for Daniel

1. **Confirm model access.** Open the Anthropic dashboard → check whether `claude-sonnet-4-5` or `claude-sonnet-4-6` is available at the org level. Once confirmed, edit `src/app/api/aion/lib/models.ts:70-71` and flip `standard` and `heavy` to the correct model IDs.

2. **Add the voice form.** In `src/app/(dashboard)/settings/aion/AionSettingsView.tsx`, add a section below the consent block with three labeled `<textarea>` fields for `description`, `example_message`, and `guardrails`. Wire Save to `saveAionVoiceConfig()` from `aion-config-actions.ts`.

3. **Add a "Test a draft" button.** Below the form, add a button that calls `getFollowUpQueue()` (from `follow-up-actions.ts`), takes the first item, calls `getDealContextForAion()`, then POSTs to `/api/aion/draft-follow-up`. Render the result in a read-only `<textarea>`.

4. **Add empty-queue fallback.** If `getFollowUpQueue()` returns nothing, show: "Add a deal to the CRM to test with real client context."

5. **Link from the chat greeting.** In `buildGreeting()` at `src/app/api/aion/chat/route.ts:933`, add a chip to the `no_voice` state: `{ label: 'Set it up myself', value: '/settings/aion → Voice setup' }` — or use a structured `link` content type if one exists in `AionMessageContent`.

6. **Delete `ArthurInput.tsx`** (referenced in primer as empty file, delete candidate). Confirm it is empty, then remove it.

## References

- `supabase/migrations/20260101000000_baseline_schema.sql:15058` — `aion_config` column
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:12-74` — type definitions and `getAionConfig`
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247-257` — `getOnboardingState`
- `src/app/api/aion/chat/route.ts:288, 912-919, 929-970` — system prompt + greeting builder
- `src/app/api/aion/chat/tools/core.ts:36, 118-143` — `buildDraftPrompt`, `save_voice_config` tool
- `src/app/api/aion/lib/generate-draft.ts:25` — `generateFollowUpDraft`
- `src/app/api/aion/draft-follow-up/route.ts:1-73` — draft endpoint
- `src/app/api/aion/lib/models.ts:64-73` — temporary Haiku routing
- `src/app/(dashboard)/settings/aion/AionSettingsView.tsx:33` — settings page (no voice form today)
