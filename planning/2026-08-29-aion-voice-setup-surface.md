# Aion voice setup — minimum path to voice config + test draft

_Researched: 2026-08-29 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture. Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? The goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

**Note on premise:** This question was written when the primer was current (April 2026). The codebase has moved. The real research question, restated honestly: _what UI surface is missing to collect voice config and show a test draft?_ This doc answers that version.

## Current state

`aion_config` is a live column on `public.workspaces` — typed as `Json` in `src/types/supabase.ts:7782` (Row), `7825` (Insert), `7868` (Update). It is not missing.

The `AionVoiceConfig` shape — `description`, `example_message`, `guardrails` — is defined at `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:12–16`. `saveAionVoiceConfig(voice)` lives at line 178 of the same file; `getAionConfig()` reads from the active workspace at line 84.

`OnboardingState` is a 5-state machine (`no_voice → no_example → no_guardrails → needs_test_draft → configured`) in `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:225–256`. When `voice_default_derived === true`, `getOnboardingState` short-circuits to `configured` (line 248).

`/api/aion/draft-follow-up/route.ts` exists (74 lines), is fully authenticated (line 26), tier-gated (line 44), kill-switch-checked (line 53), and generates a draft via `generateFollowUpDraft({ context, voice })` from `src/app/api/aion/lib/generate-draft.ts:25`. The prompt builder at line 52 of that file needs real deal context — a dealId, proposal details, and recent follow-up log.

`applyVoiceDefaultIfEmpty` in `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35` synthesizes a workspace-name-derived voice when none is stored, which means new workspaces get a default without error.

What does **not** exist: a voice setup form anywhere in the UI. The settings page at `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` covers consent and cadence-learning controls only — no `description`/`example_message`/`guardrails` fields. The "Brain tab" is referenced only in a comment at `src/app/(dashboard)/(features)/aion/components/CadenceLearningToggle.tsx:14`; there is no brain directory or tab component.

## Intended state

Daniel opens a page, writes 3 paragraphs covering his voice (`description`), a sample message (`example_message`), and what Aion should never say (`guardrails`). On save, Aion generates a follow-up draft using that voice and a real open deal, renders it inline for review. The `OnboardingState` machine tracks which fields are filled.

## The gap

- No voice setup form exists (no UI for `description`, `example_message`, `guardrails`)
- No test draft trigger exists post-save
- `draft-follow-up` needs a real `dealId` in context — needs a "fetch most recent open deal" step or graceful fallback

## Options

### Option A: Voice setup section inside `/settings/aion`

- **What it is:** Add a `<VoiceSetupSection />` component to `AionSettingsView.tsx` — three textareas, a save button calling `saveAionVoiceConfig()`, then a test draft call to `/api/aion/draft-follow-up` using the most recent open deal, rendered with the existing `DraftPreviewCard`.
- **Effort:** Small — no new routes or pages. Every piece of infra (the action, the route, the card) already exists.
- **Main risk:** The settings page is mentally the "admin consent" zone, not a creative setup flow — may feel out of place.
- **Unlocks:** Voice config live and test draft visible in one session.

### Option B: Onboarding prompt gate in the Aion chat (`ChatInterface`)

- **What it is:** When `getOnboardingState(config)` returns `no_voice`, show a structured prompt above `AionInput` — "Tell me how you talk to clients." Collect the response, call a new `/api/aion/extract-voice-fields` endpoint to parse it into the 3 typed fields, save, chain a draft.
- **Effort:** Medium — new extraction endpoint, chat-flow integration, possible multi-turn handling.
- **Main risk:** Parsing freeform paragraphs into `description` / `example_message` / `guardrails` via LLM is unreliable. A misclassified guardrail silently corrupts voice quality from day one.
- **Unlocks:** Conversational onboarding that fits the Aion mental model.

### Option C: Dedicated `/settings/aion/voice` stepper page

- **What it is:** New page at `src/app/(dashboard)/settings/aion/voice/page.tsx` with a 3-step form matching `OnboardingState`. Each step saves immediately (preserving partial completion). Final step fetches the most recent open deal and renders a live draft.
- **Effort:** Medium — new page, step navigation, step-by-step save logic, deal-fetch for test.
- **Main risk:** Three separate steps for three fields is heavier UX than warranted. More surface to maintain.
- **Unlocks:** `OnboardingState` machine put to real use; clear entry point to reference in onboarding docs later.

## Recommendation

Option A. The settings page already fetches and hydrates `aion_config` — adding a voice form section is a focused, low-risk task that reuses every piece of existing infrastructure without new routes or parsing risks. The "Brain tab" framing in the queue item was written before the infra existed; the infra is now present, so the gap is purely the form surface.

One dependency to resolve before building: confirm the most recent open deal fetched for the test draft has enough context (at minimum a proposal record and one prior follow-up log entry) for `buildFollowUpPrompt` in `generate-draft.ts:52` to produce a meaningful draft. If no deal qualifies, show "Voice saved — your first draft will appear on your next open deal" rather than blocking.

Accept the tradeoff: voice setup will live in settings (not a dedicated "Brain" panel) for now. That's fine — correctness of the voice config matters more than where the form lives. A dedicated surface is Option C when there's time.

## Next steps for Daniel

1. Read `aion-config-actions.ts:12–48` — confirm the 3 fields (`description`, `example_message`, `guardrails`) match what you want to collect, and check any length/format constraints noted in the action.
2. In `src/app/(dashboard)/settings/aion/page.tsx`, read what props are passed to `AionSettingsView` and add `voiceConfig` (from `getAionConfig()`) to the server-side load.
3. Create `src/app/(dashboard)/settings/aion/VoiceSetupSection.tsx` — 3 textareas, a save button wired to `saveAionVoiceConfig()` via `useTransition`.
4. After save, fetch the most recent open deal (reuse `get-aion-card-for-deal.ts` or a direct query), POST to `/api/aion/draft-follow-up`, render the result with `DraftPreviewCard`.
5. Mount `<VoiceSetupSection initialVoice={voiceConfig?.voice} />` at the bottom of `AionSettingsView.tsx`.
6. Optional: add `OnboardingState` progress chips at the top of the section so it's clear which fields are set vs. still default-derived.

## References

- `src/types/supabase.ts:7782` — `aion_config` column on workspaces
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:12–48` — `AionVoiceConfig`, `AionConfig` types
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:178` — `saveAionVoiceConfig()`
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:225–256` — `OnboardingState` machine
- `src/app/api/aion/draft-follow-up/route.ts` — authenticated draft generation route
- `src/app/api/aion/lib/generate-draft.ts:25,52` — `generateFollowUpDraft`, `buildFollowUpPrompt`
- `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` — existing settings page (no voice form)
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35` — `applyVoiceDefaultIfEmpty`
- `src/app/(dashboard)/(features)/aion/components/CadenceLearningToggle.tsx:14` — only mention of "Brain tab"
