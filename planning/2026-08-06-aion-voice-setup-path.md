# Aion Phase A: Minimum path to voice setup + first real draft

_Researched: 2026-08-06 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

**The primer is significantly outdated.** The following is built and live:

- `workspaces.aion_config` column exists as JSONB and is fully operational. `getAionConfig()` reads from it at `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:84`. `saveAionVoiceConfig()` writes to it at `:178`.
- `AionConfig` has a full `voice` sub-object: `{ description, example_message, guardrails }`. (`aion-config-actions.ts:12–16`)
- `POST /api/aion/draft-follow-up` (`src/app/api/aion/draft-follow-up/route.ts`) is live, authenticated, tier-gated, and injects `voice.description`, `voice.example_message`, and `voice.guardrails` into the system prompt via `buildFollowUpPrompt()` (`src/app/api/aion/lib/generate-draft.ts:52`).
- `POST /api/aion/learn-from-edit` (`src/app/api/aion/learn-from-edit/route.ts`) is live — extracts vocabulary swaps and patterns from draft edits and persists them to `aion_config.learned`.
- The Aion page (`/aion`) renders a full chat interface, not a paused stub. `AionPageClient.tsx:66` renders `<ChatInterface viewState="chat" />`.
- A 4-step onboarding state machine exists: `no_voice → no_example → no_guardrails → needs_test_draft → configured` (`src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:225`). At each step the chat route surfaces a targeted question and, on the last step, calls `draft_follow_up` to show a test draft in chat.
- **However:** Wk 11 §3.8 synthesizes a default voice from the workspace name (`aion-config-helpers.ts:20`) and sets `voice_default_derived: true`. `getOnboardingState()` returns `'configured'` whenever this flag is set (`aion-chat-types.ts:248`). Every workspace therefore skips the 4-step onboarding entirely and lands in pull-mode chat immediately.
- The only exposed affordance to retrigger onboarding is "Tune Aion's voice" in the Sidebar settings overflow (`AionSidebar.tsx:998`), which calls `resetAionVoiceConfig()` — dropping the stored voice — and then requires the user to start a new chat.
- `AionSettingsView.tsx` (`src/app/(dashboard)/settings/aion/`) has no voice configuration section — it shows card-beta consent, cadence learning, memory backfill, and pending requests only.

## Intended state

Daniel opens Aion, writes 3 paragraphs in a form (description of style, example message, guardrails), submits, and immediately sees a follow-up draft for a real deal that reflects his voice. No multi-turn chat required for initial setup. Subsequent chat interactions build on the configured voice.

## The gap

- No form UI for voice config. `saveAionVoiceConfig()` is wired but has no user-facing entry point except the chat-based 4-step onboarding.
- The synthesized default (`voice_default_derived: true`) bypasses onboarding for all workspaces, making it impossible to stumble into voice setup naturally.
- `AionSettingsView.tsx` has no voice section.
- The test-draft step in onboarding requires a pending deal; new workspaces may have none.

## Options

### Option A: Voice form in /settings/aion

- **What it is:** Add a three-textarea form (description, example message, guardrails) + "Save voice" button to `AionSettingsView.tsx`. Below it, a "Generate test draft" button that calls `/api/aion/draft-follow-up` against the first pending follow-up deal and previews the result in a read-only card on the settings page.
- **Effort:** Small — `saveAionVoiceConfig()` and the draft route are already wired. The form is a new component plus one fetch.
- **Main risk:** Settings is not where Daniel naturally goes to configure a conversational AI. Discovery requires knowing to look there. The "3 paragraphs → immediate draft" flow feels buried.
- **Unlocks:** A stable, persistable voice config that the draft route and chat system prompt both consume immediately.

### Option B: Inline voice setup on the /aion page (form-first)

