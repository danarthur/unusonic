# Aion Phase A: Voice Setup + First Draft — Current State

_Researched: 2026-07-18 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

**The premise of this question is 3+ months stale.** The Brain tab is not paused — Aion is a fully live production chat at `/aion`. All three components cited as "unwired" in the primer are wired and shipping.

What actually exists today:

- `workspaces.aion_config` column exists as `Json` (`src/types/supabase.ts:7782`). Read by `getAionConfig` (`aion-config-actions.ts:84`) and written by `saveAionVoiceConfig` / `updateAionConfigForWorkspace` (`aion-config-actions.ts:178`, `262`).
- `/api/aion/chat/route.ts` is a 450-line production handler with Supabase auth, per-user rate limiting, workspace kill-switch, three model tiers (`fast`/`standard`/`heavy`), and `streamText` streaming (`src/app/api/aion/chat/route.ts:98–303`).
- `AionInput.tsx`, `AionVoice.tsx`, `ChatInterface.tsx` are all mounted at `src/app/(dashboard)/aion/AionPageClient.tsx:76`.
- `getDealContextForAion` fully exists at `src/app/(dashboard)/(features)/events/actions/follow-up-actions.ts:545` and is called from the chat tools layer.
- The voice onboarding state machine is implemented: `no_voice → no_example → no_guardrails → needs_test_draft → configured` (`src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:225–257`).
- `save_voice_config` tool (`src/app/api/aion/chat/tools/core.ts:118`) fires on any user message describing their communication style; it persists `description`, `example_message`, and `guardrails` to `aion_config` in a single call.
- `buildSystemPrompt` injects the stored voice under `=== VOICE CONFIG ===` (`src/app/api/aion/chat/route/prompts.ts:88–99`) so every draft call already uses it.
- `draft_follow_up` constructs a prompt via `buildFollowUpPrompt` which injects `voice.description`, `voice.example_message`, and `voice.guardrails` directly (`src/app/api/aion/lib/generate-draft.ts:62–65`).

The "Tune Aion's voice" reset affordance is in the sidebar overflow at `AionSidebar.tsx:1043`, wired to `resetAionVoiceConfig()`.

However, there is one real blocker to the described experience: **new workspaces auto-derive a synthetic voice** from the workspace name via `applyVoiceDefaultIfEmpty`, which sets `voice_default_derived = true` and puts the workspace into `configured` state, silently skipping the 4-step onboarding (`aion-chat-types.ts:248`). For any workspace that has been open for more than one session, Daniel likely has a synthesized generic voice — not a real one — and there is no in-chat signal telling him this.

## Intended state

Daniel opens Aion, is greeted with a prompt to describe how he talks to clients, provides 3 paragraphs, and immediately gets a draft that sounds like him. This means: the onboarding flow runs naturally for workspaces with synthesized voices, not just for brand-new ones.

## The gap

- `voice_default_derived = true` silently skips onboarding — existing workspaces with a synthesized voice see no prompt to customize it.
- The "Tune Aion's voice" reset is buried in a sidebar overflow menu. Not discoverable on a first impression.
- `CadenceLearningToggle` (`src/app/(dashboard)/(features)/aion/components/CadenceLearningToggle.tsx`) is built and wired to `setLearnOwnerCadence`, but has no parent component — it was built for a settings page that doesn't exist yet.
- Two legacy brand renames still pending: `ION_SYSTEM`/`ION_FULL_SYSTEM` in `src/features/ai/tools/package-generator.ts:22,102`, and `SIGNAL_SPRING_DURATION_MS` in `src/shared/lib/motion-constants.ts:116`.

## Options

### Option A: Accept the current state, update the primer, verify the existing flow

- **What it is:** No code changes. Daniel opens `/aion`, uses sidebar overflow → "Tune Aion's voice", starts a new chat, and goes through the 4-step onboarding that already works.
- **Effort:** Small (manual verification + primer update)
- **Main risk:** The flow is invisible — Daniel has to know to look for the reset option. New team members won't discover it.
- **Unlocks:** Confirms the existing flow works before layering on discoverability improvements.

### Option B: Add a "Customize your voice" chip to the default greeting

