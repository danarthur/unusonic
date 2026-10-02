# Aion Phase A: Voice Setup Form + First Real Draft

_Researched: 2026-10-02 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

_Note: two premises in this question are outdated. `aion_config` already exists on `workspaces`. The "Brain tab" was never a rendered component — it was a planning concept. The research below starts from the actual codebase state._

## Current state

**Voice schema:** `aion_config: Json` column exists on `public.workspaces` (`src/types/supabase.ts:7895`). `AionConfig` type (`aion-config-actions.ts:50`) includes `voice?: AionVoiceConfig` with three fields: `description`, `example_message`, `guardrails` (`aion-config-actions.ts:12`).

**Save actions:** `saveAionVoiceConfig` (`aion-config-actions.ts:178`) and `updateAionConfigForWorkspace` (`aion-config-actions.ts:262`) are both implemented and write the three fields.

**Onboarding state machine:** `getOnboardingState` (`aion-chat-types.ts:247`) derives one of five states from `aion_config`: `no_voice → no_example → no_guardrails → needs_test_draft → configured`. The chat route resolves this on every POST (`chat/route.ts:124`) and injects the appropriate onboarding instruction into the system prompt (`prompts.ts:284`).

**Greeting flow:** `buildGreeting` (`prompts.ts:301`) returns distinct greeting messages and chip suggestions for each onboarding state. The `no_voice` greeting asks about communication style; `needs_test_draft` offers a test draft with two chips ("Yes, try one" / "I am good for now.") (`prompts.ts:338`).

**`save_voice_config` tool:** Defined in `chat/tools/core.ts:118`. Aion calls it whenever the user describes their style, pastes an example message, or states rules. Merges into `aion_config` via `updateAionConfigForWorkspace` and calls `refreshConfig()`.

**`draft_follow_up` tool:** Defined in `chat/tools/core.ts:318`. Pulls the top item from the follow-up queue (or a specified deal), builds context via `getDealContextForAion` (`follow-up-actions.ts:545`), and calls `generateFollowUpDraft` (`lib/generate-draft.ts`). That function injects `voice.description`, `voice.example_message`, and `voice.guardrails` into the system prompt (`generate-draft.ts:63`).

**"Tune Aion's voice" entry point:** The AionSidebar header overflow menu already has a "Tune Aion's voice" item (`AionSidebar.tsx:1043`) that calls `resetAionVoiceConfig`, which clears the voice fields. The next cold-open chat then lands on `no_voice`.

**What the "Brain tab" is today:** There is no Brain tab component. Aion lives at `/aion`, in the lobby (`LobbyClient.tsx:79`), and inline in `AionDealCard`. Prism has three tabs: Deal, Plan, Ledger (`prism.tsx:687`).

## Intended state

Daniel clicks "Tune Aion's voice" (or visits a direct setup page), writes three paragraphs (style, example message, guardrails), and immediately sees a real follow-up draft for his top deal — with his voice reflected. The whole sequence takes under 3 minutes and requires no further chat back-and-forth to produce the first draft.

## The gap

- The backend for voice setup and voice-injected drafting is complete. The gap is entirely UX.
- The current path — chat onboarding through `buildGreeting` — works only on a cold open (messages.length === 0). It requires at least 3-4 turns, depends on Aion following the onboarding system prompt without being sidetracked, and ends with a chip the user must still click.
- The `draft_follow_up` tool in `needs_test_draft` state fails silently if the follow-up queue is empty (`core.ts:334`: returns `{ error: 'No deals in the follow-up queue.' }`). A fresh workspace gets no draft.
- No standalone form exists. `saveAionVoiceConfig` has no UI consumer outside the conversational loop.
- "Tune Aion's voice" currently resets the config and drops the user into chat — it does not navigate to a structured setup form.

## Options

