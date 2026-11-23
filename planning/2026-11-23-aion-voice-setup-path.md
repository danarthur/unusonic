# Aion Phase A: voice setup + first real draft path

_Researched: 2026-11-23 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

**How this was understood:** The primer dates from 2026-04-10. The codebase has moved significantly since then. This doc describes the actual current state before proposing a path.

## Current state

The system is substantially complete. The primer's two key premises are outdated:

**`aion_config` exists.** `public.workspaces.aion_config` is a live JSONB column. `getAionConfig()` reads it at `aion-config-actions.ts:84`, `saveAionVoiceConfig()` writes it at `:178`, and `getAionConfigForWorkspace()` at `:106` is used by API routes that already have `workspaceId`.

**The 5-state onboarding machine is live.** `aion-chat-types.ts:247` defines `no_voice → no_example → no_guardrails → needs_test_draft → configured`. The chat route at `/api/aion/chat/route.ts:124` reads onboarding state, injects the right forcing block into the system prompt (`prompts.ts:284`), and returns the appropriate greeting on cold open (`prompts.ts:310`).

**`save_voice_config` tool exists** at `core.ts:118`. When the user describes their style in chat, Aion calls this to persist all three fields (`description`, `example_message`, `guardrails`) to `aion_config` via `updateAionConfigForWorkspace`.

**`draft_follow_up` tool exists** at `core.ts:318`. It enriches drafts with deal context, tone anchoring (`tone-anchoring.ts`), memory (`cortex.aion_memory`), playbook rules, and voice config. The `/api/aion/draft-follow-up` standalone route uses the same `generateFollowUpDraft()` lib at `generate-draft.ts:25`.

**The blocking issue is a Wk 11 design decision (§3.8).** `applyVoiceDefaultIfEmpty()` at `aion-config-helpers.ts:35` synthesizes a default voice from the workspace name on every read when `voice.description` is empty, and sets `voice_default_derived: true`. `getOnboardingState()` at `aion-chat-types.ts:248` returns `'configured'` immediately when this flag is true, skipping the 4-step flow. The intent was to avoid friction for newcomers.

Result: unless a workspace has explicitly set voice OR an owner has clicked "Tune Aion's voice" in the sidebar overflow (AionSidebar `~:1043`), `aion_config.voice` is always a synthesized default and the onboarding flow never fires. The `configured` greeting at `prompts.ts:349` is a pull-mode warm greeting with capability chips — it offers no voice-tune affordance even when the voice is derived.

## Intended state

Daniel opens `/aion`, is invited to describe how he talks to clients, writes 3 paragraphs, Aion calls `save_voice_config`, moves to `needs_test_draft`, generates a draft for a real deal, Daniel approves, state flips to `configured`. Every subsequent draft reflects his voice.

The machine for all of this exists. The gap is the entry point: there is no proactive surface that says "you're on a synthesized default — want to tune it?" The "Tune Aion's voice" affordance is the only path in, and it's buried in the sidebar overflow menu.

## The gap

- The `configured` greeting has no voice-tune CTA when `voice_default_derived=true`.
- Owners who don't discover the sidebar overflow never enter voice setup.
- `buildGreeting()` does not receive `voice_default_derived` — it only receives `onboardingState`, which is already `'configured'` by the time it's called.
- The `draft_follow_up` tool returns an error if there are no deals in the follow-up queue — this would break the `needs_test_draft` step for a true day-0 workspace.

## Options

### Option A: Voice-tune chip in the configured greeting

- **What it is:** When `aionConfig.voice_default_derived` is true, add a soft CTA to the `configured` greeting — a text line ("Your voice is a default based on your workspace name. Want to tune how I write for you?") and a "Tune my voice" chip. The chip sends "Let's tune my voice for drafts." as a user message, which re-enters the `no_voice` flow naturally via the system-prompt forcing block after `resetAionVoiceConfig()` runs client-side, or just by saying "describe how you talk to clients" if the route handles it without a reset.
- **Effort:** Small — pass `voice_default_derived` from the route into `buildGreeting`, add ~15 lines in the `configured` case.
- **Main risk:** `buildGreeting` signature must change (add one bool param). Existing tests that mock the greeting will need updating.
- **Unlocks:** The exact journey Daniel described. No new components, no schema changes.

### Option B: Voice config form in `/settings/aion`

