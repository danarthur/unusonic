# Minimum path to voice setup and first Aion draft

_Researched: 2026-05-11 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

**The primer's "Current notable state" is out of date.** The codebase has moved significantly past it. Here is what actually exists today.

`public.workspaces.aion_config` **exists** and is fully typed (`src/types/supabase.ts:7689`). Its shape, defined in `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:12–74`, includes `voice` (`AionVoiceConfig` with `description`, `example_message`, `guardrails`), `learned`, `follow_up_playbook`, `onboarding_state`, `kill_switch`, and `voice_default_derived`.

The old `/api/aion/route.ts` stub is gone. It was replaced by `/api/aion/chat/route.ts` — a 450-line authenticated, tool-calling, streaming route with per-user rate limiting, tier gating, onboarding state detection, and workspace snapshot injection (`src/app/api/aion/chat/route.ts:57–160`).

The chat route implements a 5-state voice onboarding machine (`src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247–257`): `no_voice → no_example → no_guardrails → needs_test_draft → configured`. Each state generates a tailored greeting with action chips. The `save_voice_config` chat tool (`src/app/api/aion/chat/tools/core.ts:118–144`) saves each step and marks `onboarding_state = 'complete'` when done.

`getDealContextForAion` is implemented at `src/app/(dashboard)/(features)/events/actions/follow-up-actions.ts:545`. `/api/aion/draft-follow-up/route.ts` is live, authenticated, tier-gated, and calls `generateFollowUpDraft` (`src/app/api/aion/lib/generate-draft.ts:25`). That function reads `aion_config.voice` and injects description, example message, and guardrails into the system prompt.

The `/aion` page (labeled "Nodes" in the nav shell at `src/shared/ui/layout/Shell.tsx:16`) mounts `ChatInterface` directly via `AionPageClient` (`src/app/(dashboard)/aion/AionPageClient.tsx:66–76`). There is no "paused" UI — the page is fully active.

**The one structural gap**: `applyVoiceDefaultIfEmpty` (`src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35–45`) silently synthesizes a generic voice from the workspace name and sets `voice_default_derived: true` on every read where `voice.description` is absent. `getOnboardingState` treats `voice_default_derived: true` as `configured` and skips the 4-step flow entirely. The AionSidebar exposes "Tune Aion's voice" to re-enter the flow, but it is buried in a header overflow menu (`src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:1002–1043`).

## Intended state

Daniel opens Aion, is immediately invited to describe how he talks to clients, writes in his own words, and within one session sees a follow-up draft for a real deal that sounds like him — not the generic synthesized default. The voice setup should feel intentional, not something stumbled upon in a sidebar overflow.

The voice config shape is already correct (`description` + `example_message` + `guardrails`). The draft generation pipeline already reads it. The onboarding state machine is already built. The missing piece is a front door: a surface that leads Daniel through voice setup before (or instead of) the bypass kicking in.

## The gap

- Fresh workspaces always receive a synthesized voice (`voice_default_derived: true`) and skip the 4-step onboarding. Daniel writes zero paragraphs.
- "Tune Aion's voice" is hidden in an overflow menu — not discoverable as the intended entry point.
- No dedicated form surface exists where all three voice fields can be set in one pass (description, example, guardrails), separate from the conversational chat flow.

## Options

### Option A: Voice setup form in a settings drawer

- **What it is:** A standalone form panel — three textarea fields (communication style, example message, guardrails), submit calls `saveAionVoiceConfig`. Accessible via a persistent "Set up your voice" prompt inside the Aion sidebar when `voice_default_derived === true`. After save, `voice_default_derived` is cleared and the workspace is marked fully configured.
- **Effort:** Small. `saveAionVoiceConfig` Server Action already exists. `AionVoiceConfig` type is defined. No backend work needed — pure UI.
- **Main risk:** Two parallel entry paths (form + chat onboarding) can diverge; the chat route's `save_voice_config` tool may partially overwrite a form-saved config if the onboarding state logic isn't updated to match.
- **Unlocks:** Daniel can set voice in one 5-minute session, immediately see personalized drafts from the Follow-Up Card on any deal.