### Option A: Harden the existing chat onboarding
- **What it is:** Leave the chat as the setup path. Add a hard intercept in `buildSystemPrompt` so Aion refuses to answer non-onboarding questions until the current step is complete. Fix the empty-queue fallback in `draft_follow_up` to use the most recently updated deal if the queue is empty.
- **Effort:** Small
- **Main risk:** Conversational hard-forcing feels broken — users expecting to ask "show me my deals" get refused. Difficult to tune without a form contract.
- **Unlocks:** A functional setup path without new UI components.

### Option B: Add a standalone VoiceSetupForm component (recommended)
- **What it is:** Build a `VoiceSetupForm` component — three labeled textareas (tone/style, example message, guardrails) — wire to `saveAionVoiceConfig`, then immediately POST to `/api/aion/draft-follow-up` to show a live preview draft. Surface it from the existing "Tune Aion's voice" sidebar entry (navigate to `/aion/setup` instead of just resetting). Add a fallback context for empty queues: use the most recent deal even if not in the queue.
- **Effort:** Small (~250 lines, no schema changes)
- **Main risk:** Adds a new route (`/aion/setup`). Needs an empty-queue fallback to be useful for new workspaces.
- **Unlocks:** The exact "3 paragraphs → immediate draft" flow the queue item describes. Also unlocks editing voice outside of chat.

### Option C: Add a Brain tab to the Aion page
- **What it is:** Add a "Brain" tab to the `/aion` page alongside the chat interface. The Brain tab houses the `VoiceSetupForm` (from Option B), the `CadenceLearningToggle` (already built), and future config controls. Separate from the conversational chat.
- **Effort:** Medium
- **Main risk:** Splits the Aion page into two mental models (chat vs. config), which may confuse the design. The tab nav needs to live alongside the sidebar — that's a layout decision.
- **Unlocks:** A natural home for all workspace AI configuration beyond the sidebar overflow.

## Recommendation

Ship Option B. The backend plumbing is already done — `saveAionVoiceConfig`, `draft-follow-up`, and `getDealContextForAion` are all live. The only missing piece is a form UI and a direct navigation path.

A standalone `/aion/setup` page with three labeled textareas is ~250 lines of new code and no DB migrations. Wire "Tune Aion's voice" to navigate there instead of just resetting. On form submit: call `saveAionVoiceConfig`, then immediately fetch from `/api/aion/draft-follow-up` with the top queue item (or the most recently updated deal as fallback), and render the draft inline on the same page. The user writes, saves, and sees the result in one continuous action.

Option C is worth building later — but it's a layout decision that deserves its own sprint once the setup form is validated. Option A keeps the chat as the only entry point, which is fragile for first-time setup.

## Next steps for Daniel

1. Create `/src/app/(dashboard)/aion/setup/page.tsx` as the setup page route.
2. Build `VoiceSetupForm` in `/src/app/(dashboard)/(features)/aion/components/VoiceSetupForm.tsx` — three textareas, labels matching the `AionVoiceConfig` fields, submit button wired to `saveAionVoiceConfig`.
3. After successful `saveAionVoiceConfig`, POST to `/api/aion/draft-follow-up` from the form's client — pass the top follow-up queue item's context, or fall back to the most recent deal via `getDealContextForAion`.
4. Render the returned draft inline on the page (read-only textarea or prose block) so Daniel sees it without navigating away.
5. Update `AionSidebar.tsx:1043` to navigate to `/aion/setup` instead of just calling `resetAionVoiceConfig`.
6. Handle the empty-queue case in `/api/aion/draft-follow-up/route.ts` or the form's POST handler: if `draft-follow-up` returns an error for an empty queue, use a generic deal context (workspace name + generic scenario) so first-time users still see a draft.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:12` — `AionVoiceConfig` type
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:178` — `saveAionVoiceConfig`
- `src/app/api/aion/draft-follow-up/route.ts` — draft route, already live
- `src/app/api/aion/lib/generate-draft.ts:63` — where voice is injected into the prompt
- `src/app/api/aion/chat/route/prompts.ts:338` — `needs_test_draft` greeting
- `src/app/api/aion/chat/tools/core.ts:118` — `save_voice_config` tool
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:1043` — "Tune Aion's voice" entry
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — `getOnboardingState`
