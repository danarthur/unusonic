# Aion Phase A: Voice Setup + First Real Draft

_Researched: 2026-06-11 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

The premise in the queue entry is outdated. Both `aion_config` and the in-chat voice setup pipeline are fully implemented.

**Column exists:** `public.workspaces.aion_config` is a `Json` column, typed in `src/types/supabase.ts:7689`.

**Type and server actions are implemented:**
- `AionVoiceConfig` (description, example_message, guardrails) at `aion-config-actions.ts:12`
- `saveAionVoiceConfig()` at `aion-config-actions.ts:178` — writes to the column, clears `voice_default_derived`
- `updateAionConfigForWorkspace()` at `aion-config-actions.ts:262` — deep-merge path used by the chat route
- `getAionConfigForWorkspace()` at `aion-config-actions.ts:106` — reads via system client for API routes

**5-state onboarding machine is implemented:** `getOnboardingState()` at `aion-chat-types.ts:247` derives state from config: `no_voice` → `no_example` → `no_guardrails` → `needs_test_draft` → `configured`. When `voice_default_derived === true`, jumps straight to `configured` so new workspaces aren't blocked.

**In-chat collection is implemented:**
- `buildGreeting()` at `prompts.ts:292` returns a step-specific prompt for each onboarding state
- `save_voice_config` tool at `tools/core.ts:118` — Aion calls this mid-conversation to persist each field
- System prompt gate at `prompts.ts:282`: when state is `needs_test_draft`, Aion is told "Offer a test draft. Use draft_follow_up."
- `draft_follow_up` tool at `tools/core.ts:318` — fetches deal context + entity memories, generates draft using the workspace's stored voice

**Chat is live at `/chat`** (`chat/page.tsx:1` renders `ChatInterface` with `viewState="chat"`). If `aion_config.voice` is empty, opening `/chat` immediately asks "How would you describe your style?"

**What is missing:** `/settings/aion/AionSettingsView.tsx` is purely consent and cadence management — no voice configuration form. There is no dedicated "Brain tab" or voice setup page. The setup path exists but only as an in-chat conversation, which requires Daniel to know to start it.

## Intended state

Daniel opens a dedicated voice setup surface, writes in plain prose how he talks to clients (description, an example message, guardrails), saves, and is immediately handed a draft that reflects that voice on his highest-priority deal. The setup should feel like filling in a card, not discovering a hidden chat onboarding flow.

Per the 5-state machine design, the natural terminal state is `needs_test_draft` after all three fields are filled, at which point the chat route surfaces a draft offer via suggestion chips.

## The gap

- No form-based voice setup UI. The pipeline exists; the front door doesn't.
- `/settings/aion` has consent controls but no "Your voice" section.
- After saving voice via form, there's no handoff to trigger the test draft — the user would have to navigate to `/chat` manually and know to ask.
- No "Brain tab" as a named entry point on the deal page. `AionDealCard` is embedded in the Deal lens as a card, not a full chat surface.

## Options

### Option A: Voice form in `/settings/aion`
- **What it is:** Add a "Your voice" section to `AionSettingsView.tsx` — three textareas calling `saveAionVoiceConfig()`. On save, redirect to `/chat` (general scope). The `needs_test_draft` greeting fires immediately and offers a draft.
- **Effort:** Small — one new section in an existing page, one existing server action, one client redirect.
- **Main risk:** The settings page is a cold, admin-feeling context. Writing about communication style feels odd next to consent toggles.
- **Unlocks:** The voice setup has a form-based home; the in-chat flow becomes the fallback rather than the only path.

### Option B: Accept the in-chat path as-is
- **What it is:** The `/chat` route already handles the full onboarding: voice collection → example → guardrails → test draft offer. Reset voice config via `resetAionVoiceConfig()`, open `/chat`, and the 5-step flow works today.
- **Effort:** Zero new code. A link or tooltip pointing Daniel to `/chat` is the only addition.
- **Main risk:** UX discovery — the setup is buried in a conversational flow. Daniel wrote the queue item because he didn't know this existed, which means other users won't either. The sequential collection (three separate chat turns) doesn't match the "write 3 paragraphs" mental model.
- **Unlocks:** Nothing new — already complete.

### Option C: "Brain" tab on the deal page
- **What it is:** Add a Brain tab to the deal Prism lens that renders a deal-scoped `ChatInterface`. Voice setup happens in-chat, but in the context of a real deal Daniel is looking at. The `pageContext` passed to the chat route would set `type: 'deal'`, so `draft_follow_up` targets that deal directly.
- **Effort:** Medium — new tab in the deal lens tab strip, ChatInterface embedded with a deal scope, session creation wired to deal ID.
- **Main risk:** Increases deal page complexity. The deal page already has two tabs (Deal, Plan) plus a heavy panel structure. A chat tab adds a third context to manage.
- **Unlocks:** The "write about your style in context of a specific deal and immediately see a draft for it" UX. Also makes Aion contextual on every deal, not just at `/chat`.

## Recommendation

Option A. It's the minimum path and it closes the actual gap: there's no form-based entry point to voice setup, and adding one to `/settings/aion` is a two-hour task using fully-built infrastructure.

The in-chat path (Option B) is already done but it's invisible. Nobody discovers it without a prompt. Option C is the right long-term home for Aion on the deal page, but it's a full tab addition and doesn't need to block the voice setup story.

Build the `/settings/aion` voice form first. After save, redirect to `/chat`. The `needs_test_draft` greeting will fire automatically and offer the test draft — this produces the "write 3 paragraphs → immediately see a draft" sequence Daniel described, using zero new backend code. Option C (deal-scoped Brain tab) becomes the next queue item.

One accepted tradeoff: the settings context is colder than a deal page. If the draft feels disconnected from any specific deal, that's fine for Phase A — the test draft uses the top-priority item from the follow-up queue.

## Next steps for Daniel

1. Open `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` — add a "Your voice" section below the existing consent controls.
2. Three `<textarea>` fields: description ("How you talk to clients"), example_message ("Paste a follow-up you sent that landed well"), guardrails ("Anything Aion should always or never do"). Plain prose, no structure required.
3. On save, call `saveAionVoiceConfig({ description, example_message, guardrails })` from `aion-config-actions.ts:178` — server action is ready.
4. After successful save, `router.push('/chat')`. The `buildGreeting` at `prompts.ts:329` will fire the `needs_test_draft` state, offering a draft with suggestion chips.
5. Test the full flow: clear your `aion_config.voice` in Supabase, open `/settings/aion`, fill the form, hit save, land on `/chat`, accept the "Yes, try one" chip.
6. Once the flow works end-to-end, update the primer to remove "Brain tab is paused."

## References

- `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` — target file for voice form addition
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:12,178` — AionVoiceConfig type + saveAionVoiceConfig
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — getOnboardingState 5-state machine
- `src/app/api/aion/chat/route/prompts.ts:292,329` — buildGreeting + needs_test_draft state
- `src/app/api/aion/chat/tools/core.ts:118,318` — save_voice_config + draft_follow_up tools
- `src/types/supabase.ts:7689` — aion_config column confirmation
