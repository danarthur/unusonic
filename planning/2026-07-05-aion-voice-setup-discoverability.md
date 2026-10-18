# Aion Phase A: voice setup entry point and first real draft

_Researched: 2026-07-05 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

**The premise of the question is outdated.** The primer reflects April 2026 state; the codebase has moved significantly. Current reality as of the latest commits:

- `public.workspaces.aion_config` is a live JSONB column. `getAionConfigForWorkspace` reads it and `saveAionVoiceConfig` writes it via the system client (`aion-config-actions.ts:90–120`, `178–206`).
- `/api/aion/chat` is a full 450-line authenticated route with model routing, streaming, tool-calling, and session management (`chat/route.ts:57–450`). Not a stub.
- `ChatInterface` is fully wired and active in `/aion`, the lobby, and the deal thread (`AionPageClient.tsx:73`, `LobbyClient.tsx:79`).
- The voice onboarding flow is **already implemented** as a chat-native sequence: `no_voice → no_example → no_guardrails → needs_test_draft → configured` (`prompts.ts:275–283`, `aion-chat-types.ts:247–257`). Each state produces a specific greeting with leading questions.
- `save_voice_config` is a live tool the chat model calls to persist voice fields in-conversation (`core.ts:118–144`).
- `/api/aion/draft-follow-up` is live and voice-aware — it injects `voice.description`, `voice.example_message`, and `voice.guardrails` into the generation prompt (`generate-draft.ts:52–86`).
- `learn-from-edit` is live — it extracts vocabulary patterns from draft edits and writes them back to `aion_config.learned` (`learn-from-edit/route.ts`).
- "Tune Aion's voice" exists as a sidebar overflow item that calls `resetAionVoiceConfig` (`AionSidebar.tsx:1043`).

**The blocker**: `applyVoiceDefaultIfEmpty` synthesizes a voice from the workspace name and sets `voice_default_derived: true` on every read (`aion-config-helpers.ts:35–45`). `getOnboardingState` returns `configured` for any config with `voice_default_derived: true` (`aion-chat-types.ts:248`). This means **every workspace skips the onboarding flow by default** — the 4-step voice sequence never fires unless the owner explicitly clicks "Tune Aion's voice" in the sidebar overflow, which is buried and undiscoverable.

## Intended state

Daniel opens `/aion` (or `/settings/aion`), sees a clear voice setup surface, writes how he talks to clients, pastes an example, states any guardrails, and immediately gets a grounded draft for a real deal. After that, every follow-up draft respects his voice. The discoverability gap, not the mechanics, is what's broken.

## The gap

- No voice setup entry point in `/settings/aion` — that page is entirely deal-card-beta consent UI.
- "Tune Aion's voice" is a single sidebar overflow item; new workspaces never reach it because `voice_default_derived` makes them appear `configured`.
- No nudge/banner on the Aion page when voice is synthesized (not user-set): Daniel has no signal that Aion is using a generic default.
- No direct "try a test draft" CTA after saving voice from outside the chat flow.

## Options

### Option A: Voice config section in `/settings/aion`

- **What it is:** Add an `AionVoiceConfigSection` component to the existing `AionSettingsView`. Three textarea fields (description, example message, guardrails) wired to `saveAionVoiceConfig`. A "Generate test draft" button after save that navigates to `/aion` with a URL param that triggers the `needs_test_draft` greeting. Show a `voice_default_derived` banner when the voice is synthesized, not user-set.
- **Effort:** Small — new section in an existing settings page, `saveAionVoiceConfig` already exists, form validation is trivial.
- **Main risk:** The test draft needs an active deal in the pipeline; if Daniel's workspace has no deals, the `draft_follow_up` tool returns nothing useful. Needs a graceful empty state.
- **Unlocks:** Daniel can deliberately sit down and configure Aion via a form, which matches the "3 paragraphs" mental model better than a conversational flow. Any team member who lands on `/settings/aion` can discover and update the voice.

### Option B: Surface an onboarding nudge on the Aion page

