# Unblocking Aion Voice Setup + First Real Draft

_Researched: 2026-08-30 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

`public.workspaces.aion_config` DOES exist — the queue item's premise is stale. The column is live and typed as `Json` in `src/types/supabase.ts:7782`. The config shape is `AionConfig` defined at `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:50–74`, with `voice: AionVoiceConfig` (three fields: `description`, `example_message`, `guardrails`).

The complete infrastructure for voice setup + draft generation already exists:

- `getOnboardingState()` at `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` implements a 4-step forcing block: `no_voice → no_example → no_guardrails → needs_test_draft → configured`. The chat route at `src/app/api/aion/chat/route.ts:122` reads this and injects `=== ONBOARDING ===` blocks into the system prompt.
- `save_voice_config` chat tool at `src/app/api/aion/chat/tools/core.ts:118` saves any of the three fields on each turn.
- `draft_follow_up` chat tool at `src/app/api/aion/chat/tools/core.ts:318` generates a real draft for the top-priority deal in the queue (or a deal from page context).
- `saveAionVoiceConfig()` server action at `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:178` merges and persists voice config.
- `buildFollowUpPrompt()` at `src/app/api/aion/lib/generate-draft.ts:52` already injects all three voice fields into the system prompt before generation.

Two bugs block the flow entirely:

**Bug 1 — synthesis bypass.** `applyVoiceDefaultIfEmpty()` at `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35` synthesizes a generic default from the workspace name and sets `voice_default_derived: true` on every read when no explicit voice is stored. `getOnboardingState()` at line 248 returns `'configured'` immediately when it sees `voice_default_derived`, so the 4-step chat forcing block never fires — for any workspace, ever.

**Bug 2 — empty queue failure.** The `draft_follow_up` tool requires either page context (an open deal) or entries in the follow-up queue. During initial onboarding the queue is likely empty, and the tool returns `{ error: 'No deals in the follow-up queue.' }` at `src/app/api/aion/chat/tools/core.ts:334`. The `needs_test_draft` step cannot complete.

The "Brain tab" referred to in the queue item maps to the `/aion` chat page (`src/app/(dashboard)/aion/AionPageClient.tsx`). There is no separate "Brain" tab — the primer note was describing a pre-existing unwired state that has since shipped. The chat interface is live.

## Intended state

Daniel opens the Aion chat, triggers "Tune Aion's voice" (sidebar overflow), and the chat guides him through describing his communication style (free-form, across several turns). Aion saves each piece. After all three fields are captured, Aion generates a real draft using a representative deal — or a synthetic stand-in if no deals exist — respecting the voice Daniel just described. He reviews it, confirms, and the onboarding marks complete. Every subsequent draft silently uses his configured voice.

## The gap

- `getOnboardingState` returns `'configured'` for all workspaces due to the `voice_default_derived` bypass, so no user ever hits the 4-step flow.
- `resetAionVoiceConfig()` clears the stored voice, but the next `getAionConfig()` call re-synthesizes and re-sets `voice_default_derived: true` in memory — so even after a reset, `getOnboardingState` immediately returns `'configured'` again.
- `draft_follow_up` has no synthetic fallback; it fails when the follow-up queue is empty.
- No discovery surface: "Tune Aion's voice" is buried in the AionSidebar header overflow and invisible to new users.

## Options

### Option A: Fix the two blocking bugs in the existing chat flow

- **What it is:** Two targeted changes. (1) In `getOnboardingState`, stop treating `voice_default_derived` as `'configured'` — return `'no_voice'` instead, so the 4-step chat flow fires for any workspace without explicit voice. (2) Add a hardcoded synthetic `AionDealContext` fallback to `draft_follow_up` when the queue is empty and onboarding state is `needs_test_draft` — a representative sample deal (wedding, inquiry stage, proposal sent 5 days ago, one contact) that lets Aion show a real draft without needing live data.
- **Effort:** Small — under 30 lines across `aion-chat-types.ts` and `core.ts`.
- **Main risk:** Existing workspaces that have been happily using the synthesized default will suddenly see the 4-step onboarding next time they reset their voice. That is intentional but may surprise them.
- **Unlocks:** The complete voice setup → draft preview loop, using only code that already exists and is tested.

