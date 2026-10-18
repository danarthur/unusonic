# Aion Phase A: Voice Setup to First Follow-Up Draft

_Researched: 2026-07-21 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

**Both stated blockers are resolved.** The primer's description of the Brain tab and `aion_config` was accurate as of April 10, 2026, but the codebase has advanced substantially since then.

**What exists today:**

- `public.workspaces.aion_config` (JSONB) is live and fully typed as `AionConfig` at `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:50`. The shape contains `voice` (`AionVoiceConfig`: description, example_message, guardrails), `learned`, `follow_up_playbook`, and `onboarding_state`.

- The full chat route is live at `src/app/api/aion/chat/route.ts`. It is not the 16-line stub anymore — it is a production tool-calling route with auth, tier gating, rate limiting, session management, and rolling summarization.

- A 5-state onboarding machine exists at `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247`: `no_voice → no_example → no_guardrails → needs_test_draft → configured`. Each state has a greeting and system-prompt directive in `src/app/api/aion/chat/route/prompts.ts:300`.

- `save_voice_config` is a live chat tool at `src/app/api/aion/chat/tools/core.ts:118`. Aion calls it automatically when the user describes their style in conversation.

- `draft_follow_up` is a live chat tool at `src/app/api/aion/chat/tools/core.ts:318`. It fires at the `needs_test_draft` state or on demand. It uses the stored voice config via `generateFollowUpDraft()` at `src/app/api/aion/lib/generate-draft.ts:25`.

- `/api/aion/draft-follow-up` is a standalone REST endpoint (`src/app/api/aion/draft-follow-up/route.ts`) that returns a draft for the top queue deal.

**Critical behavior:** `applyVoiceDefaultIfEmpty()` at `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35` synthesizes a default voice from the workspace name and sets `voice_default_derived: true`. `getOnboardingState()` treats that flag as `'configured'` (`aion-chat-types.ts:247`). This means **new workspaces skip the conversational onboarding entirely** and open with a pull-mode chat greeting. The "Tune Aion's voice" overflow in the AionSidebar calls `resetAionVoiceConfig()` to re-enter the flow.

## Intended state

Daniel described a specific UX: open the Brain tab, write 3 paragraphs, see a draft immediately. The design's onboarding flow achieves the same outcome but spread across 3-4 sequential conversation turns. Two things prevent the "3 paragraphs → immediate draft" experience today:

1. New workspaces are silently routed to `configured` state (auto-derived voice), so the onboarding flow never triggers unless Daniel knows to click "Tune Aion's voice".
2. Even if the conversational flow triggers, it is sequential — each field (description, example, guardrails) requires a separate turn.

The intended state is a single-screen form that accepts all three fields at once and immediately renders a draft.

## The gap

- No dedicated voice setup form exists. `saveAionVoiceConfig()` at `aion-config-actions.ts:178` is the right server action but is called by nothing in the UI — only the chat tool calls `updateAionConfigForWorkspace()` internally.
- No "write all 3 at once → instant draft" path exists. The conversational flow works but requires 3-4 turns.
- New workspaces never see the onboarding prompts because `voice_default_derived` routes them to `configured` immediately.
- There is no surfacing mechanism that tells Daniel his voice is auto-derived (not explicit) and that setting it explicitly would unlock better drafts.

## Options

### Option A: Dedicated voice setup form with inline draft preview

- **What it is:** A `VoiceSetupSheet` component (slide-over or inline panel) with 3 text areas: communication style, example message, guardrails. On submit, calls `saveAionVoiceConfig()` then immediately POSTs to `/api/aion/draft-follow-up` and renders the draft. Surfaced in the Brain tab when `voice_default_derived === true` (a banner or an empty-state card with a "Set your voice" CTA).
- **Effort:** Medium (1-2 days). Server actions and draft endpoint exist. New: `VoiceSetupSheet.tsx`, a trigger banner in `ChatInterface` or `AionSidebar`, and a client-side fetch to `/api/aion/draft-follow-up`.
- **Main risk:** The `/api/aion/draft-follow-up` endpoint requires a deal in the follow-up queue. A brand-new workspace with no deals returns `{ error: 'No deals in the follow-up queue.' }` — needs a graceful fallback ("No deals in queue yet — your voice is saved and will apply to drafts as deals come in").
- **Unlocks:** Exactly the flow Daniel described. Explicit voice overrides the auto-derived default and persists.

### Option B: Fix the conversational flow — remove the auto-derived bypass for new workspaces

