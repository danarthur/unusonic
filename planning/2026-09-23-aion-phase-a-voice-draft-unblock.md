# Aion Phase A: Voice Setup to First Draft

_Researched: 2026-09-23 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

_Note: the question's framing is from the planning-primer snapshot dated 2026-04-10. This doc re-states the question, then reports the actual current state five months later._

## Current state

The blockers the question assumes no longer exist. Phase A infrastructure is fully shipped:

- `public.workspaces.aion_config` is a live `jsonb NOT NULL DEFAULT '{}'` column (`supabase/migrations/20260101000000_baseline_schema.sql:15058`). It was added via `supabase/migrations/pre-baseline/20260407140000_aion_voice_foundation.sql:7`.
- `AionConfig` type and full CRUD live at `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:12–316`. `saveAionVoiceConfig` writes `aion_config.voice`; `resetAionVoiceConfig` clears it for retuning.
- `ChatInterface.tsx` is a fully wired 808-line component at `src/app/(dashboard)/(features)/aion/components/ChatInterface.tsx`. Not a stub.
- A 5-state onboarding machine (`no_voice → no_example → no_guardrails → needs_test_draft → configured`) drives the chat route at `src/app/api/aion/chat/route/prompts.ts:225–257` and `284–292`. Each state maps to a tailored greeting and a forcing block in the system prompt.
- `save_voice_config` is a live tool at `src/app/api/aion/chat/tools/core.ts:117–137` that writes voice fields to the DB via `updateAionConfigForWorkspace`.
- `generateFollowUpDraft` at `src/app/api/aion/lib/generate-draft.ts:25–46` injects `voice.description`, `voice.example_message`, and `voice.guardrails` into the system prompt for every draft.
- `/api/aion/draft-follow-up` at `src/app/api/aion/draft-follow-up/route.ts` is live with auth guard, tier gate, and kill-switch check. Called by `follow-up-card.tsx:348`.
- `getDealContextForAion` at `src/app/(dashboard)/(features)/events/actions/follow-up-actions.ts:545` is fully implemented and imported by four consumers.
- "Tune Aion's voice" is surfaced in the sidebar overflow (`src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:973–1044`): calls `resetAionVoiceConfig` and re-enters the 4-step onboarding.

The "Brain tab" concept was never built as a separate navigation tab. The Aion page at `/aion` renders `ChatInterface` directly. Voice is set up conversationally, which is the intended design.

## Intended state

Daniel opens Aion, writes 3 paragraphs about how he talks to clients, and immediately sees a follow-up draft that reflects that voice. The journey should be legible on first open without reading a tooltip. The draft should work even if no deals are in the follow-up queue yet.

## The gap

Two concrete failures remain between current code and that journey:

- **Discovery gap.** New workspaces auto-receive a synthesized default voice from the workspace name (`src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:20–44`). `applyVoiceDefaultIfEmpty` sets `voice_default_derived: true`, which `getOnboardingState` treats as `configured` (`aion-chat-types.ts:248`). A new owner opening `/aion` lands immediately in `configured` mode — the 4-step voice setup never fires. The path to it is the sidebar overflow menu, which is easy to miss.
- **Empty-queue failure.** When `draft_follow_up` is called and the follow-up queue is empty, it returns `{ error: 'No deals in the follow-up queue.' }` (`core.ts:334`). A workspace that has just completed voice setup — or one where the cron hasn't run yet — cannot see a test draft at the last step of onboarding.

## Options

### Option A: Add an onboarding cue inside ChatInterface

- **What it is:** When the loaded `aion_config` has `voice_default_derived === true`, render a small dismissible banner at the top of the chat body — "Aion is using a default voice. Teach it yours." with a single CTA that calls `resetAionVoiceConfig()` and starts a new session. No new route or page needed.
- **Effort:** Small. One new component (~50 lines), one new prop threaded into `ChatInterface` (the resolved `voice_default_derived` flag, readable via `getAionConfig` in the page server component).
- **Main risk:** The prop chain through `AionPageClient` → `ChatInterface` needs a minor extension. Non-breaking.
- **Unlocks:** The full "open Aion → write voice → see draft" journey is available without any sidebar hunting.