- **What it is:** Modify `buildGreeting` in `src/app/api/aion/chat/route/prompts.ts` (~line 310) to add a "Customize your voice" suggestion chip when `onboardingState === 'configured'` and `config.voice_default_derived === true`. The chip value triggers the Aion chat to enter the `no_voice` onboarding path in-message. One file, no new API or schema.
- **Effort:** Small
- **Main risk:** Aion responding to a chip press by entering onboarding requires the system prompt `=== ONBOARDING ===` block to activate, which currently only fires based on config state — not on a mid-session message. A small prompt instruction needs to be added alongside the chip.
- **Unlocks:** Onboarding is discoverable from day one without a settings page. `CadenceLearningToggle` can ship separately.

### Option C: Add a `/settings/aion` (or sidebar settings panel) with explicit form fields

- **What it is:** New settings surface with three text inputs (description, example, guardrails) saving via `saveAionVoiceConfig`, plus `CadenceLearningToggle` embedded.
- **Effort:** Medium (new page/panel, form, save action — though the server action already exists)
- **Main risk:** Adds a parallel configuration path alongside the in-chat onboarding. Users can now configure voice outside chat, which is fine, but creates two sources of truth for the same config.
- **Unlocks:** `CadenceLearningToggle` finally has a home. More power-user control.

## Recommendation

**Option B.** The entire backend is already correct. The only thing standing between Daniel and the experience described in the question is that `voice_default_derived` marks the workspace as configured before he's written anything. A "Customize your voice" chip in the opening greeting costs one file edit and makes the 4-step flow discoverable without requiring a new settings page. Option C is worth doing eventually (particularly for `CadenceLearningToggle`), but it's a separate project from the Phase A goal.

The `voice_default_derived` flag was a reasonable workaround to avoid forcing new workspaces through onboarding before they know what Aion is. What's missing is the path back to explicit setup once a user is ready. A chip in the greeting is that path.

## Next steps for Daniel

1. Open `/aion` in your own workspace and note the opening greeting — verify whether you see `voice_default_derived = true` behavior (a warm generic greeting rather than the onboarding ask).
2. Click the sidebar settings overflow → "Tune Aion's voice" → then start a new chat to run the existing 4-step flow. Verify the resulting draft sounds right. This confirms the backend is correct before touching code.
3. In `src/app/api/aion/chat/route/prompts.ts`, find `buildGreeting` (~line 292). In the `configured` case, check if `config.voice_default_derived === true` and, if so, add a `{ label: 'Customize your voice', value: 'I want to customize how Aion sounds when writing for me.' }` chip alongside the existing workspace-state chips.
4. Add a one-line instruction to the `configured + voice_default_derived` system prompt block: "If the user asks to customize their voice, treat it as if onboarding_state were no_voice and proceed through the full voice setup flow." This ensures `save_voice_config` fires correctly mid-session.
5. After Option B is verified, create a settings panel for `CadenceLearningToggle` — it's a drop-in and its server action (`setLearnOwnerCadence`) already exists.
6. Rename `ION_SYSTEM`/`ION_FULL_SYSTEM` in `src/features/ai/tools/package-generator.ts` and mark `SIGNAL_SPRING_DURATION_MS` for deletion in `src/shared/lib/motion-constants.ts` (check for remaining callers first).

## References

- `src/app/(dashboard)/aion/AionPageClient.tsx` — live Aion page mount
- `src/app/api/aion/chat/route.ts` — production chat handler
- `src/app/api/aion/chat/tools/core.ts:118` — `save_voice_config` tool
- `src/app/api/aion/chat/route/prompts.ts` — `buildSystemPrompt`, `buildGreeting`
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — `getOnboardingState`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — `AionConfig` type, `saveAionVoiceConfig`, `resetAionVoiceConfig`
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:1043` — "Tune Aion's voice" overflow item
- `src/app/(dashboard)/(features)/aion/components/CadenceLearningToggle.tsx` — unplaced cadence opt-in toggle
- `src/app/api/aion/lib/generate-draft.ts:62` — voice injection into draft prompt
- `src/types/supabase.ts:7782` — `aion_config` column definition
