# Aion voice setup Phase A: minimum path to first real draft

_Researched: 2026-09-02 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

_Note: the premise here is stale. Research found that all three core infrastructure pieces are already shipped. The question reduces to finishing the last mile._

## Current state

**`aion_config` exists and is wired.** The column was added in `supabase/migrations/pre-baseline/20260407140000_aion_voice_foundation.sql` and is present in `public.workspaces` with type `Json`. The TypeScript shape `AionVoiceConfig` is defined at `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:12–16` as three string fields: `description`, `example_message`, `guardrails`.

**The 4-step onboarding conversation is fully built.**
- `getOnboardingState()` at `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` determines state from the stored config: `no_voice → no_example → no_guardrails → needs_test_draft → configured`.
- `buildGreeting()` at `src/app/api/aion/chat/route/prompts.ts:292` returns a first message for each state with answer chips.
- The system prompt injects coaching instructions per state at `prompts.ts:275–283` (e.g. "Ask about communication style. Save via save_voice_config.").
- The `save_voice_config` tool at `src/app/api/aion/chat/tools/core.ts:118` persists each field and marks `onboarding_complete` when the sequence finishes.

**Draft generation reads and applies voice.** `src/app/api/aion/draft-follow-up/route.ts:60–63` loads `aionConfig.voice` and passes it to `generateFollowUpDraft()`, which injects description, example message, and guardrails into the generation prompt at `src/app/api/aion/lib/generate-draft.ts:52`. The Follow-Up Card triggers this via its "Draft message" button at `src/app/(dashboard)/(features)/events/components/follow-up-card.tsx:338–370`.

**The Aion chat UI** (`ChatInterface`) is mounted at `/aion` (`src/app/(dashboard)/aion/AionPageClient.tsx:73`) and also in the lobby. There is no "Brain tab" route anywhere in `src/app/`.

**One synthesis risk.** `applyVoiceDefaultIfEmpty()` at `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35–44` generates a synthetic voice default from the workspace name. When `voice_default_derived === true`, `getOnboardingState()` returns `'configured'` immediately and the onboarding sequence never runs.

## Intended state

Daniel opens the Aion chat, sees a greeting that asks how he communicates with clients, answers three prompts (style description, example message, guardrails), and is then offered a test draft for his top-priority deal — all in a single conversation. The draft respects his stated voice. The whole sequence completes in under five minutes with no form or settings page.

That experience is what the shipped code is designed to produce. The gap is not infrastructure — it is the last-mile discoverability and one potential flow-blocker.

## The gap

- No "Brain tab" exists. There is no nav entry or dedicated route that surfaces voice setup. Daniel must know to navigate to `/aion` to trigger it.
- If `voice_default_derived` is `true` for his workspace (set by any automated path), onboarding never fires — he lands in `configured` state and sees the normal chat greeting instead.
- The `needs_test_draft` state offers a draft from chat tools, but the chat-internal `draft_follow_up` tool needs a deal in scope or in the queue to produce anything concrete. If the queue is empty or the session has no scope, the test draft step may stall.
- No explicit "Retune voice" call-to-action is visible in the chat unless Daniel finds the sidebar overflow menu at `AionSidebar.tsx:998–1044`.

## Options

### Option A: Confirm the flow works as-is, ship a nav entry

- **What it is:** Verify end-to-end that a workspace with no voice config goes through the 4-step greeting sequence. Then add "Set up Aion" (or similar) to the main nav or dashboard home, pointing to `/aion`. No new UI components — just a link.
- **Effort:** Small (1–2 hours: test + one nav change)
- **Main risk:** If `voice_default_derived` is set for Daniel's own workspace, he will never see the onboarding sequence — needs a manual `resetAionVoiceConfig()` call to clear it first.
- **Unlocks:** Daniel can go through the designed flow today. No code changes to the voice system needed.

### Option B: Add a dedicated voice setup entry point in workspace settings

- **What it is:** A short static form at `/settings/aion` with three textarea fields (description, example message, guardrails) that saves directly via `updateAionConfigForWorkspace`. Bypasses the conversation entirely. Add a "Retune voice" link from the Aion chat sidebar.
- **Effort:** Medium (half a day: new page, server action, basic form UI)
- **Main risk:** Duplicates the UX path. The conversation sequence already exists and is higher quality — a bare form next to it creates confusion about which is canonical.
- **Unlocks:** Power-user shortcut; unblocks the journey even if the chat onboarding flow has edge cases.

### Option C: Embed an onboarding nudge in the lobby or deal page

- **What it is:** When `getOnboardingState(config) !== 'configured'`, render a banner or card in the lobby/dashboard directing Daniel to `/aion` with a "Finish voice setup" CTA. Dismissable. Disappears once `onboarding_state === 'complete'`.
- **Effort:** Medium (half a day: state read, banner component, dismiss persistence)
- **Main risk:** Banner fatigue if it re-appears on every session. Needs a per-user dismiss key (localStorage or `aion_config.onboarding_state` is enough).
- **Unlocks:** Zero navigation knowledge required — the prompt meets Daniel where he already is.

## Recommendation

**Option A first, Option C if onboarding completion rates are low.**

The conversation-driven onboarding is the right product surface — it already asks exactly the three questions the queue item describes, with chips and natural language, in the correct order. No new UI is needed for Phase A. The only work is: (1) verify the flow end-to-end in a workspace with a clean `aion_config`, (2) add one nav entry or lobby shortcut to surface `/aion` for onboarding, and (3) check whether Daniel's own workspace has `voice_default_derived: true` — if so, call `resetAionVoiceConfig()` from the sidebar to re-enter the sequence.

Option B is a detour: it adds a form that competes with the already-built conversation and would need its own maintenance path. Option C is a reasonable follow-on once the basic flow is confirmed working, but it adds build time before any real-user validation.

Accept the tradeoff that the flow is chat-only — that is a feature, not a limitation.

## Next steps for Daniel

1. Check your workspace's `aion_config` in Supabase: `SELECT aion_config FROM public.workspaces WHERE id = '<your_workspace_id>'`. If `voice_default_derived` is `true` or all three voice fields are set, the flow will not trigger — proceed to step 2.
2. In the Aion chat sidebar (`/aion`), open the overflow menu (three dots) and click "Tune Aion's voice" to call `resetAionVoiceConfig()` and re-enter onboarding.
3. Reload `/aion` and confirm the greeting matches the `no_voice` branch — it should ask about communication style with three suggestion chips.
4. Complete the 4-step sequence: describe style, paste an example message, state any guardrails, approve a test draft.
5. Open a deal with a pending follow-up, click "Draft message" in the Follow-Up Card, and verify the draft matches your stated voice.
6. If navigation discoverability is an issue after testing, add a "Set up Aion" entry to the main nav pointing to `/aion` — a one-line change in the nav component.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — `AionConfig`, `AionVoiceConfig`, reader/writer functions
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — `getOnboardingState()`
- `src/app/api/aion/chat/route/prompts.ts:275–340` — onboarding coaching injections and `buildGreeting()`
- `src/app/api/aion/chat/tools/core.ts:118` — `save_voice_config` tool
- `src/app/api/aion/draft-follow-up/route.ts` — draft generation endpoint
- `src/app/api/aion/lib/generate-draft.ts:52` — `buildFollowUpPrompt()` with voice injection
- `src/app/(dashboard)/(features)/events/components/follow-up-card.tsx:338–370` — draft trigger in the UI
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35` — `applyVoiceDefaultIfEmpty()` (synthesis risk)
- `src/app/(dashboard)/aion/AionPageClient.tsx` — `/aion` route mount
