# Aion voice setup: form-first path to first real draft

_Researched: 2026-11-24 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

_Note: several premises in this question are stale. The research reframes the actual current gap below._

## Current state

The question was written against the April 2026 codebase. As of November 2026, Phase A is largely shipped:

**`aion_config` exists and is live.** The column was added in `supabase/migrations/pre-baseline/20260407140000_aion_voice_foundation.sql`. `getAionConfig()` reads it; `saveAionVoiceConfig()` writes it; both are in `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:84–206`.

**`AionVoiceConfig` type is defined** as `{ description, example_message, guardrails }` at `aion-config-actions.ts:12–16`.

**A 5-state onboarding machine is wired into the chat route.** `getOnboardingState()` at `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` drives the states `no_voice → no_example → no_guardrails → needs_test_draft → configured`. The chat route's `buildSystemPrompt()` injects the current state into Aion's instructions at `src/app/api/aion/chat/route/prompts.ts:284–294`, and `buildGreeting()` at `:306` delivers the matching opening message.

**Draft generation is live.** `generateFollowUpDraft()` at `src/app/api/aion/lib/generate-draft.ts:25` calls Claude with `voice` injected into the system prompt. `/api/aion/draft-follow-up/route.ts` is a full route with auth, tier-gating, and kill-switch checks.

**Default voice synthesis bypasses onboarding.** `synthesizeDefaultVoice()` at `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:20` auto-generates a placeholder voice from the workspace name. `applyVoiceDefaultIfEmpty()` at `:35` injects it on every read and sets `voice_default_derived: true`. Because `getOnboardingState()` returns `configured` when `voice_default_derived` is true, **every new workspace skips the 4-step conversational flow entirely.**

**The only re-entry point for voice tuning is an overflow button.** `SidebarSettingsMenu` in `AionSidebar.tsx:982` offers "Tune Aion's voice", which calls `resetAionVoiceConfig()`. This deletes the stored voice and says "start a new chat to retune Aion" — routing the user back through Aion's conversational questioning.

## Intended state

The queue goal: Daniel opens the Aion tab, writes 3 paragraphs about how he talks to clients, and immediately sees a draft. This implies a **form-first** setup path — direct textareas for description, example message, and guardrails, followed by an instant test draft without requiring a multi-turn conversation.

Currently there is no such form. `/settings/aion` (`AionSettingsView.tsx`) manages deal card beta consent and cadence opt-in; it has no voice configuration UI. The only voice setup is conversational (chat) or the placeholder synthesized from the workspace name.

## The gap

- No standalone voice setup form with direct-edit textareas and an instant draft preview
- `/settings/aion` is the natural home for a voice config section, but has none
- Default voice synthesis (Wk 11 §3.8) silently bypasses onboarding for all new workspaces — users never see that they have a placeholder
- "Tune Aion's voice" drops the voice and routes to chat, but gives no in-place form
- No zero-deal fallback for the test draft (the follow-up queue requires real deals)

## Options

### Option A: Voice config form in /settings/aion (recommended)

- **What it is:** Add a `VoiceConfigSection` to `AionSettingsView.tsx` with three textareas (description, example message, guardrails). On save, calls `saveAionVoiceConfig()`. Below the form, a "Preview a draft" button calls `/api/aion/draft-follow-up` with a synthetic context (or the first real deal from the follow-up queue if one exists).
- **Effort:** Small — the server action and API route already exist. Pure UI work in one file.
- **Main risk:** Synthetic draft context (no real deal) produces a generic output that undersells the feature; solved by using the top follow-up queue item if available.
- **Unlocks:** The exact experience in the queue item — open a tab, type your style, see a draft in one interaction.

### Option B: Prominent first-visit prompt in the Aion chat

- **What it is:** When `voice_default_derived === true`, surface a banner ("Aion is using a placeholder voice — tune it in 3 steps") with a CTA that calls `resetAionVoiceConfig()` and starts a new chat. The conversational onboarding already works; this just makes it visible.
- **Effort:** Small — banner logic + a flag in localStorage to dismiss once.
- **Main risk:** The conversational flow still takes 4+ turns. The "immediately see a draft" goal isn't met.
- **Unlocks:** More users discover that tuning is possible; doesn't change the setup mechanism.

### Option C: Inline voice form inside the chat interface

- **What it is:** When onboarding state is `no_voice` (after a voice reset), replace Aion's first message with a structured form card instead of a conversational question. User fills fields, submits, Aion immediately drafts.
- **Effort:** Medium — requires a new message content type (`voice_setup_form`), a client-side form renderer, and routing logic in the chat route.
- **Main risk:** Breaks the message type contract established across the codebase; more surface area.
- **Unlocks:** A tighter, single-surface experience without leaving the chat.

## Recommendation

Build Option A. The backend is fully ready — `saveAionVoiceConfig()` and `/api/aion/draft-follow-up` need no changes. The gap is a single settings view section: three textareas and a preview button. This takes the queue item's goal from "0% reachable" to "one tab open" without touching the chat route, the message type system, or any API surface.

Option B is worth adding alongside A as a discoverability layer (the banner can point to `/settings/aion#voice`), but it doesn't deliver the form-first experience on its own. Option C is overengineered for the goal.

The one real decision to resolve before building: what deal context does the preview draft use? The cleanest answer is the first item in `ops.follow_up_queue` for the workspace; if the queue is empty (new workspace), use a hardcoded synthetic context (fictional deal, `"checking in"` reason). This keeps the preview meaningful for Daniel and graceful for new users.

## Next steps for Daniel

1. Open `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` and add a `VoiceConfigSection` below the existing panels. The section needs three `<textarea>` fields bound to `AionVoiceConfig` state plus a Save button that calls `saveAionVoiceConfig()`.
2. Add a "Preview a draft" button below the form. On click: fetch the top item from `ops.follow_up_queue` (via an existing server action), or fall back to a fixed synthetic `AionDealContext`, then POST to `/api/aion/draft-follow-up`. Render the result in a `<pre>` or prose block inline.
3. In `AionSidebar.tsx:1007`, update the `toast.success` message on "Tune Aion's voice" to link to `/settings/aion#voice` rather than saying "start a new chat" — this closes the discovery loop.
4. Optionally add a one-time banner in `ChatInterface.tsx` when `voice_default_derived === true` that says "Aion is using a placeholder voice" with a link to the new settings section.
5. Run `npm run test` to confirm existing config-actions tests pass with no changes needed.
6. Ship — no migration needed; `aion_config` already exists.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — `AionVoiceConfig`, `getAionConfig`, `saveAionVoiceConfig`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — `synthesizeDefaultVoice`, `applyVoiceDefaultIfEmpty`
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:224–257` — `OnboardingState` machine
- `src/app/api/aion/chat/route/prompts.ts:284–294` — onboarding forcing block
- `src/app/api/aion/draft-follow-up/route.ts` — draft generation endpoint
- `src/app/api/aion/lib/generate-draft.ts` — `generateFollowUpDraft` with voice injection
- `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` — settings page (no voice form today)
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:973–1048` — "Tune Aion's voice" overflow