### Option B: Voice setup form in settings + standalone preview endpoint

- **What it is:** Add a three-textarea form to `/settings/aion/` (description, example, guardrails), with labels that explain each field. Add a "Preview a draft" button that calls a new `/api/aion/voice-preview` endpoint — identical to `draft-follow-up` but accepts a `previewVoice` payload and falls back to synthetic deal data when no live deal is supplied. Wire submit to `saveAionVoiceConfig`.
- **Effort:** Medium — new form component, new endpoint, wiring.
- **Main risk:** Parallel voice entry points (chat and form) can diverge — user sets voice via form but chat still thinks it needs to run onboarding, or vice versa. Needs `onboarding_state = 'complete'` written on form submit to close the loop.
- **Unlocks:** A transparent, form-based UI; no chat interaction required; clear display of what Aion will use.

### Option C: Free-form prose → structured fields via LLM

- **What it is:** New `/api/aion/parse-voice` endpoint that accepts a block of free-form text and returns the three structured fields extracted by the model. UI: a single large textarea labeled "Describe how you talk to clients," a parse button, a review/edit step, then a "Generate sample draft" button.
- **Effort:** Large — parsing endpoint, multi-step UI, field review, error states, test coverage.
- **Main risk:** Extraction quality varies; a misread description silently degrades all future drafts. The review step helps but adds friction.
- **Unlocks:** The "write 3 paragraphs" UX exactly as the queue item describes.

## Recommendation

**Option A.** The chat-based onboarding is already fully built, tested, and wired through to draft generation. The entire gap is two bugs — one line and one short fallback function — not missing features. Fixing them costs less than an hour and unblocks the exact scenario described: Daniel opens Aion, resets his voice, the chat asks about his style turn by turn, saves each field, then generates a draft using a synthetic deal. Option B's form UI is a legitimate future improvement for discoverability, but shipping it before fixing the underlying bugs means the form and the chat flow can conflict. Fix the bugs first.

The synthetic deal for the `needs_test_draft` step should be a wedding-industry inquiry: proposal sent, one named contact, deal in "Proposal Sent" stage. That covers the most common Unusonic use case and produces a concrete, recognizable draft.

## Next steps for Daniel

1. In `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:248`, change `if (config.voice_default_derived === true) return 'configured';` to `if (config.voice_default_derived === true) return 'no_voice';`. This re-enables the forcing block.
2. In `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35`, rename the `voice_default_derived` flag in the return to something like `voice_synthesized_only: true` to make it visually distinct — or accept the current name and move on.
3. In `src/app/api/aion/chat/tools/core.ts:332–334`, add a synthetic `AionDealContext` fallback when `queue.length === 0` during `needs_test_draft` state. A hardcoded constant (5–10 fields) is enough; it never touches the DB.
4. Verify the `draft_follow_up` tool's `buildFollowUpPrompt` call reaches `generateFollowUpDraft` with the current `getConfig().voice` (it already does via `ctx.getConfig()` — confirm after step 1).
5. Run `npm run test` to catch any broken assertion in `aion-config-actions.test.ts` (the `getOnboardingState` tests at line 97–136 will need updating for the changed `voice_default_derived` behavior).
6. Open the Aion chat, click "Tune Aion's voice" in the sidebar overflow, and confirm the 4-step flow fires.

## References

- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247–257` — `getOnboardingState`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35–45` — `applyVoiceDefaultIfEmpty`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:50–74` — `AionConfig` / `AionVoiceConfig` types
- `src/app/api/aion/chat/tools/core.ts:118–144` — `save_voice_config` tool
- `src/app/api/aion/chat/tools/core.ts:318–400` — `draft_follow_up` tool
- `src/app/api/aion/chat/route/prompts.ts:275–283` — onboarding blocks injected into system prompt
- `src/app/api/aion/lib/generate-draft.ts:52–137` — `buildFollowUpPrompt` with voice injection
- `src/app/api/aion/draft-follow-up/route.ts` — REST endpoint, already auth+tier+kill-switch gated
