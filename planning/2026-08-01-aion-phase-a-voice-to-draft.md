# Phase A Aion: Voice Setup to First Draft — What's Actually Left

_Researched: 2026-08-01 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

_Note: This question was written against the 2026-04-10 primer. As of 2026-08-01 the codebase has moved significantly. The findings below correct the outdated assumptions before scoping what remains._

## Current state

**`public.workspaces.aion_config` exists** — added in `supabase/migrations/pre-baseline/20260407140000_aion_voice_foundation.sql:7` and confirmed in `src/types/supabase.ts:7782`. Voice is stored as a typed JSONB sub-key `aion_config.voice = { description, example_message, guardrails }` — three prose fields for tone and style.

**`/api/aion/route.ts` (the "16-line stub") is gone** — replaced by `src/app/api/aion/draft-follow-up/route.ts` (73 lines). It is fully authenticated (`getUser()` at line 22), tier-gated (`canExecuteAionAction` at line 44), kill-switch aware (line 53), and already calls `generateFollowUpDraft({ context, voice: aionConfig.voice ?? null })` at line 60. Voice is wired to the draft path.

**`getDealContextForAion` is fully implemented** — defined at `src/app/(dashboard)/(features)/events/actions/follow-up-actions.ts:545`. Fetches deal, client, proposal, and recent follow-up log in parallel; returns a typed `AionDealContext` DTO. Called from 4 sites including the Follow-Up Card (`follow-up-card.tsx:341`) and the dispatch handlers.

**Follow-up engine is production** — `src/app/api/cron/follow-up-queue/route.ts` is a 669-line live cron. `ops.follow_up_queue` rows carry `reason`, `reason_type`, `suggested_channel`, and `context_snapshot`. `ops.follow_up_log` captures `draft_original`, `edit_classification`, `edit_distance` for the learn-from-edit loop (added alongside `aion_config` in the voice-foundation migration).

**Voice onboarding exists — inside the Aion chat** — the `onboarding_state` field in `aion_config` gates a 4-step voice collection flow driven by the `save_voice_config` tool in the chat prompts (`src/app/api/aion/chat/route/prompts.ts:275-282`). No standalone Brain tab page exists.

**"Brain tab" is unbuilt** — the Brain lucide icon appears in `ChatInterface.tsx:4` only as the "Thinking" model-mode button in `ModelModePicker`. No separate tab or paused-state gate exists anywhere in the codebase.

## Intended state

Daniel opens a Brain tab (or section), writes three paragraphs in plain language about how he writes to clients, hits save, and immediately sees a real Aion-generated follow-up draft for an in-flight deal that sounds like him. The loop confirms the voice config is wired and working before Daniel invests in refining it.

## The gap

- No standalone Brain tab or voice-setup form exists. Voice onboarding lives entirely inside Aion chat (conversational, multi-turn, not a "write 3 paragraphs" form experience).
- It is unconfirmed whether the Follow-Up Card exposes a one-click "Generate draft" button that surfaces the voice-informed output. The card calls `getDealContextForAion` but the next step (calling `draft-follow-up`) was not verified in the research pass.
- The "immediate feedback" step — seeing a draft right after saving voice config — requires either a deal in the queue or a synthetic demo context; neither is provided by the current voice onboarding flow.
- `AionSettingsView` at `/settings/aion` covers consent and cadence, not voice config.

## Options

### Option A: Validate the existing loop (no new code)

- **What it is:** Run the current in-chat onboarding to completion (`/aion`, let Aion walk through voice setup), then find a deal with a pending follow-up and trigger a draft from the Follow-Up Card. If the loop works end-to-end, the feature is done — the queue item was scoped against an outdated baseline.
- **Effort:** Small (one QA session, maybe 30 minutes)
- **Main risk:** The chat-based onboarding may feel impersonal or unclear; Daniel may not complete all three fields naturally, producing a thin `description` that yields a generic draft.
- **Unlocks:** Either proof the feature ships as-is, or a clear bug/UX report that scopes exactly what to build.

### Option B: Build a Brain tab with voice form and live draft preview

