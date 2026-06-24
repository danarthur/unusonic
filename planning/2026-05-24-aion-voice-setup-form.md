# Aion Phase A: Voice setup form + first real draft

_Researched: 2026-05-24 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

**The premises are outdated.** As of 2026-05-24, the codebase has shipped far beyond the 2026-04-10 primer snapshot.

- `public.workspaces.aion_config` exists — `jsonb` column with a default of `{}`. Typed as `Json` in `src/types/supabase.ts:7689`. The app type is `AionConfig` at `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:50`, which includes `voice: AionVoiceConfig` (three fields: `description`, `example_message`, `guardrails`).

- The Brain tab (`/aion`) is NOT paused. `src/app/(dashboard)/aion/AionPageClient.tsx:66` renders `<ChatInterface viewState="chat" workspaceId={workspaceId} />` directly. No paused state in this file.

- `/api/aion/draft-follow-up/route.ts` is fully implemented: auth guard, tier gate, kill-switch check, `generateFollowUpDraft({ context, voice: aionConfig.voice })` call, usage recording. `src/app/api/aion/draft-follow-up/route.ts:1`.

- `getDealContextForAion` is implemented at `src/app/(dashboard)/(features)/events/actions/follow-up-actions.ts:545`. Assembles deal + client + proposal + follow-up history into `AionDealContext`.

- `saveAionVoiceConfig` is a server action at `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:178`. Already handles the merge/write to `public.workspaces`.

- Voice onboarding runs **via chat**: `getOnboardingState()` at `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` maps config state to `no_voice | no_example | no_guardrails | needs_test_draft | configured`. The chat route inserts onboarding instructions into the system prompt at `src/app/api/aion/chat/route/prompts.ts:275` and greetings at `src/app/api/aion/chat/route/prompts.ts:300`.

- **Wk 11 §3.8 bypass**: `synthesizeDefaultVoice()` at `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:20` generates a generic voice from workspace name. Any workspace with no stored voice gets `voice_default_derived: true`, which `getOnboardingState()` maps directly to `configured`, skipping all four onboarding steps. New workspaces never see the voice setup flow.

- The only way to reach explicit voice setup today: click "Tune Aion's voice" in the Aion sidebar overflow (at `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:973`), which calls `resetAionVoiceConfig()` to clear the stored voice, then tells the user to start a new chat. That re-enters the conversational 4-step flow.

- `/settings/aion` page exists (`src/app/(dashboard)/settings/aion/AionSettingsView.tsx:90`) but covers only card-beta consent, cadence toggle, and memory backfill. No voice form.

## Intended state

Daniel wants to write 3 paragraphs about his communication style and immediately see a real draft that reflects them. The intent is a **direct form interaction**, not a multi-turn conversation.

The spec's goal was: voice config captured → draft generated → Daniel trusts it enough to let Aion draft future follow-ups without reviewing every word. The conversational path can achieve this but takes 4+ back-and-forth turns and produces no visible draft until the test step. The Wk 11 bypass means most workspaces skip it entirely and get a generic synthesized voice they never see.

## The gap

- No standalone form where Daniel can write his voice in prose and immediately preview a draft.
- The sidebar "Tune Aion's voice" button does a destructive reset and routes back to conversational onboarding — no form, no instant draft.
- `/settings/aion` has the right structural slot but no voice form in it.
- The Wk 11 bypass means workspaces with a synthesized default voice have no prompted reason to tune it.

## Options

### Option A: Voice form in `/settings/aion`

- **What it is:** Add a `VoiceSetupForm` component to `AionSettingsView`. Three textareas (communication style, example message, guardrails). Save button calls `saveAionVoiceConfig`. "Generate test draft" button calls `/api/aion/draft-follow-up` with the first pending item from `ops.follow_up_queue` as context (or a lightweight synthetic context if the queue is empty). Change the sidebar "Tune Aion's voice" button from calling `resetAionVoiceConfig` to navigating to `/settings/aion#voice`.
- **Effort:** Small. All server-side plumbing exists. New code is one `VoiceSetupForm` component (~150 lines), a minor settings page addition, and a one-line sidebar nav change.
- **Main risk:** The test draft needs a deal context. Fetching from `follow_up_queue` adds a server action call. If queue is empty the draft is generic — acceptable but underwhelming.
- **Unlocks:** Daniel can read and edit his voice config as plain text, generate a test draft on demand, and re-tune without burning chat turns.

### Option B: Voice wizard panel from the sidebar button

