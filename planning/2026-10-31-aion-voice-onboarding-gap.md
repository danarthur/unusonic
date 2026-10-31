# Aion voice setup: what's actually missing

_Researched: 2026-10-31 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

**The premise is outdated.** The primer was captured around 2026-04-10. Since then, the system has shipped the full infrastructure the question was asking for. Nothing here is blocking.

`workspaces.aion_config` **exists** and is actively read and written. `getAionConfig()` reads it at `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:94`. The schema stores a typed `AionVoiceConfig` — `{ description, example_message, guardrails }` — plus `learned`, `follow_up_playbook`, `onboarding_state`, and `voice_default_derived`.

The **4-step voice onboarding machine** is live in the chat route. `getOnboardingState()` at `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` drives: `no_voice → no_example → no_guardrails → needs_test_draft → configured`. Each state gets a distinct greeting (`src/app/api/aion/chat/route/prompts.ts:284`) and a system-prompt injection that tells the model what to ask. The `save_voice_config` tool in `src/app/api/aion/chat/tools/core.ts:118` saves the config and sets `onboarding_state: 'complete'` when `onboarding_complete: true`.

`/api/aion/draft-follow-up` **is a fully implemented route** at `src/app/api/aion/draft-follow-up/route.ts`. It authenticates, tier-gates, reads the workspace voice config, and calls `generateFollowUpDraft()` in `src/app/api/aion/lib/generate-draft.ts` — which injects voice into the system prompt before calling the fast model.

The **Brain tab is active.** `AionPageClient.tsx` renders `ChatInterface` directly. The "Brain Mode is paused — waiting for timeline engine" message is not in the codebase.

The **one real bypass** is `applyVoiceDefaultIfEmpty` in `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35`. When `aion_config.voice` is empty, it synthesizes a generic voice from the workspace name and sets `voice_default_derived: true`. `getOnboardingState` returns `'configured'` immediately when that flag is set (line 248), skipping the 4-step forcing block. This means a new workspace lands in pull-mode from the first message, never seeing the onboarding conversation.

An existing reset path exists: the AionSidebar header overflow has "Tune Aion's voice" which calls `resetAionVoiceConfig()` — clearing `voice`, `voice_default_derived`, and `onboarding_state`. After reset, the next chat re-enters at `no_voice`. This affordance is a buried power-user menu that Daniel almost certainly doesn't know about.

## Intended state

Daniel opens `/aion`, is met with the `no_voice` greeting ("Let's start with how you talk to clients"), walks through the 3-step capture, and at `needs_test_draft` Aion uses `draft_follow_up` against an active deal — all within one conversation. The resulting draft respects the voice he just described. After approval he sees `configured` on subsequent opens.

That experience is **fully built**. It just requires `voice_default_derived` to be false, which requires either: (a) a fresh workspace with no name, or (b) an explicit reset.

## The gap

- No discoverable UI tells Daniel his voice is auto-derived vs. personally configured.
- New workspaces go directly to `configured` pull-mode; the onboarding conversation never surfaces.
- The reset path (sidebar overflow → "Tune Aion's voice") is invisible to new users.
- `AionSettingsView` (`src/app/(dashboard)/settings/aion/AionSettingsView.tsx`) only shows consent/cadence controls — no voice setup affordance.

## Options

### Option A: Document the existing reset path

- **What it is:** Add a visible "Your voice is auto-configured — personalize it" section to `AionSettingsView` when `voice_default_derived === true`. One `<StagePanel>` with a description and a "Personalize" button that calls `resetAionVoiceConfig` then routes to `/aion`.
- **Effort:** Small — one `<StagePanel>` block in `AionSettingsView.tsx`, reads from a new `voiceConfig` prop threaded from the page server component.
- **Main risk:** User ends up in settings, clicks button, goes to `/aion` — small context switch but low friction.
- **Unlocks:** Daniel can discover and complete voice setup without knowing the sidebar overflow exists.

