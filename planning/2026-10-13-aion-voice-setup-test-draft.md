# Aion voice setup and first draft — minimum path

_Researched: 2026-10-13 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

_Note: the queue entry reflects an earlier state. The codebase has shipped the core infrastructure. The open question is the UX entry point, not the backend._

## Current state

**`aion_config` already exists.** `public.workspaces.aion_config` is a live JSONB column. `getAionConfig()` and `getAionConfigForWorkspace()` read it; `saveAionVoiceConfig()`, `resetAionVoiceConfig()`, and `updateAionConfigForWorkspace()` write to it — all in `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:84`.

**Voice config is structured.** `AionVoiceConfig` has three fields: `description`, `example_message`, `guardrails`. `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:12`.

**New workspaces auto-get a synthesized voice.** `synthesizeDefaultVoice(workspaceName)` in `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:20` generates a placeholder from the workspace name. `applyVoiceDefaultIfEmpty()` (`line 35`) wraps it and sets `voice_default_derived: true`, which causes `getOnboardingState()` to return `'configured'` immediately — bypassing the 4-step chat onboarding entirely (`src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247`).

**Draft generation is live.** `POST /api/aion/draft-follow-up` exists, is authenticated, gates on tier, reads voice config from `aion_config`, and calls `generateFollowUpDraft()` (`src/app/api/aion/draft-follow-up/route.ts:60`). The draft builder injects `voice.description`, `voice.example_message`, and `voice.guardrails` directly into the system prompt (`src/app/api/aion/lib/generate-draft.ts:52`).

**4-step chat onboarding exists but is bypassed.** The chat route has a full `no_voice → no_example → no_guardrails → needs_test_draft → configured` state machine. The `save_voice_config` tool in `src/app/api/aion/chat/tools/core.ts:118` persists each step. But `voice_default_derived: true` on any fresh workspace short-circuits this.

**"Tune Aion's voice"** is a sidebar overflow action that calls `resetAionVoiceConfig()`, dropping the stored voice so the next chat re-enters the 4-step sequence. It's live but not prominent (`src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:975`).

**The "Brain tab" does not exist as a separate route.** The `/aion` page (`src/app/(dashboard)/aion/AionPageClient.tsx:66`) renders `ChatInterface` directly — the chat IS the brain. There is no dedicated voice setup screen.

## Intended state

The goal: owner opens Aion, spends two minutes describing how they talk to clients, and immediately sees a follow-up draft shaped by that voice. This moment is the proof-of-value — it converts a curious first visit into a configured workspace.

The design doc (section 26, not readable from this clone) likely describes a focused setup flow: freeform input → LLM extraction into structured fields → immediate test draft against a real queue item. The existing 4-step chat sequence approximates this but is conversational (one field at a time), not a single composition moment.

## The gap

- No UI entry point for voice setup beyond the sidebar "Tune Aion's voice" overflow, which most new owners won't find.
- New workspaces land in `configured` state immediately (synthesized voice, `voice_default_derived: true`), so the 4-step flow never surfaces.
- No draft preview tied to the voice setup moment — there is no "here's what a draft looks like with your voice" screen anywhere.
- `/settings/aion` covers consent, cadence, and memory backfill but has no voice form.

## Options

### Option A: Voice setup form in settings

- **What it is:** Add three labeled textareas (description, example_message, guardrails) to `/settings/aion`. Save button calls `saveAionVoiceConfig`. Show a static explainer for each field. No draft preview.
- **Effort:** Small — one new component, one existing action, one existing route.
- **Main risk:** Voice setup buried in settings is low-visibility. The "write and immediately see a draft" moment is absent.
- **Unlocks:** Explicit voice control without chat. Satisfies the infrastructure goal but not the UX goal.

### Option B: Trigger voice setup greeting on first Aion open

- **What it is:** When a workspace has only a synthesized voice (`voice_default_derived: true`), the Aion chat's landing state shows a specific first-open prompt: "Aion is using a default voice. Want to teach it how you actually write?" with a chip. Clicking the chip enters the existing 4-step chat flow. After `guardrails` is saved, the chat calls `draft-follow-up` against the first queue item and shows the result inline.
- **Effort:** Small — modify `AionLandingStarters.tsx` or the greeting chip logic to detect `voice_default_derived`, add a soft prompt; the 4-step flow and draft endpoint are already wired.
- **Main risk:** The 4-step flow asks one question at a time — it takes 4 turns to get a draft. Feels like work, not delight.
- **Unlocks:** First-visit setup with a real draft payoff, zero new backend code.

