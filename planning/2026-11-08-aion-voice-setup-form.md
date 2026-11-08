# Aion Phase A: Voice Setup + First Real Draft

_Researched: 2026-11-08 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

**How the agent understood it:** The question's two stated premises are outdated — both blockers have already been resolved. The real gap is a UX one: a form that closes the loop between voice configuration and a first draft in a single screen.

## Current state

The codebase has advanced significantly past the planning primer's snapshot (which was accurate as of ~April 2026). Key findings:

**`aion_config` exists and is in production.** `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:50–74` defines `AionConfig` with `voice: AionVoiceConfig` (`description`, `example_message`, `guardrails`), stored as JSONB on `public.workspaces.aion_config`. Read and write paths (`getAionConfig`, `saveAionVoiceConfig`, `updateAionConfigForWorkspace`) are all live.

**The chat route is fully wired.** `src/app/api/aion/chat/route.ts` is a 464-line authenticated, rate-limited, streaming handler — not the 16-line stub the primer described. It reads `aionConfig.voice` and injects it into every system prompt via `src/app/api/aion/chat/route/prompts.ts:98–100`.

**A 5-state onboarding machine exists.** `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:225–257` defines `OnboardingState`: `no_voice → no_example → no_guardrails → needs_test_draft → configured`. The chat route checks this state each turn and the system prompt signals it to the LLM, which then walks the user through voice setup conversationally.

**Draft generation uses voice.** `src/app/api/aion/draft-follow-up/route.ts:53–63` loads `aionConfig.voice` and passes it to `generateFollowUpDraft` in `src/app/api/aion/lib/generate-draft.ts`. The draft prompt is voice-aware.

**`learn-from-edit` is live.** `src/app/api/aion/learn-from-edit/route.ts` extracts vocab swaps and patterns from draft edits and writes them back to `aion_config.learned`.

**The Brain tab is live.** `src/app/(dashboard)/aion/AionPageClient.tsx` renders `ChatInterface` with no pause gate.

**What is missing:** `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` covers only consent (Aion card beta) and cadence learning — it has no voice configuration form. Voice setup only happens through the multi-turn chat onboarding, which requires 3–4 separate turns to populate the three fields.

## Intended state

Per the question's stated goal: Daniel opens the Brain tab, writes three paragraphs about how he talks to clients, and immediately sees an Aion-generated follow-up draft that uses that voice. This is a single-screen setup + test experience. The description maps to a voice config form with one rich text area (or three labeled fields), a save action, and an immediate "here's what Aion would draft for your top pending deal" preview.

## The gap

- Settings → Aion has no voice config section. The fields (`description`, `example_message`, `guardrails`) are schema-ready but have no input UI.
- Voice setup is conversational only. Three separate chat turns each asks for one field. That's fine for gradual onboarding but doesn't match the described "write once, see draft" intent.
- After voice is set via chat, there is no "try it on a real deal" affordance — the user has to know to ask Aion for a draft explicitly.
- The `needs_test_draft` onboarding state exists but only signals the LLM; it doesn't programmatically trigger a draft against a pending deal.

## Options

### Option A: Status quo — rely on the chat onboarding
- **What it is:** No new form. Document that voice setup is already handled by the Aion chat onboarding flow. Tell Daniel to open `/aion`, start a fresh chat (or trigger reset via sidebar overflow → "Tune Aion's voice"), and let the 4-step conversation walk him through it.
- **Effort:** Small — no code, just a note.
- **Main risk:** The described experience (3 paragraphs → immediate draft) doesn't exist. The chat asks one question at a time and the draft doesn't auto-fire after the last step.
- **Unlocks:** Nothing new.

### Option B: Voice setup form in Settings → Aion (recommended)
- **What it is:** Add a `VoiceConfigSection` component to `AionSettingsView`. Three labeled textareas: "How you communicate" (`description`), "Example message" (`example_message`), "Strict rules" (`guardrails`). Save via the existing `saveAionVoiceConfig` server action. After save, trigger a draft preview: call `draft-follow-up` against the top deal in `ops.follow_up_queue` for the workspace and display it inline.
- **Effort:** Medium — one new component (~150 lines), one new page section, one draft-preview fetch on save.
- **Main risk:** The draft preview requires a deal to exist in the follow-up queue. Need a graceful empty state ("No pending follow-ups to preview against — your drafts will reflect this voice when one appears").
- **Unlocks:** Daniel can set voice in 2 minutes at `/settings/aion`. Future onboarding wizard can link here. The described goal works end-to-end.

### Option C: "First visit" mode in the Brain tab
- **What it is:** When `onboardingState === 'no_voice'`, replace the blank chat with an inline setup pane: a single multi-line textarea ("Tell Aion how you communicate with clients — 2–3 paragraphs is ideal"), a save button, and a draft preview. After save, dissolve into the normal chat. Voice config is parsed from free text by the LLM (or simply stored as `voice.description` verbatim, with `example_message` and `guardrails` left empty to fill later).
- **Effort:** Large — requires a new view state in `ChatInterface` (or a sibling component), and free-text-to-voice-fields parsing is ambiguous.
- **Main risk:** Parsing 3 unstructured paragraphs into `description` / `example_message` / `guardrails` is fragile. Single textarea also loses the structured fields that the draft prompt depends on.
- **Unlocks:** Highest coherence with the Brain tab as the entry point, but overkill for a first pass.

## Recommendation

**Option B.** Add the voice config form to Settings → Aion. It's the right home for workspace configuration — it already lives next to consent and cadence. The fields are schema-ready. The save action exists. The draft preview ties the config change to a concrete result in one screen, closing the loop the question describes.

The form doesn't need to be elaborate: three labeled textareas, a save button, and a draft preview card that fires against the top follow-up queue deal. That's ~150 lines of React plus a server fetch. Keep the chat onboarding as the secondary path — it handles the gradual discovery case and the case where there's no settings page access.

Don't attempt Option C yet. The free-text parsing is fuzzy and the Brain tab already works as a conversation surface. Build the form first; if the first-visit case proves important later, the form can be linked from the chat's `no_voice` state.

## Next steps for Daniel

1. Open `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` and find where to slot the new `VoiceConfigSection` — after the main card beta status panel, before cadence learning.
2. Build `VoiceConfigSection` as a new component in the same directory. Three `<textarea>` fields bound to `description`, `example_message`, `guardrails`. Load initial values via `getAionConfig()` (server component) or `useTransition` + `getAionConfig` action.
3. Wire save to `saveAionVoiceConfig(voice)` from `aion-config-actions.ts`. It already handles the system-client write.
4. After save, fetch a draft preview: call `POST /api/aion/draft-follow-up` with the top deal from `ops.follow_up_queue` (query: `SELECT deal_id FROM ops.follow_up_queue WHERE workspace_id = $1 AND status = 'pending' LIMIT 1`). Display the draft inline with a "This is how Aion would follow up right now" label.
5. Add an empty state for when no pending follow-up exists: "No pending follow-ups — your drafts will use this voice when one appears."
6. Test: set voice, save, confirm draft preview reflects the voice description.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — `AionConfig`, `saveAionVoiceConfig`
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:225–257` — `OnboardingState`, `getOnboardingState`
- `src/app/api/aion/chat/route/prompts.ts:97–100` — voice injection into system prompt
- `src/app/api/aion/draft-follow-up/route.ts` — draft generation endpoint (voice-aware)
- `src/app/api/aion/lib/generate-draft.ts` — `buildFollowUpPrompt` (voice fields used directly)
- `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` — settings page to extend
