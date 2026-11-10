# Aion Phase A: Voice Setup + First Draft — Where Things Actually Stand

_Researched: 2026-11-10 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

The question's premises no longer hold. This is a note from the future: most of Phase A shipped between April and November 2026.

**`public.workspaces.aion_config` exists.** `getAionConfig()` reads it at `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:94`. The shape is fully typed: `{ voice: AionVoiceConfig, learned: AionLearnedConfig, follow_up_playbook: AionFollowUpPlaybook, onboarding_state, kill_switch, voice_default_derived }`.

**Voice config is complete.** `AionVoiceConfig` (`description`, `example_message`, `guardrails`) is saved via `saveAionVoiceConfig()` at `aion-config-actions.ts:178`. A 5-state machine (`no_voice → no_example → no_guardrails → needs_test_draft → configured`) lives at `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247`.

**Voice default synthesis is live.** `synthesizeDefaultVoice()` at `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:20` builds a default voice from the workspace name on every read when `aion_config.voice` is empty. Because `getOnboardingState()` returns `'configured'` when `voice_default_derived === true` (`aion-chat-types.ts:248`), new workspaces skip the 4-step setup entirely and go straight to chat.

**Chat route is fully live.** `/api/aion/chat/route.ts` handles auth, rate limiting, tier gating, session scoping, tool-calling, and system-prompt assembly. This is not the 16-line GPT-4-turbo stub the primer described.

**Draft follow-up is live.** `/api/aion/draft-follow-up/route.ts` calls `generateFollowUpDraft()` from `src/app/api/aion/lib/generate-draft.ts`, which injects `voice` from `aion_config` into the prompt.

**Voice reset exists.** `resetAionVoiceConfig()` (`aion-config-actions.ts:214`) clears the voice + derived flag. It is surfaced as "Tune Aion's voice" in the `AionSidebar` overflow (`src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx`).

**The 4-step onboarding conversation is built.** `buildGreeting()` at `src/app/api/aion/chat/route/prompts.ts:301` delivers each onboarding state as a cold-open message with suggestion chips. After completing guardrails, the `needs_test_draft` greeting offers to draft against the top-priority deal.

## Intended state

The original Phase A goal — write about communication style, see a voice-aware draft — is mechanically complete. The gap today is UX discoverability: a first-time workspace sees a synthesized default voice and enters a fully configured chat. To trigger the 4-step voice setup, the user must find the sidebar overflow and click "Tune Aion's voice." That entry point is not visible on the first open.

## The gap

- New workspaces land in `configured` mode (synthesized default). Voice setup is never prompted.
- The entry point — sidebar overflow → "Tune Aion's voice" — is hidden one level deep and unlabeled on first visit.
- The `needs_test_draft` state offers a draft, but it fires only on a COLD OPEN after voice is saved, not inline after the last guardrail turn.
- There is no affordance from the `/aion` page landing state that says "Tell me how you write; I'll show you a draft."

## Options

### Option A: Banner for voice-default workspaces
- **What it is:** Add a dismissible `StagePanel` banner at the top of `/aion` (in `AionPageClient.tsx`) when `voice_default_derived === true`. Copy: "I'm using a default voice for this workspace. Teach me how you actually write to clients." Button triggers `resetAionVoiceConfig()` + startNewChat, entering the `no_voice` greeting flow.
- **Effort:** Small — one banner component, one server action call, one conditional in `AionPageClient.tsx`. No schema changes.
- **Main risk:** The banner may feel like noise after the first time; needs a dismissal flag in `aion_config`.
- **Unlocks:** A clear, in-context entry point for the specific scenario in the queue item.

### Option B: Voice setup form in /settings/aion
- **What it is:** Add a "Communication style" section to `AionSettingsView.tsx` with three textarea fields (`description`, `example_message`, `guardrails`) and a "Save and preview a draft" button. The button calls `saveAionVoiceConfig()` then `fetch('/api/aion/draft-follow-up', ...)` with the first active deal as context, rendering the draft inline.
- **Effort:** Medium — new section in `AionSettingsView.tsx`, two server action calls, inline draft rendering. No schema changes.
- **Main risk:** Settings are a low-traffic surface. Users are unlikely to visit `/settings/aion` before their first chat. Solves the form problem but not the discoverability problem.
- **Unlocks:** The literal "write paragraphs → see draft" scenario from the queue item. Also gives a non-chat editing surface for voice config.

### Option C: In-chat chip for voice-default workspaces
- **What it is:** Modify the `'configured'` case of `buildGreeting()` at `prompts.ts:349` to append a suggestion chip when `voice_default_derived === true`: `{ label: "Customize how I write for you", value: "I want to teach you my communication style." }`. When the user sends that value, the route handler detects it, calls `resetAionVoiceConfig()`, and responds with the `no_voice` greeting. Keeps everything inside the existing chat surface.
- **Effort:** Small — two changes: `buildGreeting()` signature gets the config passed through, adds one chip conditionally; chat route detects the synthetic trigger and resets voice. No schema changes.
- **Main risk:** The chip only appears on the first cold open (before the user scrolls or sends anything). If missed, they still need the sidebar overflow.
- **Unlocks:** Zero-friction entry into voice setup from the existing chat experience. No new surfaces.

## Recommendation

Option A. The banner is the most direct fix for the specific problem: a first-time user opens `/aion` and there is nothing telling them to personalize it. A single `StagePanel` with one line of copy and one button addresses that without adding a new settings surface or modifying the chat flow logic. Option C is cheaper but ephemeral — the chip appears only on cold open and disappears once the user sends a message. Option B solves a secondary problem (form vs. chat for voice input) but doesn't fix the discovery gap.

Build it in `AionPageClient.tsx` using the config data already available to the page. Dismiss the banner by writing `{ voice_default_derived_banner_dismissed: true }` as a new field into `aion_config`, or simpler: once the user completes voice setup (`onboarding_state === 'complete'`), `voice_default_derived` is cleared by `saveAionVoiceConfig` anyway, so the banner naturally disappears.

The `needs_test_draft` state already delivers a draft after onboarding completes. No additional plumbing is needed to fulfil the "see a draft" part of the goal.

## Next steps for Daniel

1. Open `src/app/(dashboard)/aion/AionPageClient.tsx` — add a prop `voiceDefaultDerived: boolean` passed from the server page.
2. Add a dismissible `StagePanel` banner beneath the `PinOpenDispatcher` block: renders only when `voiceDefaultDerived === true`.
3. Banner button calls `resetAionVoiceConfig()` then `startNewChat()` from `useSession()`. The chat opens at the `no_voice` greeting.
4. Update the server page (`src/app/(dashboard)/aion/page.tsx`) to call `getAionConfig()` and pass `voice_default_derived` to `AionPageClient`.
5. Confirm: after completing the 4-step onboarding, `saveAionVoiceConfig` clears `voice_default_derived`, so the banner never reappears.
6. Smoke-test with a fresh workspace: open `/aion`, see banner, click it, complete 3-step voice setup, confirm `needs_test_draft` greeting fires and returns a live draft.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — voice config read/write
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:20` — `synthesizeDefaultVoice`
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — `getOnboardingState`
- `src/app/api/aion/chat/route/prompts.ts:301` — `buildGreeting` onboarding states
- `src/app/api/aion/lib/generate-draft.ts` — `generateFollowUpDraft` with voice injection
- `src/app/api/aion/draft-follow-up/route.ts` — draft endpoint, auth + voice config already wired
- `src/app/(dashboard)/aion/AionPageClient.tsx` — target file for the banner
