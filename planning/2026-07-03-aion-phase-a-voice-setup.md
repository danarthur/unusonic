# Aion Phase A — voice setup and first real draft

_Researched: 2026-07-03 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

**The primer is significantly out of date.** Phase A is largely shipped. The codebase shows:

- `public.workspaces.aion_config jsonb NOT NULL DEFAULT '{}'` exists since migration `supabase/migrations/pre-baseline/20260407140000_aion_voice_foundation.sql` (confirmed in the baseline at line 1 of `supabase/migrations/20260101000000_baseline_schema.sql`).

- `/api/aion/chat/route.ts` is a full 200+ line route handler with auth, tier gating, model routing, tool calling, rolling summarization, and session scoping. Not a 16-line stub.

- A 5-state onboarding machine (`no_voice → no_example → no_guardrails → needs_test_draft → configured`) is implemented in `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247`. `getOnboardingState()` derives state from `aion_config`. The chat route reads this and changes its greeting and system prompt accordingly.

- A `save_voice_config` Aion tool lives in `src/app/api/aion/chat/tools/core.ts:118`. When Aion calls it during the voice conversation, it persists `description`, `example_message`, and `guardrails` to `workspaces.aion_config` via `updateAionConfigForWorkspace()`.

- `/api/aion/draft-follow-up/route.ts` is live. It reads `aion_config.voice` and passes it to `generateFollowUpDraft()` in `src/app/api/aion/lib/generate-draft.ts:26`, which injects voice into the system prompt. The Aion chat also has an inline `draft_follow_up` tool in `core.ts`.

- `AionInput.tsx`, `AionVoice.tsx`, and `ChatInterface.tsx` are all implemented and wired. The Aion page at `/aion` renders `ChatInterface` with no paused state.

**The one real gap**: new workspaces hit `applyVoiceDefaultIfEmpty()` (`src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35`) on every `getAionConfig()` read. This synthesizes a generic voice from the workspace name and sets `voice_default_derived: true`. `getOnboardingState()` treats `voice_default_derived: true` as `'configured'`, so new users skip the 4-step conversational setup entirely and land in the generic pull-mode greeting.

The entry point for voice setup ("Tune Aion's voice") is a `SlidersHorizontal` icon in the AionSidebar header that opens a one-item dropdown (`src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:982`). After clicking it, a toast fires: "Voice reset — start a new chat to retune Aion." The user must then manually open a new chat to enter the `no_voice` flow.

## Intended state

Daniel opens `/aion`, describes his communication style in natural prose, and gets a follow-up draft that sounds like him — all in one session. The backend that makes this work (voice persistence, draft generation with voice injection, `save_voice_config` tool) is already there. What's missing is a clear path in, so that a new workspace owner encounters the setup flow rather than a generic "ready to help" greeting.

## The gap

