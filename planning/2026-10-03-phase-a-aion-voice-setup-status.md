# Phase A of Aion voice setup: status and remaining gap

_Researched: 2026-10-03 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

_Note: this is the queue's seed question, authored when the primer was current (2026-04-10). The premise is now stale — Phase A has shipped. This doc records what was built and identifies the one remaining gap._

## Current state

**aion_config is live.** The column exists on `public.workspaces` and is read/written by `getAionConfig()` at `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:84`. It holds a `voice` JSONB object with `description`, `example_message`, and `guardrails` fields, plus `learned`, `follow_up_playbook`, and `onboarding_state`.

**The 4-step voice onboarding is built and wired.** `getOnboardingState()` at `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` drives a 5-state machine: `no_voice → no_example → no_guardrails → needs_test_draft → configured`. `buildGreeting()` at `src/app/api/aion/chat/route/prompts.ts:300` returns a tailored opening message for each state. The system prompt at `prompts.ts:56` injects the voice config into every turn.

**save_voice_config and draft_follow_up are live tools.** `save_voice_config` at `src/app/api/aion/chat/tools/core.ts:118` persists voice fields to `aion_config` mid-conversation. `draft_follow_up` at `core.ts:318` pulls deal context, enriches with `cortex.aion_memory`, applies playbook rules, and drafts in the configured voice. The goal Daniel described — teach voice, see draft — is mechanically complete.

**The Brain tab is not paused.** The `/aion` page renders `ChatInterface` at `src/app/(dashboard)/aion/AionPageClient.tsx:73`. The kill switch at `src/app/api/aion/chat/route.ts:111` is per-workspace and not the default; it gated the old "Brain Mode paused" message but is unset for normal workspaces.

**The synthesized-default shortcut skips onboarding.** `applyVoiceDefaultIfEmpty()` at `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35` synthesizes a voice from the workspace name whenever `aion_config.voice` is empty, and sets `voice_default_derived: true`. `getOnboardingState()` at `aion-chat-types.ts:248` returns `configured` immediately when that flag is set. New workspaces never see the 4-step flow unless the owner explicitly clicks "Tune Aion's voice" in the sidebar (`AionSidebar.tsx:998`).

## Intended state

Per the queue item, the goal was: open Aion, write 3 paragraphs about communication style, see a draft that reflects that voice. That experience is reachable today — but only if the owner resets their voice first. A workspace that has never been explicitly configured lands in `configured` state with a synthesized voice, which means Aion immediately enters pull-mode (warm greeting + chips) rather than the onboarding conversation. The synthesized voice is functional but generic.

The `settings/aion` page has consent management, cadence toggle, and memory backfill — but no voice-config form. Voice setup is chat-only.

## The gap

- New owners never encounter the 4-step onboarding conversation; they get a synthesized default and go straight to pull mode.
- There is no in-product signal that tells an owner they are on a synthesized voice vs. one they taught Aion.
- The only path to explicit voice training is a sidebar overflow option labeled "Tune Aion's voice" — easy to miss, no discoverability in the main flow.
- `settings/aion` has no form for voice config; a non-conversational owner has no surface to fill in their style.

## Options

### Option A: Leave as-is, update the queue with a real next question
- **What it is:** Accept that the synthesized default is good enough for onboarding friction reduction. The sidebar reset path is the escape valve for owners who want finer control. Update the planning-primer and add a Phase B question to the queue.
- **Effort:** Small (docs only)
- **Main risk:** Owners with default voices generate drafts that feel generic. Voice quality stays untracked.
- **Unlocks:** Nothing immediately, but clears the queue for real next-phase planning.

### Option B: In-chat nudge after first N drafts on the synthesized default
- **What it is:** After `draft_follow_up` is called 2–3 times and `voice_default_derived` is still set, Aion appends a one-line nudge: "I've been drafting from a synthesized default — want to spend two minutes teaching me your actual style?" That triggers the existing 4-step flow via `resetAionVoiceConfig()` without adding any new surfaces.
- **Effort:** Small (one conditional in `core.ts`; track draft count in `aion_config.learned`)
- **Main risk:** Nudge timing is guesswork; might fire on a user who is actively happy with the default.
- **Unlocks:** Real voice configs for workspaces that use Aion before setting up voice intentionally.

### Option C: Voice setup form in settings/aion
- **What it is:** Add a structured form to `src/app/(dashboard)/settings/aion/` — three text areas for description, example message, and guardrails — that writes to `aion_config.voice` via `saveAionVoiceConfig()`. Alongside the form, a "Start voice setup in chat" deep-link opens Aion in the forced 4-step mode.
- **Effort:** Medium (new UI in settings, no new API or schema work)
- **Main risk:** Two paths to voice config (form + chat) could produce inconsistent states if not merged carefully. `saveAionVoiceConfig()` already strips `voice_default_derived`, so merging is sound.
- **Unlocks:** Non-conversational owners can configure voice without finding the sidebar overflow. Better settings-page discoverability.

## Recommendation

**Option B.** The synthesized-default shortcut (Wk 11 §3.8) was added to reduce friction — good call. But it means real voice configs only exist if the owner actively seeks the sidebar option, which most won't. A light in-chat nudge after the first few drafts is the lowest-friction way to surface the value without a new UI surface or forcing block. The draft-count signal is already available in context (`aion_config.learned` is the right place to track it). Option C is valuable eventually but adds a settings surface before there's evidence owners want to configure voice outside chat. Option A punts and wastes the queue.

The nudge phrasing should match the established voice: one sentence, sentence case, no exclamation mark — e.g., "These drafts are built on a default voice — want to spend a few turns teaching me how you actually write?" with a chip: `[chips: Yes, let's tune it|tune my voice, Not now|skip]`.

## Next steps for Daniel

1. Check `voice_default_derived` for your workspace: open `/aion`, note whether the greeting is the pull-mode warm line or the 4-step onboarding intro. If warm line, you're on the synthesized default.
2. To trigger explicit onboarding now: open Aion → sidebar (top-left) → overflow menu → "Tune Aion's voice".
3. To implement Option B: in `src/app/api/aion/chat/tools/core.ts`, after the `draft_follow_up` tool returns a result, check `getConfig().voice_default_derived` and increment a `learned.draft_count` field. If count hits 3, append a nudge to the result text.
4. Gate the nudge with a `learned.voice_nudge_dismissed` flag so it only fires once.
5. Update `planning-primer.md` — the current state section is 6 months stale. The Brain tab is live, `aion_config` exists, and Phase A is shipped.
6. Add a Phase B question to the queue (e.g., multi-turn playbook editing, or voice quality metrics).

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — `getAionConfig`, `saveAionVoiceConfig`, `resetAionVoiceConfig`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — `synthesizeDefaultVoice`, `applyVoiceDefaultIfEmpty`
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts` — `getOnboardingState`, `OnboardingState`
- `src/app/api/aion/chat/route/prompts.ts` — `buildSystemPrompt`, `buildGreeting`
- `src/app/api/aion/chat/tools/core.ts` — `save_voice_config`, `draft_follow_up`
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx` — "Tune Aion's voice" sidebar overflow
- `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` — current settings surface (no voice form)
