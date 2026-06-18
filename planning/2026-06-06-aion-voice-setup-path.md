# Aion Phase A: minimum path to voice setup and first real draft

_Researched: 2026-06-06 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

The premise of the question is outdated — the codebase has moved significantly since the primer was written (2026-04-10).

**Brain tab is live.** `src/app/(dashboard)/aion/AionPageClient.tsx` renders `<ChatInterface viewState="chat" workspaceId={...} />` with no "paused" banner anywhere. The chat interface has sessions, streaming, model mode picker (Auto / Fast / Thinking), a full sidebar, and tool-calling.

**`aion_config` exists.** Migration `supabase/migrations/pre-baseline/20260407140000_aion_voice_foundation.sql` added `aion_config jsonb NOT NULL DEFAULT '{}'` to `public.workspaces`. It is read and written in production code. Full CRUD lives at `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts`:
- `getAionConfig()` (line 84) — reads and synthesizes default if empty
- `saveAionVoiceConfig(voice)` (line 178) — explicit user write, clears `voice_default_derived`
- `resetAionVoiceConfig()` (line 214) — should clear voice + flag to re-enter the setup flow

**The 4-step voice onboarding machine is built.** `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:225` defines five states: `no_voice → no_example → no_guardrails → needs_test_draft → configured`. `buildGreeting()` in `src/app/api/aion/chat/route/prompts.ts:292` has tailored greetings for each, including the "how would you describe your style?" prompt for `no_voice` (line 303).

**Voice-to-draft loop is wired.** `save_voice_config` tool at `src/app/api/aion/chat/tools/core.ts:118` writes description/example/guardrails to `aion_config.voice`. `draft_follow_up` tool at line 318 pulls the top-priority deal and calls `generateFollowUpDraft()`, which injects the stored voice into the system prompt (`src/app/api/aion/lib/generate-draft.ts:62`). The standalone `/api/aion/draft-follow-up` route does the same.

## Intended state

Daniel opens the Aion tab, is immediately prompted to describe how he communicates with clients. He types three paragraphs. Aion saves the voice and offers a draft from a real deal. The draft sounds like Daniel.

## The gap

The infrastructure is complete. The problem is a bypass that makes the voice-setup greeting unreachable:

- `applyVoiceDefaultIfEmpty()` (`aion-config-helpers.ts:35`) synthesizes a generic workspace-name-derived voice on every config read when no voice is stored, and marks `voice_default_derived: true` in the returned object.
- `getOnboardingState()` (`aion-chat-types.ts:248`) short-circuits to `'configured'` when `voice_default_derived === true`.
- New workspaces with no explicitly set voice therefore always show the normal "configured" chat greeting, never the voice-setup flow.
- "Tune Aion's voice" in the sidebar (`AionSidebar.tsx:1002`) calls `resetAionVoiceConfig()`, which clears the DB. But on the next config read, `applyVoiceDefaultIfEmpty` re-synthesizes the default and sets `voice_default_derived: true` again in memory. `getOnboardingState` still returns `'configured'`. The sidebar button does not actually re-enter the 4-step flow — its own comment is wrong.

In short: the 4-step voice flow is fully built but currently unreachable via normal usage.

## Options

### Option A: Fix the `voice_setup_pending` flag (makes "Tune Aion's voice" actually work)

- **What it is:** Add `voice_setup_pending?: boolean` to `AionConfig`. Update `resetAionVoiceConfig()` to write that flag to the DB alongside clearing the voice. Update `getOnboardingState()` to check `voice_setup_pending === true` before the `voice_default_derived` short-circuit, returning `'no_voice'` instead. Clear the flag in `updateAionConfigForWorkspace` when voice fields are saved.
- **Effort:** Small — 3 files, ~30 lines.
- **Main risk:** No migration needed (JSONB column). Existing `resetAionVoiceConfig` callers get the corrected behavior automatically.
- **Unlocks:** The existing sidebar button works. Daniel can click it and the next new chat opens with the voice-setup greeting. The full voice → draft loop runs in one conversation.