### Option B: Remove the bypass — let the 4-step chat onboarding run

- **What it is:** Delete `applyVoiceDefaultIfEmpty` (or gate it: only apply when the workspace is ≥30 days old with no explicit voice). Fresh workspaces get `no_voice` state and the chat onboarding fires on first open. All three voice fields are gathered conversationally over 3–4 turns.
- **Effort:** Small. Change is in `aion-config-helpers.ts` + test coverage update. The chat route and greeting builder already handle all states correctly.
- **Main risk:** Existing workspaces that relied on the synthesized default to skip onboarding will be forced through the flow on their next chat open. Needs a migration guard (check `voice_default_derived` in DB, null-it out only for workspaces where it was never explicitly acknowledged).
- **Unlocks:** The built onboarding flow finally runs. First-open experience becomes intentional. No new UI components needed.

### Option C: Onboarding card on the Aion lobby (not in chat)

- **What it is:** A stage-panel card rendered above the chat input when `voice_default_derived === true`. Inline textarea form for the three fields, saves in one submit, then collapses. Similar to Linear's "set up your team" first-run banners.
- **Effort:** Medium. Requires passing `voiceDefaultDerived` state from the server down to `ChatInterface`, rendering a conditional panel, and wiring submit to `saveAionVoiceConfig`.
- **Main risk:** More UI surface area, more to maintain. The card must be re-rendered server-side after save, which requires a revalidate path and potential flash.
- **Unlocks:** Clearest first-run experience — the ask is in the main canvas, not a sidebar.

## Recommendation

Ship **Option A** — the voice setup form in the sidebar — but treat it as a stepping stone, not the end state. Here is why: the backend is complete, the gap is purely a front door. A form with three textareas is a 2–3 hour build, can be tested independently of the chat flow, and unblocks the stated goal immediately. Do not remove the bypass yet (Option B) because it would force the conversational onboarding on workspaces that may already have production data. Do not build Option C yet because it adds UI complexity before the simpler form is proven.

After Option A ships and Daniel has used voice-aware drafts for a week, revisit Option B to make the conversational onboarding the default for new workspaces. The two approaches are not mutually exclusive — both can coexist, with the form as a "quick setup" and the chat as a "deep tune."

## Next steps for Daniel

1. Add a `VoiceSetupPanel` component inside `src/app/(dashboard)/(features)/aion/components/` with three textareas bound to `AionVoiceConfig` fields. On submit, call `saveAionVoiceConfig(voice)`.
2. In `AionSidebar.tsx`, render `VoiceSetupPanel` as an expanded section when `voiceDefaultDerived` prop is `true` — pass it from `ChatInterface` which already loads `aionConfig` from the server.
3. Thread `voice_default_derived` from `getAionConfig()` into `ChatInterface` props → `AionSidebar` props (add a `voiceDefaultDerived?: boolean` prop on both).
4. After `saveAionVoiceConfig` succeeds, call `revalidatePath('/aion')` (already in the action) and dismiss/collapse the panel client-side.
5. Verify end-to-end: open a deal, trigger the Follow-Up Card draft, confirm the draft reads `aion_config.voice` from the saved form values — not the synthesized default.
6. Delete `ArthurInput.tsx` while you're in the components folder (empty file, confirmed legacy).

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — `AionVoiceConfig`, `saveAionVoiceConfig`, `resetAionVoiceConfig`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — `applyVoiceDefaultIfEmpty`, `synthesizeDefaultVoice`
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — `getOnboardingState` 5-state machine
- `src/app/api/aion/chat/route/prompts.ts:275` — onboarding state forcing block in system prompt
- `src/app/api/aion/lib/generate-draft.ts:52` — `buildFollowUpPrompt` — voice injection into draft
- `src/app/api/aion/draft-follow-up/route.ts` — standalone draft endpoint
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:973` — "Tune Aion's voice" overflow entry point
