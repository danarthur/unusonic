# Aion Phase A: Voice Setup to First Real Draft

_Researched: 2026-04-16 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

**Premise correction.** The queue entry's premises are outdated. Significant work shipped between the primer date (2026-04-10) and today:

**`workspaces.aion_config` exists.** Migration `20260407140000_aion_voice_foundation.sql:7` adds `aion_config jsonb NOT NULL DEFAULT '{}'` to `workspaces`. It is typed in `src/types/supabase.ts:4335`. The full schema includes `voice` (description, example_message, guardrails), `learned` (vocabulary, patterns), `follow_up_playbook`, `onboarding_state`, and `kill_switch`.

**Components are fully wired.** `AionInput.tsx` (`src/app/(dashboard)/(features)/brain/components/AionInput.tsx`), `AionVoice.tsx` (lines 21–49: full MediaRecorder flow), and `ChatInterface.tsx` (572 lines) are all functional. The Brain tab route redirects to `/aion` (`src/app/(dashboard)/aion/page.tsx`), which renders `ChatInterface`.

**`/api/aion/chat/route.ts` is not a stub.** It is a 250+ line authenticated route with a tier gate (`canExecuteAionAction` at line 19), kill switch check (line 174), intent-based tool filtering across 6 intent buckets, and streaming via `streamText`.

**Draft pipeline is live.** `/api/aion/draft-follow-up/route.ts:54–105` reads `aion_config.voice`, builds a system prompt from description + example_message + guardrails, then calls `getModel('fast')` to generate a draft.

**Voice save tool is wired.** `src/app/api/aion/chat/tools/core.ts:115–141` defines `save_voice_config` — Aion can save voice description, example_message, guardrails, and mark `onboarding_complete: true` inside a chat turn.

**Learn-from-edit pipeline exists.** `/api/aion/learn-from-edit/route.ts` extracts vocabulary swaps from human edits and saves them to `aion_config.learned` and `cortex.aion_memory`.

**What is still unverified:**
- Whether `canExecuteAionAction` passes for a workspace without a paid tier configured.
- Whether the greeting init (`ChatInterface.tsx:174–191`) actively prompts for voice setup when `aion_config.onboarding_state` is unset, or skips straight to chat.
- Whether a saved voice config is picked up in the next draft call without a page reload.

## Intended state

Daniel opens `/aion`, is prompted (via greeting or setup form) to describe how he communicates with clients — tone, vocabulary, relationship style — and Aion saves that as `aion_config.voice.description`. He then triggers a follow-up draft via the "Draft a follow-up" suggestion chip, and sees a draft that reflects his voice. The loop completes under 5 minutes without leaving the Brain tab.

## The gap

- Unknown: does `canExecuteAionAction` pass for a dev/ungated workspace? If not, every chat request is blocked before Aion speaks.
- Unknown: does the greeting init prompt for voice setup when `onboarding_state` is unset, or skip it?
- Unverified: `save_voice_config` fires correctly and subsequent draft calls pick up the newly saved config without reload.
- Legacy refs still live: `ION_SYSTEM` / `ION_FULL_SYSTEM` in `src/features/ai/tools/package-generator.ts:22,102`; `SIGNAL_SPRING_DURATION_MS` in `src/shared/lib/motion-constants.ts:116`.

## Options

### Option A: Smoke test first
- **What it is:** Open `/aion` in a browser, walk the greeting, save a voice description via chat, trigger a draft. Determine whether the full loop already works or surfaces a single specific blocker.
- **Effort:** Small (30–60 minutes, plus targeted fixes for anything found)
- **Main risk:** Tier gate blocks everything and requires a DB-level bypass for the dev workspace.
- **Unlocks:** Either confirms Phase A is already done, or pinpoints the exact one-line blocker.