### Option B: Remove the `voice_default_derived` short-circuit entirely

- **What it is:** Delete the `if (config.voice_default_derived === true) return 'configured'` line from `getOnboardingState`. New and reset workspaces start in `no_voice` state by default; the 4-step flow fires on first chat open.
- **Effort:** Small — 1 line deleted, but requires auditing all call sites.
- **Main risk:** Any workspace that never explicitly set a voice — including long-running workspaces where the owner has been using the synthesized default — would see the voice-setup greeting on their next chat. Disruptive for existing customers.
- **Unlocks:** Cleanest long-term state — the 4-step flow fires naturally for any workspace without an explicit voice. No flags needed.

### Option C: Add a voice setup card to the chat landing state

- **What it is:** When `aion_config.voice_default_derived === true` and the user is an owner/admin, show a dismissible card in `ChatInterface`'s empty-state pane with a "Set up your voice" CTA. Clicking it calls `resetAionVoiceConfig()` (fixed by Option A) and starts a new chat, which then greets with the `no_voice` prompt.
- **Effort:** Medium — requires threading `voice_default_derived` from the server into the client component; adds a new UI card.
- **Main risk:** Increases complexity of the landing state. Can't stand alone without Option A fixing the underlying bug.
- **Unlocks:** Discovery for new owners who don't know about the sidebar overflow menu.

## Recommendation

Ship Option A first. It's a 3-file server-side change that fixes a real bug (the sidebar button that doesn't work) and makes the voice → draft loop reachable today without any new UI.

The `voice_default_derived` bypass was a deliberate Wk 11 decision to avoid blocking new users with a setup form. That concern is valid for B2B onboarding, but the result is that the voice feature is unreachable unless you know to click a buried sidebar control that silently fails. Fixing the flag logic so `resetAionVoiceConfig` actually re-enters the flow costs nothing and unlocks the full experience Daniel described.

Option B is the right end-state but risks disrupting existing users. Do it after Option A is live and you have confidence in the flow.

Option C (landing card) is worth adding after A, as discoverability is real — but it's a UI change that depends on A being correct first. Do it in a second pass.

For Daniel's immediate use case: after Option A ships, open the sidebar settings icon in `/aion`, click "Tune Aion's voice", start a new chat. The `no_voice` greeting fires. Type your communication style in plain language. Aion saves it via `save_voice_config`, asks for an example, asks for guardrails, then offers a test draft from your top deal.

## Next steps for Daniel

1. Add `voice_setup_pending?: boolean` to the `AionConfig` type in `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:50`.
2. In `resetAionVoiceConfig()` (same file, line 237), save `{ ...rest, voice_setup_pending: true }` instead of just `rest`.
3. In `getOnboardingState()` (`src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247`), add `if (config.voice_setup_pending === true) return 'no_voice';` as the first check, before the `voice_default_derived` guard.
4. In `updateAionConfigForWorkspace()` (`aion-config-actions.ts:262`), clear `voice_setup_pending` from the merged config when any voice field is saved.
5. Run `npm run test` — the `aion-config-actions.test.ts` suite will catch any regressions.
6. Test: click "Tune Aion's voice" in the sidebar → start a new chat → verify the greeting is "Let's start with how you talk to clients."

## References

- `src/app/(dashboard)/aion/AionPageClient.tsx` — Brain tab entry point
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — voice CRUD
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — `applyVoiceDefaultIfEmpty`, `synthesizeDefaultVoice`
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:225` — `OnboardingState` type and `getOnboardingState()`
- `src/app/api/aion/chat/route/prompts.ts:292` — `buildGreeting()` per state
- `src/app/api/aion/chat/tools/core.ts:118,318` — `save_voice_config`, `draft_follow_up` tools
- `src/app/api/aion/lib/generate-draft.ts:52` — voice injection into draft prompt
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:982` — "Tune Aion's voice" button (currently broken)
