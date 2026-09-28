# Aion voice setup: form-first path to first draft

_Researched: 2026-09-28 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

_Note: This question was authored in April 2026. The codebase has moved considerably since — the research below reflects the September 2026 state._

## Current state

**`aion_config` exists and is in use.** `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:93` reads and writes `public.workspaces.aion_config` directly. The column is live.

**The chat route is not a stub.** `src/app/api/aion/chat/route.ts:59` is a full authenticated route using `streamText` from the Vercel AI SDK, with tier gating, tool calling, and streaming. The "16-line GPT-4-turbo stub" described in the primer has been replaced.

**A 5-state onboarding machine is wired end-to-end.** `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` defines `getOnboardingState`: `no_voice → no_example → no_guardrails → needs_test_draft → configured`. `src/app/api/aion/chat/route/prompts.ts:301` (`buildGreeting`) returns state-specific greetings and suggestion chips for each step. `src/app/api/aion/chat/tools/core.ts:118` defines `save_voice_config` which persists to DB and refreshes config in-turn.

**The draft route exists.** `src/app/api/aion/draft-follow-up/route.ts:1` — authenticated, tier-gated, calls `generateFollowUpDraft` from `src/app/api/aion/lib/generate-draft.ts:25` which uses the fast model with voice config injected into the system prompt.

**The `saveAionVoiceConfig` server action is ready.** `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:178` — accepts `AionVoiceConfig { description, example_message, guardrails }` and writes to `public.workspaces` via the authenticated server client.

**No dedicated "Brain tab" or voice setup form exists.** The CadenceLearningToggle docs mention the Brain tab as a future home (`src/app/(dashboard)/(features)/aion/components/CadenceLearningToggle.tsx:14`). The `/settings/aion` page (`src/app/(dashboard)/settings/aion/AionSettingsView.tsx`) covers deal card beta consent only — no voice config section.

## Intended state

Daniel opens an Aion surface, writes 3 paragraphs about his client communication style (one for tone, one for example, one for rules), and within 2 clicks sees a drafted follow-up for a real deal in his voice. The whole loop should complete before the next cup of coffee gets cold.

The system already handles the back-half (voice → draft). What's missing is the front-half: a surface where Daniel can write all 3 fields at once instead of through 3+ conversational turns.

## The gap

- No form where all 3 voice fields (description, example_message, guardrails) can be entered in one shot
- The existing conversational onboarding works but requires 3-5 turns and two page reloads before reaching `needs_test_draft`
- `/settings/aion` has no voice section, so there's no obvious place to go "set up my voice"
- The `needs_test_draft` greeting chip ("Yes, try one") correctly fires a draft once voice is configured — the path from voice → draft works; the path to voice is slow

## Options

### Option A: Add voice setup section to `/settings/aion`

- **What it is:** Add a three-field form (textarea for each: description, example message, guardrails) to `AionSettingsView.tsx`. On submit, call `saveAionVoiceConfig`. Show a "Go to Aion" CTA after save — the `needs_test_draft` greeting fires immediately and offers a draft chip.
- **Effort:** Small — `saveAionVoiceConfig` already exists; only new code is the form UI in one file.
- **Main risk:** Discovery: Daniel has to navigate to Settings → Aion to find it, not the chat page.
- **Unlocks:** A clean "configure once, use forever" settings path; makes voice config reviewable and editable at any time.

### Option B: Inline voice setup card in the Aion chat empty state

- **What it is:** In `ChatInterface.tsx`'s empty-state branch (line 358), check `onboardingState !== 'configured'` and render a `VoiceSetupCard` component with the 3 textareas above the chat input. On submit → `saveAionVoiceConfig` → optimistic state update → the chat session starts as `needs_test_draft` and immediately offers a draft.
- **Effort:** Medium — new component, state wiring between the form and the chat session lifecycle, coordinating the optimistic update with the greeting reload.
- **Main risk:** Architectural complexity: the empty state currently belongs to the chat flow; putting a form there creates a hybrid surface that mixes settings and conversation.
- **Unlocks:** Exactly the experience Daniel described — open the Aion tab, see the form, write, draft appears.

### Option C: One-shot conversational voice capture

- **What it is:** Change the `no_voice` greeting to ask for everything at once — "Tell me your communication style, drop an example message, and any rules you have — all in one message." Update the system prompt so Aion extracts all three fields from a single paragraph and calls `save_voice_config` with all three set, immediately advancing to `needs_test_draft`.
- **Effort:** Small — prompt changes only; no new UI.
- **Main risk:** Extraction quality: a short or vague paragraph leaves fields empty; users who write only 2 sentences still end up with partial config and stay stuck in onboarding.
- **Unlocks:** Zero UI work; any voice Daniel types is captured in one turn.

## Recommendation

**Ship Option A.** It's the smallest blast radius — one file, one form, one existing server action — and it delivers exactly what the question asks: a surface where Daniel writes 3 paragraphs and immediately reaches the test-draft step.

Option B is the "right" long-term UX but adds non-trivial state complexity to ChatInterface, which is already the most layered component in the app. That complexity is worth paying later, once the voice config flow is validated and the "Brain tab" surfaces as a real product concept.

Option C is tempting for its simplicity but is fragile: if Daniel writes one short sentence about his style, Aion silently underspecifies the config, the draft suffers, and Daniel blames the feature, not the input form.

With Option A: Daniel goes to Settings → Aion, fills in 3 textareas, hits save, is redirected (or clicks) to `/aion`. Aion opens with the `needs_test_draft` greeting and immediately offers "Yes, try one." Total time: under 5 minutes, 0 new routes, 1 existing server action, 1 section added to an existing settings page.

## Next steps for Daniel

1. Open `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` — add a `VoiceSetupPanel` section below the existing cadence toggle section.
2. The panel needs 3 labeled textareas: "Your communication style", "An example message you've sent", "Rules (things Aion should always or never do)". Pre-fill from `aion_config.voice` if it exists.
3. Wire the submit button to `saveAionVoiceConfig` (already exported from `aion-config-actions.ts`). On success, show a "Open Aion" button that navigates to `/aion`.
4. The `/settings/aion/page.tsx` server component already fetches workspace state — add a `getAionConfig()` call to pass the existing voice values into the new panel as initial values.
5. Test: clear `aion_config` in the DB, open `/settings/aion`, fill in the form, click save, navigate to `/aion` — confirm the `needs_test_draft` greeting fires and tapping "Yes, try one" produces a draft.
6. Optional: add a "Tune your voice" link from the AionSidebar overflow (already has a `resetAionVoiceConfig` affordance) pointing to `/settings/aion#voice`.

## References

- `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` — settings page to extend
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:178` — `saveAionVoiceConfig` server action
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — `getOnboardingState` machine
- `src/app/api/aion/chat/route/prompts.ts:338` — `needs_test_draft` greeting (draft offer chips)
- `src/app/api/aion/lib/generate-draft.ts` — `generateFollowUpDraft` (already production-ready)
- `src/app/(dashboard)/(features)/aion/components/CadenceLearningToggle.tsx:14` — "Brain tab" mention as future home
