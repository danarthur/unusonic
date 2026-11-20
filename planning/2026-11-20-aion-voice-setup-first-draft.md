# Aion Phase A: voice setup and first real draft

_Researched: 2026-11-20 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

The queue item was written against an earlier codebase state. The two blocking assumptions no longer hold.

**`workspaces.aion_config` exists and is in active use.** `getAionConfigForWorkspace()` reads and writes it at `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:106`. The shape is `AionConfig` with a `voice: AionVoiceConfig` sub-object (`description`, `example_message`, `guardrails`). `saveAionVoiceConfig()` at `:178` persists all three fields.

**The Aion chat is fully live.** `/api/aion/chat/route.ts:59` is a real authenticated, tool-calling route — not a stub. It tier-gates, loads workspace config, resolves onboarding state, and streams responses.

**The 5-state onboarding machine exists.** `getOnboardingState()` at `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` maps `AionConfig` to `no_voice → no_example → no_guardrails → needs_test_draft → configured`. `buildGreeting()` at `src/app/api/aion/chat/route/prompts.ts:301` returns a different opening message for each state, including chips to trigger a test draft.

**The `draft_follow_up` chat tool exists.** `src/app/api/aion/chat/tools/core.ts:318` defines it. No `dealId` required — it defaults to the highest-priority queue item. It calls `generateFollowUpDraft()` which already injects `voice.description`, `voice.example_message`, and `voice.guardrails` into the system prompt (`src/app/api/aion/lib/generate-draft.ts:62`).

**The bypass is what blocks the experience.** Wk 11 §3.8 added `synthesizeDefaultVoice()` at `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:21`. On every `getAionConfig()` read, if `voice.description` is empty, it synthesizes a default from the workspace name and sets `voice_default_derived: true`. `getOnboardingState()` treats that flag as `configured` and skips the 4-step flow entirely. New workspaces never see onboarding.

The only current path to voice onboarding is `AionSidebar` → overflow → "Tune Aion's voice" → `resetAionVoiceConfig()` (`src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:1002`). It is not discoverable.

## Intended state

Daniel opens the Aion tab (or /settings/aion), writes three free-form paragraphs about how he communicates with clients, hits save, and immediately sees a generated follow-up draft for a real deal — rewritten in his style. The draft is not a placeholder. After that, every follow-up Aion drafts uses the saved voice.

## The gap

- No form-based voice input exists anywhere (AionSettingsView is about card beta consent, not voice)
- The `voice_default_derived` bypass means no new workspace ever enters the 4-step chat onboarding
- The "Tune Aion's voice" affordance is buried in the sidebar overflow — invisible to a first-time user
- There is no one-screen path where writing voice config and seeing a test draft happen without a navigation hop

## Options

### Option A: Voice config form in `/settings/aion`

- **What it is:** Add a "Voice" section to `AionSettingsView.tsx` with three labelled textareas (`description`, `example_message`, `guardrails`) wired to `saveAionVoiceConfig()`. On save success, navigate to `/aion`. The chat greeting will now be `needs_test_draft` and will immediately offer a test draft chip.
- **Effort:** Small — the server action, the data shape, and the route all exist. Pure UI work, one component.
- **Main risk:** Two navigation hops (settings → /aion → draft). The described experience feels split across two pages.
- **Unlocks:** A permanent, editable voice config form that Daniel can return to. Removes the need to re-enter chat onboarding to change voice later.

### Option B: Inline voice setup card in the Aion chat tab

- **What it is:** When `voice_default_derived === true`, render a dismissable setup banner inside the `ChatInterface` above the input area. The banner expands to show the three fields. On save, `saveAionVoiceConfig()` is called, then a synthetic `"Yes, draft a test message"` message is dispatched into the session (`sendChatMessage`) to immediately trigger `draft_follow_up`.
- **Effort:** Medium — new component, inline form state inside `ChatInterface`, synthetic message dispatch, dismissal logic.
- **Main risk:** Inline forms inside chat are a new UI pattern for Unusonic and need design review against the Stage Engineering surface system.
- **Unlocks:** The exact described experience: open the tab, write three paragraphs, see a draft — all without leaving the page.

### Option C: Remove the `voice_default_derived` bypass

- **What it is:** Delete the `synthesizeDefaultVoice` call from `applyVoiceDefaultIfEmpty()` (or gate it behind `never_tuned !== true`). First-open greets with the existing `no_voice` conversational onboarding. No new components.
- **Effort:** Tiny — one-line change in `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts`.
- **Main risk:** Reverts a deliberate Wk 11 decision (the bypass was added specifically to avoid blocking new workspaces with onboarding). Existing workspaces with `voice_default_derived: true` are unaffected; only truly empty configs (new workspaces, reset configs) change behaviour.
- **Unlocks:** Every new workspace sees the 4-step chat onboarding with no code changes to the flow.

## Recommendation

Option A. It is the smallest new surface that delivers a form-based voice input without reverting a deliberate architectural decision or adding novel UI patterns to the chat.

The two-hop concern (settings → /aion → draft) is real but acceptable for Phase A. The `/aion` greeting in `needs_test_draft` state already has a chip that immediately calls `draft_follow_up` — so the draft appears with one tap, not a manual prompt. The experience becomes: settings form → save → one tap on "Yes, try one" → draft renders.

Option C is tempting because it costs almost nothing, but Wk 11 §3.8 was deliberate. If the bypass is wrong, that is a separate decision; this research shouldn't make it in passing.

Option B is the ideal end-state UX but deserves its own sprint — the inline-form-in-chat pattern needs design alignment before it ships.

## Next steps for Daniel

1. Open `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` and add a "Voice" section below the existing beta status panel. Three labelled textareas: "How you communicate" (`description`), "Example message" (`example_message`), "Rules" (`guardrails`). Pre-populate from `aion_config.voice` when set.
2. Import `saveAionVoiceConfig` from `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` and wire the form submit to it via `useTransition`.
3. On success, `router.push('/aion')` — the chat greeting will be `needs_test_draft` because `saveAionVoiceConfig` strips `voice_default_derived` from the stored config.
4. Confirm the experience by opening `/settings/aion`, filling three paragraphs, saving, and clicking "Yes, try one" on the resulting chip. The draft should render using the voice you wrote.
5. (Optional) Add a "Voice" link in the sidebar overflow alongside "Tune Aion's voice" so it's discoverable without knowing about settings.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — `AionVoiceConfig`, `saveAionVoiceConfig`, `getAionConfig`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — `synthesizeDefaultVoice`, `applyVoiceDefaultIfEmpty` (the bypass)
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — `getOnboardingState`
- `src/app/api/aion/chat/route/prompts.ts:301` — `buildGreeting` per onboarding state
- `src/app/api/aion/chat/tools/core.ts:318` — `draft_follow_up` tool
- `src/app/api/aion/lib/generate-draft.ts:62` — voice injection into draft prompt
- `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` — target file for the form
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:1002` — existing "Tune voice" affordance
