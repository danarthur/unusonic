# Aion Phase A: Voice Setup to First Draft

_Researched: 2026-08-23 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

_Note: the premise in the queue item is outdated. Both blockers (`aion_config` missing, Brain tab paused) are resolved. The gap is UX, not infrastructure._

## Current state

**`aion_config` exists and is fully wired.** `src/types/supabase.ts:7782` shows `aion_config: Json` on the `workspaces` table. `getAionConfigForWorkspace` reads it at `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:106`, `saveAionVoiceConfig` writes it at `:178`. The `AionVoiceConfig` type (`:12`) has three fields: `description`, `example_message`, `guardrails`.

**A 5-state voice onboarding machine exists in the chat.** `getOnboardingState` at `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` returns `no_voice → no_example → no_guardrails → needs_test_draft → configured`. When Daniel opens Aion with a fresh workspace, the greeting (`prompts.ts:301`) asks "How would you describe your style?" with chip shortcuts. The `save_voice_config` tool at `src/app/api/aion/chat/tools/core.ts:118` saves each answer to `workspaces.aion_config` as the conversation progresses.

**Draft generation is wired end-to-end.** `generateFollowUpDraft` at `src/app/api/aion/lib/generate-draft.ts:25` accepts `AionVoiceConfig | null` and injects description, example, and guardrails into the system prompt. The `draft_follow_up` chat tool at `core.ts:318` uses the top follow-up queue item by default, or falls back to `pageContext.entityId` when viewing a deal.

**There is no "Brain tab."** The Aion page (`/aion`) is the ChatInterface. The settings page (`/settings/aion`) manages the deal-card beta consent — it does not surface voice config.

## Intended state

Daniel opens a focused interface, writes 3 paragraphs in his own words (style, an example message, his rules), hits save, and immediately sees a follow-up draft for a real deal. No multi-turn chat negotiation. The voice is persisted, the draft is visible in under 10 seconds, and the experience confirms "Aion sounds like me."

## The gap

- **The conversational onboarding spreads input across 3–4 chat turns.** Writing 3 paragraphs in one go only fills `voice.description`; the state stays at `no_example` until Daniel separately pastes an example message.
- **There is no form-based shortcut.** Nothing lets Daniel say "here is everything at once — now draft something."
- **Draft fallback on empty queue fails silently.** `draft_follow_up` returns `{ error: 'No deals in the follow-up queue.' }` if there are no queue items. A new workspace that hasn't reached the queue stage gets nothing.
- **No settings page for voice.** The existing `/settings/aion` page only manages beta consent. Voice config is invisible outside the chat.

## Options

### Option A: Smart intake in the chat
- **What it is:** Update the `no_voice` chat route so when the user submits more than ~150 characters, the LLM is instructed to extract description + example + guardrails from the single message and call `save_voice_config` with all three fields at once, then immediately call `draft_follow_up`.
- **Effort:** Small — a prompt change in `buildSystemPrompt` and a one-line note in the `no_voice` greeting. No new UI.
- **Main risk:** The LLM may still hedge ("I found your style, want to add an example?"). Needs careful prompting.
- **Unlocks:** A single long chat message gets Daniel to a draft in one turn.

### Option B: Dedicated voice setup form at `/settings/aion/voice`
- **What it is:** A new settings page with three labeled text areas (communication style / example message / rules) and a "Save and preview a draft" button. On submit: calls `saveAionVoiceConfig(voice)` then calls `/api/aion/draft-follow-up` with the most recent active deal, renders the draft inline.
- **Effort:** Medium — new `page.tsx`, a client form component, one server action, draft fetch. Reuses all existing primitives.
- **Main risk:** Adds a second voice-configuration surface alongside the chat flow. If they diverge in the future, they need to stay in sync.
- **Unlocks:** Exactly the described goal. Deliberate, form-native, visually confirms the draft responds to the voice.

### Option C: Voice onboarding card in the Aion landing view
- **What it is:** In the `no_voice` empty state of ChatInterface, render a 3-field card (description / example / guardrails) instead of the current chip row. On submit: call `saveAionVoiceConfig` directly (bypassing the LLM), then POST to `/api/aion/draft-follow-up` and display the draft as the first assistant message.
- **Effort:** Medium — a new React component inside the existing ChatInterface empty-state branch, one Server Action call, one fetch.
- **Main risk:** A form element inside a chat surface reads as inconsistent. Also `draft_follow_up` still fails if there are no queue items (needs the empty-queue fallback fixed regardless).
- **Unlocks:** The "3 paragraphs → immediate draft" flow, without leaving the Aion page.

## Recommendation

**Build Option B** (the settings page), but fix the empty-queue fallback first.

The conversational flow (Option A) is theoretically correct but the LLM cannot reliably extract all three fields from free-form text in one turn — it will always ask a follow-up question, which is exactly the friction the goal wants to remove. Option C (form-in-chat) solves that but a tabbed form inside a chat surface is an awkward hybrid.

A settings page is the right mental model: voice configuration is not a request to Aion, it is system configuration. The pattern already exists at `/settings/aion`. The form maps directly to the three `AionVoiceConfig` fields, and the inline draft preview gives immediate feedback that the voice is working. The chat-based onboarding can remain as a fallback for users who arrive via chat.

The one prerequisite for either approach: fix `draft_follow_up`'s empty-queue failure. When there are no queue items, fall back to the most recently updated active deal using a direct DB lookup, so the preview always renders.

## Next steps for Daniel

1. **Fix the empty-queue fallback** in `src/app/api/aion/chat/tools/core.ts:334` — when `queue.length === 0`, query the most recent active deal from `public.deals` instead of returning an error.
2. **Create** `src/app/(dashboard)/settings/aion/voice/page.tsx` — server component that reads `getAionConfig()` and renders `VoiceSetupForm`.
3. **Create** `src/app/(dashboard)/settings/aion/voice/VoiceSetupForm.tsx` — three `<textarea>` fields bound to `AionVoiceConfig`, a "Save and see a draft" button that calls `saveAionVoiceConfig(voice)` then fetches `/api/aion/draft-follow-up`.
4. **Render the draft inline** — after the fetch resolves, show the draft text in a `StagePanel` on the same page with a "Looks right" / "Regenerate" affordance. Mark `onboarding_state: 'complete'` via a second `saveAionVoiceConfig` call if the user approves.
5. **Add a link from `/settings/aion`** — add a "Set up your voice" row that navigates to the new page.
6. **Optionally simplify the chat onboarding** — once the form exists, the `no_voice` chat greeting can become a single chip: "Set up your voice in settings" that deep-links to the new page.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — `AionConfig`, `AionVoiceConfig`, `saveAionVoiceConfig`, `getAionConfigForWorkspace`
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:225` — `OnboardingState`, `getOnboardingState`
- `src/app/api/aion/chat/tools/core.ts:118` — `save_voice_config` tool
- `src/app/api/aion/chat/tools/core.ts:318` — `draft_follow_up` tool (note empty-queue failure at `:334`)
- `src/app/api/aion/lib/generate-draft.ts` — `generateFollowUpDraft`, `buildFollowUpPrompt`
- `src/app/api/aion/draft-follow-up/route.ts` — `/api/aion/draft-follow-up` route
- `src/app/api/aion/chat/route/prompts.ts:300` — onboarding greeting variants
- `src/types/supabase.ts:7782` — `workspaces.aion_config: Json` (confirmed column exists)