### Option B: Surface a greeting chip when voice is derived

- **What it is:** When `voice_default_derived === true`, add a chip to the `configured` greeting chip row: "Personalize my voice". The value dispatches a synthetic `resetAionVoiceConfig` call then sends the message "Let me tell you how I talk to clients." This keeps the entry point inside the chat.
- **Effort:** Small-medium — modify `resolveGreetingChips()` in `src/app/api/aion/lib/greeting-chips.ts` to accept a `voiceDefaultDerived` flag, add the chip, and handle the value in the chat route.
- **Main risk:** The chip is easy to miss and disappears after the first interaction; no persistent affordance.
- **Unlocks:** Seamless in-chat onboarding trigger without leaving `/aion`.

### Option C: Flip the default — remove the `voice_default_derived` bypass

- **What it is:** Remove `applyVoiceDefaultIfEmpty` from `getAionConfig`. New workspaces return an empty voice, which means `getOnboardingState` returns `no_voice`, and the chat route runs the forcing block immediately.
- **Effort:** Very small code change. The infra is all there.
- **Main risk:** Every workspace that had `voice_default_derived: true` set but never completed voice setup will hit the 4-step flow on next open — a surprise for existing users. Requires a migration consideration or a flag check.
- **Unlocks:** The designed experience fires automatically without any new UI.

## Recommendation

**Option A.** It is the smallest, most legible change with no regressions. The settings page is the right place for persistent configuration — putting the affordance there means Daniel can find it when he's ready, not just on first open. Option C is tempting but touches active workspaces. Option B is better than nothing but the chip is transient.

Concretely: add a `voiceConfig: AionConfig` prop to `AionSettingsView`, thread it from the settings page server component (which already calls `getAionConfig`), and render a `<StagePanel>` block when `voiceConfig.voice_default_derived === true`. The block explains that the voice is auto-derived and offers a button to enter the personalization conversation. The button calls `resetAionVoiceConfig()` and then `router.push('/aion')`. No new routes, no new DB work.

The test-draft step already generates a real draft inline — so once Daniel goes through the 4-step chat, the output he sees IS the first real Aion draft respecting his voice. Everything after that is already working.

## Next steps for Daniel

1. Open `src/app/(dashboard)/settings/aion/page.tsx` — confirm it fetches `getAionConfig` and thread `voiceConfig` into `<AionSettingsView>`.
2. In `AionSettingsView.tsx`, add a `voiceConfig: AionConfig` prop and a new `<StagePanel>` block below the header: render it when `voiceConfig.voice_default_derived === true`.
3. The block copy: "Aion's voice is auto-configured from your workspace name. Walk through a 3-step setup to teach it your tone — it takes under 2 minutes."
4. Button: "Personalize Aion's voice" — onClick calls `resetAionVoiceConfig()` (already exported from `aion-config-actions.ts`) then `router.push('/aion')`.
5. Optionally: show the same affordance as a dismissible banner in `AionSidebar` for users who land on `/aion` first.
6. Smoke test: create a fresh workspace, open `/aion`, verify pull-mode greeting, go to Settings > Aion, click the button, verify the `no_voice` greeting fires.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — `AionConfig`, `saveAionVoiceConfig`, `resetAionVoiceConfig`, `getAionConfig`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — `applyVoiceDefaultIfEmpty`, `synthesizeDefaultVoice`
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — `getOnboardingState`
- `src/app/api/aion/chat/route/prompts.ts:284` — onboarding greeting states, system prompt injection
- `src/app/api/aion/chat/tools/core.ts:118` — `save_voice_config` tool
- `src/app/api/aion/draft-follow-up/route.ts` — draft generation route
- `src/app/api/aion/lib/generate-draft.ts` — `generateFollowUpDraft`, `buildFollowUpPrompt`
- `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` — settings UI (add affordance here)