- New workspaces bypass voice onboarding via `voice_default_derived: true` in `aion-config-helpers.ts:35–44`.
- "Tune Aion's voice" is buried in a sidebar icon dropdown, invisible on first visit.
- After reset, the user must manually start a new chat (the toast tells them to; the session doesn't auto-open one).
- No form-based editing path — the only way to write voice paragraphs is through the conversational chat.
- `needs_test_draft` step requires a deal in the follow-up queue; empty workspaces can't complete it.

## Options

### Option A: Form-based voice editor in settings

- **What it is:** Add a `/settings/aion/voice` page (or section in the existing `AionSettingsView`) with three labeled textareas: "Communication style," "Example message," "Rules." A Save button calls `saveAionVoiceConfig()`. A "Preview draft" button at the bottom posts to `/api/aion/draft-follow-up` with the current form values and returns a draft inline.
- **Effort:** Medium — new settings section, one fetch call for preview, Zod validation, RLS already handled.
- **Main risk:** Duplicates the conversational flow surface. Two ways to configure voice can diverge.
- **Unlocks:** Explicit before/after editing, clipboard-paste of a paragraph, visual diff before saving. Works without any deals in the queue.

### Option B: Surface a setup CTA on the Aion landing

- **What it is:** In `ChatInterface.tsx`, when the session greeting response returns and `aion_config.voice_default_derived === true` (pass as a prop from `AionPageClient`), render a dismissible banner or suggestion chip row: "This is your default voice. Tell me how you talk to clients to make it yours." Clicking "Set up my voice" calls `resetAionVoiceConfig()` and dispatches a new-chat message, dropping the user directly into the `no_voice` conversational flow.
- **Effort:** Small — one conditional render in `ChatInterface` or `AionPageClient`, one server action call, one auto-sent chat message.
- **Main risk:** Requires at least one deal to complete the `needs_test_draft` step and show a real draft.
- **Unlocks:** Self-discoverable onboarding path on first visit. No new pages.

### Option C: Remove the `voice_default_derived` bypass

- **What it is:** In `getOnboardingState()` (`aion-chat-types.ts:247`), remove the `if (config.voice_default_derived === true) return 'configured'` early exit. All workspaces — including new ones — enter the `no_voice` flow on first chat. Voice synthesis in `applyVoiceDefaultIfEmpty` can stay as a runtime fallback for draft generation when a human voice isn't yet set.
- **Effort:** Tiny — one condition removed.
- **Main risk:** Forces onboarding on any workspace that hasn't explicitly configured voice. Owners who don't care about voice tuning can't reach the queue without completing 3 conversational steps. Needs a "skip setup" chip in the `no_voice` greeting to avoid frustration.
- **Unlocks:** Every workspace naturally converges on real voice data.

## Recommendation

**Option B.** The stated goal is for Daniel to open Aion, write about his style, and see a draft. All the backend for that works today. The only barrier is the invisible entry point.

Concretely: pass `voiceIsDefault: boolean` from `AionPageClient` into `ChatInterface` (read `aion_config` server-side on the page and pass it as a prop). When true, inject a suggestion chip in the initial greeting: "Personalize my voice." Clicking it resets the config and auto-dispatches a `no_voice` chat, routing through the existing 4-step flow. Cost: under 2 hours.

Option A (the form) is the right follow-up once you have real voice data to iterate on — it's better for incremental editing than re-running the full chat flow every time. But it's not needed to unblock the first draft. Option C is too aggressive without a skip affordance; onboarding-for-everyone is a churn risk on workspaces that already have the implicit default working.

One prerequisite: Daniel needs at least one deal in an active stage for the `needs_test_draft` step to produce a real draft. The `draft_follow_up` Aion tool calls `getDealContextForAion` — no deals means Aion offers the step but can't generate anything useful. If the workspace is empty, the draft step silently fails. Add a fallback message in the `needs_test_draft` greeting for the empty-workspace case.

## Next steps for Daniel

1. In `AionPageClient.tsx`: read `aion_config` server-side (call `getAionConfig()`) and pass `voiceIsDefault={aionConfig.voice_default_derived ?? false}` as a prop to `ChatInterface`.
2. In `ChatInterface.tsx`: add a prop `voiceIsDefault?: boolean`. When the initial greeting arrives and `voiceIsDefault` is true, inject a "Personalize my voice" chip into the chip row. On click: call `resetAionVoiceConfig()`, then call `sendChatMessage({ text: '[voice-setup]', workspaceId })` to open a fresh session in `no_voice` mode.
3. In the chat route, recognize `[voice-setup]` as a synthetic entry that bypasses history and returns the `no_voice` greeting directly (mirrors the `[arg-edit]` / `[open-pin]` short-circuit patterns in `route/synthetic-messages.ts`).
4. In the `needs_test_draft` greeting path (`buildGreeting` in `route/prompts.ts`): add a fallback when `getFollowUpQueue` returns empty — offer a placeholder draft using a hypothetical deal rather than failing silently.
5. (Later) Add `/settings/aion/voice` form for iterative refinement after the first voice is set.

## References

- `supabase/migrations/pre-baseline/20260407140000_aion_voice_foundation.sql` — column creation
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:84` — `getAionConfig()`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35` — `applyVoiceDefaultIfEmpty()`
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — `getOnboardingState()`
- `src/app/api/aion/chat/tools/core.ts:118` — `save_voice_config` tool
- `src/app/api/aion/draft-follow-up/route.ts` — draft generation route
- `src/app/api/aion/lib/generate-draft.ts:26` — voice injected into draft system prompt
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:982` — "Tune Aion's voice" hidden in overflow
- `src/app/api/aion/chat/route/synthetic-messages.ts` — pattern for synthetic message short-circuits