- **What it is:** Read `aion_config` server-side in the Aion page layout. When `voice_default_derived === true` (synthesized, not explicitly saved), render a collapsible `VoiceSetupPanel` above the chat input — three textareas + a "Save and generate a test draft" button. On submit: `saveAionVoiceConfig()`, then call `/api/aion/draft-follow-up` and render the draft as the first chat message.
- **Effort:** Medium — requires a new server prop (`isVoiceDefault`) threaded into `AionPageClient.tsx`, plus the panel component. Draft rendering can reuse the existing `draft_preview` message type from the chat route.
- **Main risk:** Adds visual complexity to the chat-entry surface. Must not obscure the chat input for configured workspaces.
- **Unlocks:** The exact flow Daniel described — write → submit → draft in one place.

### Option C: Prominent "Set up your voice" CTA on the /aion landing pane

- **What it is:** When `voice_default_derived === true`, inject a special starter button in the landing starters list: "Set up how Aion sounds." Clicking it resets the voice config (calls `resetAionVoiceConfig()`) and auto-sends the chat onboarding trigger, starting the existing 4-step chat conversation.
- **Effort:** Small — `AionLandingStarters.tsx` already accepts custom starters; the onboarding chat flow already exists.
- **Main risk:** The 4-step flow is sequential (one question per turn), not the "write 3 paragraphs at once" experience in the question. Takes 4–6 chat turns instead of one submit. Also still requires `resetAionVoiceConfig()` before the 4-step flow works.
- **Unlocks:** Voice setup discovery without new UI components; benefits from the existing LLM-guided question sequence.

## Recommendation

**Option B.** Build the inline `VoiceSetupPanel` on the /aion page.

Option A puts voice config in the wrong place — settings is for governance, not setup. Option C requires multiple chat turns and the user never gets the "write → immediate draft" moment the question describes.

Option B threads a narrow new prop through two files (`AionPageClient.tsx` and whatever server component wraps it), adds one new `VoiceSetupPanel` component (~80 lines), and one fetch call. Everything else — `saveAionVoiceConfig()`, `/api/aion/draft-follow-up`, the `draft_preview` message type — is live. The main design constraint is that the panel must hide once voice is saved (i.e., once `voice_default_derived` becomes `false` after an explicit `saveAionVoiceConfig()` call), and it should not render for workspaces that have already configured voice explicitly.

One implementation detail: the test draft needs a deal. Fetch the first item from `ops.follow_up_queue` for the workspace. If the queue is empty, show the draft panel with a "No pending follow-ups yet — your voice is saved. Start a new chat to use it" message rather than a draft preview. Do not invent a fake context.

## Next steps for Daniel

1. In `src/app/(dashboard)/aion/` (or wherever the Aion page server component lives), read `aion_config.voice_default_derived` server-side and pass `isVoiceDefault: boolean` as a prop into `AionPageClient`.
2. Create `src/app/(dashboard)/(features)/aion/components/VoiceSetupPanel.tsx` — three `<textarea>` fields matching `AionVoiceConfig` shape, a submit handler calling `saveAionVoiceConfig()`, and on success fetching `/api/aion/draft-follow-up` with the top pending deal.
3. In `AionPageClient.tsx`, render `<VoiceSetupPanel />` above the chat section when `isVoiceDefault === true`; hide it on save (local state).
4. For the deal context in the test draft: add a lightweight server action to fetch the first `ops.follow_up_queue` row for the workspace. Reuse the existing `AionDealContext` shape from `follow-up-actions.ts`.
5. Wire the draft result into a `draft_preview` message card (type already exists in `AionMessageContent`), rendering it read-only so Daniel can see the voice in action without committing a send.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — `AionConfig`, `saveAionVoiceConfig`, `getAionConfig`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — `synthesizeDefaultVoice`, `applyVoiceDefaultIfEmpty`
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts` — `getOnboardingState`, `OnboardingState`, `AionMessageContent`
- `src/app/api/aion/draft-follow-up/route.ts` — authenticated draft generation
- `src/app/api/aion/lib/generate-draft.ts` — `buildFollowUpPrompt`, voice injection
- `src/app/(dashboard)/aion/AionPageClient.tsx` — Aion page client shell
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:998` — existing "Tune Aion's voice" flow
- `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` — current settings surface (no voice section)