- **What it is:** A `<VoiceConfigForm>` section in `AionSettingsView.tsx` with three textareas (description, example message, guardrails). Reads current voice from server props on page load, writes via `saveAionVoiceConfig()`. Shows a "Configured" / "Default" badge so owners can see which they have.
- **Effort:** Medium — new component (~80 lines), server props in `page.tsx` need to load `aionConfig`, page layout changes.
- **Main risk:** Two surfaces for the same thing (chat + form) is UX debt. The chat-driven flow teaches Aion by conversation; the form is a raw config editor. They produce identical data but feel different.
- **Unlocks:** A power-user direct-edit path. Useful for future team-admin scenarios where the workspace owner wants to preset voice before anyone else opens the chat.

### Option C: Revert Wk 11 §3.8 — treat `voice_default_derived` as `no_voice`

- **What it is:** One-line change in `getOnboardingState()` at `aion-chat-types.ts:248`: remove the `voice_default_derived` short-circuit so the full 4-step flow fires for all workspaces that haven't explicitly set their voice.
- **Effort:** Small — 1 line in `aion-chat-types.ts`, update 1 test.
- **Main risk:** This was deliberately reverted in Wk 11 because the 4-step forcing block felt like friction. Reverting the revert reintroduces that friction for every new workspace and for any workspace that hasn't tuned their voice (probably all of them). The right fix is a soft invite, not a mandatory gate.
- **Unlocks:** Automatic onboarding. No new UI needed.

## Recommendation

**Option A.** It directly serves the stated goal without introducing new surfaces or reverting a deliberate design decision. The Wk 11 §3.8 change was right — mandatory 4-step onboarding is friction. But a soft greeting chip for the `voice_default_derived` case costs almost nothing and delivers the entry point that's missing.

The tradeoff: `buildGreeting` grows one more parameter. That's acceptable — the function already takes five. The bigger implementation note: the chip's value should NOT trigger `resetAionVoiceConfig()` client-side before sending. Instead, the message "Let's tune my voice" should work as-is because the route's forcing block in the system prompt will guide Aion through the `no_voice` path naturally as long as the voice config is cleared first. The cleanest path is to have the chip fire `resetAionVoiceConfig()` as a server action before or on the first turn. Alternatively: add a check in `buildGreeting` — if `voice_default_derived=true`, pass `no_voice` behavior in the greeting even though onboarding state is `configured`, without touching the DB.

For the missing-deals edge case at `needs_test_draft`: no change needed. If there are no deals, Aion's response ("no deals in the queue") is honest and appropriate. The journey requires at least one active deal.

## Next steps for Daniel

1. Open `src/app/api/aion/chat/route/prompts.ts` and find `buildGreeting` at line 301 — add `voiceDefaultDerived?: boolean` to the signature.
2. In the `configured` case at line 349, before the `resolveGreetingChips` call, check: if `voiceDefaultDerived`, push an extra text message and a "Tune my voice" chip.
3. In `/api/aion/chat/route.ts` at line 128, pass `aionConfig.voice_default_derived` as the new argument to `buildGreeting`.
4. The chip value should be something like `'Tell me about how you write to clients so I can personalize drafts.'` — this triggers the `no_voice` onboarding path via the system prompt without needing to reset config first.
5. Run `npm run test -- aion-chat` to verify existing greeting tests still pass, then add a test case for the `voice_default_derived=true` branch.
6. Smoke test: open `/aion` on a workspace that hasn't explicitly set voice, confirm the tuning chip appears and the conversation flows through all 4 onboarding steps to a real draft.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — `getAionConfig`, `saveAionVoiceConfig`, `getAionConfigForWorkspace`, `updateAionConfigForWorkspace`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — `synthesizeDefaultVoice`, `applyVoiceDefaultIfEmpty`
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — `getOnboardingState` and the 5-state machine
- `src/app/api/aion/chat/route.ts` — the full chat route
- `src/app/api/aion/chat/route/prompts.ts:284` — onboarding forcing blocks; `prompts.ts:349` — configured greeting
- `src/app/api/aion/chat/tools/core.ts:118` — `save_voice_config` tool
- `src/app/api/aion/chat/tools/core.ts:318` — `draft_follow_up` tool
- `src/app/api/aion/lib/generate-draft.ts` — `generateFollowUpDraft`, `buildFollowUpPrompt`
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:1043` — "Tune Aion's voice" sidebar affordance