- **What it is:** When `voice_default_derived === true`, render a dismissible banner or prompt in `ChatInterface` or `AionFirstVisitPrompt` that says something like "Aion is using a default voice — teach it how you actually write." Clicking it calls `resetAionVoiceConfig` then sends a `[tune-voice]` synthetic message that forces `no_voice` greeting on the next load.
- **Effort:** Small-medium — requires detecting the synthesized-default state client-side (pass it from the server action), adding the banner component, and threading `resetAionVoiceConfig` into a user action.
- **Main risk:** The chat-native voice flow works conversationally but is slower for someone who wants to paste 3 paragraphs. If Daniel types a long description mid-chat, Aion has to parse it and call `save_voice_config` correctly — model behavior, not guaranteed.
- **Unlocks:** The existing conversational flow, which already handles the full sequence end-to-end, becomes discoverable without any new form infrastructure.

### Option C: Dedicated voice setup wizard at `/aion/setup`

- **What it is:** New route with a multi-step form: describe → example → guardrails → test draft. Entry point from a first-visit notice or from `/settings/aion`. Saves at each step via `saveAionVoiceConfig`. Final step auto-navigates to `/aion` and triggers a real draft.
- **Effort:** Large — new page, routing, step state, animation, server action wiring, and the same empty-state problem from Option A.
- **Main risk:** Adds a new FSD layer that will need maintenance. Overkill for a form with three fields.
- **Unlocks:** The cleanest possible onboarding UX, but the uplift relative to Option A is marginal for the added effort.

## Recommendation

**Option A** — add a voice config section to `/settings/aion`. This is the minimum addition that closes the discoverability gap without changing how the existing chat mechanics work. The form mental model matches what Daniel described: sit down, write three paragraphs, get a draft. The existing conversational flow can stay as the expert path (accessible via "Tune Aion's voice" in the sidebar).

One concrete addition on top of the basic form: a `voice_default_derived` awareness banner on the Aion page itself (a one-liner above the input, dismissible). Not a full Option B rewrite — just the signal. Without it, Daniel has no way to know the voice he's getting is generic.

Accept the tradeoff: if the workspace has no deals, the "Generate test draft" CTA should detect this and explain why rather than failing silently. The follow-up draft route already handles the empty-deal case on the server; the UI just needs to surface it.

## Next steps for Daniel

1. In `src/app/(dashboard)/settings/aion/AionSettingsView.tsx`, add an `AionVoiceConfigSection` below the main card. Three `<textarea>` fields using the existing `StagePanel` pattern. Wire to `saveAionVoiceConfig` from `aion-config-actions.ts`.
2. In the section header, check if `voice_default_derived === true` (expose it via the `WorkspaceFeatureState` type in `consent-actions.ts`). If so, show a muted line: "Aion is using a default voice based on your workspace name."
3. After a successful save, navigate to `/aion?setupVoice=1` — add a handler in `AionPageClient.tsx` that, when the param is present, calls `resetAionVoiceConfig` to clear `voice_default_derived`, strips the param, then lets the natural `needs_test_draft` greeting fire.
4. In `AionFirstVisitPrompt.tsx` or `ChatInterface.tsx`, check for `voice_default_derived` in the config (needs to be passed down or read via a `useAionConfig` hook) and render a one-line banner: "Aion is using a default voice — [update it in settings]."
5. Verify the `draft_follow_up` tool gracefully handles an empty deal list: read `core.ts` near the `draft_follow_up` tool and confirm it returns a human-readable message, not an error, when no deals are found.
6. Run `npm run test` to confirm no regressions in the `aion-config-actions` test suite before pushing.

## References

- `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` — current settings page
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:84–206` — `getAionConfig`, `saveAionVoiceConfig`, `resetAionVoiceConfig`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35–45` — `applyVoiceDefaultIfEmpty` (the shortcut that hides onboarding)
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247–257` — `getOnboardingState`
- `src/app/api/aion/chat/route/prompts.ts:275–283, 301–339` — onboarding forcing block + greeting states
- `src/app/api/aion/chat/tools/core.ts:118–144` — `save_voice_config` tool
- `src/app/api/aion/lib/generate-draft.ts:52–86` — voice injection into draft prompt
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:973–1049` — "Tune Aion's voice" entry point
- `src/app/(dashboard)/aion/AionPageClient.tsx` — Aion page client shell