- **What it is:** New route segment at `/aion/brain` (or a tab in the existing Aion page). A three-field form for `{ description, example_message, guardrails }` with placeholder copy. Server Action saves to `aion_config.voice`. On save, calls `draft-follow-up` with the first pending queue item (or a synthetic context if queue is empty) and shows the resulting draft inline. This is the "write 3 paragraphs → see a draft" experience verbatim.
- **Effort:** Medium (new route, Server Action, form UI in stage-panel, one API call, draft preview component)
- **Main risk:** Building UI before confirming the in-chat loop is broken wastes effort. Also requires a working draft-generation path — if `generateFollowUpDraft` has a latent bug, it surfaces here first.
- **Unlocks:** The exact demo-able experience described in the queue item. Positions the Brain tab as a real surface for future planning/timeline features.

### Option C: Add voice config section to `/settings/aion`

- **What it is:** Extend the existing settings page (`AionSettingsView`) with a new "Voice" section housing the same three fields. Server Action is identical to Option B. Draft preview can render inline beneath the form.
- **Effort:** Small-to-medium (extend existing page, same Server Action as B, same draft preview)
- **Main risk:** Settings is not the right permanent home for the Brain tab (the queue item implies a richer surface later). Shipping voice config in settings creates a migration/duplication problem once the Brain tab is built.
- **Unlocks:** Same end-state as B with less scaffold, but at the cost of building the same UI twice.

## Recommendation

**Run Option A first, then build Option B if the loop is broken or unsatisfying.**

The research shows that every backend piece the queue item listed as missing is actually built: `aion_config` exists, `draft-follow-up` is authenticated and voice-wired, `getDealContextForAion` is live. The honest question is whether the existing in-chat onboarding produces a good enough `AionVoiceConfig` and whether the Follow-Up Card surfaces the draft cleanly. That is a 30-minute test, not a build.

If Option A confirms the loop works but feels clunky (the chat onboarding loses context or Daniel never fills in `example_message`), then ship Option B — not Option C. A standalone Brain tab is the right long-term home for voice setup and any future timeline/planning primitives. Building it in settings creates debt immediately. Option B is two to three days of focused work and produces a demo-able end-to-end moment that is worth having before the next investor or early-customer conversation.

Accept this tradeoff: Option B requires at least one deal in `ops.follow_up_queue` with a real context snapshot to produce a compelling preview draft. A synthetic fallback context can paper over this in development but should not ship to production — surface a "No pending follow-ups to preview against" state instead.

## Next steps for Daniel

1. Open `/aion` and trigger the voice onboarding — confirm it completes and that `aion_config.voice` is non-null afterward (check in Supabase Dashboard: `select aion_config->'voice' from public.workspaces where id = '<your-workspace-id>'`).
2. Go to any open deal → Follow-Up Card → confirm there is a "Generate draft" or equivalent button and that it calls `/api/aion/draft-follow-up`.
3. If the draft is voice-informed and readable, the loop works — close this queue item as done with no code change.
4. If the loop has gaps, open `src/app/api/aion/chat/route/prompts.ts:275-282` (the `save_voice_config` tool definition) to see what fields it captures and why they may be incomplete.
5. If building Option B: scaffold `/aion/brain/page.tsx`, add a Server Action in `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` that writes `{ voice: { description, example_message, guardrails } }` via `supabase.from('workspaces').update(...)`, and wire the draft preview to `draft-follow-up`.
6. Read `src/app/api/aion/draft-follow-up/route.ts` and `src/app/api/aion/lib/generate-draft.ts` before touching any draft generation code — the tier gate and kill-switch must be preserved.

## References

- `src/app/api/aion/draft-follow-up/route.ts` — authenticated draft endpoint
- `src/app/(dashboard)/(features)/events/actions/follow-up-actions.ts:545` — `getDealContextForAion`
- `src/app/(dashboard)/(features)/events/components/follow-up-card.tsx:341` — Follow-Up Card draft trigger
- `src/app/api/aion/chat/route/prompts.ts:275-282` — `save_voice_config` tool / onboarding_state flow
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:50-74` — `AionConfig` / `AionVoiceConfig` types
- `src/types/supabase.ts:7782` — `aion_config` column declaration
- `supabase/migrations/pre-baseline/20260407140000_aion_voice_foundation.sql` — voice foundation migration
- `src/app/api/cron/follow-up-queue/route.ts` — follow-up cron (669 lines, production)
