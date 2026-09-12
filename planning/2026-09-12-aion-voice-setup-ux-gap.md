# Voice setup UX: first-time path from synthesized default to owner voice

_Researched: 2026-09-12 · Unusonic Research Agent_

## The question

> Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

**Note on premise:** This question was written in April 2026. Both stated preconditions are now false. `aion_config` has existed as a JSONB column on `public.workspaces` since migration `20260407140000_aion_voice_foundation.sql`. The Aion chat system is live at `/aion` (full `ChatInterface`, `SessionContext`, tool-calling route). There is no "Brain tab" as a standalone concept — "Brain" is the thinking-mode button in the chat's `ModelModePicker`. This doc re-scopes to: what is the CURRENT gap between the built system and the stated goal?

---

## Current state

`public.workspaces.aion_config` (`jsonb`, `DEFAULT '{}'`) is live. `AionConfig` is typed at `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:50` with `voice` (description, example_message, guardrails), `learned`, `follow_up_playbook`, and `kill_switch`.

The chat system at `src/app/api/aion/chat/route.ts:59` is a full tool-calling streaming route, authenticated, tier-gated, and kill-switch-gated. A 5-state onboarding machine exists in `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247`:

```
no_voice → no_example → no_guardrails → needs_test_draft → configured
```

When the chat route runs, `buildSystemPrompt` at `src/app/api/aion/chat/route/prompts.ts:284–291` injects per-state instructions: in `no_voice`, Aion is told to ask about communication style and save via `save_voice_config`. The `save_voice_config` tool at `src/app/api/aion/chat/tools/core.ts:118` calls `updateAionConfigForWorkspace()` and advances the state. At `needs_test_draft`, the `draft_follow_up` tool at `core.ts:318` pulls the top item from `ops.follow_up_queue` and generates a draft respecting `aion_config.voice` via `src/app/api/aion/lib/generate-draft.ts`. The `/api/aion/draft-follow-up` route is also live and does the same generation directly.

**The blocker that makes the goal unreachable today:** `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35` — `applyVoiceDefaultIfEmpty()` synthesizes a voice from the workspace name on every `getAionConfig()` call and sets `voice_default_derived: true`. `getOnboardingState()` at `aion-chat-types.ts:248` returns `'configured'` when this flag is set. So every new workspace is silently pre-configured and the 4-step forcing block never fires.

The only path to trigger the setup flow today is: `AionSidebar` overflow → "Tune Aion's voice" → `resetAionVoiceConfig()` (clears voice + flag) → open chat → now `no_voice` triggers. This affordance is buried in a overflow menu.

`AionFirstVisitPrompt` (`src/app/(dashboard)/(features)/aion/components/AionFirstVisitPrompt.tsx:1`) is a consent modal for the Aion card beta — not a voice setup form.

---

## Intended state

An owner (Daniel) opens Aion for the first time, sees a clear prompt to describe their communication style, writes one or more paragraphs, submits, and within seconds sees a draft follow-up message for a real deal that sounds like them. The setup path requires no sidebar knowledge.

---

## The gap

- New workspaces bypass the onboarding machine entirely via auto-synthesized default voice.
- The existing setup path (sidebar overflow → reset → 3-turn chat Q&A) requires knowing where to look.
- The Q&A model (one question per chat turn) does not match the "write 3 paragraphs" mental model from the queue item — users can't front-load everything in one text block easily.
- `AionFirstVisitPrompt` handles consent, not voice setup — there is no "set up your voice" first-run moment.

---

## Options

### Option A: First-visit CTA in the Aion empty state
- **What it is:** When `voice_default_derived === true` and no messages have been sent, render a "Set up your voice" prompt card in `ChatInterface`'s empty state (between `AionLandingStarters` and the input). Clicking calls `resetAionVoiceConfig()` (existing server action), then sends a synthetic chat message `"Let's set up my voice"` which triggers the `no_voice` flow and Aion asks the 3 questions in order.
- **Effort:** Small. One `voice_default_derived` prop through `ChatInterface` (needs a server read at the page level), one conditional card in the empty state, one button handler.
- **Main risk:** Still conversational — users must answer 3 turns rather than write freely. Doesn't deliver the "3 paragraphs" UX the queue item describes.
- **Unlocks:** The existing onboarding machine fires for new users. Zero new API surface.

