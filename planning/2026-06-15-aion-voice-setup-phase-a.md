# Aion Phase A: Voice Setup + First Draft Unblock

_Researched: 2026-06-15 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

**The premises in the question are outdated.** Significant work has landed since the primer was written.

`aion_config` exists on `public.workspaces` — added in `supabase/migrations/pre-baseline/20260407140000_aion_voice_foundation.sql`. The column is typed in `src/types/supabase.ts:7689`. The Aion page is a live, full-featured chat system — not paused.

The entire voice-setup pipeline is built:

- **Voice type:** `AionVoiceConfig { description, example_message, guardrails }` — `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:12`
- **State machine:** `getOnboardingState()` maps config to `no_voice → no_example → no_guardrails → needs_test_draft → configured` — `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247`
- **Greeting per state:** `buildGreeting()` handles every state with targeted prompts and chips — `src/app/api/aion/chat/route/prompts.ts:292`
- **Save tool:** `save_voice_config` in the chat tools saves fields to `aion_config` as Daniel types them — `src/app/api/aion/chat/tools/core.ts:118`
- **Test draft:** the `needs_test_draft` greeting offers "Want me to draft a test message for one of your active deals?" — `prompts.ts:329`
- **Draft route:** `/api/aion/draft-follow-up` is live, reads `aion_config.voice`, injects it into the LLM prompt — `src/app/api/aion/draft-follow-up/route.ts`
- **Reset path:** "Tune Aion's voice" in the sidebar overflow calls `resetAionVoiceConfig()` — `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:998`

**The one real blocker:** `applyVoiceDefaultIfEmpty()` auto-synthesizes a voice from the workspace name and sets `voice_default_derived: true` — `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:36`. `getOnboardingState()` maps this flag directly to `'configured'`, skipping the 4-step flow (`aion-chat-types.ts:248`). New workspaces land in the generic pull-mode greeting with no prompt to set up their voice. The reset path exists but is hidden behind a `SlidersHorizontal` icon in the sidebar header.

## Intended state

Daniel opens Aion, sees a prompt to teach it his writing style, writes his 3 paragraphs (style, example, guardrails — one per turn or all at once), and immediately receives an Aion-drafted follow-up for a real deal that reflects his voice. The Wk 11 §3.8 decision was intentional: don't force the 4-step flow on every new user. The unresolved gap is discoverability — the existing reset path is invisible.

## The gap

- `voice_default_derived === true` bypasses onboarding, so the 4-step conversational setup never fires for new workspaces
- The only reset entry point ("Tune Aion's voice") is buried in a tertiary overflow menu — a `SlidersHorizontal` icon in the sidebar header that most users won't discover
- The `configured` pull-mode greeting contains no hint that voice personalization exists or is recommended
- The `AionSettingsView` (`/settings/aion`) covers consent and cadence only — no voice setup surface there either

## Options

### Option A: First-run chip in the configured greeting

- **What it is:** When `buildGreeting` detects `voice_default_derived === true` alongside the `configured` state, add a chip: `{ label: 'Teach Aion my voice', value: 'I want to tell you how I write to clients.' }`. Sending it clears the derived flag via `resetAionVoiceConfig()` (or the user can just type and the `save_voice_config` tool picks it up). Pass `voice_default_derived` from `getAionConfigForWorkspace` through `buildGreeting`'s call site in `route.ts:126`.
- **Effort:** Small — 1 conditional branch in `prompts.ts:340`, pass one extra flag through `route.ts`
- **Main risk:** The "Teach Aion my voice" chip appears on every new chat until the user acts — could feel noisy if they ignore it
- **Unlocks:** Discoverable voice setup with zero new UI; the existing 4-step flow handles the rest

### Option B: Voice setup form in `/settings/aion`

- **What it is:** Add a `VoiceSetupForm` section to `AionSettingsView` with three labeled textareas (description, example_message, guardrails). "Save and try a draft" calls `saveAionVoiceConfig()` then redirects to `/aion` — the chat opens at `needs_test_draft` state and immediately offers a real draft.
- **Effort:** Medium — new form component, add to `AionSettingsView`, handle the post-save redirect and auto-open in `AionPageClient`
- **Main risk:** Splits the experience (settings → then chat); no deal context at save time so the test draft CTA still requires a chat turn
- **Unlocks:** Batch-input path for users who know their voice and prefer a form over conversation

### Option C: Sidebar banner when voice_default_derived

- **What it is:** In `AionSidebar`, detect `voice_default_derived === true` (needs a prop or small hook) and render a soft inline banner below the session list: "Aion is using a default voice. Teach it how you write." with a single CTA that calls `handleTuneVoice`.
- **Effort:** Small — read config in sidebar, conditional banner, reuse existing `handleTuneVoice`
- **Main risk:** Requires threading config state into the sidebar; the sidebar is already prop-heavy
- **Unlocks:** In-context discoverability without touching the greeting/chat route

## Recommendation

**Ship Option A.** It is the smallest possible change and removes the only real blocker: discoverability. The full pipeline — 4-step conversational voice capture, draft trigger, live draft preview — is completely built. The `voice_default_derived` chip in the greeting surfaces it in exactly the right moment (first open of Aion), in the medium Daniel is already using (chat), with zero new UI surface to maintain.

Option B is attractive if Daniel wants to write his 3 paragraphs all at once rather than in 3 conversational turns. But the chat route already handles paragraph-length input for each field — Daniel can write a full paragraph per turn and the `save_voice_config` tool captures it verbatim. The conversational flow also coaches each field with a pointed question, which is better than a blank form.

Accept the trade-off: the chip appears on every new chat session until voice is configured. That's correct behavior — it should be a little persistent until it's resolved.

## Next steps for Daniel

1. In `src/app/api/aion/chat/route.ts:126`, add `voice_default_derived: aionConfig.voice_default_derived` to the `buildGreeting` call signature.
2. In `src/app/api/aion/chat/route/prompts.ts`, update `buildGreeting`'s signature to accept `voiceDefaultDerived?: boolean` and add it to the `configured` case (around line 340): if `voiceDefaultDerived`, append a chip `{ label: 'Teach Aion my voice', value: 'I want to tell you how I write to clients.' }` to the greeting's chip row.
3. Verify: open a workspace where `aion_config` is empty or `voice_default_derived: true`. The greeting should show the new chip.
4. Click the chip. The `save_voice_config` tool detects the user's style description in the next turn, saves it, and the state machine advances to `no_example`, then `no_guardrails`, then `needs_test_draft`.
5. At `needs_test_draft`, the greeting (`prompts.ts:329`) offers a test draft — verify the chip "Yes, try one" triggers `draft_follow_up` on the top-priority deal and returns a real draft.
6. Optional cleanup: add a toast to `handleTuneVoice` in `AionSidebar.tsx:998` that says "Opening new chat — Aion will ask about your voice." and starts a new session so the greeting fires immediately.

## References

- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — `getOnboardingState`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:36` — `applyVoiceDefaultIfEmpty`
- `src/app/api/aion/chat/route/prompts.ts:292` — `buildGreeting`
- `src/app/api/aion/chat/route/prompts.ts:329` — `needs_test_draft` greeting
- `src/app/api/aion/chat/tools/core.ts:118` — `save_voice_config` tool
- `src/app/api/aion/draft-follow-up/route.ts` — live draft route
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:998` — `handleTuneVoice` reset
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:178` — `saveAionVoiceConfig`