- **What it is:** Replace the "Tune Aion's voice" sidebar overflow button with a slide-in panel (portal to `document.body`) containing the same three fields + inline draft preview. No page navigation required — stays in `/aion`.
- **Effort:** Medium. Needs a new portaled panel component, animation, and wiring through SessionContext or a Zustand slice.
- **Main risk:** The sidebar is already structurally complex (`src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx` is 1000+ lines). Adding a panel risks stacking context / z-index issues (portal pattern is established in the codebase but adds surface area here).
- **Unlocks:** One-shot tuning without leaving the chat page. More seamless but harder to iterate on.

### Option C: Detect free-form voice paste in chat

- **What it is:** When the user's first chat message is long (>200 words) and contains no question, the chat route interprets it as a voice description and calls `save_voice_config` then immediately generates a test draft in the same response, skipping the 4-step forcing block.
- **Effort:** Medium. Needs a heuristic parser in the chat route, a new onboarding shortcut path, and test coverage.
- **Main risk:** Brittle — a long rambling question would trigger it incorrectly. The heuristic needs to be conservative enough not to misfire, which makes it harder to discover.
- **Unlocks:** Zero-UI path for power users, but with real discoverability problem.

## Recommendation

**Go with Option A.** The settings page already has the structural slot, all server actions exist, and the draft route is ready. The total new surface is one form component and a nav change. Option B is more spatially pleasing but introduces panel complexity into an already-large sidebar; Option C is clever but not discoverable without a prompt.

The one non-trivial decision in Option A is the test draft context. The right call: server action fetches the top pending item from `ops.follow_up_queue` for the current workspace. If the queue is empty, use a minimal synthetic context (company name "a corporate client", no event date, reason "stall"). Flag the synthetic context in the UI so Daniel knows it is a demo draft rather than real data.

One tradeoff to accept: voice tuning is in Settings, not in the Brain tab itself. If that friction proves real, a follow-up PR can add the sidebar panel (Option B) — but don't couple them now.

## Next steps for Daniel

1. Create `src/app/(dashboard)/settings/aion/VoiceSetupForm.tsx` — three `<textarea>` fields pre-populated from `getAionConfig()`, save button calls `saveAionVoiceConfig`, "Generate test draft" calls a new thin server action that fetches the top queue item and hits `/api/aion/draft-follow-up`.
2. Add `VoiceSetupForm` to `AionSettingsView.tsx` below the cadence toggle section, inside a new `<StagePanel>` titled "Aion's voice".
3. Create the server action `getTestDraftForVoice(voice: AionVoiceConfig)` — fetches first pending `ops.follow_up_queue` row, calls `getDealContextForAion`, then calls `generateFollowUpDraft`. Returns `{ draft, channel, usedSynthetic: boolean }`. Lives in `src/app/(dashboard)/settings/aion/voice-setup-actions.ts`.
4. Update `AionSidebar.tsx:1043` — change the "Tune Aion's voice" button to `router.push('/settings/aion#voice')` instead of calling `resetAionVoiceConfig`. Keep the reset as a secondary "Start over" button inside the form itself.
5. Smoke-test: open `/settings/aion`, fill all three fields, save, generate draft, confirm the draft body references the voice description.
6. Separately: delete `ArthurInput.tsx` (empty file, delete candidate per primer) and rename `ION_SYSTEM` / `ION_FULL_SYSTEM` in `src/features/ai/tools/package-generator.ts` to `AION_SYSTEM` / `AION_FULL_SYSTEM` (legacy names flagged in primer — flag before touching, not silently).

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — `AionConfig`, `AionVoiceConfig`, `saveAionVoiceConfig`, `getAionConfigForWorkspace`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — `synthesizeDefaultVoice`, `applyVoiceDefaultIfEmpty`
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts` — `getOnboardingState`, `OnboardingState`
- `src/app/api/aion/draft-follow-up/route.ts` — draft generation endpoint
- `src/app/api/aion/lib/generate-draft.ts` — `generateFollowUpDraft`, `buildFollowUpPrompt`
- `src/app/(dashboard)/(features)/events/actions/follow-up-actions.ts` — `getDealContextForAion`, `AionDealContext`
- `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` — existing settings page (no voice form yet)
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:973` — "Tune Aion's voice" button
- `src/app/(dashboard)/aion/AionPageClient.tsx` — Brain tab (not paused)
- `src/types/supabase.ts:7689` — `aion_config` column type