### Option B: `/aion/setup` free-form page
- **What it is:** New route at `/aion/setup` with a 3-field form (style description, example message, guardrails), each a `<textarea>`. On submit, calls `saveAionVoiceConfig()` directly, then redirects to `/aion` and dispatches a synthetic `"Draft a test follow-up"` message via URL param — the chat route calls `draft_follow_up` and the `DraftPreviewCard` appears.
- **Effort:** Medium. New page + form component, a URL-param handler in `AionPageClient` (similar to the existing `PinOpenDispatcher` and `SessionDeepLinker` patterns), a fallback message when the follow-up queue is empty.
- **Main risk:** Needs at least one deal in `ops.follow_up_queue` for the immediate draft. Empty-workspace owners see the form but no draft. Add graceful fallback copy.
- **Unlocks:** Exactly matches the stated goal. The setup form is self-contained; the conversational Q&A remains available later for re-tuning.

### Option C: Voice setup section visible in `AionSidebar`
- **What it is:** When `voice_default_derived === true`, show a "Set up your voice" section at the top of the sidebar (above the session list) with 3 inline text fields and a submit button. On submit, calls `saveAionVoiceConfig()` and sends a `"Show me a test draft"` synthetic message to the active chat session.
- **Effort:** Small-medium. Sidebar receives `voiceState` prop, renders the section when `voice_default_derived`, calls server action on submit.
- **Main risk:** Sidebar is collapsible and starts open — users on a narrow viewport may not see it. Still requires the Aion page to be open.
- **Unlocks:** Setup is visible without knowing the overflow menu. Closer to the chat context where the draft will appear.

---

## Recommendation

**Ship Option B.** The queue item's goal is unambiguous: write once, see draft immediately. A dedicated `/aion/setup` page is the only option that delivers that without requiring users to understand the sidebar or chat Q&A sequencing. It also has a natural precedent in the codebase — `AionPageClient` already handles URL-param synthetic messages (`PinOpenDispatcher` at `AionPageClient.tsx:17`, `SessionDeepLinker` at `AionPageClient.tsx:45`). Add a third dispatcher that reads `?setupDone=1`, sends `"Draft a follow-up for my top deal"`, and strips the param.

The risk (empty queue → no draft) is real but solved in two lines: if `follow_up_queue` is empty, show "No deals in your follow-up queue yet — add a deal and come back" instead of the draft. The `draft_follow_up` tool already handles this gracefully at `core.ts:334`.

One tradeoff to accept: users who write rich, free-form paragraphs in the setup form may have them truncated or reformatted when `saveAionVoiceConfig` stores them as three discrete fields. The fields map cleanly (description ≈ paragraph 1, example ≈ paragraph 2, guardrails ≈ paragraph 3), so label the form fields accordingly.

---

## Next steps for Daniel

1. Create `src/app/(dashboard)/aion/setup/page.tsx` with a 3-field server component shell (same pattern as `aion/page.tsx`).
2. Create `src/app/(dashboard)/aion/setup/AionSetupClient.tsx` — a client form with three labeled `<textarea>` fields. On submit, call `saveAionVoiceConfig(voice)` (imported from `aion-config-actions.ts`), then `router.push('/aion?setupDone=1')`.
3. Add a `SetupDoneDispatcher` in `AionPageClient.tsx` (after `SessionDeepLinker`, same pattern) — reads `?setupDone=1`, calls `sendChatMessage({ text: 'Draft a follow-up for my top deal', workspaceId })`, strips param.
4. Add a first-visit banner in `ChatInterface.tsx` empty state: when `voice_default_derived === true` and `messages.length === 0`, show a "Teach Aion your voice — takes 2 minutes" link to `/aion/setup`. Read `voice_default_derived` from `getAionConfig()` in `AionPageClient` and pass it down as a prop.
5. Verify `draft_follow_up` tool returns a `DraftPreviewCard` for a workspace with at least one deal in `ops.follow_up_queue` — run the follow-up cron manually if needed (`GET /api/cron/follow-up-queue` with the cron secret).
6. Test the full path: `/aion/setup` → fill form → submit → `/aion?setupDone=1` → see `DraftPreviewCard` for the top pending deal.

---

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — `AionConfig` type, `saveAionVoiceConfig`, `resetAionVoiceConfig`, `getAionConfig`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — `applyVoiceDefaultIfEmpty` (the bypass)
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — `getOnboardingState`, 5-state machine
- `src/app/api/aion/chat/route/prompts.ts:284` — onboarding forcing block in system prompt
- `src/app/api/aion/chat/tools/core.ts:118` — `save_voice_config` tool
- `src/app/api/aion/chat/tools/core.ts:318` — `draft_follow_up` tool
- `src/app/api/aion/lib/generate-draft.ts` — `generateFollowUpDraft`, voice injection into prompt
- `src/app/(dashboard)/aion/AionPageClient.tsx` — `PinOpenDispatcher` and `SessionDeepLinker` patterns to reuse
- `supabase/migrations/20260407140000_aion_voice_foundation.sql` — `aion_config` column origin