### Option C: Freeform voice setup card on the Aion landing page

- **What it is:** Show a `VoiceSetupCard` in the `/aion` empty state for workspaces with `voice_default_derived: true`. One large textarea: "How do you write to clients? Paste a real message, or describe your tone." On submit, POST to a new `/api/aion/parse-voice` endpoint (fast model, structured output) that extracts `description`, `example_message`, `guardrails`. Save via `saveAionVoiceConfig`. Then POST to `/api/aion/draft-follow-up` for the top queue item and display the draft inline. Done — one screen, one moment.
- **Effort:** Medium — new UI component (~120 lines), one new API endpoint (parse-voice, ~60 lines), one new client hook to chain save → draft.
- **Main risk:** LLM extraction can misparse thin input (a single sentence gives weak structured output). Need a graceful fallback when the model can't fill all three fields.
- **Unlocks:** The exact UX described in the queue entry. Converts new visits into configured workspaces with proof-of-value in under two minutes.

## Recommendation

**Build Option C.** The 4-step chat flow (Option B) solves the problem technically but breaks the moment: four conversational turns to reach a draft feels like a form split across four pages. The goal is a moment of delight — write once, see a draft — and that needs a single composition surface.

The two pieces are small. The parse-voice endpoint is ~60 lines: POST, auth check, one `generateObject` call with a Zod schema for `{ description, example_message, guardrails }`, return. The `VoiceSetupCard` is a textarea, a submit button, and two loading states (parsing → drafting). Errors degrade to asking the user to fill the three fields manually (effectively Option A as a fallback).

Accept the LLM-extraction risk: a weak parse still produces something, and the user sees it before it saves. A "look right?" confirmation step (two seconds) is enough to catch bad extractions without adding friction.

Option A should ship regardless as a settings fallback — it's an afternoon of work and gives power users fine-grained control.

## Next steps for Daniel

1. **Create `/api/aion/parse-voice/route.ts`** — `POST`, auth, call `generateObject` (Vercel AI SDK) with model `getModel('fast')`, schema `z.object({ description: z.string(), example_message: z.string(), guardrails: z.string() })`, prompt: the user's raw text. Return parsed fields. (~60 lines)
2. **Build `VoiceSetupCard.tsx`** in `src/app/(dashboard)/(features)/aion/components/` — textarea, submit, inline states for parsing and drafting, confirmation summary of extracted fields, then a call to `draft-follow-up` for the first queue item. Render as a `stage-panel` card.
3. **Wire it into `AionLandingStarters.tsx`** — check if `voice_default_derived === true` (fetch via `getAionConfig` in the parent server component or a small client fetch on mount) and render `VoiceSetupCard` instead of the default starters.
4. **Add voice form to `/settings/aion`** — three textareas pre-filled from `getAionConfig().voice`, save calls `saveAionVoiceConfig`. Acts as the edit surface after initial setup.
5. **Remove the `voice_default_derived` bypass from `getOnboardingState`** once a workspace explicitly saves voice (`saveAionVoiceConfig` already clears the flag — no code change needed here, just confirm the test in `aion-config-actions.test.ts:98`).
6. **Test end-to-end**: add a workspace with no explicit voice, open `/aion`, confirm `VoiceSetupCard` shows, write two sentences, submit, confirm draft appears referencing a real queue item.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — `AionVoiceConfig`, `saveAionVoiceConfig`, `getAionConfigForWorkspace`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — `synthesizeDefaultVoice`, `applyVoiceDefaultIfEmpty`
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — `getOnboardingState`, 5-state machine
- `src/app/api/aion/draft-follow-up/route.ts` — live draft endpoint
- `src/app/api/aion/lib/generate-draft.ts` — `generateFollowUpDraft`, voice injection
- `src/app/(dashboard)/aion/AionPageClient.tsx` — landing page entry point
- `src/app/(dashboard)/(features)/aion/components/AionLandingStarters.tsx` — where VoiceSetupCard would mount
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:975` — "Tune Aion's voice" overflow