### Option B: Add a /aion/settings voice form

- **What it is:** Create `src/app/(dashboard)/aion/settings/page.tsx` with three labelled text areas (description, example, guardrails). Server Action posts via `saveAionVoiceConfig`. On success, redirect to `/aion` which will be in `needs_test_draft` state.
- **Effort:** Medium. New route, server-rendered form, Zod validation, redirect.
- **Main risk:** Duplicates what the conversational flow already does. Two parallel paths for the same action, which diverge over time.
- **Unlocks:** An explicit non-chat path. Useful if the chat-onboarding feel is wrong for some users.

### Option C: Fix the empty-queue fallback for test draft

- **What it is:** In `draft_follow_up` at `core.ts:332–336`, when the queue is empty fall back to the most recently updated open deal from `public.deals` (a single `.select().eq('status', 'open').order('updated_at').limit(1)`). If no deals at all exist, return a graceful message asking the user to pick a deal once they have one open.
- **Effort:** Small. ~15 lines in `core.ts`, no new files.
- **Main risk:** The fallback deal may not have a queue item with a real `reason`, so the draft prompt uses the stub `reason: 'Requested by user'` — still useful as a voice demo.
- **Unlocks:** The `needs_test_draft` step completes even for brand-new workspaces.

## Recommendation

Ship Option A and Option C together. They are both small and close the same journey end-to-end. A eliminates the discovery gap; C prevents the flow from breaking at the final step.

Option B adds a second voice-setup path that will accumulate drift against the conversational flow — defer it unless the conversational setup proves confusing in practice. The 4-step chat onboarding is already well-designed; it just needs to be surfaced.

Accepting: the draft produced during `needs_test_draft` uses a stub queue reason when no real queue item exists. That is fine for a voice demo — the point is to show the tone, not the exact CTA. The stub text (`"Requested by user"`) is invisible to Daniel in the output.

## Next steps for Daniel

1. In `src/app/(dashboard)/aion/page.tsx` (or `AionPageClient.tsx`), call `getAionConfig()` server-side and pass `voice_default_derived` as a boolean prop to `ChatInterface`.
2. Create `src/app/(dashboard)/(features)/aion/components/AionVoiceOnboardingBanner.tsx`: a dismissible one-line banner shown when `voiceIsDefault === true`. CTA calls `resetAionVoiceConfig()` then `session.startNewSession()` (the hook already exists in `useSession`).
3. Wire the banner into `ChatInterface.tsx` at the top of the message list — render before any messages when `voiceIsDefault` is true and the user hasn't dismissed it (use a session-scoped flag in `sessionStorage` so it re-appears on next open).
4. In `src/app/api/aion/chat/tools/core.ts:332–336`, replace the empty-queue hard return with a fallback: query `public.deals` for the most recent open deal, use it with the stub `queueItem`.
5. Test the full path manually: new workspace → `/aion` → banner visible → click CTA → voice onboarding (4 steps) → `needs_test_draft` → "Yes, try one" → draft with your voice injected.
6. Update `planning-primer.md` to reflect the actual current Aion state (primer is 5 months stale on Aion).

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — voice CRUD, `AionConfig` type
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — `synthesizeDefaultVoice`, `applyVoiceDefaultIfEmpty`
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:225–257` — `getOnboardingState`
- `src/app/api/aion/chat/route/prompts.ts:280–295` — onboarding forcing blocks in system prompt
- `src/app/api/aion/chat/tools/core.ts:318–396` — `draft_follow_up` tool
- `src/app/api/aion/lib/generate-draft.ts` — voice injection in draft prompt
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:970–1044` — "Tune Aion's voice" affordance
- `src/app/(dashboard)/(features)/aion/components/ChatInterface.tsx` — main chat UI (808 lines, fully wired)
- `supabase/migrations/20260101000000_baseline_schema.sql:15058` — `aion_config` column definition
