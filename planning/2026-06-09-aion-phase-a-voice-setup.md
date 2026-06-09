# Aion Phase A: Voice setup + first real draft

_Researched: 2026-06-09 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

_Note: the research found the premises in this question are stale. The doc below describes what actually exists and reframes accordingly._

## Current state

**`aion_config` exists and is populated.** `workspaces.aion_config` is a `jsonb` column (typed as `Json` in `src/types/supabase.ts`). Read/write actions are at `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:50–316`, covering `getAionConfig`, `saveAionVoiceConfig`, `resetAionVoiceConfig`, and `updateAionConfigForWorkspace`.

**`AionVoiceConfig` has three fields:** `description`, `example_message`, `guardrails`. The onboarding state machine (`aion-chat-types.ts:225–257`) has five states: `no_voice → no_example → no_guardrails → needs_test_draft → configured`.

**The chat-driven onboarding is wired end-to-end:**
- Chat route (`src/app/api/aion/chat/route.ts:122`) calls `getOnboardingState()` on every request and passes the state to `buildSystemPrompt` and `buildGreeting` (`chat/route/prompts.ts:276–282`).
- For each onboarding state, the system prompt injects an `=== ONBOARDING ===` directive instructing Aion to ask the right question and save via `save_voice_config`.
- At `needs_test_draft`, the prompt reads: "Offer a test draft. Use `draft_follow_up`. After approval, call `save_voice_config` with `onboarding_complete: true`." (`prompts.ts:282`)
- The `draft_follow_up` tool (`chat/tools/core.ts:318`) is registered and exported (`core.ts:649`). When it fires, `helpers.ts:103–105` renders a `draft_preview` rich block in the chat stream via `DraftPreviewCard.tsx`.

**The "Tune Aion's voice" affordance exists** in `AionSidebar.tsx:973–1049`. Clicking it calls `resetAionVoiceConfig()`, clears the stored voice, and shows a toast: "Voice reset — start a new chat to retune Aion." The next chat then opens at `no_voice`.

**The gap the queue item described no longer exists.** `AionInput.tsx`, `AionVoice.tsx`, and `ChatInterface.tsx` are all wired. The `draft-follow-up` API route (`src/app/api/aion/draft-follow-up/route.ts`) is functional.

## Intended state

Daniel clicks "Tune Aion's voice," starts a new Aion chat, answers three chat turns about his communication style (description → example message → guardrails), then sees Aion immediately generate a follow-up draft styled in his voice for a live deal. That's the described outcome, and the designed flow for it already exists. "The Brain tab" in the queue item maps to the Aion chat page + the sidebar overflow settings menu — not a separate dedicated page.

## The gap

The flow is designed and wired. The real gaps are:

- **Discoverability.** New workspaces get a synthesized default voice (`applyVoiceDefaultIfEmpty` in `aion-config-helpers.ts:35–45`) which sets `voice_default_derived: true`. This skips the 4-step onboarding entirely — the user is silently "configured" and never prompted to write a single word. The only entry point to voice setup is "Tune Aion's voice" buried behind a settings gear in the sidebar overflow (`AionSidebar.tsx:1041`).
- **No first-run nudge.** `AionLandingStarters.tsx` and `AionFirstVisitPrompt.tsx` exist as landing surfaces but neither checks `voice_default_derived` to surface a "set up your voice" CTA.
- **Draft requires a queued deal.** `draft_follow_up` at `needs_test_draft` defaults to the top-priority deal in the follow-up queue. If the queue is empty, Aion's draft offer will fall flat. The tool description says "Omit to use the top-priority deal" but doesn't handle the empty-queue case gracefully.

## Options

### Option A: Add a voice setup nudge to the landing starters
- **What it is:** In `AionLandingStarters.tsx`, check `voice_default_derived === true` from the loaded config and render a distinct starter card ("Your voice is auto-configured. Teach Aion how you actually write."). Clicking it sends a synthetic first message that triggers the `no_voice` onboarding branch.
- **Effort:** Small (2–4 hours). One component, no schema changes, no new API routes.
- **Main risk:** The 4-step onboarding hasn't been end-to-end tested. Could surface a rough edge.
- **Unlocks:** The described outcome — Daniel writes 3 paragraphs (one per chat turn), sees a draft preview.