### Option B: Instrument the greeting for voice onboarding
- **What it is:** Modify the system prompt in `/api/aion/chat/route.ts` to inject an onboarding instruction when `aion_config.voice` is empty — Aion's first message asks the user to describe their communication style. The `save_voice_config` tool already handles persistence. No new UI needed.
- **Effort:** Small (30–60 minutes — system prompt edit + manual test)
- **Main risk:** User can skip the voice question and jump straight to drafting; first draft will be generic until they circle back.
- **Unlocks:** Conversational onboarding without a separate UI surface. Fits Stage Engineering voice.

### Option C: Build a dedicated VoiceSetupForm
- **What it is:** Build `VoiceSetupForm.tsx` — a structured 3-field form (tone description, example message, guardrails). Show it when `onboarding_state !== 'complete'` before rendering `ChatInterface`. Submit via `saveAionVoiceConfig()` in `brain/actions/aion-config-actions.ts:99`, which is already implemented.
- **Effort:** Medium (2–3 hours — new component, conditional render in the Aion page, wiring)
- **Main risk:** Adds a hard onboarding gate that feels more like a wizard than a precision instrument.
- **Unlocks:** Guarantees voice is always set before a user reaches the chat, so every first draft is voice-aware.

## Recommendation

**Option A first, then Option B if the greeting is missing the prompt.**

The codebase is substantially more complete than the queue entry assumed. Before building anything new, spend 30 minutes smoke-testing the actual flow. The tier gate (`canExecuteAionAction` at `src/app/api/aion/chat/route.ts:19`) is the most likely single blocker — if the dev workspace is not marked active, every chat request fails silently before Aion speaks.

If the smoke test passes and the greeting already prompts for voice setup, Phase A is done. If the greeting skips voice setup, apply Option B: a one-line instruction added to the system prompt context when `aion_config.voice` is empty. This keeps onboarding conversational rather than form-based, which is consistent with the precision-instrument design posture.

Only build the VoiceSetupForm (Option C) if you decide you want a hard gate — that is a product call, not a technical one.

## Next steps for Daniel

1. Open `/aion` in a browser and check the Network tab for the greeting POST to `/api/aion/chat`. If it returns a 403 or tier error, locate `canExecuteAionAction` and check what tier it requires — then set your workspace to active or add a dev bypass.
2. Walk the greeting flow. Does Aion ask about communication style, or jump to generic chat? Read `ChatInterface.tsx:174–191` to see the exact greeting payload.
3. If no voice prompt: add an instruction to the system prompt in `src/app/api/aion/chat/route.ts` — when `aion_config.voice` is empty, include "Begin by asking the user to describe their communication style with clients."
4. Describe your voice in 3 paragraphs, let Aion invoke `save_voice_config`, then trigger "Draft a follow-up" from the suggestion chip.
5. Verify the draft reflects your described voice — check the draft-follow-up route logs to confirm `buildSystemPrompt` injected the voice description.
6. After the loop is confirmed working, rename `ION_SYSTEM` → `AION_SYSTEM` in `src/features/ai/tools/package-generator.ts:22,102` and `SIGNAL_SPRING_DURATION_MS` → `UNUSONIC_SPRING_DURATION_MS` in `src/shared/lib/motion-constants.ts:116`.

## References

- `src/app/(dashboard)/aion/page.tsx` — Brain tab entry point
- `src/app/(dashboard)/(features)/brain/components/ChatInterface.tsx:174–191` — greeting init
- `src/app/api/aion/chat/route.ts:19,174` — tier gate, kill switch
- `src/app/api/aion/draft-follow-up/route.ts:54–105` — voice-aware draft generation
- `src/app/api/aion/chat/tools/core.ts:115–141` — `save_voice_config` tool
- `src/app/(dashboard)/(features)/brain/actions/aion-config-actions.ts:99` — `saveAionVoiceConfig()`
- `supabase/migrations/20260407140000_aion_voice_foundation.sql:7` — `aion_config` column
- `src/types/supabase.ts:4335` — typed `aion_config`
- `src/app/(dashboard)/(features)/crm/actions/follow-up-actions.ts:467` — `getDealContextForAion()`
- `src/features/ai/tools/package-generator.ts:22,102` — legacy `ION_SYSTEM` refs to clean up