- **What it is:** Change `applyVoiceDefaultIfEmpty()` (or `getOnboardingState()`) so `voice_default_derived` no longer short-circuits to `'configured'`. New workspaces go through the 3-turn chat onboarding. Add a "Tell me all at once" chip on the `no_voice` greeting that signals Aion to accept all 3 fields in a single message.
- **Effort:** Small (half a day). Touches `aion-config-helpers.ts` and `aion-chat-types.ts`, plus adding a chip label to `prompts.ts:305`.
- **Main risk:** Existing workspaces currently in `voice_default_derived: true` state would hit the onboarding flow again on next chat open. Need a migration path (e.g. only apply to workspaces where `onboarding_state` was never explicitly set).
- **Unlocks:** The existing conversational pipeline works as designed. No new UI needed. The 3-turn flow is still 3 turns, not 1 — doesn't fully satisfy the "3 paragraphs → immediate draft" spec.

### Option C: Brain tab cold-start card

- **What it is:** When the Brain tab opens with `voice_default_derived === true` and fewer than 5 outbound messages exist (proxy for "new workspace"), render a cold-start card inside `ChatInterface` above the input — 3 fields plus a "Set voice and see a draft" button. On submit, saves voice via server action, requests a draft via the chat session (dispatches a synthetic message), and the draft appears in the chat thread.
- **Effort:** Medium-large (2-3 days). More integrated with the chat session state, requires thread injection or a synthetic message dispatch similar to how `PinOpenDispatcher` works at `AionPageClient.tsx:17`.
- **Main risk:** Complexity of injecting a draft back into the live chat session. Also need to coordinate with `AionFirstVisitPrompt` (consent modal) so both don't surface simultaneously.
- **Unlocks:** Fully in-tab experience; voice setup and first draft live in the same UI surface. Better than Option A UX-wise if the integration works cleanly.

## Recommendation

**Build Option A.** It is the minimum viable implementation of the stated goal and the fastest to ship correctly. The server actions (`saveAionVoiceConfig`) and draft endpoint (`/api/aion/draft-follow-up`) are already production-ready. The only new code is a form component and the trigger surface.

Option B is worth doing as a follow-on — the auto-derived voice bypass is a design compromise that hides onboarding from users who would benefit from it — but it doesn't achieve the "write 3 paragraphs → see draft immediately" spec on its own. Option C is the best long-term UX but is riskier to ship quickly given the session injection complexity.

Accept the tradeoff that Option A is a sheet, not an in-chat experience. The important thing is that Daniel can input all three fields at once and see a draft in seconds. The sheet can be iterated into an in-chat experience later (Option C path).

## Next steps for Daniel

1. Check if there are any deals in `ops.follow_up_queue` for your workspace. The draft endpoint returns an error if queue is empty — confirm the queue has rows before wiring the draft preview.
2. Create `src/app/(dashboard)/(features)/aion/components/VoiceSetupSheet.tsx` — a `<form>` with 3 `<textarea>` fields (description, example_message, guardrails) and a submit button. On submit, call `saveAionVoiceConfig(voice)`.
3. After `saveAionVoiceConfig` resolves, POST to `/api/aion/draft-follow-up` with `{ workspaceId, context: ... }` using the top queue deal. Render the returned `draft` inline below the form.
4. Add a trigger in `AionSidebar.tsx` or as a banner inside `ChatInterface.tsx`: when `voice_default_derived === true`, show "Your voice is auto-configured — set it explicitly to improve drafts" with a button that opens the sheet.
5. Handle the empty-queue case gracefully: show "Voice saved. Drafts will use it as soon as you have a deal in the queue" instead of an error.
6. Run `npm run test` to confirm no regressions in `aion-config-actions.test.ts`.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — `saveAionVoiceConfig`, `getAionConfig`, `AionConfig` type
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — `applyVoiceDefaultIfEmpty`, `synthesizeDefaultVoice`
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — `getOnboardingState`, 5-state machine
- `src/app/api/aion/chat/route/prompts.ts:275` — onboarding directives in system prompt
- `src/app/api/aion/chat/route/prompts.ts:300` — per-state greeting builders
- `src/app/api/aion/chat/tools/core.ts:118` — `save_voice_config` tool
- `src/app/api/aion/chat/tools/core.ts:318` — `draft_follow_up` tool
- `src/app/api/aion/draft-follow-up/route.ts` — standalone draft endpoint
- `src/app/api/aion/lib/generate-draft.ts` — `generateFollowUpDraft`, `buildFollowUpPrompt`
- `src/app/(dashboard)/aion/AionPageClient.tsx` — Brain tab page client