### Option B: Harden the `needs_test_draft` → draft path before surfacing it
- **What it is:** Before adding the landing nudge, trace and test the full path in a browser: reset voice → 3 chat turns → `needs_test_draft` greeting → chip click → `draft_follow_up` tool call → `DraftPreviewCard`. Fix any failures. Then add the nudge from Option A.
- **Effort:** Small–Medium (1 day). No new code, just test coverage and targeted patches.
- **Main risk:** If the `draft_follow_up` tool fails for an empty queue, the final step is a dead end and the feature impression is bad.
- **Unlocks:** A reliable, demo-ready flow before any marketing or founder walkthroughs.

### Option C: Build a dedicated /aion/brain settings page
- **What it is:** New App Router page with a 3-field form (description, example_message, guardrails), wired to `saveAionVoiceConfig()`, with a "Generate test draft" button calling `draft-follow-up` on demand. `CadenceLearningToggle.tsx` and `LearnedSummaryCard.tsx` could also live here.
- **Effort:** Large (3–5 days). New page, new route, new UI surface.
- **Main risk:** Duplicates the chat-driven UX. Two surfaces for the same config creates drift.
- **Unlocks:** The literal "Brain tab" described in the queue item; home for future knowledge/memory UI.

## Recommendation

**Option B, then A.** The backend is more complete than the queue item assumed — don't build Option C before you know whether the chat flow actually works. The right move is to walk the existing path in the browser (20 minutes), find and fix whatever breaks, then add the landing nudge to make it discoverable. The `needs_test_draft` → `draft_preview` chain is the product moment: if it lands well, the chat-driven onboarding is the right design. If it feels awkward in practice, that's the signal to reconsider Option C — but not before.

The one concrete pre-check: make sure `draft_follow_up` handles an empty follow-up queue without a confusing error. If there are no deals queued, Aion should say "you don't have any queued deals yet — add a deal and I'll draft for it" rather than silently failing.

## Next steps for Daniel

1. In a browser, go to Aion → sidebar settings gear → "Tune Aion's voice" → confirm toast. Start a new chat and observe what Aion says as its opening message.
2. Complete the 3-step onboarding (describe voice, give example message, give guardrails). Verify each `save_voice_config` call writes to `workspaces.aion_config` (check Supabase Dashboard).
3. At the `needs_test_draft` greeting, click "Yes, try one." Verify `DraftPreviewCard` renders. If it errors, check `src/app/api/aion/chat/tools/core.ts:318–350` for the failure point.
4. If empty-queue draft fails, add a guard in `draft_follow_up`'s handler to return a user-facing message when no queue items exist.
5. In `src/app/(dashboard)/(features)/aion/components/AionLandingStarters.tsx`, add a starter that fires when `voice_default_derived === true` to make the onboarding discoverable.
6. Ship and smoke-test the full path: landing nudge → 3 chat turns → draft preview → `onboarding_state: 'complete'`.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — `AionConfig` type, read/write actions
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — `applyVoiceDefaultIfEmpty`, synthesized default logic
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:225–257` — `OnboardingState` type, `getOnboardingState()`
- `src/app/api/aion/chat/route.ts:122` — onboarding state read on every request
- `src/app/api/aion/chat/route/prompts.ts:276–282` — system prompt onboarding injection
- `src/app/api/aion/chat/route/prompts.ts:329–334` — `needs_test_draft` greeting + suggestion chips
- `src/app/api/aion/chat/tools/core.ts:318` — `draft_follow_up` tool definition
- `src/app/api/aion/chat/route/helpers.ts:103–105` — `draft_preview` rich block rendering
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:973–1049` — "Tune Aion's voice" entry point
- `src/app/(dashboard)/(features)/aion/components/DraftPreviewCard.tsx` — draft preview UI card
