# Aion Phase A — Voice Setup + First Real Draft

_Researched: 2026-04-21 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

**The premise is outdated.** Both stated blockers were resolved in the April 7 sprint.

`public.workspaces.aion_config jsonb` was added via migration `20260407140000_aion_voice_foundation.sql:7`. The column exists in prod and is fully typed in `src/types/supabase.ts:6302`. Read/write server actions live at `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — `getAionConfig():71`, `saveAionVoiceConfig():161`, `updateAionConfigForWorkspace():192`.

The Brain tab at `/aion` is a full production chat interface. `src/app/(dashboard)/aion/AionPageClient.tsx:39` renders `ChatInterface`, which hits `/api/aion/chat`. That route (`src/app/api/aion/chat/route.ts`) is not a stub — it has auth guard, per-user rate limiting, tier gate, intent classification, model routing, session summarization, and 40+ tools across 6 modules.

A complete 5-state onboarding machine exists. `getOnboardingState()` in `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:237` returns `no_voice → no_example → no_guardrails → needs_test_draft → configured` based on which voice fields are populated in `aion_config.voice`. Each state drives a custom greeting via `buildGreeting()` in `route.ts:764` and a matching instruction block appended to the system prompt via `buildSystemPrompt()` at `route.ts:747-755`.

The `save_voice_config` tool (`src/app/api/aion/chat/tools/core.ts:115`) accepts all three fields in one call and uses `updateAionConfigForWorkspace` (system client, correct write path) to persist them. Voice is injected into every draft prompt via `buildDraftPrompt()` at `core.ts:33` and `src/app/api/aion/lib/generate-draft.ts:52`.

`/api/aion/draft-follow-up/route.ts` is fully implemented — auth, tier gate, kill switch, `getDealContextForAion`, `generateFollowUpDraft`, usage logging. The `DraftPreviewCard` renders in the chat interface when Aion calls `draft_follow_up` (`AionMessageRenderer.tsx:51`).

The only part of the stated goal that is not yet true: **"immediately sees a draft."**

## Intended state

After Daniel finishes voice setup in the conversational flow, a follow-up draft for his top-priority deal should appear automatically — no second prompt, no "Want me to try one?" The `needs_test_draft` greeting at `route.ts:796-805` currently returns a confirmation question and two chips. It should instead call `getDealContextForAion` inline, generate a draft, and surface it as a `draft_preview` block in the same greeting response.

## The gap

- `needs_test_draft` greeting offers to draft rather than drafting immediately (`route.ts:796`).
- `/settings/aion` has no form UI for editing voice config outside of the chat flow. Daniel cannot paste three pre-written paragraphs in one shot without the conversational back-and-forth.
- `saveAionVoiceConfig` at `aion-config-actions.ts:161` uses the anon Supabase client. The comment at line 139 notes workspaces has no UPDATE policy for authenticated callers. This is a latent bug if a form ever calls that action — the chat tool's path via `updateAionConfigForWorkspace` (system client) is correct.

## Options

### Option A: Ship as-is — tell Daniel the flow already works

- **What it is:** No code changes. Daniel goes to `/aion`, answers 3 conversational questions, clicks "Yes, try one", sees a draft with his voice applied. The end-to-end path exists today.
- **Effort:** Zero.
- **Main risk:** The "Yes, try one" click feels like a gate. If Daniel doesn't have any queue items, the draft button does nothing useful.
- **Unlocks:** Nothing new — the feature is already usable.

### Option B: Auto-draft in the `needs_test_draft` greeting

- **What it is:** Change `buildGreeting` in `route.ts:796` so that when `state === 'needs_test_draft'`, it calls `getFollowUpQueue()`, grabs the top item, calls `getDealContextForAion` and `generateFollowUpDraft` inline, and returns the draft as a `draft_preview` block. Falls back to the current offer-text if the queue is empty.
- **Effort:** Small (~30 lines in `buildGreeting`). No schema changes. No new files.
- **Main risk:** `buildGreeting` is async today; adding two more awaits is safe but increases first-load latency when the queue is large. If `getDealContextForAion` fails, the greeting should fall back gracefully rather than 500ing.
- **Unlocks:** Satisfies the "immediately sees a draft" goal. The full flow becomes: 3 chat turns (style → example → rules) → greeting auto-populates a real draft with voice applied.

### Option C: Add a voice setup form at `/settings/aion/voice`

- **What it is:** A dedicated page with three textareas (description, example, guardrails) wired to a fixed `saveAionVoiceConfig` server action (fix it to use system client). Separate from the chat flow. Daniel can paste all three paragraphs at once.
- **Effort:** Medium — new route, new UI page in the settings shell, fix the latent RLS bug, add nav link.
- **Main risk:** Creates two paths (form vs. chat) that can diverge. The form doesn't trigger a live draft, so it doesn't satisfy "immediately sees a draft" without additional wiring.
- **Unlocks:** Lets Daniel do voice setup without entering a conversation. Useful for admins configuring Aion on behalf of the workspace.

## Recommendation

**Option B.** It is the minimum change that completes the stated goal. The infrastructure is already there — `getFollowUpQueue`, `getDealContextForAion`, and `generateFollowUpDraft` are all importable in `route.ts`. The change is isolated to one function, no schema work, no new files.

The remaining latency concern is real but minor: the `needs_test_draft` greeting only fires once (after all three onboarding turns complete), so the user is already in an async conversation; a 1-2s wait for a real draft is acceptable and better than an empty "Want me to try?" prompt.

Don't ship Option C as a parallel path. If Daniel wants to re-edit his voice later, the chat is the right surface: "Update my voice config — here's my new example message." The `save_voice_config` tool handles that.

## Next steps for Daniel

1. Open `src/app/api/aion/chat/route.ts:764`. Find `buildGreeting`.
2. In the `needs_test_draft` case (`route.ts:796`): add a try/catch block that calls `getFollowUpQueue()`, takes `queue[0]`, calls `getDealContextForAion(queue[0].deal_id, queue[0])` (imported from `follow-up-actions.ts:535`), then `generateFollowUpDraft({ context, voice: null })` (imported from `lib/generate-draft.ts:25`).
3. Return `{ messages: [{ type: 'text', text: 'Your voice is set up. Here's a draft for your top deal.' }, { type: 'draft_preview', draft, dealId, dealTitle, channel }] }`.
4. Add a fallback: if queue is empty or any call fails, return the existing offer-text at `route.ts:799`.
5. Fix `saveAionVoiceConfig` at `aion-config-actions.ts:161` to use `getSystemClient()` (match the pattern at line 141 in `setLearnOwnerCadence`). No functional change to the chat flow — this just closes the latent bug before a form path ever calls it.
6. Smoke-test: open `/aion` with a fresh workspace (empty `aion_config`), answer 3 style questions, confirm a draft card renders without an extra confirmation step.

## References

- `src/app/api/aion/chat/route.ts:764` — `buildGreeting`
- `src/app/api/aion/chat/route.ts:747` — system prompt onboarding injection
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:237` — `getOnboardingState`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:161` — `saveAionVoiceConfig` (latent RLS bug)
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:192` — `updateAionConfigForWorkspace` (correct system-client path)
- `src/app/api/aion/lib/generate-draft.ts:25` — `generateFollowUpDraft`
- `src/app/(dashboard)/(features)/crm/actions/follow-up-actions.ts:535` — `getDealContextForAion`
- `src/app/api/aion/chat/tools/core.ts:115` — `save_voice_config` tool
- `supabase/migrations/20260407140000_aion_voice_foundation.sql:7` — `aion_config` column
